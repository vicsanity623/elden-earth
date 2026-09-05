// ============================================================
// Elden Earth — 3D Parcel Foliage & Mushroom Landmarks (Zero-Context High-Perf)
// ============================================================
const Foliage = (() => {
  let mapInstance = null;
  let isImageLoaded = false;
  let activeMarkers = [];
  let cachedMushroomImgSrc = null;

  // Realistic stylized grass blade sprite
  function createGrassImage(callback) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <defs>
          <linearGradient id="bladeFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#a8f5ec"/>
            <stop offset="30%" stop-color="#2ecc71"/>
            <stop offset="85%" stop-color="#1b7a43"/>
            <stop offset="100%" stop-color="#0e4425"/>
          </linearGradient>

          <linearGradient id="bladeBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#58d68d"/>
            <stop offset="50%" stop-color="#229954"/>
            <stop offset="100%" stop-color="#0b301a"/>
          </linearGradient>

          <radialGradient id="rootShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,0.6)"/>
            <stop offset="70%" stop-color="rgba(0,0,0,0.2)"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>

        <ellipse cx="48" cy="90" rx="32" ry="5" fill="url(#rootShadow)"/>
        <path d="M 48 90 Q 24 65 18 38 Q 32 52 48 90" fill="url(#bladeBack)" opacity="0.9"/>
        <path d="M 48 90 Q 72 62 78 35 Q 64 50 48 90" fill="url(#bladeBack)" opacity="0.9"/>
        <path d="M 48 90 Q 34 50 30 20 Q 42 42 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 62 48 66 18 Q 54 40 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 45 32 48 6 Q 51 32 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 40 70 36 52 Q 44 64 48 90" fill="#a8f5ec"/>
        <path d="M 48 90 Q 56 70 60 52 Q 52 64 48 90" fill="#58d68d"/>
      </svg>
    `;

    const img = new Image(96, 96);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.onload = () => callback(img);
  }

  // Pre-render 3D Mushroom GLB ONCE into a lightweight image sprite
  function preloadMushroom() {
    if (typeof THREE === "undefined" || !THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    loader.load(
      "models/mush_common.glb",
      (gltf) => {
        try {
          const offCanvas = document.createElement("canvas");
          offCanvas.width = 128;
          offCanvas.height = 128;

          const renderer = new THREE.WebGLRenderer({ canvas: offCanvas, alpha: true, antialias: true });
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
          camera.position.set(0, 1.2, 2.5);
          camera.lookAt(0, 0.4, 0);

          const ambLight = new THREE.AmbientLight(0xffffff, 1.8);
          scene.add(ambLight);

          const dirLight = new THREE.DirectionalLight(0xf0d38a, 2.4);
          dirLight.position.set(3, 5, 4);
          scene.add(dirLight);

          const clone = gltf.scene.clone();
          const box = new THREE.Box3().setFromObject(clone);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 1.15 / maxDim;
          clone.scale.set(scale, scale, scale);

          box.setFromObject(clone);
          clone.position.y = -box.min.y;
          scene.add(clone);

          renderer.render(scene, camera);
          cachedMushroomImgSrc = offCanvas.toDataURL();

          // DISPOSE RENDERER IMMEDIATELY: Releases WebGL context so it never leaks!
          renderer.dispose();
          renderer.forceContextLoss();
          update();
        } catch (e) {
          console.warn("[Foliage] Pre-render notice:", e);
        }
      },
      undefined,
      (err) => {
        // Fallback mushroom emoji if GLB is missing
        cachedMushroomImgSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="50" font-size="48">🍄</text></svg>`
        );
        update();
      }
    );
  }

  // Zero-WebGL Lightweight Image Billboard
  function create3DMushroomElement() {
    const wrap = document.createElement("div");
    wrap.className = "parcel-prop-wrap";

    if (cachedMushroomImgSrc) {
      wrap.innerHTML = `<img src="${cachedMushroomImgSrc}" style="width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.7));display:block;">`;
    } else {
      wrap.innerHTML = `<span style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.7));">🍄</span>`;
    }

    return wrap;
  }

  function init(map) {
    mapInstance = map;
    preloadMushroom();

    createGrassImage((img) => {
      if (!mapInstance.hasImage("foliage-grass")) {
        mapInstance.addImage("foliage-grass", img, { pixelRatio: 2 });
      }
      isImageLoaded = true;
      setupLayers();
      update();
    });
  }

  function setupLayers() {
    if (!mapInstance || mapInstance.getSource("foliage-source")) return;

    mapInstance.addSource("foliage-source", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    const layers = mapInstance.getStyle().layers || [];
    const labelLayerId = layers.find(l => l.type === "symbol" && l.layout && l.layout["text-field"])?.id;

    mapInstance.addLayer({
      id: "foliage-layer",
      type: "symbol",
      source: "foliage-source",
      minzoom: 16.5,
      layout: {
        "icon-image": "foliage-grass",
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          16.5, ["*", 0.16, ["get", "scale"]],
          18.5, ["*", 0.32, ["get", "scale"]],
          20,   ["*", 0.52, ["get", "scale"]]
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          16.5, 0,
          17.2, 0.95
        ],
      },
    }, labelLayerId);
  }

  function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function update() {
    if (!mapInstance || !isImageLoaded || !mapInstance.getSource("foliage-source")) return;

    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : {};
    const tileSize = CONFIG.TILE_SIZE_METERS || 6.096;
    const grassFeatures = [];
    const zoom = mapInstance.getZoom();

    for (const tid in allPlots) {
      const p = allPlots[tid];
      const rarityKey = p.rarity?.key || p.rarity || "common";
      const px = parseInt(p.tx, 10);
      const py = parseInt(p.ty, 10);

      let seed = Math.abs(px * 374761393 + py * 668265263);

      const c = Geo.fromMercator(
        px * tileSize + tileSize / 2,
        py * tileSize + tileSize / 2
      );

      const tuftCount = 5 + Math.floor(seededRandom(seed++) * 3);

      for (let i = 0; i < tuftCount; i++) {
        const offsetX = (seededRandom(seed++) - 0.5) * 0.000036;
        const offsetY = (seededRandom(seed++) - 0.5) * 0.000036;
        const randomScale = 0.65 + seededRandom(seed++) * 0.5;

        grassFeatures.push({
          type: "Feature",
          properties: { scale: randomScale },
          geometry: {
            type: "Point",
            coordinates: [c.lon + offsetX, c.lat + offsetY]
          }
        });
      }

      // If Common Plot, place the 3D Common Mushroom slightly offset in the grass
      if (rarityKey === "common" && zoom >= 15.5) {
        const mushOffsetX = (seededRandom(seed++) - 0.5) * 0.000015;
        const mushOffsetY = (seededRandom(seed++) - 0.5) * 0.000015;

        const mushEl = create3DMushroomElement();
        const m = new mapboxgl.Marker({
          element: mushEl,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        })
          .setLngLat([c.lon + mushOffsetX, c.lat + mushOffsetY])
          .addTo(mapInstance);

        activeMarkers.push(m);
      }
    }

    mapInstance.getSource("foliage-source").setData({
      type: "FeatureCollection",
      features: grassFeatures,
    });
  }

  return { init, update };
})();
