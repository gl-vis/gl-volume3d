"use strict";

var vec4 = require('gl-vec4');
var mat4 = require('gl-mat4');
var createTexture = require('gl-texture2d');
var createTriMesh = require('./lib/simplemesh.js');


/*
	How this should work:

	1) take in a [w,h,d] 3d array of data
	2) turn the array into w + h + d slice textures
	3) generate w + h + d slice quads, each pointing to its own texture
	4) render quads back-to-front with source-over blend

*/

module.exports = function createVolume(params, bounds) {
	var gl = params.gl;
	if (!gl) {
		gl = arguments[0];
		params = arguments[1];
		bounds = arguments[2];
	}
	var dimensions = params.dimensions, 
		rawIsoBounds = params.intensityBounds, 
		rawIntensityBounds = params.isoBounds, 
		clipBounds = params.clipBounds, 
		colormap = params.colormap, 
		alphamap = params.alphamap, 
		opacity = params.opacity,
		meshgrid = params.meshgrid;

	var values = params.values;
	if (!dimensions) {
		dimensions = [
			meshgrid[0].length,
			meshgrid[1].length,
			meshgrid[2].length
		];
	}
	var width = dimensions[0], height = dimensions[1], depth = dimensions[2];

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

	var valuesImgZ = new Uint8Array(tilesX * width * tilesY * height * 4);

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

		var tileOff = (tileY * tilesX + tileX) * width * height;

		var pxOff = tileOff + y * width * tilesX + x;

		valuesImgZ[pxOff * 4 ] = r;
		valuesImgZ[pxOff * 4 + 1] = g;
		valuesImgZ[pxOff * 4 + 2] = b;
		valuesImgZ[pxOff * 4 + 3] = a;
	}

	var tex = createTexture(gl, [tilesX * width, tilesY * height]);
	tex.minFilter = gl.LINEAR;
	tex.magFilter = gl.LINEAR;
	tex.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tex.shape[0], tex.shape[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgZ);


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

	for (var i = 0; i < meshgrid[2].length; i += meshgrid[2].length-1) {
		var z = i / (meshgrid[2].length-1);
		for (var y = 1; y < meshgrid[1].length; y++) {
			for (var x = 1; x < meshgrid[0].length; x++) {
				positions.push(
					meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i],
					meshgrid[0][x  ], meshgrid[1][y-1], meshgrid[2][i],
					meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
					meshgrid[0][x-1], meshgrid[1][y-1], meshgrid[2][i],
					meshgrid[0][x  ], meshgrid[1][y  ], meshgrid[2][i],
					meshgrid[0][x-1], meshgrid[1][y  ], meshgrid[2][i]
				);

				var u0 = (x-1) / (meshgrid[0].length-1);
				var u1 = x / (meshgrid[0].length-1);
				var v0 = (y-1) / (meshgrid[1].length-1);
				var v1 = y / (meshgrid[1].length-1);

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
	}

	for (var i = 0; i < meshgrid[1].length; i += meshgrid[1].length-1) {
		var y = i / (meshgrid[1].length-1);
		for (var z = 1; z < meshgrid[2].length; z++) {
			for (var x = 1; x < meshgrid[0].length; x++) {
				positions.push(
					meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1],
					meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z-1],
					meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
					meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z-1],
					meshgrid[0][x  ], meshgrid[1][i], meshgrid[2][z  ],
					meshgrid[0][x-1], meshgrid[1][i], meshgrid[2][z  ]
				);

				var u0 = (x-1) / (meshgrid[0].length-1);
				var u1 = x / (meshgrid[0].length-1);
				var w0 = (z-1) / (meshgrid[2].length-1);
				var w1 = z / (meshgrid[2].length-1);

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
	}

	for (var i = 0; i < meshgrid[0].length; i += meshgrid[0].length-1) {
		var x = i / (meshgrid[0].length-1);
		for (var z = 1; z < meshgrid[2].length; z++) {
			for (var y = 1; y < meshgrid[1].length; y++) {
				positions.push(
					meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1],
					meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z-1],
					meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
					meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z-1],
					meshgrid[0][i], meshgrid[1][y  ], meshgrid[2][z  ],
					meshgrid[0][i], meshgrid[1][y-1], meshgrid[2][z  ]
				);

				var v0 = (y-1) / (meshgrid[1].length-1);
				var v1 = y / (meshgrid[1].length-1);
				var w0 = (z-1) / (meshgrid[2].length-1);
				var w1 = z / (meshgrid[2].length-1);

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
	}


	return createTriMesh(gl, {
		positions: positions,
		triangleUVWs: triangleUVWs,

		texture: tex,
		colormap: colormap,
		alphamap: alphamap,
		opacity: opacity,
		transparent: true,

		isoBounds: isoBounds,
		intensityBounds: intensityBounds,
		clipBounds: clipBounds
	});
};

