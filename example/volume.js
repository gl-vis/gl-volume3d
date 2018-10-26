var createCamera = require('3d-view-controls')
var getBounds    = require('bound-points')
var perspective  = require('gl-mat4/perspective')
var createAxes   = require('gl-axes3d')
var createSpikes = require('gl-spikes3d')
var createSelect = require('gl-select-static')
var getBounds    = require('bound-points')
var mouseChange  = require('mouse-change')
var createVolume = require('../volume')

var getData = function(fn, callback) {
  var xhr = new XMLHttpRequest;
  xhr.onload = function() {
    callback(xhr.responseText);
  };
  xhr.open('GET', fn, true);
  xhr.send();
};

var parseCSV = function(str) {
  return str.replace(/^\s+|\s+$/g, '').split(/\r?\n/g).map(x => x.split(',').map(parseFloat));
};


var canvas = document.createElement('canvas')
document.body.appendChild(canvas)
window.addEventListener('resize', require('canvas-fit')(canvas))
var gl = canvas.getContext('webgl', {alpha: false})
gl.getExtension('OES_standard_derivatives');
gl.clearColor(1,1,1,1)

getData('example/data/mri.csv', function(mricsv) {
  console.log("Volume demo");
  console.time("Total mesh creation time")

  var mri = parseCSV(mricsv.replace(/\r?\n/g, ','))[0];
  mri.pop();

  var bounds = [[0,0,0], [25, 25, 25]]

  var values = [];
  var meshgrid = [[],[],[]];
  for (var i=0; i<128; i++) meshgrid[0].push(bounds[0][0] + (bounds[1][0]-bounds[0][0]) * i/127);
  for (var i=0; i<128; i++) meshgrid[1].push(bounds[0][1] + (bounds[1][1]-bounds[0][1]) * i/127);
  for (var i=0; i<128; i++) meshgrid[2].push(bounds[0][2] + (bounds[1][2]-bounds[0][2]) * i/127);

  for (var z=0; z<128; z++) {
    for (var y=0; y<128; y++) {
      for (var x=0; x<128; x++) {
        values.push(Math.min((x/127),(y/127),(z/127)));
      }
    }
  }

  var alphamap = [];
  for (var i=0; i<256; i++) {
    var v = i/255;
    var a = v; //Math.cos(v * Math.PI*2 - Math.PI) * 0.5 + 0.5;
    alphamap[i] = a;
  }

  var volume = createVolume(gl, {
  	values: values,
    meshgrid: meshgrid,
  	isoBounds: [0, 1],
  	intensityBounds: [0, 1],
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

  console.timeEnd("Total mesh creation time")

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
});