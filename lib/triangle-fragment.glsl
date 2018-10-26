#define RAY_STEPS 256.0

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
uniform vec2 tileCounts;
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

vec2 getTileUV(float tileIdx) {
  float y = floor(tileIdx / tileCounts.x);
  float x = tileIdx - y * tileCounts.x;

  vec2 tileUV = vec2(x, y) * (tileDims / texDims);
  return tileUV;
}

vec4 readTex(sampler2D tex, vec3 uvw) {
  float fidx, y, x;

  float slice = uvw.z;
  float tileCount = tileCounts.x * tileCounts.y;
  float idx = slice * (tileCount-1.0);
  vec2 pxUV = uvw.xy * (tileDims-1.0);
  pxUV += 0.5;
  vec2 rUV = pxUV / (texDims-1.0);

  vec2 tileUV = getTileUV(floor(idx));
  vec2 tile2UV = getTileUV(ceil(idx));

  return mix(
    texture2D(tex, tileUV + rUV, -16.0),
    texture2D(tex, tile2UV + rUV, -16.0),
    fract(idx)
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
    float stepSize = clipBoxLength / RAY_STEPS;
    for (float i = 0.0; i < RAY_STEPS; i++) {
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
