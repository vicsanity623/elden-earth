// ============================================================
// Elden Earth — save data (Local + Firebase Cloud Sync)
// ============================================================
const Store = (() => {
  const KEY = "eldenEarth.save.v1";
  let db = null;

  function getDb() {
    if (db) return db;
    try {
      if (typeof firebase !== "undefined" && CONFIG.FIREBASE_CONFIG && CONFIG.FIREBASE_CONFIG.apiKey) {
        if (!firebase.apps.length) {
          firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        }
        db = firebase.firestore();
      }
    } catch (e) {
      console.warn("[Firebase] Init error:", e);
    }
    return db;
  }

  function defaultState() {
    return {
      player: { name: "Traveler", id: null, avatar: "🙂", model3d: "robot" },
      cash: 0,
      eb: 150,
      diamonds: 0,
      totalDividends: 0,
      plots: {},
      liveDiamonds: {},
      collectedDiamondIds: [],
      lastDiamondSpawn: 0,
      boostExpiry: 0,
      boostMultiplier: 30,
      extractor: { built: false, level: 1, lastHarvest: Date.now(), stored: 0 },
      lastTick: Date.now(),
      createdAt: Date.now(),
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        // Deep merge extractor object so nested properties are never lost
        if (parsed.extractor) {
          state.extractor = Object.assign(defaultState().extractor, parsed.extractor);
        }
      } else {
        state = defaultState();
      }
    } catch (e) {
      console.warn("Save data unreadable, starting fresh.", e);
      state = defaultState();
    }
    return state;
  }

  function save(immediateCloud = true) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      syncToCloudDebounced(immediateCloud);
    } catch (e) {
      console.warn("Could not save game.", e);
    }
  }

  // Cloud sync debounce - prevents excessive Firestore writes
  let cloudSyncTimeout = null;

  // Force cloud sync before closing/unloading the page
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (state && state.player && state.player.id) {
        clearTimeout(cloudSyncTimeout);
        syncToCloud();
      }
    });
  }

  // Cloud Save to Firestore (Full Document Overwrite so deleted diamonds actually delete)
  function syncToCloud() {
    const firestore = getDb();
    if (!firestore || !state || !state.player || !state.player.id) return;

    try {
      // Must NOT use { merge: true } for the whole state object,
      // because Firestore merge will NOT remove deleted keys from liveDiamonds!
      firestore.collection("saves").doc(state.player.id).set(state)
        .catch(err => console.warn("[Cloud] Sync failed:", err));
    } catch (err) {
      console.warn("[Cloud] Error during sync:", err);
    }
  }

  // Debounced cloud sync - only syncs once per save call if immediateCloud is not explicitly true
  function syncToCloudDebounced(immediateCloud = false) {
    if (immediateCloud) {
      syncToCloud();
      return;
    }
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(syncToCloud, 1000);
  }

  // Load from Cloud when logging into Google (Full Restore)
  async function syncFromCloud(playerId) {
    const firestore = getDb();
    if (!firestore || !playerId) return null;

    try {
      // 1. Fetch player save document
      const doc = await firestore.collection("saves").doc(playerId).get();
      if (doc.exists) {
        const cloudData = doc.data();
        // Preserve local liveDiamonds & local built extractor state
        const localDiamonds = (state && state.liveDiamonds) ? state.liveDiamonds : {};
        const localExtractor = (state && state.extractor) ? state.extractor : null;

        state = Object.assign(defaultState(), cloudData);

        // Only keep diamonds that exist in BOTH or let local deletion take precedence
        if (Object.keys(localDiamonds).length < Object.keys(state.liveDiamonds || {}).length) {
          state.liveDiamonds = localDiamonds;
        }

        // Never allow cloud sync to un-build an already built extractor
        if (localExtractor && localExtractor.built) {
          if (!state.extractor || !state.extractor.built) {
            state.extractor = localExtractor;
          } else {
            // Keep the higher level / newer harvest
            state.extractor.level = Math.max(state.extractor.level || 1, localExtractor.level || 1);
            state.extractor.stored = Math.max(state.extractor.stored || 0, localExtractor.stored || 0);
          }
        }
      }

      // 2. Query and restore all plots owned by this player from world map
      const plotSnap = await firestore.collection("plots").where("ownerId", "==", playerId).get();
      if (!plotSnap.empty) {
        if (!state.plots) state.plots = {};
        plotSnap.forEach((pDoc) => {
          state.plots[pDoc.id] = pDoc.data();
        });
      }

      localStorage.setItem(KEY, JSON.stringify(state));
      console.log(`[Cloud] Restored account for ${playerId} with ${Object.keys(state.plots || {}).length} plots.`);
      return state;
    } catch (err) {
      console.warn("[Cloud] Load error:", err);
    }
    return null;
  }

  function get() { return state; }

  function reset() {
    localStorage.removeItem(KEY);
    state = defaultState();
    save();
    return state;
  }

  // Total $/sec across every owned plot (multiplied if boost active)
  function totalRate() {
    let baseRate = 0;
    for (const id in state.plots) {
      const p = state.plots[id];
      const rarityKey = p.rarity?.key || p.rarity;
      const configRarity = CONFIG.PLOT_RARITIES.find(r => r.key === rarityKey);
      baseRate += (configRarity ? configRarity.rate : (p.rate || 0));
    }
    const isBoosted = state.boostExpiry && Date.now() < state.boostExpiry;
    return isBoosted ? baseRate * (state.boostMultiplier || 30) : baseRate;
  }

  // Apply offline earnings & offline extractor progress
  function applyOfflineProgress() {
    const now = Date.now();
    const elapsedSec = Math.max(0, (now - (state.lastTick || now)) / 1000);
    const earned = elapsedSec * totalRate();
    if (state.cash === undefined) state.cash = 0;
    state.cash += earned;

    // Offline Diamond Extractor progress
    if (state.extractor && state.extractor.built) {
      const interval = CONFIG.EXTRACTOR_INTERVAL_MS || 600000;
      const maxStored = CONFIG.EXTRACTOR_MAX_STORED || 50;
      const timeSince = now - state.extractor.lastHarvest;
      const newDiamonds = Math.floor(timeSince / interval);
      if (newDiamonds > 0) {
        state.extractor.stored = Math.min(maxStored, (state.extractor.stored || 0) + newDiamonds);
        state.extractor.lastHarvest = now - (timeSince % interval);
      }
    }

    state.lastTick = now;
    save();
    return earned;
  }

  return { load, save, get, reset, totalRate, applyOfflineProgress, syncFromCloud, getDb };
})();
