"use strict";

const createTexture = require('gl-texture2d');
const createTriMesh = require('./lib/simplemesh.js');

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
	const { values, dimensions, isoBounds, intensityBounds, clipBounds, colormap } = params;
	const [width, height, depth] = dimensions;

	var valuesImgZ = new Uint8Array(values.length * 4);
	var valuesImgX = new Uint8Array(values.length * 4);
	var valuesImgY = new Uint8Array(values.length * 4);
	for (var i=0; i<values.length; i++) {
		var v = values[i]; // (values[i] - isoBounds[0]) / (isoBounds[1] - isoBounds[0]);
		// v = 255 * (v > 0 ? (v < 1 ? v : 1) : 0);
		var r = v;
		var g = v;
		var b = v;
		var a = v;
		valuesImgZ[i*4] = r;
		valuesImgZ[i*4+1] = g;
		valuesImgZ[i*4+2] = b;
		valuesImgZ[i*4+3] = a;

		let z = Math.floor(i / (width*height));
		let y = Math.floor((i - z*width*height) / width);
		let x = i - z*width*height - y*width;

		let xOff = x * depth*height + y * depth + z;
		valuesImgX[xOff * 4] = r;
		valuesImgX[xOff * 4 + 1] = g;
		valuesImgX[xOff * 4 + 2] = b;
		valuesImgX[xOff * 4 + 3] = a;

		let yOff = y * width*depth + z * depth + x;
		valuesImgY[yOff * 4] = r;
		valuesImgY[yOff * 4 + 1] = g;
		valuesImgY[yOff * 4 + 2] = b;
		valuesImgY[yOff * 4 + 3] = a;
	}

	var texZ = createTexture(gl, [width, height*depth]);
	texZ.minFilter = gl.LINEAR;
	texZ.magFilter = gl.LINEAR;
	texZ.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height*depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgZ);

	var texX = createTexture(gl, [depth, width*height]);
	texX.minFilter = gl.LINEAR;
	texX.magFilter = gl.LINEAR;
	texX.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, depth, width*height, 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgX);

	var texY = createTexture(gl, [width, height*depth]);
	texY.minFilter = gl.LINEAR;
	texY.magFilter = gl.LINEAR;
	texY.bind();
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height*depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, valuesImgY);


	var meshes = [];


	// Create Z stack mesh [z grows]

	var positions = [];
	var triangleUVs = [];

	for (var i = 0; i < depth; i++) {
		var u0 = 0;
		var u1 = 1;
		var v0 = i / depth;
		var v1 = (i + 1) / depth;

		positions.push(
			0,     0,      i,
			width, 0,      i,
			width, height, i,
			0,     0,      i,
			width, height, i,
			0,     height, i
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
			positions,
			triangleUVs,

			texture: texZ,
			colormap,

			isoBounds,
			intensityBounds,
			clipBounds
		})
	)


	// Create Y stack mesh [y grows]

	var positions = [];
	var triangleUVs = [];

	for (var i = height-1; i >= 0; i--) {
		var u0 = 0;
		var u1 = 1;
		var v0 = i / height;
		var v1 = (i + 1) / height;

		positions.push(
			0,     i, 0,
			width, i, 0,
			width, i, depth,
			0,     i, 0,
			width, i, depth,
			0,     i, depth
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
			positions,
			triangleUVs,

			texture: texY,
			colormap,

			isoBounds,
			intensityBounds,
			clipBounds
		})
	)


	// Create X stack mesh [x grows]

	var positions = [];
	var triangleUVs = [];

	for (var i = 0; i < width; i++) {
		var u0 = 0;
		var u1 = 1;
		var v0 = i / width;
		var v1 = (i + 1) / width;

		positions.push(
			i, 0,      0,
			i, height, 0,
			i, height, depth,
			i, 0,      0,
			i, height, depth,
			i, 0,      depth
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
			positions,
			triangleUVs,

			texture: texX,
			colormap,

			isoBounds,
			intensityBounds,
			clipBounds
		})
	)


	return {
		draw: function(cameraParams) {
			meshes.forEach(m => m.draw(cameraParams));
		}
	};
};

