"use strict";

const vec4 = require('gl-vec4');
const mat4 = require('gl-mat4');
const createTexture = require('gl-texture2d');
const createTriMesh = require('./lib/simplemesh.js');


const findLastSmallerIndex = function(points, v) {
  for (var i=0; i<points.length; i++) {
  	var p = points[i];
  	if (p === v) return i;
    if (p > v) return i-1;
  }
  return i;
};

const clamp = function(v, min, max) {
	return v < min ? min : (v > max ? max : v);
};

const lerp = function(u, v, t) {
	return u * (1-t) + v * t;
};

const sampleMeshgridScalar = function(x, y, z, array, meshgrid, clampOverflow) {
	var w = meshgrid[0].length;
	var h = meshgrid[1].length;
	var d = meshgrid[2].length;

	// Find the index of the nearest smaller value in the meshgrid for each coordinate of (x,y,z).
	// The nearest smaller value index for x is the index x0 such that
	// meshgrid[0][x0] < x and for all x1 > x0, meshgrid[0][x1] >= x.
	var x0 = findLastSmallerIndex(meshgrid[0], x);
	var y0 = findLastSmallerIndex(meshgrid[1], y);
	var z0 = findLastSmallerIndex(meshgrid[2], z);

	// Get the nearest larger meshgrid value indices.
	// From the above "nearest smaller value", we know that
	//   meshgrid[0][x0] < x
	//   meshgrid[0][x0+1] >= x
	var x1 = x0 + 1;
	var y1 = y0 + 1;
	var z1 = z0 + 1;

	if (meshgrid[0][x0] === x) x1 = x0;
	if (meshgrid[1][y0] === y) y1 = y0;
	if (meshgrid[2][z0] === z) z1 = z0;

	if (clampOverflow) {
		x0 = clamp(x0, 0, w-1);
		x1 = clamp(x1, 0, w-1);
		y0 = clamp(y0, 0, h-1);
		y1 = clamp(y1, 0, h-1);
		z0 = clamp(z0, 0, d-1);
		z1 = clamp(z1, 0, d-1);
	}

	// Reject points outside the meshgrid, return a zero.
	if (x0 < 0 || y0 < 0 || z0 < 0 || x1 >= w || y1 >= h || z1 >= d) {
		return 0;
	}

	// Normalize point coordinates to 0..1 scaling factor between x0 and x1.
	var xf = (x - meshgrid[0][x0]) / (meshgrid[0][x1] - meshgrid[0][x0]);
	var yf = (y - meshgrid[1][y0]) / (meshgrid[1][y1] - meshgrid[1][y0]);
	var zf = (z - meshgrid[2][z0]) / (meshgrid[2][z1] - meshgrid[2][z0]);

	if (xf < 0 || xf > 1 || isNaN(xf)) xf = 0;
	if (yf < 0 || yf > 1 || isNaN(yf)) yf = 0;
	if (zf < 0 || zf > 1 || isNaN(zf)) zf = 0;

	var z0off = z0*w*h;
	var z1off = z1*w*h;

	var y0off = y0*w;
	var y1off = y1*w;

	var x0off = x0;
	var x1off = x1;

	// Sample data array around the (x,y,z) point.
	//  vZYX = array[zZoff + yYoff + xXoff]
	var v000 = array[y0off + z0off + x0off];
	var v001 = array[y0off + z0off + x1off];
	var v010 = array[y1off + z0off + x0off];
	var v011 = array[y1off + z0off + x1off];
	var v100 = array[y0off + z1off + x0off];
	var v101 = array[y0off + z1off + x1off];
	var v110 = array[y1off + z1off + x0off];
	var v111 = array[y1off + z1off + x1off];

	var result, tmp, tmp2;

	// Average samples according to distance to point.
	result = lerp(v000, v001, xf);
	tmp = lerp(v010, v011, xf);
	result = lerp(result, tmp, yf);
	tmp = lerp(v100, v101, xf);
	tmp2 = lerp(v110, v111, xf);
	tmp = lerp(tmp, tmp2, yf);
	result = lerp(result, tmp, zf);

	return result;
};

