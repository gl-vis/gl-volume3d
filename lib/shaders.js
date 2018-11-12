var glslify       = require('glslify')

var triVertSrc = glslify('./triangle-vertex.glsl')
var triFragSrc = glslify('./triangle-fragment.glsl')

exports.meshShader = {
  vertex:   triVertSrc,
  fragment: triFragSrc,
  attributes: [
    {name: 'position', type: 'vec3'}
  ]
}
