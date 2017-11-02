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
uniform bool useColormap;

varying vec3 f_lightDirection
           , f_eyeDirection
           , f_data;
varying vec2 f_uv;

void main() {
  if(any(lessThan(f_data, clipBounds[0])) ||
     any(greaterThan(f_data, clipBounds[1]))) {
    discard;
  }

  vec4 tex = texture2D(texture, f_uv);

  if (useColormap) {
    tex.rgb = texture2D(colormap, vec2((tex.r - intensityBounds[0]) / (intensityBounds[1] - intensityBounds[0]), 0.0)).rgb;
  }

  tex.a = tex.a > 0.0 && tex.a < 1.0 ? tex.a * opacity : 0.0;

  gl_FragColor = tex;

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