/*
	Converts values and meshgrid dataset into an uniformly sampled
	grid with the given dimensions.
*/
const uniformResample = function(values, meshgrid, dimensions) {
	var [sx, sy, sz] = [meshgrid[0][0], meshgrid[1][0], meshgrid[2][0]];
	var [ex, ey, ez] = [meshgrid[0][meshgrid[0].length-1], meshgrid[1][meshgrid[1].length-1], meshgrid[2][meshgrid[2].length-1]];

	var newValues = [];
	
	var [w, h, d] = dimensions;
	var w1 = w-1, h1 = h-1, d1 = d-1;

	for (var z=0; z<d; z++) {
		var rz = sz + (ez-sz) * (z / d1); 
		for (var y=0; y<h; y++) {
			var ry = sy + (ey-sy) * (y / h1); 
			for (var x=0; x<w; x++) {
				var rx = sx + (ex-sx) * (x / w1); 
				newValues.push(sampleMeshgridScalar(rx, ry, rz, values, meshgrid, true));
			}
		}
	}
	return newValues;
};

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
	const { dimensions, isoBounds, intensityBounds, clipBounds, colormap, alphamap, opacity, meshgrid } = params;
	const rawValues = params.values;
	const [width, height, depth] = dimensions;
	var values;
	if (meshgrid) {
		values = uniformResample(rawValues, meshgrid, dimensions);
	} else {
		values = rawValues;
	}

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

	var modelSX = 0;
	var modelSY = 0;
	var modelSZ = 0;

	var modelEX = width;
	var modelEY = height;
	var modelEZ = depth;

	if (meshgrid) {
		modelSX = meshgrid[0][0];
		modelSY = meshgrid[1][0];
		modelSZ = meshgrid[2][0];

		modelEX = meshgrid[0][meshgrid[0].length-1];
		modelEY = meshgrid[1][meshgrid[1].length-1];
		modelEZ = meshgrid[2][meshgrid[2].length-1];
	}

	var rz = modelSZ + (modelEZ - modelSZ) * (i / (depth-1));

	for (var i = 0; i < depth; i++) {
		var u0 = 0;
		var u1 = 1;
		var v0 = i / depth;
		var v1 = (i + 1-3/depth) / depth;

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

	for (var i=0; i<positions.length; i+=3) {
		positions[i] = (positions[i] / width) * (modelEX-modelSX) + modelSX;
		positions[i + 1] = (positions[i+1] / height) * (modelEY-modelSY) + modelSY;
		positions[i + 2] = (positions[i+2] / depth) * (modelEZ-modelSZ) + modelSZ;
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
			alphamap,
			opacity,

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

	for (var i=0; i<positions.length; i+=3) {
		positions[i] = (positions[i] / width) * (modelEX-modelSX) + modelSX;
		positions[i + 1] = (positions[i+1] / height) * (modelEY-modelSY) + modelSY;
		positions[i + 2] = (positions[i+2] / depth) * (modelEZ-modelSZ) + modelSZ;
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
			alphamap,
			opacity,

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
		var v1 = (i + 1-3/width) / width;

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

	for (var i=0; i<positions.length; i+=3) {
		positions[i] = (positions[i] / width) * (modelEX-modelSX) + modelSX;
		positions[i + 1] = (positions[i+1] / height) * (modelEY-modelSY) + modelSY;
		positions[i + 2] = (positions[i+2] / depth) * (modelEZ-modelSZ) + modelSZ;
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
			alphamap,
			opacity,

			isoBounds,
			intensityBounds,
			clipBounds
		})
	)

	meshes = [meshes[2], meshes[1], meshes[0]];

	v = vec4.create();
	const inv = mat4.create();

	return {
		draw: function(cameraParams) {
			vec4.set(v, 0, 0, 1, 0);
			mat4.invert(inv, cameraParams.view);
			vec4.transformMat4(v, v, inv);
			v[0] = Math.abs(v[0]);
			v[1] = Math.abs(v[1]);
			v[2] = Math.abs(v[2]);
			if (v[2] < v[1]) {
				if (v[2] < v[0]) {
					meshes[2].draw(cameraParams);
					if (v[0] < v[1]) {
						meshes[0].draw(cameraParams);
						meshes[1].draw(cameraParams);
					} else {
						meshes[1].draw(cameraParams);
						meshes[0].draw(cameraParams);
					}
				} else {
					meshes[0].draw(cameraParams);
					meshes[2].draw(cameraParams);
					meshes[1].draw(cameraParams);
				}
			} else if (v[2] < v[0]) {
				meshes[1].draw(cameraParams);
				meshes[2].draw(cameraParams);
				meshes[0].draw(cameraParams);
			} else if (v[1] < v[0]) {
				meshes[1].draw(cameraParams);
				meshes[0].draw(cameraParams);
				meshes[2].draw(cameraParams);
			} else {
				meshes[0].draw(cameraParams);
				meshes[1].draw(cameraParams);
				meshes[2].draw(cameraParams);
			}
		}
	};
};

