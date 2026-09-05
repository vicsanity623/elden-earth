# 🌍 Elden Earth

A real-world geo-location territory-claiming and idle income game. Walk the real world, collect diamonds, spin the fortune wheel for Elden Bucks (EB), claim real 10×10 ft tiles beneath your feet, and earn simulated passive rent ($USD) every fraction of a second.

Built with **pure static HTML5 / CSS3 / Vanilla JS** — zero build step, no backend server required, and 100% hosted for free on GitHub Pages as a full **Progressive Web App (PWA)**.

---

## ✨ Implemented Core Features & Mechanics

* [x] **🎮 3D WebGL Engine & 60° Isometric Camera:** Mapbox GL JS 3D vector engine with 60° isometric camera tilt, free 360° touch orbit gestures, and true 3D extruded city buildings.
* [x] **🧭 True North Navigation & Compass Reset:** Dedicated compass button that smoothly animates camera bearing back to True North (0°) and restores default 18.5 zoom.
* [x] **📐 "Buy Land" Cinematic 2D Mode:** One-tap button that smoothly flies the camera from 60° 3D down to a flat 2D top-down view (`pitch: 0`), reveals the 10×10 ft grid strictly within reach, and allows precise land claims without building occlusions.
* [x] **🧍 3D Animated Mixamo Characters (Three.js WebGL):** Integrated Three.js custom layer rendering upright, hero-scaled 3D character models (`.glb`) at real-time GPS coordinates with automatic `Idle` $\leftrightarrow$ `Walk` speed-based animation blending.
* [x] **👗 3D Wardrobe & Character Selector:** In-game wardrobe modal accessible via a gold **✏️ Pencil** on the Player Info profile card, allowing players to hot-swap between multiple 3D models (`Soldier`, `Xbot`, `Fox`, `CesiumMan`, `Custom`).
* [x] **🔥 Real-time Multiplayer Firestore Sync:** Live WebSocket streaming across all players worldwide to see newly claimed lands, plot rarities, and avatars in real time without refreshing.
* [x] **☁️ Firebase Cloud Saves & Anti-Exploit Security:** Permanent account backups stored in Google Cloud Firestore with strict document overwriting and a persistent collected-diamond blacklist (`collectedDiamondIds`) that eliminates force-close duplication glitches.
* [x] **💬 Global Live Activity Feed:** A subtle activity feed ticker at the top showing live accomplishments.
* [x] **📅 30-Day Daily Login Calendar:** Scaling daily check-in rewards: Day 2 = 5 EB, Day 7 = 20 EB, Day 12 = 75 EB, scaling up to a **200 EB Jackpot on Day 30**.
* [x] **⏳ Sequential Boot Pipeline:** Dedicated `js/loading.js` bootloader with an animated gold/teal progress bar and terminal logs that pre-fetches world plots and coordinates with zero race conditions.
* [x] **📱 Forced Portrait Guard:** Orientation guard overlay preventing unintended screen rotation on mobile devices.
* [x] **💎 3D Hovering Gemstones & Particle FX:** Upright 3D faceted crystals with specular lighting, real-time ground shadows, organic desynchronized hover physics, ambient rising stardust, and a 10-point particle explosion on collection.
* [x] **🖥️ HUD Micro-Interactions & Flying 3D Gems:** Floating `+1 ◆` and `+EB` combat-text popups rising from tap points, accompanied by physical flying 3D crystals traveling from the street into the top HUD counter with impact bumps.
* [x] **🏰 3D Raised Parcels & Orbital Extractor:** Elevation bevels and neon rarity glow edges on claimed plots flush with the ground, plus a 3D levitating Extractor Beacon with counter-rotating orbital energy rings.
* [x] **👑 Local Mayorship & Regional Dividends:** The player owning the most plots in a town or city becomes **Mayor**, wears a golden crown, and collects a **1%–3% dividend** on every local land sale.
* [x] **🏆 Global & Local Leaderboards:** Top 100 rankings for Most Plots Owned, Total Rent Accrued, and Active Mayors.
* [x] **📡 Dynamic 100m Geodesic Sonar & GPU Shockwaves:** Full geodesic Web Mercator polygon circle generator (`createCirclePolygon`) producing an exact 100-meter outer dashed perimeter matching the Buy Land claim grid 1:1, driven by multi-stage, 60fps GPU-accelerated WebGL radar shockwaves that expand smoothly from the player to the boundary.
* [x] **💵 Dual-Currency Economy:**
  * **Cash Balance ($USD):** High-precision simulated rent (15 decimal places) generated in real-time by your owned plots every 0.5 seconds with dual-scale typography and suppressed leading zeros under $1.00.
  * **Elden Bucks (EB):** Game currency used to claim new plots (100 EB) or construct base structures.
