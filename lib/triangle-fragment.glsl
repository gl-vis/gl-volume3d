#extension GL_OES_standard_derivatives : enable

precision mediump float;

#pragma glslify: cookTorrance = require(glsl-specular-cook-torrance)


uniform vec3 clipBounds[2];
uniform float intensityBounds[2];
uniform float roughness
            , fresnel
            , kambient
            , kdiffuse
            , kspecular
            , opacity;
uniform sampler2D texture;
uniform sampler2D colormap;
uniform sampler2D alphamap;
uniform bool useColormap;
uniform bool useAlphamap;

// Used to compute uvw -> uv
uniform vec2 texDims;
uniform vec2 texTiles;
uniform vec2 tileDims;


varying vec3 f_lightDirection
           , f_eyeDirection
           , f_data;
varying vec3 f_uvw;

/*

struct Box {
  vec3 minPoint;
  vec3 maxPoint;
};


bool boxIntersect(vec3 ro, vec3 rd, Box box, out float t1, out float t2, out vec3 nml)
{
  vec3 ird = 1.0 / rd;
  vec3 v1 = (box.minPoint - ro) * ird;
  vec3 v2 = (box.maxPoint - ro) * ird;
  vec3 n = min(v1, v2);
  vec3 f = max(v1, v2);
  float enter = max(n.x, max(n.y, n.z));
  float exit = min(f.x, min(f.y, f.z));
  if (exit > 0.0 && enter < exit) {
    t1 = enter;
    t2 = exit;
    return true;
  }
  return false;
}

bool planeIntersect(vec3 ro, vec3 rd, vec3 p, vec3 nml, out float t)
{
  float d = dot(nml, rd);
  if (d <= 0.0) {
    return false;
  }
  d = -dot(ro-p, nml) / d;
  if (d < 0.0) {
    return false;
  }
  t = d;
  return true;
}

vec3 gradient(vec3 uvw, vec4 c)
{
  vec3 e = vec3(0.0, 0.0, 1.0 / 256.0);
  vec4 dx = texture(uTexture, uvw + e.zxx, -16.0) - c;
  vec4 dy = texture(uTexture, uvw + e.xzx, -16.0) - c;
  vec4 dz = texture(uTexture, uvw + e.xxz, -16.0) - c;
  return vec3(dx.r, dy.r, dz.r);
}

vec3 grey(vec3 rgb) {
  return vec3((rgb.r + rgb.g + rgb.b) / 3.0);
}

vec4 getColor(vec3 uvw, vec4 c) {
  vec3 grad = gradient(uvw, c);
  float alpha = 0.005; //mix(0.05*c.r, 0.01*c.r, pow(clamp(c.r+0., 0.0, 1.0), 4.0));
  if (abs(c.r - uIsoLevel) <= uIsoRange) {
    alpha = 0.15;
  }
  alpha *= c.a;
  c.r = abs(c.r - uIsoLevel) * 2.0;
  vec3 col = 1.0-max(vec3(0.0), vec3(c.r*2., abs(0.7-c.r), 0.8-c.r)+0.5);
  col = col.bgr;
  col.r *= 0.75;
  col.b *= 0.5;
  return vec4(pow(grey(abs(grad))+abs(grad), vec3(0.5))+col, alpha);  
}

vec4 getCapColor(vec3 uvw, vec4 c) {
  vec3 grad = gradient(uvw, c);
  float alpha = 0.005; //mix(0.05*c.r, 0.01*c.r, pow(clamp(c.r+0., 0.0, 1.0), 4.0));
  if (abs(c.r - uIsoLevel) <= uIsoRange) {
    alpha = 0.15;
  }
  alpha *= c.a;
  vec3 col = 1.0-max(vec3(0.0), vec3(c.r*2., abs(0.7-c.r), 0.8-c.r)+0.5);
  col = col.bgr;
  col.r *= 0.75;
  col.b *= 0.5;
  return vec4(pow(grey(abs(grad))+abs(grad), vec3(0.5))+col, alpha);  
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  mat4 clipToEye = inverse(uProjection);
  mat4 eyeToWorld = inverse(uModelView);
  vec4 clipNear = vec4(uv, -1.0, 1.0);
  vec4 clipFar = vec4(uv, 1.0, 1.0);
  vec4 eyeNear = clipToEye * clipNear;
  vec4 eyeFar = clipToEye * clipFar;
  vec4 worldNear = eyeToWorld * eyeNear;
  vec4 worldFar = eyeToWorld * eyeFar;
  vec3 ro = worldNear.xyz / worldNear.w;
  vec3 rd = normalize((worldFar.xyz / worldFar.w) - ro);
  color = vec4(0.0);
  float t1, t2;
  vec3 nml;
  Box clipBox = Box(uClipBoxMin, uClipBoxMax);
  if (boxIntersect(ro, rd, clipBox, t1, t2, nml)) {
    vec3 uvw = (ro + rd * t1);
    if ( uIsocaps && all(lessThanEqual(uvw, vec3(1.0))) && all(greaterThanEqual(uvw, vec3(0.0))) ) {
      vec4 c = texture(uTexture, uvw, -16.0);
      if (abs(c.r - uIsoLevel) <= uIsoRange) {
        vec4 col = getCapColor(uvw, c);
        color = 1.0 - col;
        color.a = sqrt(c.r) * c.a;
      }
    }
    vec3 p1 = ro + rd * t1;
    vec4 accum = vec4(0.0);
    bool noHit = true;
    float steps = ceil((t2-t1) * uRaySteps);
    for (float i=0.0; i<=steps; i++) {
      float t = 1.0 - i/steps;
      vec3 uvw = (p1 + rd * (t2-t1) * t);
      //uvw += vec3(sin(uTime + uvw.y*6.0) * 0.2, 0.0, 0.0);
      vec3 ou = uvw;
      if (all(lessThanEqual(uvw, clipBox.maxPoint)) && all(greaterThanEqual(uvw, clipBox.minPoint)) ) {
        vec4 c = texture(uTexture, uvw, -16.0);
        //if (abs(c.r - uIsoLevel) <= uIsoRange) {
          vec4 col = getColor(uvw, c);
          accum = mix(accum, col, col.a);
          noHit = false;
        //}
      }
    }
//    if (noHit) {
//      discard;
//      return;
//    }
    color = mix(1.0 - accum, color, color.a);
    color.a = 1.0;
  }
}

*/

