gl-volume3d
=====================
Visualization module for volumetric data.

# Example

```javascript
var createScene      = require('gl-plot3d')
var createVolume     = require('gl-volume3d')

var scene = createScene()

var width = 64
var height = 64
var depth = 64

var data = new Uint16Array(width*height*depth)
for (var z=0; z<depth; z++)
for (var y=0; y<height; y++)
for (var x=0; x<width; x++) {
	var value = 1500 + 500 * (
		Math.sin(3 * 2*Math.PI*(z/depth-0.5)) +
		Math.cos(4 * 2*Math.PI*(x/width-0.5)) +
		Math.sin(5 * 2*Math.PI*(h/height-0.5))
	);
	data[z*height*width + y*width + x] = value
}

var dims = [width, height, depth]
var bounds = [[0,0,0], [width, height, depth]]

var volumePlot = createVolume({
	gl: gl,
	values: data,
	dimensions: dims,
	isoBounds: [1600, 2000],
	intensityBounds: [1000, 2000],
	colormap: 'portland'
}, bounds)

scene.add(gl)
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
    + `meshgrid` *(Optional)* Meshgrid to use for the value coordinates
    + `dimensions` *(Required)* The dimensions of the array. When used with meshgrid, sets the resolution of the 3D texture. When using meshgrid, the 3D texture values are sampled in an uniform fashion between the start and end coordinates of the meshgrid.
    + `isoBounds` *(Recommended)* The range of values to envelop with the isosurface. Defaults to [1, Infinity], which creates an isosurface that has all values 1 and larger inside it.
    + `intensityBounds` *(Optional)* The range of values to map to [0..1] intensities. Defaults to the minimum and maximum values of the values array.
    + `colormap` *(Optional)* Name of the color map to use.
    + `alphamap` *(Optional)* Opacity lookup table, a 256-element array that maps intensity to voxel opacity. The first element is intensity 0 (after intensityBounds mapping), the last element is intensity 1.
    + `opacity` *(Optional)* Multiplier for the voxel opacities. Used for controlling the volume transparency.

* `bounds` is a bounds object that tells what part of the 3D array to display. It defaults to [[0, 0, 0], [width, height, depth]].

**Returns** A volume plot object that can be passed to gl-mesh3d.

# Credits
(c) 2013-2017 Mikola Lysenko, Ilmari Heikkinen. MIT License