* [x] **⚡ 30X / 50X Income Multiplier:** Stackable 1-hour booster (up to 6 hours max bank) that electrifies the UI with animated gold pulses and speeds up real-time rent generation. Alternate days feature a rare **0.05% chance for a 50X Super Multiplier**.
* [x] **💎 Automated Diamond Extractor:** Unlockable beacon for players owning **5+ connected plots** (Limit 1 per player) that automatically mines 1 Diamond every 2 minutes (holds up to 50 gems). Upgradable with Cash Balance to expand capacity and reduce mining time.
* [x] **🎡 Weighted Diamond Spin Wheel:** Realistic physics-based spin wheel with weighted odds, jackpot prizes (25 EB & 50 EB), 3D canvas gems, diamond refunds, and **`🚫` (Miss)** bust slices with background failsafe recovery.
* [x] **👤 Clustered Player Profile & Info Modal:** Google avatar sync that groups adjacent owned tiles into clean territories with centralized badges and an interactive Player Stats modal (supports inspecting other players' live cash earnings).
* [x] **📱 Progressive Web App (PWA):** Installable directly to iOS & Android home screens with network-first offline asset caching via `sw.js`.

---

## 🗺️ Master Development Roadmap

### 🔊 I. Sensory & Audiovisual Polish
* [ ] **1. Phase 4: Web Audio SFX & Mobile Haptics:**
  * Synthesized crystal chimes when picking up diamonds.
  * Tactile phone vibration pulses when collecting gems or spinning the wheel.
  * Ticking clicks on the wheel and a royal trumpet fanfare on claiming land.
* [ ] **2. 🎉 Celebration Confetti & Screen Fireworks:**
  * Golden particle cascade across the screen when winning 25 EB / 50 EB or rolling a Legendary plot.
* [ ] **3. 🌙 Real-Time Day / Night & Weather Cycle:**
  * Dynamic lighting based on local sunrise/sunset—streetlights glow at night, with subtle rain/fog particle overlays.
* [ ] **4. 🧭 3D Dynamic Compass Rose:**
  * A mini compass dial on the HUD that rotates smoothly with device orientation / camera bearing.

---

### 🗺️ II. Map Exploration & World Features
* [ ] **5. Phase 6: 🌐 Community Globe Mode:**
  * Dedicated interactive 3D Earth Globe viewing mode (`map.setProjection('globe')`). Spin the planet, inspect foreign continents, and view other players' international empires.
* [ ] **6. 🎁 Tiered Mystery Chests on the Map:**
  * Bronze, Silver, and Golden chests spawning randomly that require keys or diamonds to open for big EB payouts.
* [ ] **7. 💎 Diamond Radar Compass Pointers:**
  * Subtle glowing arrows around the edge of your screen pointing toward off-screen diamonds so you know which street to walk down.
* [ ] **8. 🌈 Prismatic / Super Diamonds (1-in-50 Spawn):**
  * Rare iridescent rainbow crystals that award **+3 Diamonds** or an instant 2-hour boost potion when tapped.
* [ ] **9. 🧲 Diamond Magnet Boost Potion:**
  * A 15-minute consumable buff that doubles your collection reach to vacuum up all neighborhood diamonds without moving.

---

### 👑 III. Social, Multiplayer & Prestige
* [x] **10. 👑 Local Mayorship & Regional Dividends:**
  * The player owning the most plots in a town or city becomes **Mayor**, wears a golden crown, and collects a **1%–3% dividend** on every local land sale.
* [x] **11. 💬 Global Live Activity Feed:**
  * A subtle ticker at the bottom showing live accomplishments: *"Artistic just claimed a Legendary plot in Phoenix!"*, *"Player X hit the 50 EB Jackpot!"*
* [x] **12. 🏆 Global & Local Leaderboards:**
  * Top 100 rankings for Most Plots Owned, Total Rent Accrued, and Active Mayors.
* [ ] **13. 🤝 Player-to-Player Parcel Marketplace:**
  * Put owned plots up for sale on the open market for EB or trade tiles with friends.
* [ ] **14. 🛡️ Realm Guilds & Joint Kingdoms:**
  * Form alliances to connect plots into massive shared kingdoms with a communal Diamond Vault.
* [ ] **15. 🎟️ Referral / Friend Invite Code System:**
  * Share your code; when a friend claims their 5th plot, both of you get **+50 EB free**.

---

### 📅 IV. Retention & Daily Progression
* [x] **16. 📅 30-Day Daily Login Calendar:**
  * Scaling daily check-in rewards: Day 2 = 5 EB, Day 7 = 20 EB, Day 12 = 75 EB, scaling up to a **200 EB Jackpot on Day 30**.
* [ ] **17. 📜 Daily Quests & Weekly Bounties:**
  * 3 daily missions (*Collect 3 diamonds*, *Spin twice*, *Keep 30X active for 2 hrs*) rewarding bonus EB.
* [ ] **18. ⚡ "Blood Moon / Solar Flare" 50X Weekend Events:**
  * 24-hour weekend flash events where the boost multiplier temporarily jumps to **50X**.
* [ ] **19. 📈 Prestige Milestones & Player Leveling Track:**
  * Title ranks (*Novice, Baron, Count, Duke, Monarch*) that unlock golden avatar borders and exclusive profile emblems.
* [ ] **20. 🚶 Real-World Step Counter / Pedometer Sync:**
  * Awards passive EB for physical steps taken throughout the day (e.g. 1,000 steps = +5 EB).

---

### 🏰 V. Customization & Base Building
* [ ] **21. 🏰 3D Plot Landmarks & Monuments:**
  * Place 3D structures on owned land (Castles, Golden Trees, Neon Shrines) that grant a **+15% permanent income boost** to surrounding tiles.
* [ ] **22. 🎨 Parcel Ground Skins & Theme Customization:**
  * Customize how your owned plots look: Cyberpunk Grid, Medieval Cobblestone, Molten Lava, or Glacial Ice.
* [ ] **23. 🛂 Travel Passport & City Stamps:**
  * Collect digital passport stamps when claiming land in new cities; each badge gives an account-wide **+5% rent multiplier**.
* [ ] **24. 📦 Player Inventory & Item Bag:**
  * A clean inventory screen to manage boost potions, keys, cosmetic badges, and collectible relics.
* [ ] **25. ⚔️ Contested Landmark Duels (Friendly Mini-Game):**
  * Stake diamonds in a mini-game to contest neutral high-yield landmarks like parks, museums, or city halls for temporary mega-dividends.

---

## 📁 Repository Structure

```text
├── index.html          # Main application structure, modals, HUD & portrait guard
├── manifest.json       # PWA app configuration & home screen icons
├── sw.js               # Service Worker for local asset caching & offline play
├── css/
│   └── style.css       # Dark fantasy theme, animations, radar pulses & glowing borders
├── models/             # 3D GLTF / GLB Skeletal Character Models
│   ├── Soldier.glb     # Vanguard Soldier (Idle, Walk, Run)
│   ├── Xbot.glb        # X-Operative Android (Mixamo Rig)
│   ├── Fox.glb         # Low-Poly Spirit Fox (Survey, Walk)
│   ├── CesiumMan.glb   # Cesium Tracksuit Walker
│   └── character.glb   # Custom Champion
└── js/
    ├── config.js       # Central tuning file (rates, drop weights, radiuses, Firebase keys)
    ├── geo.js          # Web Mercator math, geodesic circle generator, tile bounds & Haversine
    ├── storage.js      # Save engine, Firestore cloud sync, offline progress & rate lookups
    ├── auth.js         # Google Identity Services OAuth & cloud save retrieval
    ├── loading.js      # Bootloader pipeline, progress bar & zero-race condition loader
    ├── character.js    # Three.js WebGL custom layer & GPS animation controller
    ├── diamonds.js     # Spawn engine, expiration timer, and 3D crystal particle FX
    ├── grid.js         # 10x10ft tile rendering, flood-fill clustering & multiplayer sync
    ├── wheel.js        # Canvas-rendered 10-slice wheel with 3D gems & failsafe timer
    └── main.js         # Game loop, 500ms ticker, WebGL sonar pulse animation & UI wiring
```

---

## 🚀 How to Host on GitHub Pages

1. **Create a GitHub repository** (public or private) and upload all project files preserving the folder structure.
2. In your repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, choose `main` (or default branch), and select folder `/ (root)`.
4. Click **Save**. GitHub Pages will deploy your game at `https://yourusername.github.io/your-repo/`.
5. Open the link on your phone. Tap **Share → Add to Home Screen** on iOS or **Install App** on Android to play in full-screen standalone mode.

---

## 🔑 Optional: Enable Google Sign-In & Firebase Cloud Saves

By default, the game offers instant on-device Guest mode with persistent saves. To enable **Google Sign-In & Firebase Cloud Saves**:

1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials) and create an **OAuth 2.0 Client ID** (Authorized origin: `https://yourusername.github.io`).
2. Copy your Client ID into `js/config.js`:
   ```javascript
   GOOGLE_CLIENT_ID: "your-id-here.apps.googleusercontent.com",
   ```
