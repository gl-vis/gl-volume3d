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

	var ni = width - 1;
	var nj = height - 1;
	var nk = depth - 1;

	for (var q = 0; q < 6; q++) {

		var start_i = 0;
		var start_j = 0;
		var start_k = 0;

		var stop_i = ni - 1;
		var stop_j = nj - 1;
		var stop_k = nk - 1;

		if (q === 0) { stop_i = start_i; }
		if (q === 1) { stop_j = start_j; }
		if (q === 2) { stop_k = start_k; }

		if (q === 3) { start_i = stop_i; }
		if (q === 4) { start_j = stop_j; }
		if (q === 5) { start_k = stop_k; }

		for (var i = start_i; i <= stop_i; i++) {
			for (var j = start_j; j <= stop_j; j++) {
				for (var k = start_k; k <= stop_k; k++) {
					var u0 = i / ni;
					var v0 = j / nj;
					var w0 = k / nk;
					var u1 = (i + 1) / ni;
					var v1 = (j + 1) / nj;
					var w1 = (k + 1) / nk;

					var x0 = meshgrid[0][i];
					var y0 = meshgrid[1][j];
					var z0 = meshgrid[2][k];
					var x1 = meshgrid[0][i+1];
					var y1 = meshgrid[1][j+1];
					var z1 = meshgrid[2][k+1];

					if (q === 0) { u1 = u0;	x1 = x0; }
					if (q === 1) { v1 = v0;	y1 = y0; }
					if (q === 2) { w1 = w0;	z1 = z0; }

					if (q === 3) { u0 = u1;	x0 = x1; }
					if (q === 4) { v0 = v1;	y0 = y1; }
					if (q === 5) { w0 = w1;	z0 = z1; }

					// front-0:
					positions.push(
						x1, y0, z0,
						x0, y1, z0,
						x0, y0, z1
					);
					triangleUVWs.push(
						u1, v0, w0,
						u0, v1, w0,
						u0, v0, w1
					);
					// front-1:
					positions.push(
						x0, y1, z1,
						x1, y0, z1,
						x1, y1, z0
					);
					triangleUVWs.push(
						u0, v1, w1,
						u1, v0, w1,
						u1, v1, w0
					);
					// back-0:
					positions.push(
						x0, y1, z0,
						x1, y0, z0,
						x0, y0, z1
					);
					triangleUVWs.push(
						u0, v1, w0,
						u1, v0, w0,
						u0, v0, w1
					);
					// back-1:
					positions.push(
						x1, y0, z1,
						x0, y1, z1,
						x1, y1, z0
					);
					triangleUVWs.push(
						u1, v0, w1,
						u0, v1, w1,
						u1, v1, w0
					);
				}
			}
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
