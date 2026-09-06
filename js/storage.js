// ============================================================
// Elden Earth — save data (Local + Firebase Cloud Sync)
// With Integrity Checksum Anti-Cheat Engine
// ============================================================
const Store = (() => {
  const KEY = "eldenEarth.save.v1";
  const CHECKSUM_KEY = "eldenEarth.checksum.v1";
  let db = null;

  // Secret salt prevents attackers from pre-computing hash values
  // Keep this secret or obfuscate it in production
  const SECRET_SALT = "eldenEarth_anti_cheat_salt_2026";

  // Config-derived max limits (kept in sync with js/config.js)
  const MAX_EXTRACTOR_LEVEL = 50;
  const MAX_EXTRACTOR_STORED = 50;
  const MAX_BOOST_EXPIRY_MS = 6 * 3600 * 1000; // 6 hours max
  const MIN_VALUE = 0;
  // Session & anti-farming settings
  const EB_COOLDOWN_MS = 30000; // Minimum 30s between EB gains per user (prevents tab farming)
  const MAX_ACTIVE_SESSIONS = 1; // Only one tab per Google account can generate EB at a time

  function computeChecksum(state) {
    const { cash, eb, diamonds, plots, extractor } = state;
    // Include ALL critical values so tampering any one breaks the hash
    const plotCount = plots ? Object.keys(plots).length : 0;
    const extLevel = extractor ? extractor.level : 1;
    const extStored = extractor ? extractor.stored : 0;
    const raw = Number(cash) + Number(eb) + Number(diamonds) + plotCount + extLevel + extStored + SECRET_SALT;
    // 32-bit bitwise hash (deterministic & fast)
    let h = 0;
    for (let i = 0; i < raw.toString().length; i++) {
      h = ((h << 5) - h + Number(raw.toString()[i])) | 0;
    }
    return h;
  }

  function verifyChecksum(state) {
    const storedChecksum = localStorage.getItem(CHECKSUM_KEY);
    const currentChecksum = computeChecksum(state);
    return storedChecksum && Number(storedChecksum) === currentChecksum;
  }

  function setChecksum(state) {
    const checksum = computeChecksum(state);
    localStorage.setItem(CHECKSUM_KEY, checksum.toString());
  }

  // --- Session & Anti-Farming Tracker ---
  // Tracks active Google session per user to prevent 100-tab EB farming
  let activeSessionId = null;
  let lastEbGainTimestamp = 0; // Timestamp of last EB change (boost or income tick)

  function generateSessionId() {
    // Unique session ID based on timestamp + random
    return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function isSessionCooldownPassed() {
    const now = Date.now();
    const elapsed = now - lastEbGainTimestamp;
    return elapsed >= EB_COOLDOWN_MS;
  }

  function recordEbGain() {
    lastEbGainTimestamp = Date.now();
  }

  function getActiveSessionId() {
    return activeSessionId;
  }

  function setActiveSessionId(id) {
    activeSessionId = id;
  }

  function getLastEbGainTimestamp() {
    return lastEbGainTimestamp;
  }

  function validateAndCapState(state) {
    let changed = false;

    // 1. Prevent negative values (should never happen but defense-in-depth)
    if (state.cash !== undefined && Number(state.cash) < MIN_VALUE) {
      state.cash = MIN_VALUE; changed = true;
    }
    if (state.eb !== undefined && Number(state.eb) < MIN_VALUE) {
      state.eb = MIN_VALUE; changed = true;
    }
    if (state.diamonds !== undefined && Number(state.diamonds) < MIN_VALUE) {
      state.diamonds = MIN_VALUE; changed = true;
    }

    // 2. Cap extractor level (prevents console: extractor.level = 999)
    if (state.extractor && state.extractor.level > MAX_EXTRACTOR_LEVEL) {
      state.extractor.level = MAX_EXTRACTOR_LEVEL; changed = true;
    }

    // 3. Cap extractor stored diamonds (prevents: extractor.stored = 9999)
    if (state.extractor && state.extractor.stored > MAX_EXTRACTOR_STORED) {
      state.extractor.stored = MAX_EXTRACTOR_STORED; changed = true;
    }

    // 4. Cap boost expiry to absolute max 6 hours (prevents: boostExpiry = Infinity)
    if (state.boostExpiry && state.boostExpiry > Date.now() + MAX_BOOST_EXPIRY_MS) {
      state.boostExpiry = Date.now() + MAX_BOOST_EXPIRY_MS; changed = true;
    }

    // 5. Cap boost multiplier to config max (30X or 50X)
    if (state.boostMultiplier && state.boostMultiplier > 50) {
      state.boostMultiplier = 50; changed = true;
    }

    // 6. Ensure diamonds doesn't exceed reasonable bounds relative to extractor capacity
    if (state.diamonds > MAX_EXTRACTOR_STORED * 2) {
      // Arbitrary safety cap - prevents insane values
      state.diamonds = MAX_EXTRACTOR_STORED * 2; changed = true;
    }

    return { state, changed };
  }

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
        // --- Integrity Checksum Anti-Cheat ---
        // If loaded data has a mismatched checksum, it's tampered data
        if (!verifyChecksum(state)) {
          console.warn("[Anti-Cheat] Load blocked: checksum mismatch — session likely tampered.");
          // Revert to clean default state
          state = defaultState();
          // Remove bad data from localStorage so next save creates fresh
          localStorage.removeItem(KEY);
          localStorage.removeItem(CHECKSUM_KEY);
          showToast("🚫 Tampered data detected — progress reset to zero.");
        } else {
          // Valid session: run validation & capping, preserve correction state
          // Restore session data from local save
          activeSessionId = parsed.sessionId || null;
          lastEbGainTimestamp = parsed.lastEbGainTimestamp || 0;
          const { state: validatedState, changed } = validateAndCapState(state);
          state = validatedState;
          // If values were corrected from impossible ranges, mark for subtle warning
          if (changed) {
            state._corrected = true;
          }
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
      // --- Integrity Checksum Anti-Cheat ---
      // If checksum fails, this is a tampered session → revert values and flag
      if (!verifyChecksum(state)) {
        console.warn("[Anti-Cheat] Save blocked: checksum mismatch — session likely tampered.");
        // Set tamper flag for warning display
        state._tampered = true;
        // Revert to zero values and force re-sync from cloud
        state.cash = 0;
        state.eb = 0;
        state.diamonds = 0;
        // Clear local save so next load forces cloud sync
        localStorage.removeItem(KEY);
        // Also clear the bad checksum so next save creates a fresh one
        localStorage.removeItem(CHECKSUM_KEY);
        showToast("🚫 Tampered data detected — progress reset to zero.");
      } else {
        // Valid session: run full validation & capping, then update checksum
        const { state: validatedState, changed } = validateAndCapState(state);
        if (changed) {
          // Subtle warning: mark state as having been corrected
          validatedState._corrected = true;
        }
        state = validatedState;
        // Attach session data before cloud sync
        state.sessionId = activeSessionId;
        state.lastEbGainTimestamp = lastEbGainTimestamp;
        setChecksum(state);
      }
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
