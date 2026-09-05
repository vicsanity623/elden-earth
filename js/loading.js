// ============================================================
// Elden Earth — Bootloader & Loading Screen Pipeline
// Sequentially boots all core game subsystems with zero race conditions.
// ============================================================
const Bootloader = (() => {
  const el = (id) => document.getElementById(id);

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

  async function run(player, onComplete) {
    // Show Loading Screen, hide other screens
    el("signin-screen")?.classList.add("hidden");
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.remove("hidden");

    try {
      // 1. Storage & State Initialization (15%)
      await step(150, 15, "Initializing local memory & core registries...");
      Store.load();

      // 2. Cloud Save & Player Database Sync (35%)
      await step(200, 35, `Synchronizing cloud profile: ${player.name || "Traveler"}...`);
      if (player.id && !player.id.startsWith("guest-")) {
        await Store.syncFromCloud(player.id);
      }

      // 3. Location / GPS Acquisition (60%)
      await step(200, 60, "Acquiring high-accuracy GPS coordinates...");
      const coords = await new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          resolve({ latitude: 33.4484, longitude: -112.0740 }); // Default fallback
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

      // 4. Mapbox 512px Retina Engine & Layer Groups (75%)
      await step(150, 75, "Mounting Mapbox 512px Retina vector tile engine...");

      // 5. Global Multiplayer Claims Sync (Directly write to Grid memory)
      setProgress(85, "Pre-fetching all claimed world plots from Firestore...");
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
          console.warn("[Bootloader] Firestore plot preload error:", e);
        }
      }

      // 6. World Populated & Ready
      await step(200, 100, "Realm synchronized. Entering Elden Earth...");
      
      // Hide Loader & Launch Game
      setTimeout(() => {
        el("loading-screen")?.classList.add("hidden");
        onComplete(coords);
      }, 200);

    } catch (err) {
      console.error("[Bootloader] Fatal boot failure:", err);
      setProgress(100, "Boot error — entering recovery mode...");
      setTimeout(() => {
        el("loading-screen")?.classList.add("hidden");
        onComplete({ latitude: 33.4484, longitude: -112.0740 });
      }, 500);
    }
  }

  return { run };
})();
