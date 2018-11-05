var glslify       = require('glslify')

var triVertSrc = glslify('./triangle-vertex.glsl')
var triFragSrc = glslify('./triangle-fragment.glsl')

//console.log("triVertSrc=", triVertSrc);

//console.log("triFragSrc=", triFragSrc);

exports.meshShader = {
  vertex:   triVertSrc,
  fragment: triFragSrc,
  attributes: [
    {name: 'position', type: 'vec3'}//,
    //{name: 'uvw', type: 'vec3'}
  ]
}
