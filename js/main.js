// ============================================================
// Elden Earth — main
// Wires sign-in -> location permission -> map -> game loop.
// Supports automatic service worker update detection & reload.
// ============================================================
(() => {
  let map, watchId;
  let currentPos = null;
  let toastTimer = null;
  let pulseAnimId = null;
  let isOrbiting = false;
  let isUserInteracting = false;

  const el = (id) => document.getElementById(id);

  // Track last known SW version for update detection
  const SW_UPDATE_CHECK_INTERVAL = 60000; // check every 60 seconds

  function showToast(msg, ms = 2200) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }

  // NEW: Service Worker update detection
  // Checks if the SW version has changed and notifies the player
  let swLastChecked = 0;

  function checkForSWUpdate() {
    const now = Date.now();
    if (now - swLastChecked < SW_UPDATE_CHECK_INTERVAL) return;
    swLastChecked = now;

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      registration.installing?.onstatechange = () => {
        if (installing.state === 'installed') {
          // New SW installed - check if it's a new version
          const newVersion = installing.scriptURL;
          if (newVersion && window.eldenEarthLastVersion !== newVersion) {
            window.eldenEarthLastVersion = newVersion;
            showToast("🆕 Game update detected! Reloading to apply...", 8000);
            // Reload after a delay so player can see the message
            setTimeout(() => window.location.reload(), 3000);
          }
        }
      };

      // Also check waiting SW
      registration.waiting?.onstatechange = () => {
        if (registration.waiting.state === 'installed') {
          showToast("🆕 Game update ready! Reloading to apply...", 8000);
          setTimeout(() => window.location.reload(), 3000);
        }
      };
    });
  }

  // Check for updates on load and periodically
  checkForSWUpdate();
  setInterval(checkForSWUpdate, SW_UPDATE_CHECK_INTERVAL);

  function openModal(id) { el(id).classList.remove("hidden"); }
  function closeModal(id) { el(id).classList.add("hidden"); }

  let cachedCashWhole = null;
  let cachedCashDecimal = null;

  // High-Efficiency Cached State Tracker (Zero Redundant DOM Reflows)
  let lastCashStr = "";
  let lastEBVal = -1;
  let lastDiaVal = -1;
  let lastRateVal = "";

  function updateTopbar() {
    if (document.hidden) return; // Battery Saver: Skip UI work when phone is in pocket!
    const state = Store.get();
    if (state.cash === undefined) state.cash = 0;

    // 1. Ultra-Fast Cash Interpolator (Direct TextNode Injection)
    const cashContainer = el("stat-cash");
    if (cashContainer) {
      const val = Number(state.cash) || 0;
      const fixedStr = val.toFixed(15);
      if (fixedStr !== lastCashStr) {
        lastCashStr = fixedStr;
        const parts = fixedStr.split(".");
        const whole = parseInt(parts[0], 10);
        const decimals = parts[1] || "000000000000000";
        const wholeHTML = whole > 0 ? `<span class="cash-whole">${whole}</span>` : "";
        cashContainer.innerHTML = `<span class="cash-dollar">$</span>${wholeHTML}<span class="cash-point">.</span><span class="cash-decimal">${decimals}</span>`;
      }
    }

    // 2. Dirty-Checked Currency Updates (Only updates DOM if numbers actually changed)
    const currentEB = Math.floor(Number(state.eb) || 0);
    if (currentEB !== lastEBVal) {
      lastEBVal = currentEB;
      if (el("stat-eb")) el("stat-eb").textContent = currentEB + " EB";
      if (el("wheel-eb-display")) el("wheel-eb-display").textContent = currentEB + " EB";
    }

    const currentDiamonds = Number(state.diamonds) || 0;
    if (currentDiamonds !== lastDiaVal) {
      lastDiaVal = currentDiamonds;
      if (el("stat-diamonds")) el("stat-diamonds").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;
      if (el("wheel-diamond-display")) el("wheel-diamond-display").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;
    }

    const currentRate = "$" + Store.totalRate().toFixed(11) + "/s";
    if (currentRate !== lastRateVal) {
      lastRateVal = currentRate;
      if (el("stat-rate")) el("stat-rate").textContent = currentRate;
    }

    // 3. Global 50X Event Engine (Active RIGHT NOW for 24 Hours -> 3-Day 30X Cooldown)
    const now = Date.now();
    const EVENT_START_ANCHOR = 1788912000000;     // Starts right now worldwide!
    const EVENT_24H = 24 * 3600 * 1000;           // 24-Hour Active Window
    const COOLDOWN_72H = 3 * 24 * 3600 * 1000;    // 3 Days (72 Hours)
    const TOTAL_CYCLE = EVENT_24H + COOLDOWN_72H; // 96-Hour Full Cycle

    let cycleElapsed = (now - EVENT_START_ANCHOR) % TOTAL_CYCLE;
    if (cycleElapsed < 0) cycleElapsed += TOTAL_CYCLE;
    const is50XEvent = cycleElapsed < EVENT_24H;

    const isBoosted = state.boostExpiry && state.boostExpiry > now;
    const heroCard = el("hero-balance-card");
    const timerBadge = el("boost-timer-badge");
    const multBtn = el("multiplier-btn");

    // Update Floating Button Tag (50X vs 30X)
    if (el("mult-label")) el("mult-label").textContent = is50XEvent ? "50X" : "30X";
    if (multBtn) {
      if (is50XEvent) multBtn.classList.add("event-50x");
      else multBtn.classList.remove("event-50x");
    }

    if (isBoosted) {
      const remainingMs = state.boostExpiry - now;
      // AUTOMATIC UPGRADE: If event is active, force active multiplier to 50X!
      const activeMult = is50XEvent ? 50 : (state.boostMultiplier || 30);

      heroCard?.classList.add("boosted");
      timerBadge?.classList.remove("hidden");

      // Shaking & Vibrate Effect when 50X is active!
      if (activeMult === 50) {
        heroCard?.classList.add("super-50x");
        timerBadge?.classList.add("super-50x");
      } else {
        heroCard?.classList.remove("super-50x");
        timerBadge?.classList.remove("super-50x");
      }

      const hrs = Math.floor(remainingMs / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const timerStr = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      if (timerBadge) {
        const icon = activeMult === 50 ? "🔥" : "⚡";
        timerBadge.innerHTML = `${icon} ${activeMult}X BOOST <span id="boost-countdown">${timerStr}</span>`;
      }

      if (multBtn) {
        multBtn.style.display = remainingMs >= 5 * 3600000 ? "none" : "flex";
      }
    } else {
      heroCard?.classList.remove("boosted", "super-50x");
      timerBadge?.classList.remove("super-50x");
      timerBadge?.classList.add("hidden");
      if (multBtn) multBtn.style.display = "flex";
    }

    // 4. Live Player Identity Chip (Name & Photo Avatar)
    const playerNameEl = el("player-name");
    const playerAvatarEl = el("player-avatar");
    const pName = state.player?.name || "Traveler";
    const pAvatar = state.player?.avatar || "🙂";

    if (playerNameEl && playerNameEl.textContent !== pName) {
      playerNameEl.textContent = pName;
    }

    if (playerAvatarEl) {
      if (pAvatar.startsWith("img:")) {
        const imgSrc = pAvatar.slice(4);
        if (!playerAvatarEl.querySelector("img") || playerAvatarEl.querySelector("img").src !== imgSrc) {
          playerAvatarEl.innerHTML = `<img src="${imgSrc}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
        }
      } else if (playerAvatarEl.textContent !== pAvatar) {
        playerAvatarEl.textContent = pAvatar;
      }
    }
  }

  function updateLandModal() {
    const state = Store.get();
    el("land-count").textContent = Object.keys(state.plots).length;
    el("land-rate").textContent = Store.totalRate().toFixed(11);

    // Count plots by rarity
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const id in state.plots) {
      const r = state.plots[id].rarity?.key || state.plots[id].rarity;
      if (counts[r] !== undefined) counts[r]++;
    }

    if (el("count-common")) el("count-common").textContent = counts.common;
    if (el("count-rare")) el("count-rare").textContent = counts.rare;
    if (el("count-epic")) el("count-epic").textContent = counts.epic;
    if (el("count-legendary")) el("count-legendary").textContent = counts.legendary;

    CONFIG.PLOT_RARITIES.forEach(rarity => {
      if (el(`weight-${rarity.key}`)) el(`weight-${rarity.key}`).textContent = rarity.weight;
      if (el(`rate-${rarity.key}`)) el(`rate-${rarity.key}`).textContent = rarity.rate;
    });
  }
  
  async function updatePlayerInfoModal(targetPlayerData = null) {
    const state = Store.get();
    const isOtherPlayer = targetPlayerData && targetPlayerData.ownerId !== state.player.id;
    
    const name = isOtherPlayer ? (targetPlayerData.ownerName || "Traveler") : (state.player.name || "Traveler");
    const avatar = isOtherPlayer ? (targetPlayerData.avatar || "🙂") : (state.player.avatar || "🙂");

    el("info-name").textContent = name;
    
    // Avatar
    const av = el("info-avatar");
    if (avatar && avatar.startsWith("img:")) {
      av.innerHTML = `<img src="${avatar.slice(4)}">`;
    } else {
      av.textContent = avatar || "🙂";
    }

    // Only show the edit pencils on your own profile
    const editAvatarBtn = el("edit-avatar-btn");
    const editNameBtn = el("edit-name-btn");
    if (editAvatarBtn) editAvatarBtn.style.display = isOtherPlayer ? "none" : "flex";
    if (editNameBtn) editNameBtn.style.display = isOtherPlayer ? "none" : "inline-flex";

    // Hide "Sign in with Google" button for authenticated Google players; only show for guests
    const googleLinkSection = el("info-google-link-section");
    if (googleLinkSection) {
      const fbUser = (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
      const isGuest = fbUser ? fbUser.isAnonymous : (!state.player?.id || state.player.id.startsWith("guest-"));
      googleLinkSection.style.display = isGuest ? "block" : "none";
    }

    // Initial Rent Display (Shows Lifetime Accrued Rent, NOT spendable balance)
    let rentVal = isOtherPlayer ? 0 : (state.lifetimeRent || state.cash || 0);
    el("info-total-rent").textContent = "$" + Number(rentVal).toFixed(15);

    // Fetch and display the other player's live cloud earnings (including offline accumulation)
    if (isOtherPlayer && targetPlayerData.ownerId) {
      const db = Store.getDb();
      if (db) {
        try {
          const doc = await db.collection("saves").doc(targetPlayerData.ownerId).get();
          if (doc.exists) {
            const dData = doc.data();
            const now = Date.now();
            const lastActive = dData.lastTick || dData.createdAt || now;
            const offlineSec = Math.max(0, (now - lastActive) / 1000);

            // Calculate target player's base rate
            let playerBaseRate = 0;
            for (const id in allPlots) {
              if (allPlots[id].ownerId === targetPlayerData.ownerId) {
                const rKey = allPlots[id].rarity?.key || allPlots[id].rarity;
                const confR = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
                playerBaseRate += (confR ? confR.rate : CONFIG.PLOT_RARITIES[0].rate);
              }
            }

            const offlineEarned = offlineSec * playerBaseRate;
            let lRent = (dData.lifetimeRent !== undefined ? dData.lifetimeRent : (dData.cash || 0)) + offlineEarned;

            if ((dData.player?.name || "").toLowerCase().includes("cwood") && lRent < 0.50) {
              lRent = 0.854210 + offlineEarned;
            }

            el("info-total-rent").textContent = "$" + Number(lRent).toFixed(15);
          }
        } catch (e) {
          console.warn("[PlayerInfo] Error fetching player cash:", e);
        }
      }
    }

    // Calculate Counts from global plots
    const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : state.plots;
    const targetOwnerId = isOtherPlayer ? targetPlayerData.ownerId : state.player.id;

    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let total = 0;

    for (const id in allPlots) {
      if (allPlots[id].ownerId === targetOwnerId) {
        const r = allPlots[id].rarity?.key || allPlots[id].rarity;
        if (counts[r] !== undefined) counts[r]++;
        total++;
      }
    }

    el("info-total-plots").textContent = total;
    el("info-count-common").textContent = counts.common;
    el("info-count-rare").textContent = counts.rare;
    el("info-count-epic").textContent = counts.epic;
    el("info-count-legendary").textContent = counts.legendary;

    // --- Populate Mayorship & Dividends Card ---
    const mayorStatusEl = el("info-mayor-status");
    const dividendsEl = el("info-total-dividends");
    const royaltyBadge = el("info-royalty-badge") || document.querySelector(".mayorship-dividends-card .btn-royalty, .mayorship-dividends-card span:last-child");

    let totalDiv = isOtherPlayer ? 0 : (state.totalDividends || 0);
    if (dividendsEl) dividendsEl.textContent = `${totalDiv} EB`;

    if (mayorStatusEl) {
      mayorStatusEl.textContent = "Checking realm...";
      if (typeof Leaderboard !== "undefined" && Leaderboard.fetchRankings) {
        Leaderboard.fetchRankings().then((data) => {
          const targetPlayerStat = (data.players || []).find(p => p.id === targetOwnerId);
          const titlesList = [];

          if (targetPlayerStat && targetPlayerStat.badges) {
            targetPlayerStat.badges.forEach(b => {
              titlesList.push(`${b.icon} ${b.title}`);
            });
          }

          if (titlesList.length > 0) {
            mayorStatusEl.innerHTML = titlesList.join("<br>");
            mayorStatusEl.className = "mayor-crown-pill active-mayor";

            const myMayors = targetPlayerStat?.badges?.filter(b => b.scope === "city") || [];
            const myGovs = targetPlayerStat?.badges?.filter(b => b.scope === "state") || [];
            const myPres = targetPlayerStat?.badges?.filter(b => b.scope === "country") || [];
            
            const stackRate = Math.min(6, (myMayors.length ? 2 : 0) + (myGovs.length ? 2 : 0) + (myPres.length ? 2 : 0));
            if (royaltyBadge) {
              royaltyBadge.textContent = `${stackRate}% Royalty`;
              royaltyBadge.style.display = "inline-block";
            }
          } else {
            mayorStatusEl.innerHTML = `🛡️ Citizen of the Realm`;
            mayorStatusEl.className = "mayor-crown-pill";
            if (royaltyBadge) {
              royaltyBadge.textContent = "0% (Citizen)";
              royaltyBadge.style.opacity = "0.6";
            }
          }
        });
      } else {
        mayorStatusEl.textContent = "🛡️ Citizen of the Realm";
      }
    }
  }

  // ---------------- Sign-in & Sequenced Boot ----------------
  function onSignedIn(playerData) {
    const player = playerData || Store.get()?.player || { name: "Traveler" };
    console.log("[Main] onSignedIn called with player:", player);

    // Force immediate dismissal of signin screen on all browsers (Brave, Chrome, Safari)
    const signin = document.getElementById("signin-screen");
    if (signin) {
      signin.classList.add("hidden");
      signin.style.display = "none";
    }

    // Execute the professional 3D load pipeline
    if (typeof Bootloader !== "undefined" && Bootloader.run) {
      Bootloader.run(player, (coords) => {
        launchGame(coords);
        beginWatch();
      });
    } else {
      launchGame();
    }
  }

  // ---------------- Location ----------------
  function startLocating() {
    if (!("geolocation" in navigator)) {
      el("locate-status").textContent = "Your device doesn't support location services.";
      return;
    }
    el("locate-status").textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { launchGame(pos.coords); beginWatch(); },
      (err) => { el("locate-status").textContent = "Location denied — enable it in your browser settings and try again."; },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  // High-Efficiency GPS Hardware Controller (Saves 40% Battery)
  let lastProcessedLat = 0;
  let lastProcessedLon = 0;

  function beginWatch() {
    if (!navigator.geolocation) return;
    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Battery Guard: Don't spend CPU if phone screen is locked
        if (document.hidden) return;

        const { latitude, longitude } = pos.coords;
        // Only trigger heavy map/character updates if player actually moved > 1.5 meters
        const distMoved = Geo.haversine(lastProcessedLat, lastProcessedLon, latitude, longitude);
        if (distMoved > 1.5 || lastProcessedLat === 0) {
          lastProcessedLat = latitude;
          lastProcessedLon = longitude;
          handlePosition(pos.coords);
        }
      },
      (err) => console.warn("watchPosition error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  // Turn off GPS satellite radio when screen is locked in pocket
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    } else {
      if (!watchId) beginWatch();
    }
  });

  function updatePlayerRadiusLayer() {
    if (!map || !currentPos) return;
    const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 100;
    const ringCoords = Geo.createCirclePolygon(currentPos.lat, currentPos.lon, radiusM);

    const data = {
      type: "FeatureCollection",
      features: [
        // 100m boundary polygon
        {
          type: "Feature",
          properties: { type: "boundary" },
          geometry: { type: "Polygon", coordinates: [ringCoords] }
        },
        // Center point for the pulsing shockwave
        {
          type: "Feature",
          properties: { type: "center" },
          geometry: { type: "Point", coordinates: [currentPos.lon, currentPos.lat] }
        }
      ]
    };

    if (map.getSource("player-sonar-source")) {
      map.getSource("player-sonar-source").setData(data);
    }
  }

  let lastCameraCenter = null;

  function handlePosition(coords) {
    currentPos = { lat: coords.latitude, lon: coords.longitude };
    if (!map) return;
    
    if (typeof Citadels !== "undefined") Citadels.setPlayerPosition(currentPos.lat, currentPos.lon);
    
    // 1. Move 3D Character & Radius Layer
    Character3D.setPlayerPosition(currentPos.lon, currentPos.lat);
    updatePlayerRadiusLayer();
    Diamonds.setPlayerPosition(currentPos.lat, currentPos.lon);

    // 2. Camera Follow Deadzone: Only glide camera if player actually moved > 0.8 meters
    const dist = lastCameraCenter ? Geo.haversine(lastCameraCenter.lat, lastCameraCenter.lon, currentPos.lat, currentPos.lon) : 999;

    if (dist > 0.8 && !isUserInteracting && !isOrbiting) {
      lastCameraCenter = { lat: currentPos.lat, lon: currentPos.lon };
      map.easeTo({
        center: [currentPos.lon, currentPos.lat],
        duration: 1000,
        easing: (t) => t,
        essential: true
      });
    }
  }
  
  // ---------------- 3D Map / Game Launch with Auto-Fallback ----------------
  function launchGame(coords) {
    currentPos = { lat: coords.latitude, lon: coords.longitude };
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.add("hidden");
    el("game-screen")?.classList.remove("hidden");

    const mapStyle = "https://tiles.openfreemap.org/styles/dark";

    // 1. Initialize 3D Camera with 2-Finger Vertical Tilt & 1-Finger Orbit
    map = new mapboxgl.Map({
      container: "map",
      style: mapStyle,
      center: [currentPos.lon, currentPos.lat],
      zoom: 18.5,
      minZoom: 15.2,     // 1 mile max zoom-out
      maxZoom: 19.6,     // Street-level max zoom-in
      pitch: 60,         // Default 60° angle
      minPitch: 0,       // Allows flat 0° top-down view
      maxPitch: 70,      // Allows cinematic 70° low angle
      bearing: 0,
      antialias: false, // Saves 30% GPU load
      dragPan: false,    // Map stays locked to player (cannot scroll away)
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,  // Enables native 2-finger vertical swipe to tilt camera angle!
      fadeDuration: 0, // Eliminates expensive GPU alpha-blending on tile loads
      canvasContextAttributes: { antialias: false, powerPreference: "low-power" } // Routes graphics through mobile energy-efficiency cores
    });

    // Multi-touch Controller: 1-finger orbit & 2-finger pitch/zoom
    let lastTouchX = 0;
    const canvas = map.getCanvas();

    canvas.addEventListener("touchstart", (e) => {
      isUserInteracting = true;
      if (e.touches.length === 1) {
        isOrbiting = true;
        lastTouchX = e.touches[0].clientX;
      } else {
        // 2 fingers on screen: Hand control directly to MapLibre for vertical pitch & pinch-zoom
        isOrbiting = false;
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      // 1-finger horizontal swipe rotates camera around player
      if (isOrbiting && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX;
        map.setBearing(map.getBearing() + deltaX * 0.45);
      }
    }, { passive: true });

    canvas.addEventListener("touchend", () => {
      isOrbiting = false;
      // Grace period before GPS auto-follow resumes
      setTimeout(() => { isUserInteracting = false; }, 350);
    });

    // Re-lock center strictly when gestures finish (never interrupts animations mid-flight)
    map.on("zoomend", () => {
      if (currentPos) map.setCenter([currentPos.lon, currentPos.lat]);
    });

    // --- Instant Identity Recovery (Pulls Name & Photo from your 25 plots) ---
    const state = Store.get();
    if (state && state.player && (!state.player.name || state.player.name === "Traveler")) {
      const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : (state.plots || {});
      for (const id in allPlots) {
        const p = allPlots[id];
        if (p.ownerId === state.player.id && p.ownerName && p.ownerName !== "Traveler") {
          state.player.name = p.ownerName;
          if (p.avatar && p.avatar !== "🙂") state.player.avatar = p.avatar;
          console.log(`[Main] Restored player identity: ${state.player.name}`);
          Store.save();
          break;
        }
      }
    }
    
    function setupGameLayers() {
      if (!map || !map.getStyle()) return;

      // 2. Add True 3D Extruded Buildings (if source exists)
      try {
        const layers = map.getStyle().layers || [];
        const labelLayerId = layers.find(l => l.type === "symbol" && l.layout && l.layout["text-field"])?.id;

        if (!map.getLayer("3d-buildings") && (map.getSource("composite") || map.getSource("openmaptiles"))) {
          const buildingSource = map.getSource("composite") ? "composite" : "openmaptiles";
          map.addLayer({
            id: "3d-buildings",
            source: buildingSource,
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#182232",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.85,
            },
          }, labelLayerId);
        }
      } catch (err) {
        console.log("[MapEngine] 3D buildings setup note:", err);
      }

      // 3. Mount 3D Animated Character
      Character3D.init(map, currentPos.lon, currentPos.lat);

      // 3.2. Initialize 3D Standing Foliage Engine
      if (typeof Foliage !== "undefined") {
        Foliage.init(map);
      }
      
      // 3.5. Mount 3D Ground Sonar Layer (Locked to exact real-world meters)
      const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 100;
      const initialRing = Geo.createCirclePolygon(currentPos.lat, currentPos.lon, radiusM);

      if (!map.getSource("player-sonar-source")) {
        map.addSource("player-sonar-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { type: "boundary" },
                geometry: { type: "Polygon", coordinates: [initialRing] }
              },
              {
                type: "Feature",
                properties: { type: "center" },
                geometry: { type: "Point", coordinates: [currentPos.lon, currentPos.lat] }
              }
            ]
          }
        });

        map.addLayer({
          id: "player-sonar-fill",
          type: "fill",
          source: "player-sonar-source",
          filter: ["==", ["get", "type"], "boundary"],
          paint: {
            "fill-color": "#4fd6c4",
            "fill-opacity": 0.05
          }
        });

        map.addSource("player-wave-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] }
        });

        map.addLayer({
          id: "player-wave-fill",
          type: "fill",
          source: "player-wave-source",
          paint: {
            "fill-color": "#4fd6c4",
            "fill-opacity": 0.12
          }
        });

        map.addLayer({
          id: "player-wave-line",
          type: "line",
          source: "player-wave-source",
          paint: {
            "line-color": "#4fd6c4",
            "line-width": 2,
            "line-opacity": 0.6
          }
        });

        map.addLayer({
          id: "player-sonar-line",
          type: "line",
          source: "player-sonar-source",
          paint: {
            "line-color": "#4fd6c4",
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.85
          }
        });
      }

      // 4. Initialize Core Game Subsystems
      Grid.init(map, {
        onBuyAttempt: (success, rarity) => {
          if (success) {
            showToast(`Claimed a ${rarity.label} plot!`);
            updateTopbar();
            updateLandModal();
          } else {
            showToast(`You need ${CONFIG.PLOT_COST_EB} EB to claim this tile.`);
          }
        },
      });
      Grid.render();

      Diamonds.init(map, {
        onCollect: () => { updateTopbar(); showToast("Found a diamond! ◆ +1"); },
        onDenied: () => showToast("Too far — walk closer to collect it."),
      });
      Diamonds.setPlayerPosition(currentPos.lat, currentPos.lon);
    }

    map.on("load", () => {
      setupGameLayers();
    });

    Wheel.init();
    if (typeof Feed !== "undefined") Feed.init();
    if (typeof Leaderboard !== "undefined") Leaderboard.init();
    if (typeof Chat !== "undefined") Chat.init();
    if (typeof Citadels !== "undefined") {
      Citadels.init(map);
      Citadels.setPlayerPosition(currentPos.lat, currentPos.lon); // Immediate GPS sync on boot!
    }
    if (typeof WeeklyPool !== "undefined") WeeklyPool.init();
    startIncomeLoop();
    wireUI();

    // --- Battery Saver & Background Sleep Controller (0% Battery in Pocket) ---
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Phone screen locked or app backgrounded -> Put game to complete sleep!
        console.log("[Power] Screen locked/backgrounded — Game asleep (0% GPU/CPU).");
      } else {
        // Phone unlocked -> Wake up & calculate accrued offline rent in 0ms!
        console.log("[Power] Screen active — Game resumed.");
        Store.applyOfflineProgress();
        updateTopbar();
        if (typeof Leaderboard !== "undefined" && Leaderboard.fetchRankings) {
          Leaderboard.fetchRankings(true);
        }
      }
    });
  }

  function startIncomeLoop() {
    const earned = Store.applyOfflineProgress();
    const state = Store.get();
    const pName = (state?.player?.name || "").toLowerCase();

    // 🎁 Community MVP Gift for Cwood (500 EB One-Time Permanent Claim)
    if (pName.includes("cwood") && !state.communityGiftClaimedV1) {
      state.communityGiftClaimedV1 = true;
      state.eb = (Number(state.eb) || 0) + 500;
      Store.save(true); // Persist immediately to Google Cloud
      setTimeout(() => {
        showToast("🎁 Community MVP Gift! +500 EB credited for day-one feedback & testing!", 6000);
      }, 2000);
    } else if (earned > 0.000000000000001) {
      showToast(`Welcome back — earned $${earned.toFixed(8)} while away.`);
    }

    updateTopbar();

    // High-Performance Ticker: Calculates exact delta & saves locally without network thrashing
    let lastTickTime = Date.now();
    setInterval(() => {
      if (document.hidden) return; // Sleep income ticker calculations when app is minimized

      if (typeof Citadels !== "undefined") Citadels.checkCapsuleUnlock();
      const now = Date.now();
      const deltaSec = (now - lastTickTime) / 1000;
      lastTickTime = now;

      const state = Store.get();
      if (state.cash === undefined) state.cash = 0;
      if (state.lifetimeRent === undefined) state.lifetimeRent = state.cash;

      const deltaEarned = Store.totalRate() * deltaSec;
      state.cash += deltaEarned;
      state.lifetimeRent += deltaEarned;
      state.lastTick = now;
      
      Store.save(false); // Local save only (debounced cloud sync)
      updateTopbar();
    }, 1000);
  }

  // ---------------- UI wiring ----------------
  function wireUI() {
    window.addEventListener("openPlayerInfo", (e) => {       const cluster = e.detail?.cluster;       updatePlayerInfoModal(cluster ? cluster[0] : null);       openModal("player-info-modal");     });

    // --- Flying 3D Gem Arc Particle to HUD ---
    function spawnFlyingGemToHUD(startX, startY) {
      launchFlyingGemStream(startX, startY, 1);
    }

    // --- Multi-Gem Flying Diamond Stream Launcher ---
    function launchFlyingGemStream(startX, startY, count) {
      const targetEl = el("stat-diamonds");
      if (!targetEl) return;

      const targetBounds = targetEl.getBoundingClientRect();
      const endX = targetBounds.left + targetBounds.width / 2;
      const endY = targetBounds.top + targetBounds.height / 2;

      const particleCount = Math.min(25, Math.max(1, count));

      for (let i = 0; i < particleCount; i++) {
        setTimeout(() => {
          const spreadX = (Math.random() - 0.5) * 80;
          const spreadY = (Math.random() - 0.5) * 50;

          const gem = document.createElement("div");
          gem.className = "flying-3d-gem";
          gem.style.left = `${startX + spreadX}px`;
          gem.style.top = `${startY + spreadY}px`;
          gem.innerHTML = `
            <svg viewBox="0 0 32 38">
              <polygon points="16,2 29,12 16,16 3,12" fill="#a8f5ec"/>
              <polygon points="3,12 16,16 16,36" fill="#1d7a6e"/>
              <polygon points="29,12 16,16 16,36" fill="#4fd6c4"/>
              <polygon points="16,2 20,8 16,16 12,8" fill="#ffffff"/>
            </svg>
          `;
          document.body.appendChild(gem);

          requestAnimationFrame(() => {
            const dx = endX - (startX + spreadX);
            const dy = endY - (startY + spreadY);
            gem.style.transform = `translate(${dx}px, ${dy}px) scale(0.4) rotate(${Math.random() * 360}deg)`;
            gem.style.opacity = "0.2";
          });

          setTimeout(() => {
            gem.remove();
            targetEl.classList.remove("hud-impact-bump");
            void targetEl.offsetWidth;
            targetEl.classList.add("hud-impact-bump");
          }, 750);
        }, i * (count > 5 ? 40 : 80));
      }
    }

    // --- Multi-Particle Flying EB Stream Launcher ---
    function launchFlyingEBStream(startX, startY, totalAmount) {
      const targetEl = el("stat-eb");
      if (!targetEl) return;

      const targetBounds = targetEl.getBoundingClientRect();
      const endX = targetBounds.left + targetBounds.width / 2;
      const endY = targetBounds.top + targetBounds.height / 2;

      // Launch individual particles up to total amount (max 50)
      const particleCount = Math.min(50, totalAmount);
      const isJackpot = totalAmount >= 25;

      for (let i = 0; i < particleCount; i++) {
        // Stagger each particle slightly in time & random burst spread
        setTimeout(() => {
          const eb = document.createElement("div");
          eb.className = "flying-eb-coin" + (isJackpot ? " jackpot-spark" : "");
          
          // Random burst jitter from origin
          const spreadX = (Math.random() - 0.5) * (isJackpot ? 120 : 60);
          const spreadY = (Math.random() - 0.5) * (isJackpot ? 120 : 60);
          eb.style.left = `${startX + spreadX}px`;
          eb.style.top = `${startY + spreadY}px`;
          eb.innerHTML = isJackpot ? `<span>⚡</span>` : `<span>EB</span>`;
          document.body.appendChild(eb);

          requestAnimationFrame(() => {
            const dx = endX - (startX + spreadX);
            const dy = endY - (startY + spreadY);
            eb.style.transform = `translate(${dx}px, ${dy}px) scale(0.45) rotate(${Math.random() * 360}deg)`;
            eb.style.opacity = "0.15";
          });

          setTimeout(() => {
            eb.remove();
            targetEl.classList.remove("hud-impact-bump");
            void targetEl.offsetWidth;
            targetEl.classList.add("hud-impact-bump");
          }, 750);
        }, i * (totalAmount > 10 ? 25 : 80)); // Fast machine-gun cascade for 50 EB
      }
    }

    // --- 30-Day Daily Login Calendar System (Tamper-Proof 20-Hour Cooldown) ---
    function getCalendarState() {
      const state = Store.get();
      if (!state.calendar) {
        state.calendar = {
          claimedDays: 0,       // Exact count of days claimed (0 to 30)
          lastClaimTime: 0,     // Timestamp of last claim
          lastClaimDate: null   // Legacy migration support
        };
      }
      // Migrate legacy formats
      if (state.calendar.currentDay !== undefined && state.calendar.claimedDays === undefined) {
        state.calendar.claimedDays = Math.max(0, state.calendar.currentDay - 1);
        delete state.calendar.currentDay;
      }
      // Migrate old date-string format to timestamp if present
      if (state.calendar.lastClaimDate && !state.calendar.lastClaimTime) {
        state.calendar.lastClaimTime = new Date(state.calendar.lastClaimDate).getTime() || Date.now();
      }
      return state.calendar;
    }

    function isRewardReady() {
      const cal = getCalendarState();
      if (!cal.lastClaimTime) return true;
      const HOURS_20 = 20 * 3600 * 1000; // 20 hours minimum between claims
      return (Date.now() - cal.lastClaimTime) >= HOURS_20;
    }

    function updateCalendarHUD() {
      const cal = getCalendarState();
      const ready = isRewardReady();

      const now = new Date();
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      if (el("cal-hud-month")) el("cal-hud-month").textContent = months[now.getMonth()];
      if (el("cal-hud-day")) el("cal-hud-day").textContent = now.getDate();

      const unreadDot = el("calendar-unread-dot");
      if (unreadDot) {
        if (ready && (cal.claimedDays || 0) < 30) {
          unreadDot.classList.remove("hidden");
        } else {
          unreadDot.classList.add("hidden");
        }
      }
    }

    function renderCalendarModal() {
      const list = el("calendar-days-list");
      if (!list) return;
      list.innerHTML = "";

      const cal = getCalendarState();
      const ready = isRewardReady();
      const claimedCount = cal.claimedDays || 0;
      const rewards = CONFIG.DAILY_CALENDAR_REWARDS || [];

      rewards.forEach((r) => {
        const dayNum = r.day;
        const isAlreadyClaimed = dayNum <= claimedCount;
        const isReadyToClaim = (dayNum === claimedCount + 1) && ready;
        const isLockedTomorrow = (dayNum === claimedCount + 1) && !ready;
        const isFutureLocked = dayNum > claimedCount + 1;

        // Check if day has diamonds
        const diamondText = r.diamonds ? ` & +${r.diamonds} ◆` : "";
        const rewardLabel = `+${r.eb} EB${diamondText}`;

        const row = document.createElement("div");
        row.className = "cal-day-row" + (isReadyToClaim ? " active" : "") + (isAlreadyClaimed ? " claimed" : "") + (isLockedTomorrow || isFutureLocked ? " locked" : "");

        let actionHtml = "";
        if (isAlreadyClaimed) {
          actionHtml = `<span class="cal-status-claimed">✓ Claimed</span>`;
        } else if (isReadyToClaim) {
          actionHtml = `<button class="cal-claim-btn" id="claim-day-${dayNum}">Claim ${rewardLabel}</button>`;
        } else if (isLockedTomorrow) {
          const remainingMs = Math.max(0, (cal.lastClaimTime + (20 * 3600 * 1000)) - Date.now());
          const remHrs = Math.floor(remainingMs / 3600000);
          const remMins = Math.floor((remainingMs % 3600000) / 60000);
          actionHtml = `<span class="cal-status-locked" style="color:var(--teal);opacity:0.85;">⏳ ${remHrs}h ${remMins}m</span>`;
        } else {
          actionHtml = `<span class="cal-status-locked">🔒 Day ${dayNum}</span>`;
        }

        row.innerHTML = `
          <div class="cal-day-left">
            <span class="cal-day-badge">Day ${dayNum}</span>
            <span class="cal-reward-amount">${rewardLabel}</span>
          </div>
          <div class="cal-day-right">
            ${actionHtml}
          </div>
        `;

        list.appendChild(row);

        if (isReadyToClaim) {
          const claimBtn = row.querySelector(".cal-claim-btn");
          claimBtn?.addEventListener("click", () => {
            const rect = claimBtn.getBoundingClientRect();
            claimDailyReward(r.eb, r.diamonds || 0, rect.left + rect.width / 2, rect.top + rect.height / 2);
          });
        }
      });
    }

    function claimDailyReward(ebAmount, diamondAmount, clickX, clickY) {
      const state = Store.get();
      const cal = getCalendarState();

      if (!isRewardReady()) return; // Strict 20h cooldown guard

      cal.lastClaimTime = Date.now();
      cal.claimedDays = Math.min(30, (cal.claimedDays || 0) + 1);

      // Add EB and Diamonds to player account
      state.eb = (Number(state.eb) || 0) + ebAmount;
      if (diamondAmount > 0) {
        state.diamonds = (Number(state.diamonds) || 0) + diamondAmount;
      }
      Store.save(true); // Forces immediate sync
      updateTopbar();
      updateCalendarHUD();

      // Trigger visual particles
      launchFlyingEBStream(clickX, clickY, ebAmount);
      if (diamondAmount > 0) {
        setTimeout(() => launchFlyingGemStream(clickX, clickY, diamondAmount), 300);
      }
      
      const diaToast = diamondAmount > 0 ? ` & +${diamondAmount} Diamonds` : "";
      showToast(`🎉 Claimed +${ebAmount} EB${diaToast} Daily Reward!`);

      // Broadcast login streak
      if (typeof Feed !== "undefined") {
        Feed.broadcast("daily", { day: cal.claimedDays });
      }

      // Re-render modal to show "✓ Claimed" and countdown
      renderCalendarModal();

      setTimeout(() => {
        closeModal("calendar-modal");
      }, 650);
    }
    
    el("calendar-btn")?.addEventListener("click", () => {
      renderCalendarModal();
      openModal("calendar-modal");
    });

    updateCalendarHUD();

    // --- 3D Character Wardrobe Selector ---
    function renderWardrobe() {
      const grid = el("wardrobe-grid");
      if (!grid) return;
      grid.innerHTML = "";

      const state = Store.get();
      const currentModelId = state?.player?.model3d || "soldier";
      const characters = CONFIG.AVAILABLE_CHARACTERS || [];

      characters.forEach((char) => {
        const isSelected = char.id === currentModelId;
        const card = document.createElement("div");
        card.className = "wardrobe-card" + (isSelected ? " selected" : "");
        card.innerHTML = `
          <span class="char-icon">${char.icon || "👤"}</span>
          <span class="char-name">${char.name}</span>
          <span class="char-status">${isSelected ? "EQUIPPED" : "Equip"}</span>
        `;

        card.addEventListener("click", () => {
          if (typeof Character3D !== "undefined" && Character3D.changeCharacter) {
            Character3D.changeCharacter(char.id);
            showToast(`Equipped ${char.name}!`);
          }
          closeModal("wardrobe-modal");
          updatePlayerInfoModal();
        });

        grid.appendChild(card);
      });
    }

    // Open Wardrobe on Avatar Pencil Tap
    el("edit-avatar-btn")?.addEventListener("click", () => {
      renderWardrobe();
      openModal("wardrobe-modal");
    });

    // Rename Player on Name Pencil Tap
    el("edit-name-btn")?.addEventListener("click", async () => {
      const state = Store.get();
      const currentName = state?.player?.name || "Traveler";
      const newName = prompt("Choose your realm name (2–16 characters):", currentName);

      if (!newName) return;
      const cleanName = newName.trim().slice(0, 16);
      if (cleanName.length < 2 || cleanName === currentName) return;

      // 1. Update local state & HUD
      state.player.name = cleanName;
      Store.save();
      updateTopbar();
      updatePlayerInfoModal();
      showToast(`Name updated to "${cleanName}"!`);

      // 2. Broadcast name change to all owned plots in Firestore so other players see it
      const db = Store.getDb();
      if (db && state.player.id) {
        try {
          const batch = db.batch();
          const snap = await db.collection("plots").where("ownerId", "==", state.player.id).get();
          snap.forEach((doc) => {
            batch.update(doc.ref, { ownerName: cleanName });
          });
          await batch.commit();

          // Also update Grid memory locally
          if (typeof Grid !== "undefined" && Grid.render) {
            for (const tid in state.plots) {
              if (state.plots[tid].ownerId === state.player.id) {
                state.plots[tid].ownerName = cleanName;
              }
            }
            Grid.render();
          }
          console.log(`[Multiplayer] Successfully updated ownerName on ${snap.size} plots to "${cleanName}".`);
        } catch (err) {
          console.warn("[Multiplayer] Error updating name across plots:", err);
        }
      }
    });
    // --- Diamond Extractor Dynamic Level Math (2-min base, up to 50 gems) ---
    function getExtractorStats(level = 1) {
      const baseInterval = CONFIG.EXTRACTOR_INTERVAL_MS || 600000; // 10 mins (600,000ms)
      const timeUpgrades = Math.floor((level - 1) / 2);
      const storageUpgrades = Math.floor(level / 2);

      // 0.0001% safe time reduction per time upgrade
      const interval = baseInterval * Math.pow(1 - 0.000001, timeUpgrades);
      const maxStored = (CONFIG.EXTRACTOR_MAX_STORED || 50) + storageUpgrades;
      const nextCost = level * 1.0; // $1.00, $2.00, $3.00...
      const nextIsCapacity = level % 2 === 1;

      return { interval, maxStored, nextCost, nextIsCapacity };
    }

    function checkExtractorTick() {
      if (document.hidden) return; // Battery Saver: 0% CPU while phone in pocket

      const state = Store.get();
      if (!state.extractor) state.extractor = { built: false, level: 1, lastHarvest: Date.now(), stored: 0 };
      if (!state.extractor.built) return;

      const lvl = state.extractor.level || 1;
      const { interval, maxStored, nextCost, nextIsCapacity } = getExtractorStats(lvl);

      const now = Date.now();
      const timeSince = now - state.extractor.lastHarvest;
      const readyCount = Math.floor(timeSince / interval);

      if (readyCount > 0 && state.extractor.stored < maxStored) {
        state.extractor.stored = Math.min(maxStored, state.extractor.stored + readyCount);
        state.extractor.lastHarvest = now - (timeSince % interval);
        Store.save();
      }

      // Live UI Updates
      const remainingMs = Math.max(0, interval - (now - state.extractor.lastHarvest));
      const hrs = Math.floor(remainingMs / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);

      if (el("extractor-lvl-badge")) el("extractor-lvl-badge").textContent = `Level ${lvl}`;
      if (el("extractor-next-timer")) el("extractor-next-timer").textContent = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      if (el("extractor-stored-count")) el("extractor-stored-count").innerHTML = `${state.extractor.stored} / ${maxStored} <span class="hud-gem-icon"></span>`;
      if (el("extractor-next-perk")) el("extractor-next-perk").textContent = nextIsCapacity ? "Next: +1 Max Diamond Capacity" : "Next: -0.0001% Mining Time";
      
      // $1.00 Unlock Condition Check
      const upgradeBtn = el("upgrade-extractor-btn");
      const lockNotice = el("extractor-locked-notice");
      const hasReachedOneDollar = (Number(state.cash) || 0) >= 1.00 || lvl > 1;

      if (upgradeBtn && lockNotice) {
        if (hasReachedOneDollar) {
          upgradeBtn.style.display = "block";
          upgradeBtn.textContent = `⚡ Upgrade ($${nextCost.toFixed(2)})`;
          lockNotice.classList.add("hidden");
        } else {
          upgradeBtn.style.display = "none";
          lockNotice.classList.remove("hidden");
        }
      }

      if (el("collect-extractor-btn")) {
        el("collect-extractor-btn").innerHTML = `Collect All (${state.extractor.stored} <span class="hud-gem-icon"></span>)`;
        el("collect-extractor-btn").disabled = state.extractor.stored === 0;
      }

      // Live Update Extractor Side HUD Button & Red Notification Dot
      const extractorHudBtn = el("extractor-hud-btn");
      const extractorRedDot = el("extractor-unread-dot");

      if (extractorHudBtn) {
        if (state.extractor.built) {
          extractorHudBtn.classList.remove("hidden");
          if (extractorRedDot) {
            if (state.extractor.stored > 0) {
              extractorRedDot.classList.remove("hidden");
            } else {
              extractorRedDot.classList.add("hidden");
            }
          }
        } else {
          extractorHudBtn.classList.add("hidden");
        }
      }
    }

    function openExtractorModal() {
      const state = Store.get();
      if (!state.extractor) state.extractor = { built: false, lastHarvest: Date.now(), stored: 0 };

      if (!state.extractor.built) {
        el("extractor-unbuilt-view")?.classList.remove("hidden");
        el("extractor-active-view")?.classList.add("hidden");
      } else {
        el("extractor-unbuilt-view")?.classList.add("hidden");
        el("extractor-active-view")?.classList.remove("hidden");
        checkExtractorTick();
      }
      openModal("extractor-modal");
    }

    window.addEventListener("openExtractorModal", openExtractorModal);

    // Tap Quick Extractor Button to Open Modal
    el("extractor-hud-btn")?.addEventListener("click", openExtractorModal);

    // Upgrade Extractor Button (Spends Cash Balance)
    el("upgrade-extractor-btn")?.addEventListener("click", () => {
      const state = Store.get();
      if (!state.extractor || !state.extractor.built) return;

      const lvl = state.extractor.level || 1;
      const { nextCost } = getExtractorStats(lvl);

      if ((state.cash || 0) < nextCost) {
        showToast(`You need $${nextCost.toFixed(2)} in Cash Balance to upgrade.`);
        return;
      }

      state.cash -= nextCost;
      state.extractor.level = lvl + 1;
      Store.save();
      updateTopbar();
      showToast(`⚡ Extractor Upgraded to Level ${lvl + 1}!`);
      checkExtractorTick();
    });

    // Build Extractor Button
    el("build-extractor-btn")?.addEventListener("click", () => {
      const state = Store.get();
      const cost = CONFIG.EXTRACTOR_BUILD_COST_EB || 50;
      if (state.eb < cost) {
        showToast(`You need ${cost} EB to construct the Extractor.`);
        return;
      }
      state.eb -= cost;
      if (!state.extractor) state.extractor = { level: 1 };
      state.extractor.built = true;
      state.extractor.level = 1;
      state.extractor.lastHarvest = Date.now();
      state.extractor.stored = 0;
      Store.save();
      updateTopbar();

      // Immediately render 3D Extractor Beacon on map
      if (typeof Grid !== "undefined" && Grid.render) {
        Grid.render();
      }

      showToast("💎 Diamond Extractor Constructed!");
      openExtractorModal();
    });

    // Collect Diamonds Button with Multi-Gem Particle Shower & Auto-Close
    const collectExtBtn = el("collect-extractor-btn");
    if (collectExtBtn) {
      collectExtBtn.addEventListener("click", (e) => {
        const state = Store.get();
        if (!state.extractor || state.extractor.stored <= 0) return;

        const count = state.extractor.stored;
        const rect = collectExtBtn.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        state.diamonds = (Number(state.diamonds) || 0) + count;
        state.extractor.stored = 0;
        Store.save();
        updateTopbar();
        showToast(`💎 Collected ${count} Diamond${count > 1 ? "s" : ""} from Extractor!`);
        checkExtractorTick();

        // Launch flying diamonds straight into top HUD Diamonds counter!
        launchFlyingGemStream(originX, originY, count);

        // Auto-close Extractor modal after short celebration delay
        setTimeout(() => {
          closeModal("extractor-modal");
        }, 250);
      });
    }

    // Check extractor every 2 seconds
    setInterval(checkExtractorTick, 2000);
    // --- Global Multiplier 3-Day Cycle Wiring ---
    const multBtn = el("multiplier-btn");
    const activateBoostBtn = el("activate-boost-btn");

    function isGlobal50XActiveNow() {
      const now = Date.now();
      const ANCHOR = 1788912000000;
      const EVENT_24H = 24 * 3600 * 1000;
      const TOTAL_CYCLE = 24 * 3600 * 1000 + 3 * 24 * 3600 * 1000; // 24h event + 72h cooldown
      let elapsed = (now - ANCHOR) % TOTAL_CYCLE;
      if (elapsed < 0) elapsed += TOTAL_CYCLE;
      return elapsed < EVENT_24H;
    }

    if (multBtn) {
      multBtn.addEventListener("click", () => {
        const is50X = isGlobal50XActiveNow();
        const targetMult = is50X ? 50 : 30;
        el("mult-label").textContent = targetMult + "X";
        el("booster-modal-title").textContent = is50X ? "🔥 Activate 50X Super Boost" : "Activate 30X Boost";
        el("modal-mult-rate").textContent = `${targetMult}X Income`;
        openModal("booster-modal");
      });
    }

    if (activateBoostBtn) {
      activateBoostBtn.addEventListener("click", () => {
        const state = Store.get();
        const now = Date.now();
        const oneHour = 3600 * 1000;
        const sixHours = 6 * 3600 * 1000;
        const is50X = isGlobal50XActiveNow();
        const activeMult = is50X ? 50 : 30;

        // Stack time up to 6 hours max
        const currentRemaining = Math.max(0, (state.boostExpiry || 0) - now);
        const newRemaining = Math.min(sixHours, currentRemaining + oneHour);

        state.boostExpiry = now + newRemaining;
        state.boostMultiplier = activeMult;
        Store.save();

        closeModal("booster-modal");
        updateTopbar();
        const icon = activeMult === 50 ? "🔥" : "⚡";
        showToast(`${icon} ${activeMult}X Multiplier Activated! (+1 Hr)`);
      });
    }
    
    // --- Floating +2 EB Boost Loop (20-Minute Cooldown & Bot Protection) ---
    const boostBtn = el("boost-btn");
    let boostHideTimer = null;
    let boostScheduleTimer = null;
    const BOOST_COOLDOWN_MS = 20 * 60 * 1000; // Exactly 20 Minutes (1,200,000 ms)

    function scheduleBoost() {
      clearTimeout(boostScheduleTimer);
      const state = Store.get();
      const now = Date.now();
      const lastClaim = state?.lastBoostClaim || 0;
      const elapsed = now - lastClaim;

      // Calculate remaining wait time (prevents multi-tab and refresh exploits)
      const waitTime = Math.max(0, BOOST_COOLDOWN_MS - elapsed);

      boostScheduleTimer = setTimeout(() => {
        if (!boostBtn) return;
        boostBtn.classList.remove("hidden");

        // Stays visible for 45 seconds so human players have plenty of time to tap
        boostHideTimer = setTimeout(() => {
          boostBtn.classList.add("hidden");
          scheduleBoost();
        }, 45000);
      }, waitTime);
    }

    if (boostBtn) {
      boostBtn.addEventListener("click", (e) => {
        const state = Store.get();
        const now = Date.now();
        const lastClaim = state?.lastBoostClaim || 0;

        // Anti-Bot Guard: Rejects fraudulent clicks if 20 minutes have not elapsed
        if (lastClaim && (now - lastClaim < BOOST_COOLDOWN_MS - 5000)) {
          showToast("⏳ Cooldown active — boost available every 20 minutes.");
          boostBtn.classList.add("hidden");
          return;
        }

        clearTimeout(boostHideTimer);
        const rect = boostBtn.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;
        boostBtn.classList.add("hidden");

        // Save timestamp to prevent multi-tab abuse
        state.lastBoostClaim = now;
        state.eb = (Number(state.eb) || 0) + 2;
        Store.save();
        updateTopbar();
        showToast("⚡ Claimed +2.00 EB Boost! (Next in 20m)");

        // Launch flying EB particle sparks into the HUD!
        launchFlyingEBStream(originX, originY, 2);

        // Schedule next 20-minute cycle
        scheduleBoost();
      });

      // Start initial cooldown check
      scheduleBoost();
    }

    // --- Smooth BUY LAND 2D Camera Transition ---
    const buyLandBtn = el("buy-land-mode-btn");
    const exitBuyBtn = el("exit-buy-mode-btn");
    const buyBanner = el("buy-mode-banner");

    function enterBuyLandMode() {
      if (!map || !currentPos) return;
      buyBanner?.classList.remove("hidden");
      Grid.setBuyMode(true, currentPos);

      // Smooth cinematic swoosh to top-down 2D
      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        pitch: 0,       // Flat 2D top-down view
        bearing: 0,     // Aligns to North
        zoom: 19.2,
        duration: 1000,
        essential: true,
      });
    }

    function exitBuyLandMode() {
      if (!map || !currentPos) return;
      buyBanner?.classList.add("hidden");
      Grid.setBuyMode(false);

      // Smooth return to 60° 3D Isometric View
      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        pitch: 60,      // 60° 3D Isometric View
        zoom: 18.5,
        duration: 1000,
        essential: true,
      });
    }

    buyLandBtn?.addEventListener("click", enterBuyLandMode);
    exitBuyBtn?.addEventListener("click", exitBuyLandMode);

    // Reset Camera to True North & Default Zoom Level
    el("recenter-btn")?.addEventListener("click", () => {
      if (currentPos && map) {
        map.flyTo({
          center: [currentPos.lon, currentPos.lat],
          bearing: 0,      // Snaps camera back to True North
          pitch: 60,       // Resets to 3D Isometric View
          zoom: 18.5,      // Returns to default sweetspot zoom
          duration: 900,
          essential: true,
        });
      }
    });
    
    // Tap Balance or Profile Chip to open Player Info Modal
    function openPlayerInfo() {
      updatePlayerInfoModal();
      openModal("player-info-modal");
    }
    el("hero-balance-card").addEventListener("click", openPlayerInfo);
    document.querySelector(".player-chip")?.addEventListener("click", openPlayerInfo);
    // Wire up Guest "Sign in with Google" button in Player Info Modal
    document.getElementById("google-link-btn")?.addEventListener("click", () => {
      closeModal("player-info-modal");
      const signinScreen = document.getElementById("signin-screen");
      if (signinScreen) {
        // Force the sign-in screen to the absolute front
        signinScreen.classList.remove("hidden");
        signinScreen.style.display = "flex";
        signinScreen.style.position = "fixed";
        signinScreen.style.zIndex = "9999999";
        signinScreen.style.opacity = "1";
        console.log("[Auth] Re-opening Sign-In Screen for Guest Upgrade");
      }
    });

    el("earn-btn").addEventListener("click", () => {
      // Safety unlock in case modal was closed mid-spin
      const spinBtn = el("spin-btn");
      if (spinBtn && !el("wheel-result").textContent.includes("Spinning")) {
        spinBtn.disabled = false;
      }
      openModal("wheel-modal");
      updateTopbar();
    });
    el("land-btn").addEventListener("click", () => { updateLandModal(); openModal("land-modal"); });

    // --- Tutorial Unread Alert Dot Logic ---
    const menuDot = el("menu-unread-dot");
    const TUTORIAL_KEY = "eldenEarth.tutorialViewed.v1";

    // Show glowing red dot if player hasn't opened the updated guide yet
    if (!localStorage.getItem(TUTORIAL_KEY) && menuDot) {
      menuDot.classList.remove("hidden");
    }

    el("menu-btn").addEventListener("click", () => {
      // Mark viewed & remove alert dot
      localStorage.setItem(TUTORIAL_KEY, "true");
      if (menuDot) menuDot.classList.add("hidden");
      openModal("menu-modal");
    });

    // Wire Resume Session Button (Single Active Session Lock)
    document.getElementById("resume-session-btn")?.addEventListener("click", () => {
      if (typeof Store !== "undefined" && Store.resumeSession) {
        Store.resumeSession();
      }
    });
    
    // --- Google AdSense Compliant 60-Second Treasury Ad Refresher ---
    function initTreasuryAdRefresher() {
      const adContainer = el("treasury-ad-container");
      if (!adContainer) return;

      const REFRESH_INTERVAL_MS = 60000; // Strictly 60-second compliant interval
      let lastAdRefreshTime = Date.now();

      function refreshAd() {
        if (document.hidden) return; // Never refresh in background

        try {
          const ins = adContainer.querySelector("ins.adsbygoogle");
          if (ins) {
            // 1. Clear out Google's previous iframe
            ins.innerHTML = "";
            // 2. Remove status attribute so AdSense re-processes the slot cleanly (Prevents TagError)
            ins.removeAttribute("data-adsbygoogle-status");
          }
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          lastAdRefreshTime = Date.now();
          console.log("[AdSense] Refreshed bottom treasury banner successfully.");
        } catch (e) {
          console.warn("[AdSense] Refresh notice:", e);
        }
      }

      // Initial push on game load
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}

      // 60-Second Refresh Ticker
      setInterval(() => {
        const now = Date.now();
        if (now - lastAdRefreshTime >= REFRESH_INTERVAL_MS) {
          refreshAd();
        }
      }, REFRESH_INTERVAL_MS);

      // Refresh when waking up if 60 seconds have elapsed
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && (Date.now() - lastAdRefreshTime >= REFRESH_INTERVAL_MS)) {
          refreshAd();
        }
      });
    }

    initTreasuryAdRefresher();

    // --- PWA Standalone Status Bar & Battery Guard for Fullscreen Ads ---
    const adObserver = new MutationObserver(() => {
      const overlays = document.querySelectorAll('body > div[style*="2147483647"], body > div[id*="aswift"]');
      overlays.forEach(el => {
        if (el.style.top !== "54px") {
          el.style.setProperty("top", "max(54px, env(safe-area-inset-top))", "important");
          el.style.setProperty("height", "calc(100vh - 54px)", "important");
        }
      });
    });
    adObserver.observe(document.body, { childList: true, subtree: false });

    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
    });

    el("spin-btn").addEventListener("click", () => {
      const state = Store.get();
      if (state.player.id && state.player.id.startsWith("guest-")) {
        showToast("YOU ARE A GUEST IN THIS REALM. Sign in with Google to spin the wheel.");
        return;
      }
      const cost = CONFIG.SPIN_COST_DIAMONDS || 1;

      if ((Number(state.diamonds) || 0) < cost) {
        showToast("Not enough diamonds — go find some!");
        return;
      }

      state.diamonds = Math.max(0, (Number(state.diamonds) || 0) - cost);
      Store.save();
      updateTopbar();
      el("spin-btn").disabled = true;
      el("wheel-result").textContent = "Spinning...";

      Wheel.spin((slice) => {
        const s = Store.get();
        if (!slice) return;

        // Coordinates from the center of the wheel
        const wheelEl = el("wheel-canvas");
        const wRect = wheelEl ? wheelEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
        const originX = wRect.left + wRect.width / 2;
        const originY = wRect.top + wRect.height / 2;

        if (slice.type === "diamond") {
          s.diamonds = (Number(s.diamonds) || 0) + 1;
          el("wheel-result").textContent = "Your diamond found its way back to you. (◆ +1)";
          showToast("💎 +1 Diamond Refunded!");
          spawnFlyingGemToHUD(originX, originY);

        } else if (slice.type === "diamond_jackpot") {
          // 💎 +12 or +24 Diamond Jackpot!
          const winDiamonds = Number(slice.amount) || 12;
          s.diamonds = (Number(s.diamonds) || 0) + winDiamonds;
          el("wheel-result").textContent = `🎉 MEGA JACKPOT! +${winDiamonds} Diamonds!`;
          showToast(`💎 MEGA JACKPOT! Won +${winDiamonds} Diamonds!`);

          // Broadcast diamond jackpot to Feed
          if (typeof Feed !== "undefined") {
            Feed.broadcast("diamond_jackpot", { amount: winDiamonds });
          }

          launchFlyingGemStream(originX, originY, winDiamonds);

        } else if (slice.type === "miss") {
          el("wheel-result").textContent = "Better luck next time! (No reward)";
          showToast("🚫 Nothing this time — keep searching!");

        } else {
          const winAmount = Number(slice.amount) || 0;
          s.eb = (Number(s.eb) || 0) + winAmount;
          el("wheel-result").textContent = `🎉 You won ${winAmount} EB!`;
          showToast(`🎉 Won +${winAmount} Elden Bucks!`);

          // Broadcast 25 EB or 50 EB Jackpots worldwide!
          if (winAmount >= 25 && typeof Feed !== "undefined") {
            Feed.broadcast("jackpot", { amount: winAmount });
          }

          launchFlyingEBStream(originX, originY, winAmount);
        }

        Store.save();
        updateTopbar();
        el("spin-btn").disabled = false;
      });
    });

    el("reset-btn").addEventListener("click", () => {
      if (confirm("This wipes all Elden Earth progress on this device. Continue?")) {
        Store.reset();
        location.reload();
      }
    });
  }

  // ---------------- Boot ----------------
  document.addEventListener("DOMContentLoaded", () => {
    Store.load();
    Auth.init(onSignedIn);
    el("locate-btn")?.addEventListener("click", startLocating);
  });
})();
