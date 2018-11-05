precision highp float;

attribute vec3 position;
//attribute vec3 uvw;

uniform mat4 model
           , view
           , projection;
uniform vec3 eyePosition
           , lightPosition;

varying vec3 f_normal
           , f_lightDirection
           , f_eyeDirection
           , f_data;
//varying vec3 f_uvw;

void main() {
  vec4 m_position  = model * vec4(position, 1.0);
  vec4 t_position  = view * m_position;
  gl_Position      = projection * t_position;
  f_data           = position;
  f_eyeDirection   = eyePosition   - position;
  f_lightDirection = lightPosition - position;
  //f_uvw            = uvw;
}