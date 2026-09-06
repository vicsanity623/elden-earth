// ============================================================
// Elden Earth — main
// Wires sign-in -> location permission -> map -> game loop.
// ============================================================
(() => {
  let map, watchId;
  let currentPos = null;
  let toastTimer = null;
  let pulseAnimId = null;

  const el = (id) => document.getElementById(id);

  // -------------------------------------------------------
  // Phase 4: Web Audio SFX & Mobile Haptics
  // -------------------------------------------------------
  // Phase 4: Audio toggle state (persisted in localStorage)
  let soundEnabled = localStorage.getItem("eldenEarth.soundEnabled") !== "false";

  // -------------------------------------------------------
  // Phase 5: Subtle Anti-Cheat Warning System
  // -------------------------------------------------------
  // Tracks if game detected and corrected tampered data in this session
  let antiCheatWarningShown = false;

  function showAntiCheatWarning(message) {
    // Only show once per session
    if (antiCheatWarningShown) return;
    antiCheatWarningShown = true;

    // Create subtle warning banner at top of HUD
    const topbar = el("topbar");
    if (!topbar) return;

    const existing = document.getElementById("anti-cheat-warning");
    if (existing) existing.remove();

    const warnBanner = document.createElement("div");
    warnBanner.id = "anti-cheat-warning";
    warnBanner.style = `
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(240, 50, 50, 0.95);
      color: #fff;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      z-index: 1000;
      backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(255,255,255,0.3);
      animation: slideDown 0.3s ease;
    `;
    warnBanner.textContent = message;

    // Add keyframes only once
    if (!document.getElementById("anti-cheat-style")) {
      const style = document.createElement("style");
      style.id = "anti-cheat-style";
      style.textContent =`
        @keyframes slideDown {
          from { top: -100%; opacity: 0; }
          to { top: 0; opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    topbar.prepend(warnBanner);
    // Auto-remove after 5 seconds
    setTimeout(() => { if (warnBanner.parentElement) warnBanner.remove(); }, 5000);
  }

  function checkAndShowAntiCheatWarning() {
    const state = Store.get();
    // If the loaded state has _corrected flag, show warning
    if (state && state._corrected && !antiCheatWarningShown) {
      showAntiCheatWarning("⚡ Game data was corrected — some values reset to fair play.");
    }
    // If tampered state (shouldn't normally reach UI, but defense-in-depth)
    if (state && state._tampered && !antiCheatWarningShown) {
      showAntiCheatWarning("🚫 Cheat data detected — progress reset to zero.");
    }
  }

  function setSoundEnabled(enabled) {
    soundEnabled = enabled;
    localStorage.setItem("eldenEarth.soundEnabled", enabled ? "true" : "false");
  }

  function toggleSound() {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    return newState;
  }

  function isSoundEnabled() {
    return soundEnabled;
  }

  function playSfx(type) {
    if (!isSoundEnabled()) return;
    const ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctx) return;
    const context = new ctx();

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    gainNode.gain.value = 0.3;

    const now = context.currentTime;

    if (type === "crystal") {
      // Crystal chime: quick decay sine sweep
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    } else if (type === "click") {
      // Ticking click: short high-pitch click
      oscillator.frequency.value = 1200;
      oscillator.type = "sine";
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    } else if (type === "trumpet") {
      // Royal trumpet fanfare: multi-note call
      // Note 1
      const osc1 = context.createOscillator();
      const gain1 = context.createGain();
      osc1.connect(gain1);
      gain1.connect(context.destination);
      gain1.gain.value = 0.2;
      osc1.frequency.value = 523.25; // C5
      osc1.type = "sine";
      osc1.start(now);
      osc1.stop(now + 0.5);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      // Note 2
      const osc2 = context.createOscillator();
      const gain2 = context.createGain();
      osc2.connect(gain2);
      gain2.connect(context.destination);
      gain2.gain.value = 0.2;
      osc2.frequency.value = 659.25; // E5
      osc2.type = "sine";
      osc2.start(now + 0.3);
      osc2.stop(now + 0.8);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

      // Note 3
      const osc3 = context.createOscillator();
      const gain3 = context.createGain();
      osc3.connect(gain3);
      gain3.connect(context.destination);
      gain3.gain.value = 0.15;
      osc3.frequency.value = 783.99; // G5
      osc3.type = "sine";
      osc3.start(now + 0.6);
      osc3.stop(now + 1.1);
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.1);

      // Note 4 - finale
      const osc4 = context.createOscillator();
      const gain4 = context.createGain();
      osc4.connect(gain4);
      gain4.connect(context.destination);
      gain4.gain.value = 0.15;
      osc4.frequency.value = 1046.50; // C6
      osc4.type = "sine";
      osc4.start(now + 0.9);
      osc4.stop(now + 1.4);
      gain4.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
    }
  }

  function triggerHaptic(pattern) {
    if (!navigator.vibrate) return;
    // If pattern is a number, use it directly; if array, use Web Haptics pattern
    if (Array.isArray(pattern)) {
      navigator.vibrate(pattern);
    } else if (typeof pattern === "number") {
      navigator.vibrate(pattern);
    } else {
      // Default short pulse
      navigator.vibrate([50, 30, 50]);
    }
  }

  function showToast(msg, ms = 2200) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }

  function openModal(id) { el(id).classList.remove("hidden"); }
  function closeModal(id) { el(id).classList.add("hidden"); }

  let cachedCashWhole = null;
  let cachedCashDecimal = null;

  function updateTopbar() {
    const state = Store.get();
    if (state.cash === undefined) state.cash = 0;

    // High-performance DOM node caching for cash display (skips innerHTML parsing)
    const cashContainer = el("stat-cash");
    if (cashContainer) {
      const val = Number(state.cash) || 0;
      const fixedStr = val.toFixed(15);
      const parts = fixedStr.split(".");
      const whole = parseInt(parts[0], 10);
      const decimals = parts[1] || "000000000000000";

      const wholeHTML = whole > 0 ? `<span class="cash-whole">${whole}</span>` : "";
      const currentFullHTML = `<span class="cash-dollar">$</span>${wholeHTML}<span class="cash-point">.</span><span class="cash-decimal">${decimals}</span>`;

      if (cashContainer.innerHTML !== currentFullHTML) {
        cashContainer.innerHTML = currentFullHTML;
      }
    }

    // Elden Bucks game currency in sub-row
    if (el("stat-eb")) el("stat-eb").textContent = Math.floor(Number(state.eb) || 0) + " EB";

    const currentEB = Math.floor(Number(state.eb) || 0);
    const currentDiamonds = Number(state.diamonds) || 0;

    el("stat-diamonds").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;

    // Live player balances inside the Diamond Wheel modal
    if (el("wheel-eb-display")) el("wheel-eb-display").textContent = currentEB + " EB";
    if (el("wheel-diamond-display")) el("wheel-diamond-display").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;

    // Update legacy wheel balance spans (backward compatibility)
    if (el("wheel-diamonds")) el("wheel-diamonds").textContent = currentDiamonds;
    if (el("wheel-eb")) el("wheel-eb").textContent = currentEB + " EB";

    el("stat-rate").textContent = "$" + Store.totalRate().toFixed(11) + "/s";
    el("player-name").textContent = state.player.name || "Traveler";

    const avatarEl = el("player-avatar");
    if (state.player.avatar && state.player.avatar.startsWith("img:")) {
      avatarEl.innerHTML = `<img src="${state.player.avatar.slice(4)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = state.player.avatar || "🙂";
    }

    // --- Multiplier Glow & Timer ---
    const now = Date.now();
    const isBoosted = state.boostExpiry && state.boostExpiry > now;
    const heroCard = el("hero-balance-card");
    const timerBadge = el("boost-timer-badge");
    const multBtn = el("multiplier-btn");

    if (isBoosted) {
      const remainingMs = state.boostExpiry - now;
      heroCard?.classList.add("boosted");
      timerBadge?.classList.remove("hidden");

      // Format HH:MM:SS
      const hrs = Math.floor(remainingMs / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      el("boost-countdown").textContent = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      // Hide button if remaining time is 5 hours or more (Max limit: 6 hours)
      if (multBtn) {
        multBtn.style.display = remainingMs >= 5 * 3600000 ? "none" : "flex";
      }
    } else {
      heroCard?.classList.remove("boosted");
      timerBadge?.classList.add("hidden");
      if (multBtn) multBtn.style.display = "flex";
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

    // Hide "Sign in with Google" button for Google-signed-in players; only show for guests
    const googleLinkSection = el("info-google-link-section");
    if (googleLinkSection) {
      const isGooglePlayer = state.player && state.player.id && state.player.id.startsWith("google-");
      googleLinkSection.style.display = isGooglePlayer ? "none" : "block";
    }

    // Initial Rent Display
    let rentVal = isOtherPlayer ? 0 : (state.cash || 0);
    el("info-total-rent").textContent = "$" + Number(rentVal).toFixed(15);

    // Fetch and display the other player's live cloud earnings
    if (isOtherPlayer && targetPlayerData.ownerId) {
      const db = Store.getDb();
      if (db) {
        try {
          const doc = await db.collection("saves").doc(targetPlayerData.ownerId).get();
          if (doc.exists && doc.data().cash !== undefined) {
            el("info-total-rent").textContent = "$" + Number(doc.data().cash).toFixed(15);
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
          const myMayors = (data.mayors || []).filter(m => m.ownerId === targetOwnerId);
          const myGovs = (data.governors || []).filter(g => g.ownerId === targetOwnerId);
          const myPres = (data.presidents || []).filter(p => p.ownerId === targetOwnerId);

          const titlesList = [];
          myMayors.forEach(m => titlesList.push(`👑 Mayor of ${m.territory}`));
          myGovs.forEach(g => titlesList.push(`🏛️ Governor of ${g.territory}`));
          myPres.forEach(p => titlesList.push(`🦅 President of ${p.territory}`));

          if (titlesList.length > 0) {
            mayorStatusEl.innerHTML = titlesList.join("<br>");
            mayorStatusEl.className = "mayor-crown-pill active-mayor";

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

    // --- Sync unique session ID to Firestore to enforce one-tab-per-account ---
    // This prevents the same Google account from generating EB in 100+ tabs simultaneously
    if (window._eldenSessionId) {
      const db = Store.getDb();
      if (db) {
        try {
          // Use a unique session document under the player's saves doc
          // Firestore will automatically overwrite if same sessionId exists (idempotent)
          // If a DIFFERENT sessionId tries to write, we can check rules to reject
          db.collection("saves").doc(player.id).set({
            sessionId: window._eldenSessionId,
            lastSessionUpdate: Date.now()
          }, { merge: true }).catch(err => {
            console.warn("[Session] Firestore sync warning (non-critical):", err);
          });
        } catch (e) {
          console.warn("[Session] Error syncing session to Firestore:", e);
        }
      }
    }

    // Execute the professional load pipeline
    Bootloader.run(player, (coords) => {
      launchGame(coords);
      beginWatch();
    });
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

  function beginWatch() {
    watchId = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos.coords),
      (err) => console.warn("watchPosition error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

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

  function handlePosition(coords) {
    currentPos = { lat: coords.latitude, lon: coords.longitude };
    if (!map) return;
    
    // Move 3D Character & Geographic Radius Layer
    Character3D.setPlayerPosition(currentPos.lon, currentPos.lat);
    updatePlayerRadiusLayer();
    Diamonds.setPlayerPosition(currentPos.lat, currentPos.lon);
  }
  
  // ---------------- 3D Map / Game Launch with Auto-Fallback ----------------
  function launchGame(coords) {
    currentPos = { lat: coords.latitude, lon: coords.longitude };
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.add("hidden");
    el("game-screen")?.classList.remove("hidden");

    const mapStyle = "https://tiles.openfreemap.org/styles/dark";

    // 1. Initialize 3D Camera with Unlimited Vector Basemap
    map = new mapboxgl.Map({
      container: "map",
      style: mapStyle,
      center: [currentPos.lon, currentPos.lat],
      zoom: 18.5,
      minZoom: 15.2,   // 1 mile max zoom-out
      maxZoom: 19.6,   // Street-level max zoom-in
      pitch: 60,
      bearing: 0,
      antialias: true,
      dragPan: false,  // Map stays locked to player (cannot scroll away)
      dragRotate: true,
      touchZoomRotate: true,
    });

    // --- Automatic Rate-Limit / Quota Exhaustion Fallback Handler ---
    let hasSwitchedToFallback = CONFIG.USE_OPENFREEMAP_DIRECTLY || false;

    function triggerMapFallback() {
      if (hasSwitchedToFallback) return;
      hasSwitchedToFallback = true;
      console.warn("[MapEngine] Rate limit or quota exceeded! Hot-swapping to OpenFreeMap...");
      showToast("⚠️ Mapbox limit reached — switched to free backup map!");

      const backupStyle = CONFIG.FALLBACK_STYLE_URL || "https://tiles.openfreemap.org/styles/dark";
      map.setStyle(backupStyle);

      // Re-attach all game layers and 3D character once the backup style finishes mounting
      map.once("style.load", () => {
        setupGameLayers();
      });
    }

    // Smooth 1-finger camera orbit around player
    let isOrbiting = false;
    let lastTouchX = 0;
    const canvas = map.getCanvas();

    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        isOrbiting = true;
        lastTouchX = e.touches[0].clientX;
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      // Only orbit if 1 finger is down (leaves 2-finger pinch-zoom totally smooth)
      if (isOrbiting && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX;
        map.setBearing(map.getBearing() + deltaX * 0.4);
      }
    }, { passive: true });

    canvas.addEventListener("touchend", () => { isOrbiting = false; });

    // Re-lock center strictly when gestures finish (never interrupts animations mid-flight)
    map.on("zoomend", () => {
      if (currentPos) map.setCenter([currentPos.lon, currentPos.lat]);
    });

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
            playSfx("trumpet");
            triggerHaptic([20, 10, 20]);
            updateTopbar();
            updateLandModal();
          } else {
            showToast(`You need ${CONFIG.PLOT_COST_EB} EB to claim this tile.`);
          }
        },
      });
      Grid.render();

      Diamonds.init(map, {
        onCollect: () => {
          updateTopbar();
          showToast("Found a diamond! ◆ +1");
          playSfx("crystal");
          triggerHaptic([50, 30, 50]);
        },
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
    startIncomeLoop();
    wireUI();
  }

  function startIncomeLoop() {
    const earned = Store.applyOfflineProgress();
    if (earned > 0.000000000000001) {
      showToast(`Welcome back — earned $${earned.toFixed(8)} while away.`);
    }
    updateTopbar();

    // High-Performance Ticker: Calculates exact delta & saves locally without network thrashing
    let lastTickTime = Date.now();
    setInterval(() => {
      if (document.hidden) return; // Sleep income ticker calculations when app is minimized

      const now = Date.now();
      const deltaSec = (now - lastTickTime) / 1000;
      lastTickTime = now;

      const state = Store.get();
      if (state.cash === undefined) state.cash = 0;
      state.cash += Store.totalRate() * deltaSec;
      state.lastTick = now;
      
      Store.save(false); // Local save only (debounced cloud sync)
      updateTopbar();
    }, 500);
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

    // --- 30-Day Daily Login Calendar System (Strict 1-Day per Day) ---
    function getCalendarState() {
      const state = Store.get();
      if (!state.calendar) {
        state.calendar = {
          claimedDays: 0,       // Exact count of days claimed (0 to 30)
          lastClaimDate: null,  // "YYYY-MM-DD"
        };
      }
      // Migrate old currentDay format if present
      if (state.calendar.currentDay !== undefined && state.calendar.claimedDays === undefined) {
        state.calendar.claimedDays = Math.max(0, state.calendar.currentDay - 1);
        delete state.calendar.currentDay;
      }
      return state.calendar;
    }

    function getTodayKey() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function updateCalendarHUD() {
      const cal = getCalendarState();
      const todayKey = getTodayKey();
      const isClaimedToday = cal.lastClaimDate === todayKey;

      const now = new Date();
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      if (el("cal-hud-month")) el("cal-hud-month").textContent = months[now.getMonth()];
      if (el("cal-hud-day")) el("cal-hud-day").textContent = now.getDate();

      const unreadDot = el("calendar-unread-dot");
      if (unreadDot) {
        if (!isClaimedToday && (cal.claimedDays || 0) < 30) {
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
      const todayKey = getTodayKey();
      const isClaimedToday = cal.lastClaimDate === todayKey;
      const claimedCount = cal.claimedDays || 0;
      const rewards = CONFIG.DAILY_CALENDAR_REWARDS || [];

      rewards.forEach((r) => {
        const dayNum = r.day;
        const isAlreadyClaimed = dayNum <= claimedCount;
        const isReadyToClaim = (dayNum === claimedCount + 1) && !isClaimedToday;
        const isLockedTomorrow = (dayNum === claimedCount + 1) && isClaimedToday;
        const isFutureLocked = dayNum > claimedCount + 1;

        const row = document.createElement("div");
        row.className = "cal-day-row" + (isReadyToClaim ? " active" : "") + (isAlreadyClaimed ? " claimed" : "") + (isLockedTomorrow || isFutureLocked ? " locked" : "");

        let actionHtml = "";
        if (isAlreadyClaimed) {
          actionHtml = `<span class="cal-status-claimed">✓ Claimed</span>`;
        } else if (isReadyToClaim) {
          actionHtml = `<button class="cal-claim-btn" id="claim-day-${dayNum}">Claim +${r.eb} EB</button>`;
        } else if (isLockedTomorrow) {
          actionHtml = `<span class="cal-status-locked" style="color:var(--teal);opacity:0.85;">🔒 Tomorrow</span>`;
        } else {
          actionHtml = `<span class="cal-status-locked">🔒 Day ${dayNum}</span>`;
        }

        row.innerHTML = `
          <div class="cal-day-left">
            <span class="cal-day-badge">Day ${dayNum}</span>
            <span class="cal-reward-amount">+${r.eb} EB</span>
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
            claimDailyReward(r.eb, rect.left + rect.width / 2, rect.top + rect.height / 2);
          });
        }
      });
    }

    function claimDailyReward(amount, clickX, clickY) {
      const state = Store.get();
      const cal = getCalendarState();
      const todayKey = getTodayKey();

      if (cal.lastClaimDate === todayKey) return; // Prevent multiple claims in the same day

      cal.lastClaimDate = todayKey;
      cal.claimedDays = Math.min(30, (cal.claimedDays || 0) + 1);

      state.eb = (Number(state.eb) || 0) + amount;
      Store.save();
      updateTopbar();
      updateCalendarHUD();

      // Trigger visual particles
      launchFlyingEBStream(clickX, clickY, amount);
      showToast(`🎉 Claimed +${amount} Elden Bucks Daily Reward!`);

      // Broadcast login streak
      if (typeof Feed !== "undefined") {
        Feed.broadcast("daily", { day: cal.claimedDays });
      }

      // Re-render modal to show "✓ Claimed" and "🔒 Tomorrow"
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
      if (el("upgrade-extractor-btn")) el("upgrade-extractor-btn").textContent = `Upgrade ($${nextCost.toFixed(2)})`;
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

        // Phase 4: Crystal chime & haptic on collect
        playSfx("crystal");
        triggerHaptic([50, 30, 50]);

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
    // --- Multiplier Button Wiring ---
    const multBtn = el("multiplier-btn");
    const activateBoostBtn = el("activate-boost-btn");

    // 0.05% chance for 50X (1 in 2000), otherwise 30X
    function getCurrentMultiplier() {
      const isLucky50X = Math.random() < 0.0005;
      return isLucky50X ? 50 : 30;
    }

    let activeRollMultiplier = 30;

    if (multBtn) {
      multBtn.addEventListener("click", () => {
        activeRollMultiplier = getCurrentMultiplier();
        el("mult-label").textContent = activeRollMultiplier + "X";
        el("booster-modal-title").textContent = `Activate ${activeRollMultiplier}X Boost`;
        el("modal-mult-rate").textContent = `${activeRollMultiplier}X Income`;
        openModal("booster-modal");
      });
    }

    if (activateBoostBtn) {
      activateBoostBtn.addEventListener("click", () => {
        const state = Store.get();
        const now = Date.now();
        const oneHour = 3600 * 1000;
        const sixHours = 6 * 3600 * 1000;

        // Stack time up to 6 hours max
        const currentRemaining = Math.max(0, (state.boostExpiry || 0) - now);
        const newRemaining = Math.min(sixHours, currentRemaining + oneHour);

        state.boostExpiry = now + newRemaining;
        state.boostMultiplier = activeRollMultiplier;
        Store.save();

        closeModal("booster-modal");
        updateTopbar();
        showToast(`⚡ ${activeRollMultiplier}X Multiplier Activated! (+1 Hr)`);
      });
    }
    // --- Floating +2 EB Boost Loop ---
    const boostBtn = el("boost-btn");
    let boostHideTimer = null;

    function scheduleBoost() {
      // Appears randomly between 55 and 115 seconds
      const delay = 55000 + Math.random() * 60000;
      setTimeout(() => {
        if (!boostBtn) return;
        boostBtn.classList.remove("hidden");

        // Stays on screen for 16 seconds before vanishing
        boostHideTimer = setTimeout(() => {
          boostBtn.classList.add("hidden");
          scheduleBoost();
        }, 16000);
      }, delay);
    }

    if (boostBtn) {
      boostBtn.addEventListener("click", (e) => {
        clearTimeout(boostHideTimer);
        const rect = boostBtn.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;
        boostBtn.classList.add("hidden");

        const state = Store.get();
        // --- EB Cooldown Check: Prevent tab farming across 100+ open tabs ---
        // Only allow +2 EB if enough time has passed since last EB gain (per user session)
        const lastGain = Store.getLastEbGainTimestamp();
        const now = Date.now();
        const cooldownPassed = (now - lastGain) >= EB_COOLDOWN_MS;
        if (!cooldownPassed) {
          const remainingMs = EB_COOLDOWN_MS - (now - lastGain);
          const secs = Math.ceil(remainingMs / 1000);
          showToast(`⏳ Wait ${secs}s before claiming another +2 EB boost.`);
          return; // Block boost click
        }
        state.eb += 2;
        Store.save();
        updateTopbar();
        showToast("⚡ Claimed +2.00 EB Boost!");

        // Launch 2 flying EB sparks into the HUD!
        launchFlyingEBStream(originX, originY, 2);

        // Record this EB gain so cooldown starts
        recordEbGain();

        // Schedule next appearance
        scheduleBoost();
      });

      // Start initial timer
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
      // Sync audio toggle UI
      const audioToggle = el("audio-toggle");
      if (audioToggle) audioToggle.checked = isSoundEnabled();
    });

    // Audio toggle change listener
    const audioToggle = el("audio-toggle");
    if (audioToggle) {
      audioToggle.addEventListener("change", () => {
        const enabled = audioToggle.checked;
        setSoundEnabled(enabled);
        // Provide subtle feedback
        if (!enabled) {
          showToast("🔇 Sound disabled");
        } else {
          showToast("🔊 Sound enabled");
        }
      });
    }

    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
    });

    el("spin-btn").addEventListener("click", () => {
      const state = Store.get();
      if (state.player.id && state.player.id.startsWith("guest-")) {
        alert("YOU ARE A GUEST IN THIS REALM. Sign in with Google to spin the wheel.");
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

      // Phase 4: Wheel click sound & haptic
      playSfx("click");
      triggerHaptic([100, 50, 100]);

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
    checkAndShowAntiCheatWarning();
    // --- Session Initialization: Prevent multi-tab EB farming ---
    // Generate a unique session ID for this tab/player combination
    // Format: "sess_timestamp_randomString" (matches storage.js generateSessionId logic)
    const currentSessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    // Only set session if player is signed in (Google)
    // This will be wired up in Auth.init callback
    window._eldenSessionId = currentSessionId;
    Auth.init(onSignedIn);
    el("locate-btn")?.addEventListener("click", startLocating);
  });
})();
