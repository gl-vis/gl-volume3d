'use strict'

var DEFAULT_VERTEX_NORMALS_EPSILON = 1e-6; // may be too large if triangles are very small
var DEFAULT_FACE_NORMALS_EPSILON = 1e-6;

var createShader  = require('gl-shader')
var createBuffer  = require('gl-buffer')
var createVAO     = require('gl-vao')
var createTexture = require('gl-texture2d')
var normals       = require('normals')
var multiply      = require('gl-mat4/multiply')
var invert        = require('gl-mat4/invert')
var ndarray       = require('ndarray')
var colormap      = require('colormap')
var getContour    = require('simplicial-complex-contour')
var pool          = require('typedarray-pool')
var shaders       = require('./shaders')

var meshShader    = shaders.meshShader

var identityMatrix = [
  1,0,0,0,
  0,1,0,0,
  0,0,1,0,
  0,0,0,1]

function SimpleMesh(gl
  , texture
  , colormap
  , alphamap
  , triShader
  , trianglePositions
  , triangleVAO
) {

  this.gl                = gl
  this.positions         = []
  this.intensity         = []
  this.texture           = texture
  this.colormap          = colormap
  this.alphamap          = alphamap
  this.dirty             = true

  this.useColormap       = false
  this.useAlphamap       = false

  this.triShader         = triShader

  this.trianglePositions = trianglePositions
  this.triangleVAO       = triangleVAO
  this.triangleCount     = 0

  this.bounds            = [
    [ Infinity, Infinity, Infinity],
    [-Infinity,-Infinity,-Infinity] ]
  this.clipBounds        = [
    [-Infinity,-Infinity,-Infinity],
    [ Infinity, Infinity, Infinity] ]

  this.intensityBounds = [0, 1];

  this.lightPosition = [1e5, 1e5, 0]
  this.ambientLight  = 0.8
  this.diffuseLight  = 0.8
  this.specularLight = 2.0
  this.roughness     = 0.5
  this.fresnel       = 1.5

  this.opacity       = 1.0
  this.transparent   = true

  this._model       = identityMatrix
  this._view        = identityMatrix
  this._projection  = identityMatrix
  this._resolution  = [1,1]
}

var proto = SimpleMesh.prototype

proto.isOpaque = function() {
  return !this.transparent
}

proto.isTransparent = function() {
  return this.transparent
}

function genColormap(param) {
  var colors = colormap({
      colormap: param
    , nshades:  256
    , format:  'rgba'
  })

  var result = new Uint8Array(256*4)
  for(var i=0; i<256; ++i) {
    var c = colors[i]
    for(var j=0; j<3; ++j) {
      result[4*i+j] = c[j]
    }
    result[4*i+3] = c[3]*255
  }

  return ndarray(result, [256,256,4], [4,0,1])
}

function genAlphamap(colors) {
  var result = new Uint8Array(256*4)
  for(var i=0; i<256; ++i) {
    var c = colors[i]
    for(var j=0; j<3; ++j) {
      result[4*i+j] = c*255
    }
    result[4*i+3] = c*255
  }

  return ndarray(result, [256,256,4], [4,0,1])
}

proto.update = function(params) {
  params = params || {}
  var gl = this.gl

  this.dirty = true

  if('lightPosition' in params) {
    this.lightPosition = params.lightPosition
  }
  if('opacity' in params) {
    this.opacity = params.opacity
  }
  if('ambient' in params) {
    this.ambientLight  = params.ambient
  }
  if('diffuse' in params) {
    this.diffuseLight = params.diffuse
  }
  if('specular' in params) {
    this.specularLight = params.specular
  }
  if('roughness' in params) {
    this.roughness = params.roughness
  }
  if('fresnel' in params) {
    this.fresnel = params.fresnel
  }
  if('transparent' in params) {
    this.transparent = params.transparent
  }

  if(params.texture) {
    this.texture.dispose()
    this.texture = params.texture
  }

  if (params.colormap) {
    this.colormap.shape = [256, 256]
    this.colormap.minFilter = gl.LINEAR_MIPMAP_LINEAR
    this.colormap.magFilter = gl.LINEAR
    this.colormap.setPixels(genColormap(params.colormap))
    this.colormap.generateMipmap()
    this.useColormap = true
  }

  if (params.alphamap) {
    this.alphamap.shape = [256, 256];
    this.alphamap.minFilter = gl.LINEAR_MIPMAP_LINEAR;
    this.alphamap.magFilter = gl.LINEAR;
    this.alphamap.setPixels(genAlphamap(params.alphamap));
    this.alphamap.generateMipmap();
    this.useAlphamap = true;
  }

  if (params.intensityBounds) {
    this.intensityBounds = params.intensityBounds;
  }

  var positions = params.positions;

  if(!positions) {
    return
  }

  //Pack cells into buffers
  var vertexCount = positions.length / 3;
  var triangleCount = vertexCount / 3;

  this.triangleCount  = triangleCount;

  this.trianglePositions.update(positions);
}

