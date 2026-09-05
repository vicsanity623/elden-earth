// ============================================================
// Elden Earth — configuration
// Edit these values to tune the game or enable Google sign-in.
// ============================================================
const CONFIG = {
  // --- Map Tile Engine & Rate Limit Fallback ---
  // Set to true to bypass Mapbox completely and use unlimited 100% free OpenFreeMap
  USE_OPENFREEMAP_DIRECTLY: true,
  MAPBOX_STYLE_URL: "mapbox://styles/mapbox/dark-v11",
  FALLBACK_STYLE_URL: "https://tiles.openfreemap.org/styles/dark", // 100% free, no key, no limits

  // Paste an OAuth 2.0 Web Client ID from https://console.cloud.google.com/apis/credentials
  // (Authorized JavaScript origin = your github.io URL) to enable "Sign in with Google".
  // Leave blank to only offer Guest (local storage) sign-in.
  GOOGLE_CLIENT_ID: "711924778312-k9fkaqr5fa95rl03m5i9mhr5agv4upeq.apps.googleusercontent.com",

  // --- Firebase Cloud Save Config ---
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAf8u0qUQJaajJp4352-SrY7lIh8rNFPWY",
    authDomain: "elden-earth.firebaseapp.com",
    projectId: "elden-earth",
    storageBucket: "elden-earth.firebasestorage.app",
    messagingSenderId: "231253239262",
    appId: "1:231253239262:web:3fa1ca28575fcade15e94f",
    measurementId: "G-X24EB16156"
  },
  
  // --- Tile grid ---
  TILE_SIZE_METERS: 6.096,        // ~20 x 20 feet
  GRID_RENDER_MIN_ZOOM: 16,       // grid only draws once zoomed in this close
  GRID_RENDER_MAX_TILES: 1200,    // safety cap per redraw

  // --- Diamonds ---
  DIAMOND_SPAWN_RADIUS_METERS: 130,   // ~220 yards (Spreads them across neighborhood)
  DIAMOND_COLLECT_RADIUS_METERS: 100,  // ~55 yards (Reachable reach)
  DIAMOND_MAX_ACTIVE: 13,
  DIAMOND_SPAWN_CHECK_MS: 35000,      // Checks for 1 new diamond every 30 seconds
  DIAMOND_LIFETIME_MS: 540 * 1000,     // 540 seconds or 5 min

  // --- Diamond Extractor ---
  EXTRACTOR_MIN_TILES: 5,               // Requires 5+ connected plots
  EXTRACTOR_INTERVAL_MS: 10 * 60 * 1000, // 1 diamond every 10 minutes
  EXTRACTOR_MAX_STORED: 50,             // Stores up to 50 diamonds max
  EXTRACTOR_BUILD_COST_EB: 50,          // 50 EB to construct
  
  // --- Spin wheel --- (Includes 🚫 Miss Slices & 2 Diamond Cost)
  WHEEL_SLICES: [
    { type: "diamond", label: "+1 ◆", color: "#8fa3b8", weight: 110 },
    { type: "eb", amount: 1,  label: "1 EB",  color: "#4fd6c4", weight: 240 },
    { type: "miss",    label: "🚫",   color: "#3f2832", weight: 80  }, // Miss / No reward
    { type: "eb", amount: 2,  label: "2 EB",  color: "#4f9dd6", weight: 130 },
    { type: "diamond", label: "+1 ◆", color: "#8fa3b8", weight: 110 },
    { type: "eb", amount: 5,  label: "5 EB",  color: "#a86ee0", weight: 50  },
    { type: "miss",    label: "🚫",   color: "#3f2832", weight: 80  }, // Miss / No reward
    { type: "eb", amount: 25, label: "25 EB", color: "#e0a84f", weight: 15  },
    { type: "diamond", label: "+1 ◆", color: "#8fa3b8", weight: 110 },
    { type: "eb", amount: 50, label: "50 EB", color: "#d4af61", weight: 5   },
  ],
  SPIN_COST_DIAMONDS: 2,

  // --- Land plots (Exact Rates & Odds) ---
  PLOT_COST_EB: 100,
  PLOT_RARITIES: [
    { key: "common",    label: "Common",    rate: 0.0000000011, weight: 50, color: "#8fa3b8" }, // 50%
    { key: "rare",      label: "Rare",      rate: 0.000000016,  weight: 30, color: "#4f9dd6" }, // 30%
    { key: "epic",      label: "Epic",      rate: 0.000000022,  weight: 15, color: "#a86ee0" }, // 15%
    { key: "legendary", label: "Legendary", rate: 0.000000044,  weight: 5,  color: "#e0a84f" }, // 5%
  ],
  
  // --- 3D Character Roster (Heroic Scale) ---
  AVAILABLE_CHARACTERS: [
    { id: "soldier",   name: "Vanguard Soldier", file: "models/Soldier.glb",   scale: 4.8, icon: "🛡️" },
    { id: "xbot",      name: "X-Operative",      file: "models/Xbot.glb",      scale: 4.2, icon: "🦾" },
    { id: "fox",       name: "Spirit Fox",       file: "models/Fox.glb",       scale: 0.08, icon: "🦊" },
    { id: "cesium",    name: "Cesium Runner",    file: "models/CesiumMan.glb", scale: 5.0, icon: "🏃" },
  ],

  // --- 30-Day Daily Login Calendar ---
  // Base 3 EB daily, scaling on Day 2 & every 5th day up to Day 30 (200 EB Jackpot)
  DAILY_CALENDAR_REWARDS: [
    { day: 1,  eb: 3   },
    { day: 2,  eb: 5   }, // Scaling boost
    { day: 3,  eb: 3   },
    { day: 4,  eb: 3   },
    { day: 5,  eb: 10  }, // Milestone 5
    { day: 6,  eb: 3   },
    { day: 7,  eb: 3   },
    { day: 8,  eb: 3   },
    { day: 9,  eb: 3   },
    { day: 10, eb: 20  }, // Milestone 10
    { day: 11, eb: 3   },
    { day: 12, eb: 3   },
    { day: 13, eb: 3   },
    { day: 14, eb: 3   },
    { day: 15, eb: 35  }, // Milestone 15
    { day: 16, eb: 3   },
    { day: 17, eb: 3   },
    { day: 18, eb: 3   },
    { day: 19, eb: 3   },
    { day: 20, eb: 50  }, // Milestone 20
    { day: 21, eb: 3   },
    { day: 22, eb: 3   },
    { day: 23, eb: 3   },
    { day: 24, eb: 3   },
    { day: 25, eb: 75  }, // Milestone 25
    { day: 26, eb: 3   },
    { day: 27, eb: 3   },
    { day: 28, eb: 3   },
    { day: 29, eb: 3   },
    { day: 30, eb: 200 }, // Milestone 30 (Grand Jackpot)
  ],
};
