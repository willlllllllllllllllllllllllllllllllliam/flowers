# Reference code for regression tests

These two files preserve the earlier V2 renderer for comparisons. They do not enter the public site.

Source: the local Flowers V2 checkpoint `81e5cf8ad89f71aa03f8330e6645a276379d700e`.

- `v2-original-garden.js` SHA-256: `23fc6db4476228bdb8f656902e46272bb82ab8849420bfce8c112a740c127620`
- `v2-original-canvas-renderer.js` SHA-256: `2c549512b7870b9b9f9010208a6ca9eb2a2c17722f0a311cd49f46442b315809`

The geometry tests remove schedule metadata before a comparison. The Canvas tests compare the final pixels in both themes.

These files are test inputs. Do not edit them to make a failed test pass. The project MIT license also covers these files.
