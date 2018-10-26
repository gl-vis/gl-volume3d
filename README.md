gl-volume3d
=====================
Visualization module for volumetric data.

# Example

```javascript
var createScene      = require('gl-plot3d');
var createVolume     = require('gl-volume3d');

var scene = createScene();

var width = 64;
var height = 64;
var depth = 64;

var meshgrid = [[], [], []];

for (var i=0; i<width; i++) meshgrid[0].push(i);
for (var i=0; i<height; i++) meshgrid[1].push(i);
for (var i=0; i<depth; i++) meshgrid[2].push(i);

var data = new Uint16Array(width*height*depth)
for (var z=0; z<depth; z++)
for (var y=0; y<height; y++)
for (var x=0; x<width; x++) {
	var value = 1500 + 500 * (
		Math.sin(3 * 2*Math.PI*(z/depth-0.5)) +
		Math.cos(4 * 2*Math.PI*(x/width-0.5)) +
		Math.sin(5 * 2*Math.PI*(h/height-0.5))
	);
	data[z*height*width + y*width + x] = value;
}

var volumePlot = createVolume({
	gl: gl,
	values: data,
	meshgrid: meshgrid,
	isoBounds: [1600, 2000],
	intensityBounds: [1000, 2000],
	colormap: 'portland'
});

scene.add(gl);
```

[Try out the example in your browser](http://gl-vis.github.io/gl-volume3d/)

# Install

```
npm i gl-volume3d
```

# Basic interface

## Constructor

#### `var volume = require('gl-volume3d')(params, bounds)`
Creates a volume visualization out of a 3D array.

* `params` is an object that has the following properties:

	+ `gl` *(Required)* WebGL context to use
    + `values` *(Required)* An flattened 3D array of values
    + `meshgrid` *(Required)* Meshgrid to use for the value coordinates
    + `isoBounds` *(Recommended)* The range of values to render in the volume. Defaults  to the minimum and maximum values of the values array.
    + `intensityBounds` *(Optional)* The range of values to map to [0..1] intensities in the colormap. Defaults to the isoBounds value.
    + `colormap` *(Optional)* Name of the color map to use.
    + `alphamap` *(Optional)* Opacity lookup table, a 256-element array that maps intensity to voxel opacity. The first element is intensity 0 (after intensityBounds mapping), the last element is intensity 1.
    + `opacity` *(Optional)* Multiplier for the voxel opacities. Used for controlling the volume transparency.
	* `clipBounds` *(Optional)* Bounds object that tells what part of the volume to display. It defaults to [ [meshgrid[0][0], meshgrid[1][0], meshgrid[2][0]], [meshgrid[0][-1], meshgrid[1][-1], meshgrid[2][-1]] ].

**Returns** A volume plot object that can be passed to gl-mesh3d.

# Credits
(c) 2013-2018 Mikola Lysenko, Ilmari Heikkinen. MIT License