vec4 readTex(sampler2D tex, vec3 uvw) {
  float slice = uvw.z;
  vec2 texDims = vec2(2048.0, 256.0);
  vec2 tileCounts = vec2(16.0, 8.0);
  vec2 tileDims = vec2(128.0, 27.0);
  float tileCount = 128.0;
  float idx = slice * tileCount;
  float y = floor(floor(idx) / tileCounts.x);
  float x = floor(idx) - y * tileCounts.x;

  vec2 tileUV = vec2(x, y) * tileDims / texDims;
  vec2 rUV = uvw.xy * (tileDims / texDims);

  return texture2D(tex, tileUV + rUV, -100.0);
}

void main() {
  //if(any(lessThan(f_data, clipBounds[0])) ||
  //   any(greaterThan(f_data, clipBounds[1]))) {
  //  discard;
  //}

  vec4 tex = texture2D(texture, f_uvw.xy);

  float intensity = clamp((tex.r - intensityBounds[0]) / (intensityBounds[1] - intensityBounds[0]), 0.0, 1.0);

  if (useColormap) {
    tex.rgb = texture2D(colormap, vec2(intensity, 0.0)).rgb;
  }

  if (useAlphamap) {
    tex.a = texture2D(alphamap, vec2(intensity, 0.0)).r * opacity;
  } else {
    tex.a = intensity * opacity;
  }

  tex.rgb *= tex.a;

  vec3 v = normalize(vec3(1.0, 1.0, 1.0));

  vec3 c = vec3(0.0);
  vec3 uvw = f_uvw;
  for (int i = 0; i < 128; i++) {
    vec4 t = readTex(texture, uvw);
    c += t.rgb * 0.01;
    uvw += v * 0.01;
  }

  gl_FragColor = vec4(c, 1.0); //vec4(1.0, 0.0, 1.0, 1.0); //tex;

  /*

  vec3 N = normalize(f_normal);
  vec3 L = normalize(f_lightDirection);
  vec3 V = normalize(f_eyeDirection);

  if(!gl_FrontFacing) {
    N = -N;
  }

  float specular = cookTorrance(L, V, N, roughness, fresnel);
  float diffuse  = min(kambient + kdiffuse * max(dot(N, L), 0.0), 1.0);

  vec4 surfaceColor = texture2D(texture, f_uv);
  vec4 litColor = surfaceColor.a * vec4(diffuse * surfaceColor.rgb + kspecular * vec3(1,1,1) * specular,  1.0);

  gl_FragColor = litColor * opacity;

  */
}