"use strict";

var vec4 = require('gl-vec4');
var mat4 = require('gl-mat4');
var createTexture = require('gl-texture2d');
var createTriMesh = require('./lib/simplemesh.js');

module.exports = function createVolume(params) {
	var gl = params.gl;
	if (!gl) {
		gl = arguments[0];
		params = arguments[1];
	}
	var rawIsoBounds = params.isoBounds, 
		rawIntensityBounds = params.intensityBounds, 
		clipBounds = params.clipBounds, 
		colormap = params.colormap, 
		alphamap = params.alphamap, 
		opacity = params.opacity,
		meshgrid = params.meshgrid;

	var values = params.values;
	var dimensions = [
		meshgrid[0].length,
		meshgrid[1].length,
		meshgrid[2].length
	];
	var width = meshgrid[0].length, height = meshgrid[1].length, depth = meshgrid[2].length;

	var isoBounds = [Infinity, -Infinity];

	if (rawIsoBounds) {
		isoBounds = rawIsoBounds;
	} else {
		for (var i=0; i<values.length; i++) {
			var v = values[i];
			if (v < isoBounds[0]) {
				isoBounds[0] = v;
			}
			if (v > isoBounds[1]) {
				isoBounds[1] = v;
			}
		}
	}

	var isoMin = isoBounds[0];
	var isoRangeRecip = 1 / (isoBounds[1] - isoBounds[0]);

	var intensityBounds = [0, 1];
	if (rawIntensityBounds) {
		intensityBounds = [
			(rawIntensityBounds[0] - isoMin) * isoRangeRecip,
			(rawIntensityBounds[1] - isoMin) * isoRangeRecip
		];
	}

	var maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

	var tilesX = Math.floor(maxTextureSize / width);
	var tilesY = Math.floor(maxTextureSize / height);
	var maxTiles = tilesX * tilesY;

	if (maxTiles < depth) {
		throw new Error("Volume too large to fit in a texture");
	}

	tilesY = Math.ceil(depth / tilesX);

	if (tilesY === 1 && tilesX > depth) {
		tilesX = depth;
	}

	var texWidth = Math.pow(2, Math.ceil(Math.log2(tilesX * width)));
	var texHeight = Math.pow(2, Math.ceil(Math.log2(tilesY * height)));

	var valuesImgZ = new Uint8Array(texWidth * texHeight * 4);

	for (var i=0; i<values.length; i++) {
		var v = (values[i] - isoMin) * isoRangeRecip;
		v = 255 * (v >= 0 ? (v <= 1 ? v : 0) : 0);

		var r = v;
		var g = v;
		var b = v;
		var a = v;

		var z = Math.floor(i / (width*height));
		var y = Math.floor((i - z*width*height) / width);
		var x = i - z*width*height - y*width;

		var tileY = Math.floor(z / tilesX);
		var tileX = z - (tilesX * tileY);

		var tileOff = (tileY * height) * texWidth + tileX * width;

		var pxOff = tileOff + y * texWidth + x;

		valuesImgZ[pxOff * 4 ] = r;
		valuesImgZ[pxOff * 4 + 1] = g;
		valuesImgZ[pxOff * 4 + 2] = b;
		valuesImgZ[pxOff * 4 + 3] = a;
	}

	var tex = createTexture(gl, [texWidth, texHeight]);
	tex.minFilter = gl.LINEAR;
	tex.magFilter = gl.LINEAR;
	tex.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tex.shape[0], tex.shape[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgZ);

	// var canvas = document.createElement('canvas');
	// canvas.width = tex.shape[0];
	// canvas.height = tex.shape[1];
	// var ctx = canvas.getContext('2d');
	// var id = ctx.getImageData(0,0,tex.shape[0], tex.shape[1]);
	// for (var i=0; i<id.data.length; i++) {
	// 	id.data[i] = valuesImgZ[i];
	// }
	// ctx.putImageData(id, 0, 0);
	// document.body.appendChild(canvas);
	// canvas.style.position='absolute';
	// canvas.style.zIndex = 10;
	// canvas.style.left = canvas.style.top = '0px';


	// Create Z stack mesh [z grows]

	var positions = [];
	var triangleUVWs = [];

	if (!meshgrid) {
		meshgrid = [[], [], []];
		for (var i = 0; i < width; i++) {
			meshgrid[0][i] = i;
		}
		for (var i = 0; i < height; i++) {
			meshgrid[1][i] = i;
		}
		for (var i = 0; i < depth; i++) {
			meshgrid[2][i] = i;
		}
	}

	var modelSX = meshgrid[0][0];
	var modelSY = meshgrid[1][0];
	var modelSZ = meshgrid[2][0];

	var modelEX = meshgrid[0][meshgrid[0].length-1];
	var modelEY = meshgrid[1][meshgrid[1].length-1];
	var modelEZ = meshgrid[2][meshgrid[2].length-1];

	var z = 1;
	var i = meshgrid[2].length-1;
	for (var y = 1; y < meshgrid[1].length; y++) {
		for (var x = 1; x < meshgrid[0].length; x++) {
			var u0 = (x-1) / (meshgrid[0].length-1);
			var u1 = x / (meshgrid[0].length-1);
			var v0 = (y-1) / (meshgrid[1].length-1);
			var v1 = y / (meshgrid[1].length-1);

			positions.push(
				meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y-1], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
				meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
				meshgrid[0][x-1], meshgrid[1][y  ], meshgrid[2][i]
			);
			triangleUVWs.push(
				u0, v0, z,
				u1, v0, z,
				u1, v1, z,
				u0, v0, z,
				u1, v1, z,
				u0, v1, z
			);
		}
	}
	var z = 0;
	var i = 0;
	for (var y = 1; y < meshgrid[1].length; y++) {
		for (var x = 1; x < meshgrid[0].length; x++) {
			var u0 = (x-1) / (meshgrid[0].length-1);
			var u1 = x / (meshgrid[0].length-1);
			var v0 = (y-1) / (meshgrid[1].length-1);
			var v1 = y / (meshgrid[1].length-1);

			positions.push(
				meshgrid[0][x-1], meshgrid[1][y  ], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
				meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
				meshgrid[0][x  ], meshgrid[1][y-1], meshgrid[2][i],
				meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i]
			);
			triangleUVWs.push(
				u0, v1, z,
				u1, v1, z,
				u0, v0, z,
				u1, v1, z,
				u1, v0, z,
				u0, v0, z
			);
		}
	}

	var y = 0;
	var i = 0;
	for (var z = 1; z < meshgrid[2].length; z++) {
		for (var x = 1; x < meshgrid[0].length; x++) {
			var u0 = (x-1) / (meshgrid[0].length-1);
			var u1 = x / (meshgrid[0].length-1);
			var w0 = (z-1) / (meshgrid[2].length-1);
			var w1 = z / (meshgrid[2].length-1);

			positions.push(
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z-1],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z  ]
			);
			triangleUVWs.push(
				u0, y, w0,
				u1, y, w0,
				u1, y, w1,
				u0, y, w0,
				u1, y, w1,
				u0, y, w1
			);
		}
	}
	var y = 1;
	var i = meshgrid[1].length-1;
	for (var z = 1; z < meshgrid[2].length; z++) {
		for (var x = 1; x < meshgrid[0].length; x++) {
			var u0 = (x-1) / (meshgrid[0].length-1);
			var u1 = x / (meshgrid[0].length-1);
			var w0 = (z-1) / (meshgrid[2].length-1);
			var w1 = z / (meshgrid[2].length-1);

			positions.push(
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z  ],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
				meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z-1],
				meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1]
			);
			triangleUVWs.push(
				u0, y, w1,
				u1, y, w1,
				u0, y, w0,
				u1, y, w1,
				u1, y, w0,
				u0, y, w0
			);
		}
	}

	var x = 1;
	var i = meshgrid[0].length-1;
	for (var z = 1; z < meshgrid[2].length; z++) {
		for (var y = 1; y < meshgrid[1].length; y++) {
			var v0 = (y-1) / (meshgrid[1].length-1);
			var v1 = y / (meshgrid[1].length-1);
			var w0 = (z-1) / (meshgrid[2].length-1);
			var w1 = z / (meshgrid[2].length-1);

			positions.push(
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z-1],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z  ]
			);
			triangleUVWs.push(
				x, v0, w0,
				x, v1, w0,
				x, v1, w1,
				x, v0, w0,
				x, v1, w1,
				x, v0, w1
			);
		}
	}
	var x = 0;
	var i = 0;
	for (var z = 1; z < meshgrid[2].length; z++) {
		for (var y = 1; y < meshgrid[1].length; y++) {
			var v0 = (y-1) / (meshgrid[1].length-1);
			var v1 = y / (meshgrid[1].length-1);
			var w0 = (z-1) / (meshgrid[2].length-1);
			var w1 = z / (meshgrid[2].length-1);

			positions.push(
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z  ],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
				meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z-1],
				meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1]
			);
			triangleUVWs.push(
				x, v0, w1,
				x, v1, w1,
				x, v0, w0,
				x, v1, w1,
				x, v1, w0,
				x, v0, w0
			);
		}
	}

	// console.log(
	// 	tilesX, tilesY, 
	// 	meshgrid[0].length, meshgrid[1].length, meshgrid[2].length,
	// 	tex.shape[0], tex.shape[1]
	// );

	var volumeBounds = [
		[meshgrid[0][0], meshgrid[1][0], meshgrid[2][0]],
		[meshgrid[0][meshgrid[0].length-1], meshgrid[1][meshgrid[1].length-1], meshgrid[2][meshgrid[2].length-1]]
	];

	var mesh = createTriMesh(gl, {
		raySteps: params.raySteps || 256,
		positions: positions,
		triangleUVWs: triangleUVWs,

		texture: tex,
		colormap: colormap,
		alphamap: alphamap,
		opacity: opacity,
		transparent: true,

		isoBounds: isoBounds,
		intensityBounds: intensityBounds
	});

	mesh.tileDims = [width, height];
	mesh.tileCounts = [tilesX, tilesY];
	mesh.texDims = [texWidth, texHeight];

	mesh.bounds = volumeBounds;
	mesh.clipBounds = clipBounds || volumeBounds;
	
	return mesh;
};

