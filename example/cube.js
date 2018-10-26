var createCamera = require('3d-view-controls')
var getBounds    = require('bound-points')
var perspective  = require('gl-mat4/perspective')
var createAxes   = require('gl-axes3d')
var createSpikes = require('gl-spikes3d')
var createSelect = require('gl-select-static')
var getBounds    = require('bound-points')
var mouseChange  = require('mouse-change')
var createVolume = require('../volume')

var canvas = document.createElement('canvas')
document.body.appendChild(canvas)
window.addEventListener('resize', require('canvas-fit')(canvas))
var gl = canvas.getContext('webgl', {alpha: false})
gl.clearColor(1,1,1,1)

var bounds = [[0,0,0], [25, 25, 25]]

var width = 64
var height = 64
var depth = 64

var values = [];
var meshgrid = [[],[],[]];
for (var i=0; i<width; i++) meshgrid[0].push(bounds[0][0] + (bounds[1][0]-bounds[0][0]) * i/(width-1));
for (var i=0; i<height; i++) meshgrid[1].push(bounds[0][1] + (bounds[1][1]-bounds[0][1]) * i/(height-1));
for (var i=0; i<depth; i++) meshgrid[2].push(bounds[0][2] + (bounds[1][2]-bounds[0][2]) * i/(depth-1));

var data = []
for (var z=0; z<depth; z++)
for (var y=0; y<height; y++)
for (var x=0; x<width; x++) {
  var rx = x / width * 128;
  var ry = y / height * 128;
  var rz = z / depth * 128;
  var rwidth = 128;
  var rheight = 128;
  var rdepth = 128;

  var value = Math.pow(Math.abs((10000 + 750 * (
    Math.sin(2 * 2*Math.PI*(rz/rdepth-0.5)) +
    Math.cos(3 * 2*Math.PI*(rx*rx/(rwidth*rwidth)-0.5)) +
    Math.sin(4 * 2*Math.PI*(ry*rz/(rheight*rdepth)-0.5))
  )) * Math.pow(rz/rdepth,1/3) * (1-Math.sqrt(rx*rx / rwidth*rwidth + ry*ry / rheight*rheight)) % 500000)/1e6, 2);
  data[z*height*width + y*width + x] = value
}

values = data;

if (values.length === 0) {
  for (var z=0; z<depth; z++) {
    for (var y=0; y<height; y++) {
      for (var x=0; x<width; x++) {
        values.push(z/(depth-1));
      }
    }
  }
}

var alphamap = [];
for (var i=0; i<256; i++) {
  var v = i/255;
  var a = Math.pow(v, 1.2); //Math.cos(v * Math.PI*2 - Math.PI) * 0.5 + 0.5;
  alphamap[i] = a;
}

var volume = createVolume(gl, {
	values: values,
  meshgrid: meshgrid,
	// isoBounds: [0.05, 0.25],
	// intensityBounds: [0.05, 0.22],
  opacity: 0.05,
  alphamap: alphamap,
  colormap: 'jet',
  clipBounds: [
    [0, 0, 0],
    [25, 25, 25]
  ]
})

var camera = createCamera(canvas, {
  eye:    [90, 90, 90],
  center: [0.5*(bounds[0][0]+bounds[1][0]),
  0.5*(bounds[0][1]+bounds[1][1]),
  0.5*(bounds[0][2]+bounds[1][2])],
  zoomMax: 500,
  mode: 'turntable'
})

var select = createSelect(gl, [canvas.width, canvas.height])
var tickSpacing = 1;
var ticks = bounds[0].map((v,i) => {
  var arr = [];
  var firstTick = Math.ceil(bounds[0][i] / tickSpacing) * tickSpacing;
  var lastTick = Math.floor(bounds[1][i] / tickSpacing) * tickSpacing;
  for (var tick = firstTick; tick <= lastTick; tick += tickSpacing) {
    if (tick === -0) tick = 0;
    arr.push({x: tick, text: tick.toString()});
  }
  return arr;
});
var axes = createAxes(gl, { bounds: bounds, ticks: ticks })

function render() {
  requestAnimationFrame(render)

  gl.enable(gl.DEPTH_TEST)

  var needsUpdate = camera.tick()
  var cameraParams = {
    projection: perspective([], Math.PI/4, canvas.width/canvas.height, 0.01, 1000),
    view: camera.matrix
  }

  if(needsUpdate) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    axes.draw(cameraParams)
    volume.draw(cameraParams)
  }

}
render()
