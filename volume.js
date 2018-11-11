"use strict";

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
	var width = meshgrid[0].length;
	var height = meshgrid[1].length;
	var depth = meshgrid[2].length;

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

		valuesImgZ[pxOff * 4    ] = r;
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
	// 	 id.data[i] = valuesImgZ[i];
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


	var ni = width -1;
	var nj = height - 1;
	var nk = depth - 1;
	var i = 0;
	for (var j = 0; j < nj; j++) {
		for (var k = 0; k < nk; k++) {
			var u = 0;
			var v0 = j / nj;
			var v1 = (j + 1) / nj;
			var w0 = k / nk;
			var w1 = (k + 1 ) / nk;

			var x = meshgrid[0][i];
			var y0 = meshgrid[1][j];
			var y1 = meshgrid[1][j+1];
			var z0 = meshgrid[2][k];
			var z1 = meshgrid[2][k+1];

			positions.push(
				x, y0, z0,
				x, y1, z1,
				x, y0, z1,

				x, y0, z0,
				x, y1, z0,
				x, y1, z1
			);
			triangleUVWs.push(
				u, v0, w0,
				u, v1, w1,
				u, v0, w1,

				u, v0, w0,
				u, v1, w0,
				u, v1, w1
			);
		}
	}

	// console.log(
	// 	tilesX, tilesY,
	// 	meshgrid[0].length, meshgrid[1].length, meshgrid[2].length,
	// 	tex.shape[0], tex.shape[1]
	// );

	var volumeBounds = [
		[
			meshgrid[0][0],
			meshgrid[1][0],
			meshgrid[2][0]
		],
		[
			meshgrid[0][meshgrid[0].length-1],
			meshgrid[1][meshgrid[1].length-1],
			meshgrid[2][meshgrid[2].length-1]
		]
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
