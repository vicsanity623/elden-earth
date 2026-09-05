// ============================================================
// Elden Earth — 3D Character Model (Three.js WebGL Custom Layer)
// Renders animated .GLB models at player GPS with Idle <-> Walk blending.
// ============================================================
const Character3D = (() => {
  let mapInstance = null;
  let customLayer = null;
  let scene, camera, renderer;
  let mixer = null;
  let currentAction = null;
  let animationsMap = {};
  let currentModel = null;
  let playerCoords = { lng: -112.0740, lat: 33.4484 };
  let lastPosTime = Date.now();
  let lastCoords = null;
  let isWalking = false;
  let modelHeading = 0;

  function init(map, initialLng, initialLat) {
    mapInstance = map;
    playerCoords = { lng: initialLng, lat: initialLat };

    // Mapbox Custom WebGL Layer for Three.js
    customLayer = {
      id: "3d-player-character",
      type: "custom",
      renderingMode: "3d",
      onAdd: function (map, gl) {
        camera = new THREE.Camera();
        scene = new THREE.Scene();

        // Balanced Lighting for Dark Map
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xf0d38a, 2.0);
        dirLight.position.set(20, 50, 20);
        scene.add(dirLight);

        const dirLight2 = new THREE.DirectionalLight(0x4fd6c4, 1.2);
        dirLight2.position.set(-20, -50, 10);
        scene.add(dirLight2);

        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;

        // Load saved character model
        const state = Store.get();
        const selectedId = state?.player?.model3d || "soldier";
        loadModel(selectedId);
      },
      render: function (gl, matrix) {
        if (!currentModel) return;

        const modelCoord = mapboxgl.MercatorCoordinate.fromLngLat(
          [playerCoords.lng, playerCoords.lat],
          0
        );

        const scale = modelCoord.meterInMercatorCoordinateUnits() * (currentModel.userData.scale || 4.8);

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(modelCoord.x, modelCoord.y, modelCoord.z)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
          .multiply(new THREE.Matrix4().makeRotationY(modelHeading));

        camera.projectionMatrix = m.multiply(l);

        // CLEAR DEPTH BUFFER: Ensures character renders on top of all 3D buildings!
        gl.clear(gl.DEPTH_BUFFER_BIT);

        renderer.resetState();
        renderer.render(scene, camera);
      },
    };

    if (mapInstance.getLayer("3d-player-character")) {
      mapInstance.removeLayer("3d-player-character");
    }
    mapInstance.addLayer(customLayer);

    // Power-Efficient Animation Loop
    let clock = new THREE.Clock();
    let animFrameId = null;

    function animate() {
      if (document.hidden) {
        animFrameId = null;
        return;
      }
      animFrameId = requestAnimationFrame(animate);
      if (mixer) {
        const delta = clock.getDelta();
        mixer.update(delta);
        if (mapInstance) mapInstance.triggerRepaint();
      }
    }
    animate();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !animFrameId) {
        clock.getDelta();
        animate();
      }
    });
  }

  function loadModel(characterId) {
    const config = CONFIG.AVAILABLE_CHARACTERS.find((c) => c.id === characterId) || CONFIG.AVAILABLE_CHARACTERS[0];
    const loader = new THREE.GLTFLoader();

    loader.load(
      config.file,
      (gltf) => {
        if (currentModel) scene.remove(currentModel);

        currentModel = gltf.scene;
        currentModel.userData.scale = config.scale;

        // Set up skeletal animation clips
        mixer = new THREE.AnimationMixer(currentModel);
        animationsMap = {};

        gltf.animations.forEach((clip) => {
          animationsMap[clip.name.toLowerCase()] = mixer.clipAction(clip);
        });

        // Auto-detect Idle and Walk animations
        const idleKey = Object.keys(animationsMap).find(k => k.includes("idle") || k.includes("survey") || k.includes("static")) || Object.keys(animationsMap)[0];
        const walkKey = Object.keys(animationsMap).find(k => k.includes("walk") || k.includes("run") || k.includes("move")) || Object.keys(animationsMap)[1];

        if (idleKey && animationsMap[idleKey]) {
          currentAction = animationsMap[idleKey];
          currentAction.setEffectiveTimeScale(0.8);
          currentAction.play();
        }

        // Slow down walk animation so it's smooth and grounded
        if (walkKey && animationsMap[walkKey]) {
          animationsMap[walkKey].setEffectiveTimeScale(0.55);
        }

        currentModel.userData.idleKey = idleKey;
        currentModel.userData.walkKey = walkKey;

        scene.add(currentModel);
        console.log(`[Character3D] Loaded ${config.name} successfully.`);
      },
      undefined,
      (err) => console.warn("[Character3D] Load error:", err)
    );
  }

  function setPlayerPosition(lng, lat) {
    const now = Date.now();
    playerCoords = { lng, lat };

    if (lastCoords) {
      const dist = Geo.haversine(lastCoords.lat, lastCoords.lng, lat, lng);
      const elapsed = (now - lastPosTime) / 1000;
      const speed = elapsed > 0 ? dist / elapsed : 0;

      if (dist > 0.5) {
        modelHeading = Math.atan2(lng - lastCoords.lng, lat - lastCoords.lat);
      }

      const walkingNow = speed > 0.45;
      if (walkingNow !== isWalking && currentModel) {
        isWalking = walkingNow;
        const nextKey = isWalking ? currentModel.userData.walkKey : currentModel.userData.idleKey;

        if (nextKey && animationsMap[nextKey] && currentAction !== animationsMap[nextKey]) {
          const nextAction = animationsMap[nextKey];
          nextAction.reset().fadeIn(0.3).play();
          if (currentAction) currentAction.fadeOut(0.3);
          currentAction = nextAction;
        }
      }
    }

    lastCoords = { lng, lat };
    lastPosTime = now;
  }

  function changeCharacter(characterId) {
    const state = Store.get();
    if (!state.player) state.player = {};
    state.player.model3d = characterId;
    Store.save();
    loadModel(characterId);
  }

  return { init, setPlayerPosition, changeCharacter, loadModel };
})();
