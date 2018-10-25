#extension GL_OES_standard_derivatives : enable

precision mediump float;

#pragma glslify: cookTorrance = require(glsl-specular-cook-torrance)


uniform vec3 clipBounds[2];
uniform vec3 volumeBounds[2];
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

uniform mat4 model
           , view
           , projection;
uniform vec3 eyePosition
           , lightPosition;

uniform vec2 resolution;

// Used to compute uvw -> uv
uniform vec2 texDims;
uniform vec2 texTiles;
uniform vec2 tileDims;


varying vec3 f_lightDirection
           , f_eyeDirection
           , f_data;
varying vec3 f_uvw;

struct Box {
  vec3 minPoint;
  vec3 maxPoint;
};

mat4 inverse(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}

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

/*

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
  if (slice < 0.0 || slice > 1.0) {
    return vec4(0.0);
  }
  vec2 texDims = vec2(2048.0, 256.0);
  vec2 tileCounts = vec2(16.0, 8.0);
  vec2 tileDims = vec2(128.0, 27.0);
  float tileCount = 128.0;
  float idx = slice * tileCount;
  float fidx = floor(idx);
  float y = floor(fidx / tileCounts.x);
  float x = fidx - y * tileCounts.x;

  vec2 tileUV = vec2(x, y) * tileDims / texDims;
  vec2 rUV = uvw.xy * ((tileDims-1.) / texDims);

  float fidx2 = ceil(idx);
  float y2 = floor(fidx / tileCounts.x);
  float x2 = fidx - y * tileCounts.x;

  vec2 tile2UV = vec2(x2, y2) * tileDims / texDims;
  vec2 r2UV = uvw.xy * ((tileDims-1.) / texDims);

  return mix(
    texture2D(tex, tileUV + rUV, -100.0),
    texture2D(tex, tile2UV + r2UV, -100.0),
    fract(slice)
  );
}




void main() {
  vec2 uv = gl_FragCoord.xy / resolution * 2.0 - 1.0;
  mat4 clipToEye = inverse(projection);
  mat4 eyeToWorld = inverse(model * view);
  vec4 clipNear = vec4(uv, -1.0, 1.0);
  vec4 clipFar = vec4(uv, 1.0, 1.0);
  vec4 eyeNear = clipToEye * clipNear;
  vec4 eyeFar = clipToEye * clipFar;
  vec4 worldNear = eyeToWorld * eyeNear;
  vec4 worldFar = eyeToWorld * eyeFar;
  vec3 ro = worldNear.xyz / worldNear.w;
  vec3 rd = normalize((worldFar.xyz / worldFar.w) - ro);

  vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
  float t1, t2;
  vec3 nml;
  Box volumeBox = Box(volumeBounds[0], volumeBounds[1]);
  vec3 volumeBoxSize = volumeBounds[1] - volumeBounds[0];
  Box clipBox = Box(clipBounds[0], clipBounds[1]);
  vec3 clipBoxSize = clipBounds[1] - clipBounds[0];
  float clipBoxLength = length(clipBoxSize);
  if (boxIntersect(ro, rd, clipBox, t1, t2, nml)) {
    // vec3 uvw = (ro + rd * t2);
    // if ( uIsocaps && all(lessThanEqual(uvw, vec3(1.0))) && all(greaterThanEqual(uvw, vec3(0.0))) ) {
    //   vec4 c = texture(uTexture, uvw, -16.0);
    //   if (abs(c.r - uIsoLevel) <= uIsoRange) {
    //     vec4 col = getCapColor(uvw, c);
    //     color = 1.0 - col;
    //     color.a = sqrt(c.r) * c.a;
    //   }
    // }
    vec3 farHit = ro + rd * t2;
    vec4 accum = vec4(0.0);
    float steps = 256.0;
    float stepSize = (t2-t1) / steps;
    for (float i=0.0; i<256.0; i++) {
      vec3 p = (farHit - rd * i * stepSize);
      vec3 uvw = p / volumeBoxSize;
      if (all(lessThanEqual(p, clipBounds[1])) && all(greaterThanEqual(p, clipBounds[0])) ) {
        vec4 c = readTex(texture, uvw);
        float intensity = clamp((c.r - intensityBounds[0]) / (intensityBounds[1] - intensityBounds[0]), 0.0, 1.0);

        if (useColormap) {
          c.rgb = texture2D(colormap, vec2(intensity, 0.0)).rgb;
        }

        if (useAlphamap) {
          c.a = texture2D(alphamap, vec2(intensity, 0.0)).r * opacity;
        } else {
          c.a = intensity * opacity;
        }

        accum.rgb = mix(accum.rgb, c.rgb, c.a);
        accum.a += (1.0 - accum.a) * c.a;
      }
    }
    color = accum;
    // color.rgb *= color.a;
  }

  gl_FragColor = color;
}