3. Create a free project at [firebase.google.com](https://firebase.google.com), enable **Firestore Database**, and paste your config keys into `js/config.js`:
   ```javascript
   FIREBASE_CONFIG: {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     // ...
   }
   ```
4. Commit and push. Your game will now auto-save progress to the cloud and sync multiplayer territories live worldwide!

---

## ⚙️ Game Balance & Plot Rarities

All gameplay tuning parameters are centralized in **`js/config.js`**:

| Rarity | Drop Chance | Rent per Second | Color |
| :--- | :---: | :---: | :---: |
| **Common** | **50%** | `$0.0000000011/s` | Slate Grey (`#8fa3b8`) |
| **Rare** | **30%** | `$0.0000000160/s` | Cyan Blue (`#4f9dd6`) |
| **Epic** | **15%** | `$0.0000000220/s` | Royal Purple (`#a86ee0`) |
| **Legendary** | **5%** | `$0.0000000440/s` | Radiant Gold (`#e0a84f`) |

---

## 📄 License & Disclaimer

This is a personal, open-source fan implementation of real-world grid collection games. Built from scratch with pure web standards for educational and entertainment purposes. For Shits and Giggles.

---
## 👥 3D Assets Attribution
- asset attribution,
- **grass yellowing by Steve B [CC-BY] via Poly Pizza,**
- **White Dandelions by Aeres Vistaas [CC-BY] via Poly Pizza,**
- **Pine Tree by Quaternius,**
- **Mushrooms by Jarlan Perez [CC-BY] via Poly Pizza,**
- **Tower by Anonymous [CC-BY] via Poly Pizza,**
- **Pine Tree Autumn by Quaternius,**
- **Twisted Tree by Quaternius,**
- **Bush with Flowers by Quaternius,**
