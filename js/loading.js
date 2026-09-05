// ============================================================
// Elden Earth — Bootloader & 3D Cinematic Loading Stage
// ============================================================
const Bootloader = (() => {
  const el = (id) => document.getElementById(id);
  let loaderRenderer = null;
  let loaderScene = null;
  let loaderCamera = null;
  let loaderMixer = null;
  let loaderAnimId = null;

  function setProgress(percent, statusText) {
    const bar = el("loader-progress-bar");
    const status = el("loader-status-text");
    const percentText = el("loader-percent-text");

    if (bar) bar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${Math.round(percent)}%`;
    if (status) status.textContent = `> ${statusText}`;
  }

  async function step(ms, percent, text) {
    setProgress(percent, text);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Mount 3D CesiumMan in Slow-Motion with Auto-Framing
  function mount3DLoaderCharacter() {
    return new Promise((resolve) => {
      const canvas = el("loader-3d-canvas");
      if (!canvas || typeof THREE === "undefined" || !THREE.GLTFLoader) {
        resolve();
        return;
      }

      try {
        loaderCamera = new THREE.PerspectiveCamera(35, 220 / 200, 0.1, 100);
        loaderCamera.position.set(0, 0, 3.2);

        loaderScene = new THREE.Scene();

        // Balanced Cinematic Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        loaderScene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0x4fd6c4, 2.8);
        frontLight.position.set(2, 4, 3);
        loaderScene.add(frontLight);

        const rimLight = new THREE.DirectionalLight(0xf0d38a, 2.2);
        rimLight.position.set(-2, 2, -2);
        loaderScene.add(rimLight);

        loaderRenderer = new THREE.WebGLRenderer({
          canvas: canvas,
          alpha: true,
          antialias: true
        });
        loaderRenderer.setSize(220, 200);
        loaderRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Load CesiumMan with automatic scale & center framing
        const loader = new THREE.GLTFLoader();
        loader.load(
          "models/CesiumMan.glb",
          (gltf) => {
            const model = gltf.scene;

            // Auto-frame model height to fit the stage perfectly
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            const scale = 1.7 / (size.y || 1);
            model.scale.set(scale, scale, scale);

            // Center model vertically behind the spinning logo
            model.position.x = -center.x * scale;
            model.position.y = -center.y * scale + 0.1;
            model.position.z = -center.z * scale;

            // Turn CesiumMan to face slightly 3-quarters toward player
            model.rotation.y = 0.45;

            loaderScene.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
              loaderMixer = new THREE.AnimationMixer(model);
              const walkAction = loaderMixer.clipAction(gltf.animations[0]);
              // 40% slow-motion walk cycle
              walkAction.setEffectiveTimeScale(0.40);
              walkAction.play();
            }

            resolve();
          },
          undefined,
          (err) => {
            console.warn("[Bootloader] 3D character load notice:", err);
            resolve();
          }
        );

        const clock = new THREE.Clock();
        function animateLoader() {
          loaderAnimId = requestAnimationFrame(animateLoader);
          if (loaderMixer) {
            const delta = clock.getDelta();
            loaderMixer.update(delta);
          }
          if (loaderRenderer && loaderScene && loaderCamera) {
            loaderRenderer.render(loaderScene, loaderCamera);
          }
        }
        animateLoader();

      } catch (e) {
        console.warn("[Bootloader] 3D stage init notice:", e);
        resolve();
      }
    });
  }

  // Cleanly dispose of WebGL context when leaving loading screen
  function dispose3DLoader() {
    if (loaderAnimId) {
      cancelAnimationFrame(loaderAnimId);
      loaderAnimId = null;
    }
    if (loaderRenderer) {
      try {
        loaderRenderer.dispose();
        loaderRenderer.forceContextLoss();
      } catch (e) {}
      loaderRenderer = null;
    }
    loaderScene = null;
    loaderCamera = null;
    loaderMixer = null;
  }

  async function run(player, onComplete) {
    el("signin-screen")?.classList.add("hidden");
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.remove("hidden");

    // 1. Mount 3D Character Stage and wait for first frame
    setProgress(15, "Summoning explorer & core registries...");
    await mount3DLoaderCharacter();
    Store.load();

    try {
      // 2. Cloud Save (35%)
      await step(200, 35, `Synchronizing cloud profile: ${player.name || "Traveler"}...`);
      if (player.id && !player.id.startsWith("guest-")) {
        await Store.syncFromCloud(player.id);
      }

      // 3. Location (60%)
      await step(200, 60, "Acquiring high-accuracy GPS coordinates...");
      const coords = await new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          resolve({ latitude: 33.4484, longitude: -112.0740 });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => {
            console.warn("[Bootloader] Location defaulted:", err);
            resolve({ latitude: 33.4484, longitude: -112.0740 });
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
        );
      });

      // 4. Map Engine (75%)
      await step(200, 75, "Mounting 3D Vector engine & WebGL layers...");

      // 5. Global Plots Preload (90%)
      setProgress(90, "Pre-fetching claimed world plots from Firestore...");
      const db = Store.getDb();
      if (db) {
        try {
          const snapshot = await db.collection("plots").get();
          const state = Store.get();
          if (!state.plots) state.plots = {};

          snapshot.forEach((doc) => {
            const plotData = doc.data();
            if (typeof Grid !== "undefined" && Grid.setGlobalPlot) {
              Grid.setGlobalPlot(doc.id, plotData);
            }
            if (plotData.ownerId === state.player.id) {
              state.plots[doc.id] = plotData;
            }
          });
          Store.save();
        } catch (e) {
          console.warn("[Bootloader] Firestore plot preload notice:", e);
        }
      }

      // 6. Complete (100%)
      await step(250, 100, "Realm synchronized. Entering Elden Earth...");
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Cleanly destroy loader WebGL context so the map gets full GPU power
      dispose3DLoader();

      el("loading-screen")?.classList.add("hidden");
      onComplete(coords);

    } catch (err) {
      console.error("[Bootloader] Fatal boot failure:", err);
      dispose3DLoader();
      el("loading-screen")?.classList.add("hidden");
      onComplete({ latitude: 33.4484, longitude: -112.0740 });
    }
  }

  async function run(player, onComplete) {
    el("signin-screen")?.classList.add("hidden");
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.remove("hidden");

    // Start 3D slow-motion character stage
    mount3DLoaderCharacter();

    try {
      // 1. Storage (15%)
      await step(120, 15, "Initializing local memory & core registries...");
      Store.load();

      // 2. Cloud Save (35%)
      await step(150, 35, `Synchronizing cloud profile: ${player.name || "Traveler"}...`);
      if (player.id && !player.id.startsWith("guest-")) {
        await Store.syncFromCloud(player.id);
      }

      // 3. Location (60%)
      await step(150, 60, "Acquiring high-accuracy GPS coordinates...");
      const coords = await new Promise((resolve) => {
        if (!("geolocation" in navigator)) {
          resolve({ latitude: 33.4484, longitude: -112.0740 });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => {
            console.warn("[Bootloader] Location defaulted:", err);
            resolve({ latitude: 33.4484, longitude: -112.0740 });
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
        );
      });

      // 4. Map Engine (75%)
      await step(120, 75, "Mounting 3D Vector engine & WebGL layers...");

      // 5. Global Plots Preload (90%)
      setProgress(90, "Pre-fetching claimed world plots from Firestore...");
      const db = Store.getDb();
      if (db) {
        try {
          const snapshot = await db.collection("plots").get();
          const state = Store.get();
          if (!state.plots) state.plots = {};

          snapshot.forEach((doc) => {
            const plotData = doc.data();
            if (typeof Grid !== "undefined" && Grid.setGlobalPlot) {
              Grid.setGlobalPlot(doc.id, plotData);
            }
            if (plotData.ownerId === state.player.id) {
              state.plots[doc.id] = plotData;
            }
          });
          Store.save();
        } catch (e) {
          console.warn("[Bootloader] Firestore plot preload notice:", e);
        }
      }

      // 6. Complete (100%)
      await step(120, 100, "Realm synchronized. Entering Elden Earth...");
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Cleanly destroy loader WebGL context so the map gets full GPU power
      dispose3DLoader();

      el("loading-screen")?.classList.add("hidden");
      onComplete(coords);

    } catch (err) {
      console.error("[Bootloader] Fatal boot failure:", err);
      dispose3DLoader();
      el("loading-screen")?.classList.add("hidden");
      onComplete({ latitude: 33.4484, longitude: -112.0740 });
    }
  }

  return { run };
})();