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

	var zTilesX = Math.floor(maxTextureSize / width);
	var zTilesY = Math.floor(maxTextureSize / height);
	var maxZTiles = zTilesX * zTilesY;

	var yTilesX = Math.floor(maxTextureSize / width);
	var yTilesY = Math.floor(maxTextureSize / depth);
	var maxYTiles = yTilesX * yTilesY;

	var xTilesX = Math.floor(maxTextureSize / depth);
	var xTilesY = Math.floor(maxTextureSize / height);
	var maxXTiles = xTilesX * xTilesY;

	if (maxZTiles < depth || maxYTiles < height || maxXTiles < width) {
		throw new Error("Volume too large to fit in a texture");
	}

	zTilesY = Math.ceil(depth / zTilesX);
	yTilesY = Math.ceil(height / yTilesX);
	xTilesY = Math.ceil(width / xTilesX);

	var valuesImgZ = new Uint8Array(zTilesX * width * zTilesY * height * 4);
	var valuesImgY = new Uint8Array(yTilesX * width * yTilesY * depth * 4);
	var valuesImgX = new Uint8Array(xTilesX * depth * xTilesY * height * 4);

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

		var zTY = Math.floor(z / zTilesX);
		var zTX = z - (zTilesX * zTY);
		var zI = y * width + x;
		var zIX = zTX * width;
		var zIY = zTY * height;
		var zY = Math.floor(zI / width);
		var zX = zI - (zY * width);
		zY += zIY;
		zX += zIX;
		var zOff = zY * (zTilesX * width) + zX;

		valuesImgZ[zOff * 4 ] = r;
		valuesImgZ[zOff * 4 + 1] = g;
		valuesImgZ[zOff * 4 + 2] = b;
		valuesImgZ[zOff * 4 + 3] = a;

		var yTY = Math.floor(y / yTilesX);
		var yTX = y - (yTilesX * yTY);
		var yI = z * width + x;
		var yIX = yTX * width;
		var yIY = yTY * depth;
		var yY = Math.floor(yI / width);
		var yX = yI - (yY * width);
		yY += yIY;
		yX += yIX;
		var yOff = yY * (yTilesX * width) + yX;

		valuesImgY[yOff * 4] = r;
		valuesImgY[yOff * 4 + 1] = g;
		valuesImgY[yOff * 4 + 2] = b;
		valuesImgY[yOff * 4 + 3] = a;

		var xTY = Math.floor(x / xTilesX);
		var xTX = x - (xTilesX * xTY);
		var xI = y * depth + z;
		var xIX = xTX * depth;
		var xIY = xTY * height;
		var xY = Math.floor(xI / depth);
		var xX = xI - (xY * depth);
		xY += xIY;
		xX += xIX;
		var xOff = xY * (xTilesX * depth) + xX;

		valuesImgX[xOff * 4] = r;
		valuesImgX[xOff * 4 + 1] = g;
		valuesImgX[xOff * 4 + 2] = b;
		valuesImgX[xOff * 4 + 3] = a;
	}

	var texZ = createTexture(gl, [zTilesX * width, zTilesY * height]);
	texZ.minFilter = gl.LINEAR;
	texZ.magFilter = gl.LINEAR;
	texZ.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texZ.shape[0], texZ.shape[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgZ);

	var texY = createTexture(gl, [yTilesX * width, yTilesY * depth]);
	texY.minFilter = gl.LINEAR;
	texY.magFilter = gl.LINEAR;
	texY.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texY.shape[0], texY.shape[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgY);

	var texX = createTexture(gl, [xTilesX * depth, xTilesY * height]);
	texX.minFilter = gl.LINEAR;
	texX.magFilter = gl.LINEAR;
	texX.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texX.shape[0], texX.shape[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgX);


	var meshes = [];


	// Create Z stack mesh [z grows]

	var positions = [];
	var triangleUVs = [];

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

	for (var i = 0; i < depth; i++) {
		var zTY = Math.floor(i / zTilesX);
		var zTX = i - (zTilesX * zTY);
		var u0 = zTX / zTilesX;
		var u1 = (zTX + 1) / zTilesX;
		var v0 = zTY / zTilesY;
		var v1 = (zTY + 1) / zTilesY;

		positions.push(
			meshgrid[0][0], meshgrid[1][0], meshgrid[2][i],
			modelEX,        meshgrid[1][0], meshgrid[2][i],
			modelEX,        modelEY,        meshgrid[2][i],
			meshgrid[0][0], meshgrid[1][0], meshgrid[2][i],
			modelEX,        modelEY,        meshgrid[2][i],
			meshgrid[0][0], modelEY,        meshgrid[2][i]
		);

		triangleUVs.push(
			u0, v0,
			u1, v0,
			u1, v1,
			u0, v0,
			u1, v1,
			u0, v1
		);
	}

	for (var i = positions.length-1, j = triangleUVs.length-1; i >= 0; i -= 3, j -= 2) {
		positions.push(positions[i-2], positions[i-1], positions[i]);
		triangleUVs.push(triangleUVs[j-1], triangleUVs[j])
	}

	meshes.push(
		createTriMesh(gl, {
			positions: positions,
			triangleUVs: triangleUVs,

			texture: texZ,
			colormap: colormap,
			alphamap: alphamap,
			opacity: opacity,
			transparent: true,

			isoBounds: isoBounds,
			intensityBounds: intensityBounds,
			clipBounds: clipBounds
		})
	)


	// Create Y stack mesh [y grows]

	var positions = [];
	var triangleUVs = [];

	for (var i = height-1; i >= 0; i--) {
		var yTY = Math.floor(i / yTilesX);
		var yTX = i - (yTilesX * yTY);
		var u0 = yTX / yTilesX;
		var u1 = (yTX + 1) / yTilesX;
		var v0 = yTY / yTilesY;
		var v1 = (yTY + 1) / yTilesY;

		positions.push(
			modelSX, meshgrid[1][i], modelSZ,
			modelEX, meshgrid[1][i], modelSZ,
			modelEX, meshgrid[1][i], modelEZ,
			modelSX, meshgrid[1][i], modelSZ,
			modelEX, meshgrid[1][i], modelEZ,
			modelSX, meshgrid[1][i], modelEZ
		);

		triangleUVs.push(
			u0, v0,
			u1, v0,
			u1, v1,
			u0, v0,
			u1, v1,
			u0, v1
		);
	}

	for (var i = positions.length-1, j = triangleUVs.length-1; i >= 0; i -= 3, j -= 2) {
		positions.push(positions[i-2], positions[i-1], positions[i]);
		triangleUVs.push(triangleUVs[j-1], triangleUVs[j])
	}

	meshes.push(
		createTriMesh(gl, {
			positions: positions,
			triangleUVs: triangleUVs,

			texture: texY,
			colormap: colormap,
			alphamap: alphamap,
			opacity: opacity,
			transparent: true,

			isoBounds: isoBounds,
			intensityBounds: intensityBounds,
			clipBounds: clipBounds			
		})
	)


	// Create X stack mesh [x grows]

	var positions = [];
	var triangleUVs = [];

	for (var i = 0; i < width; i++) {
		var xTY = Math.floor(i / xTilesX);
		var xTX = i - (xTilesX * xTY);
		var u0 = xTX / xTilesX;
		var u1 = (xTX + 1) / xTilesX;
		var v0 = xTY / xTilesY;
		var v1 = (xTY + 1) / xTilesY;


		positions.push(
			meshgrid[0][i], modelSY, modelSZ,
			meshgrid[0][i], modelEY, modelSZ,
			meshgrid[0][i], modelEY, modelEZ,
			meshgrid[0][i], modelSY, modelSZ,
			meshgrid[0][i], modelEY, modelEZ,
			meshgrid[0][i], modelSY, modelEZ
		);

		triangleUVs.push(
			u0, v0,
			u0, v1,
			u1, v1,
			u0, v0,
			u1, v1,
			u1, v0
		);
	}

	for (var i = positions.length-1, j = triangleUVs.length-1; i >= 0; i -= 3, j -= 2) {
		positions.push(positions[i-2], positions[i-1], positions[i]);
		triangleUVs.push(triangleUVs[j-1], triangleUVs[j])
	}

	meshes.push(
		createTriMesh(gl, {
			positions: positions,
			triangleUVs: triangleUVs,

			texture: texX,
			colormap: colormap,
			alphamap: alphamap,
			opacity: opacity,
			transparent: true,

			isoBounds: isoBounds,
			intensityBounds: intensityBounds,
			clipBounds: clipBounds
		})
	)

	meshes = [meshes[2], meshes[1], meshes[0]];

	v = vec4.create();
	var inv = mat4.create();

	return {
		meshes: meshes,
		texX: texX,
		texY: texY,
		texZ: texZ,

		bounds: [
			[modelSX, modelSY, modelSZ],
			[modelEX, modelEY, modelEZ]
		],

		draw: function(cameraParams) {
			this.drawTransparent(cameraParams);
		},

		drawTransparent: function(cameraParams) {
			vec4.set(v, 0, 0, 1, 0);
			mat4.invert(inv, cameraParams.view);
			vec4.transformMat4(v, v, inv);
			v[0] = Math.abs(v[0]);
			v[1] = Math.abs(v[1]);
			v[2] = Math.abs(v[2]);
			if (v[2] < v[1]) {
				if (v[2] < v[0]) {
					this.meshes[2].draw(cameraParams);
					if (v[0] < v[1]) {
						this.meshes[0].draw(cameraParams);
						this.meshes[1].draw(cameraParams);
					} else {
						this.meshes[1].draw(cameraParams);
						this.meshes[0].draw(cameraParams);
					}
				} else {
					this.meshes[0].draw(cameraParams);
					this.meshes[2].draw(cameraParams);
					this.meshes[1].draw(cameraParams);
				}
			} else if (v[2] < v[0]) {
				this.meshes[1].draw(cameraParams);
				this.meshes[2].draw(cameraParams);
				this.meshes[0].draw(cameraParams);
			} else if (v[1] < v[0]) {
				this.meshes[1].draw(cameraParams);
				this.meshes[0].draw(cameraParams);
				this.meshes[2].draw(cameraParams);
			} else {
				this.meshes[0].draw(cameraParams);
				this.meshes[1].draw(cameraParams);
				this.meshes[2].draw(cameraParams);
			}
		},

		isOpaque: function() {
			return true;
		},

		isTransparent: function() {
			return false;
		},

		dispose: function() {
			this.meshes[0].dispose();
			this.meshes[1].dispose();
			this.meshes[2].dispose();
		}
	};
};