proto.drawTransparent =
proto.draw =
function(params) {
  params = params || {}
  var gl          = this.gl
  var model       = params.model      || identityMatrix
  var view        = params.view       || identityMatrix
  var projection  = params.projection || identityMatrix

  var clipBounds = [[-1e6,-1e6,-1e6],[1e6,1e6,1e6]]
  for(var i=0; i<3; ++i) {
    clipBounds[0][i] = Math.max(clipBounds[0][i], this.clipBounds[0][i])
    clipBounds[1][i] = Math.min(clipBounds[1][i], this.clipBounds[1][i])
  }

  var volumeBounds = this.bounds;

  var texDims = this.texDims;
  var tileCounts = this.tileCounts;
  var tileDims = this.tileDims;

  var uniforms = {
    model:      model,
    view:       view,
    projection: projection,

    volumeBounds: volumeBounds,
    clipBounds: clipBounds,

    texDims: texDims,
    tileCounts: tileCounts,
    tileDims: tileDims,

    intensityBounds: this.intensityBounds,

    kambient:   this.ambientLight,
    kdiffuse:   this.diffuseLight,
    kspecular:  this.specularLight,
    roughness:  this.roughness,
    fresnel:    this.fresnel,

    eyePosition:   [0,0,0],
    lightPosition: [0,0,0],

    resolution: [gl.canvas.width, gl.canvas.height],

    opacity:  this.opacity,

    contourColor: this.contourColor,

    texture:    0,
    colormap:   1,
    alphamap:   2,

    useColormap: this.useColormap,
    useAlphamap: this.useAlphamap
  }

  this.texture.bind(0)
  this.colormap.bind(1)
  this.alphamap.bind(2)

  var invCameraMatrix = new Array(16)
  multiply(invCameraMatrix, uniforms.view, uniforms.model)
  multiply(invCameraMatrix, uniforms.projection, invCameraMatrix)
  invert(invCameraMatrix, invCameraMatrix)

  for(var i=0; i<3; ++i) {
    uniforms.eyePosition[i] = invCameraMatrix[12+i] / invCameraMatrix[15]
  }

  var w = invCameraMatrix[15]
  for(var i=0; i<3; ++i) {
    w += this.lightPosition[i] * invCameraMatrix[4*i+3]
  }
  for(var i=0; i<3; ++i) {
    var s = invCameraMatrix[12+i]
    for(var j=0; j<3; ++j) {
      s += invCameraMatrix[4*j+i] * this.lightPosition[j]
    }
    uniforms.lightPosition[i] = s / w
  }

  if(this.triangleCount > 0) {
    var shader = this.triShader
    shader.bind()
    shader.uniforms = uniforms

    // gl.enable(gl.BLEND);
    // gl.blendEquation(gl.FUNC_ADD);
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // gl.depthMask(false);

    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.BACK);
    // gl.disable(gl.CULL_FACE);

    this.triangleVAO.bind()
    gl.drawArrays(gl.TRIANGLES, 0, this.triangleCount*3)
    this.triangleVAO.unbind()

    // gl.disable(gl.CULL_FACE);
    // gl.disable(gl.BLEND);
    // gl.depthMask(true);
  }
}


proto.dispose = function() {
  this.texture.dispose()
  this.colormap.dispose()
  this.alphamap.dispose()

  this.triShader.dispose()

  this.triangleVAO.dispose()
  this.trianglePositions.dispose()
}

function createMeshShader(gl, params) {

  console.log("params=", params);

  var raySteps = Math.floor(params.raySteps || 256);

  console.log("raySteps=", raySteps);
  console.log("Now we don't pass raySteps to the shader!");

  var shader = createShader(gl, meshShader.vertex, meshShader.fragment)

  shader.attributes.position.location = 0
  return shader
}

function createSimpleMesh(gl, params) {
  if (arguments.length === 1) {
    params = gl;
    gl = params.gl;
  }



  var triShader       = createMeshShader(gl, params)

  var meshTexture       = createTexture(gl,
    ndarray(new Uint8Array([255,255,255,255]), [1,1,4]))
  meshTexture.generateMipmap()
  meshTexture.minFilter = gl.LINEAR_MIPMAP_LINEAR
  meshTexture.magFilter = gl.LINEAR

  var colormapTexture       = createTexture(gl,
    ndarray(new Uint8Array([255,255,255,255]), [1,1,4]))
  colormapTexture.generateMipmap()
  colormapTexture.minFilter = gl.LINEAR_MIPMAP_LINEAR
  colormapTexture.magFilter = gl.LINEAR

  var alphamapTexture       = createTexture(gl,
    ndarray(new Uint8Array([255,255,255,255]), [1,1,4]))
  alphamapTexture.generateMipmap()
  alphamapTexture.minFilter = gl.LINEAR_MIPMAP_LINEAR
  alphamapTexture.magFilter = gl.LINEAR

  var trianglePositions = createBuffer(gl)
  var triangleVAO       = createVAO(gl, [
    { buffer: trianglePositions,
      type: gl.FLOAT,
      size: 3
    }
  ])

  var mesh = new SimpleMesh(gl
    , meshTexture
    , colormapTexture
    , alphamapTexture
    , triShader
    , trianglePositions
    , triangleVAO)

  mesh.update(params)

  return mesh
}

module.exports = createSimpleMesh
