# assets/

Drop authored models here (`.glb` preferred) and point a slot in
`js/scene/assets.js` → `ASSET_MANIFEST` at them, e.g.

```js
golfer: { url: 'assets/golfer.glb', position: [-0.55, 0, 0.35], rotationY: Math.PI / 2, scale: 1, castShadow: true },
```

Export from Blender at metre scale with +Y up and the origin at the model's
base. Characters need an animation clip named `swing` (optionally `idle`).
