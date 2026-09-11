// ============================================================
// Elden Earth — diamonds (Mapbox GL JS 3D Native Engine)
// ============================================================
const Diamonds = (() => {
  let map = null;
  let markers = {};        // id -> Mapbox Marker
  let playerPos = null;    // {lat, lon}
  let onCollect = () => {};
  let onDenied = () => {};
  let spawnTimer = null;

  // Floating Combat Text Helper
  function spawnFloatingText(x, y, htmlContent) {
    const popup = document.createElement("div");
    popup.className = "combat-text-popup";
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.innerHTML = htmlContent;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1100);
  }

  // Flying 3D Gem Arc Particle to HUD
  function spawnFlyingGemToHUD(startX, startY) {
    const targetEl = document.getElementById("stat-diamonds");
    if (!targetEl) return;

    const targetBounds = targetEl.getBoundingClientRect();
    const endX = targetBounds.left + targetBounds.width / 2;
    const endY = targetBounds.top + targetBounds.height / 2;

    const gem = document.createElement("div");
    gem.className = "flying-3d-gem";
    gem.style.left = `${startX}px`;
    gem.style.top = `${startY}px`;
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
      gem.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.4) rotate(360deg)`;
      gem.style.opacity = "0.2";
    });

    setTimeout(() => {
      gem.remove();
      targetEl.classList.remove("hud-impact-bump");
      void targetEl.offsetWidth;
      targetEl.classList.add("hud-impact-bump");
    }, 750);
  }

  // Mini Particle Burst Explosion on Tap
  function triggerParticleExplosion(x, y) {
    const container = document.createElement("div");
    container.className = "gem-explosion-container";
    container.style.left = x + "px";
    container.style.top = y + "px";
    document.body.appendChild(container);

    for (let i = 0; i < 10; i++) {
      const p = document.createElement("span");
      p.className = "burst-spark";
      const angle = (i / 10) * 360 + (Math.random() * 20 - 10);
      const dist = 30 + Math.random() * 35;
      const rad = (angle * Math.PI) / 180;
      p.style.setProperty("--tx", `${Math.cos(rad) * dist}px`);
      p.style.setProperty("--ty", `${Math.sin(rad) * dist}px`);
      container.appendChild(p);
    }
    setTimeout(() => container.remove(), 700);
  }

  // Lightweight GPU-Accelerated 3D Gem (Zero Duplicate Shader Overhead)
  function createGemElement(dim, did) {
    const el = document.createElement("div");
    el.className = "diamond-3d-wrapper" + (dim ? " far" : "");

    const randomDuration = (2.8 + Math.random() * 0.8).toFixed(2) + "s";
    const randomDelay = (-Math.random() * 3.0).toFixed(2) + "s";

    el.innerHTML = `
      <div class="gem-anchor" style="--hover-dur:${randomDuration}; --hover-delay:${randomDelay};">
        <div class="gem-shadow"></div>
        <div class="gem-3d">
          <svg viewBox="0 0 32 38" class="gem-svg">
            <polygon points="16,2 29,12 16,16 3,12" fill="#a8f5ec"/>
            <polygon points="3,12 16,16 16,36" fill="#1d7a6e"/>
            <polygon points="29,12 16,16 16,36" fill="#4fd6c4"/>
            <polygon points="16,2 20,8 16,16 12,8" fill="rgba(255,255,255,0.85)"/>
          </svg>
          <div class="gem-sparkle-1">✦</div>
        </div>
      </div>
    `;

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      attemptCollect(did);
    });
    return el;
  }

  function id() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function withinCollectRange(lat, lon) {
    if (!playerPos) return false;
    return Geo.haversine(playerPos.lat, playerPos.lon, lat, lon) <= CONFIG.DIAMOND_COLLECT_RADIUS_METERS;
  }

  function renderAll() {
    // Battery Saver: Skip marker rendering if phone is in pocket or map not loaded
    if (!map || document.hidden) return;
    const state = Store.get();
    const live = state.liveDiamonds;

    // Remove stale markers
    for (const mid in markers) {
      if (!live[mid]) {
        markers[mid].remove();
        delete markers[mid];
      }
    }

    // Add or update markers
    const collected = new Set(state.collectedDiamondIds || []);
    const bounds = map.getBounds(); // Get active screen viewport

    for (const did in live) {
      if (collected.has(did)) {
        delete live[did];
        continue;
      }
      const d = live[did];

      // Viewport Culling: Skip rendering if diamond is off-screen (Saves dozens of CSS loops!)
      if (bounds && !bounds.contains([d.lon, d.lat])) {
        if (markers[did]) { markers[did].remove(); delete markers[did]; }
        continue;
      }

      const dim = !withinCollectRange(d.lat, d.lon);

      if (markers[did]) {
        const el = markers[did].getElement();
        if (el) {
          if (dim) el.classList.add("far");
          else el.classList.remove("far");
        }
      } else {
        const el = createGemElement(dim, did);
        const m = new mapboxgl.Marker({
          element: el,
          pitchAlignment: "viewport",    // Stands vertically upright in 3D
          rotationAlignment: "viewport", // Faces player camera
        })
          .setLngLat([d.lon, d.lat])
          .addTo(map);

        markers[did] = m;
      }
    }
  }

  function attemptCollect(did) {
    const state = Store.get();
    const d = state.liveDiamonds[did];
    if (!d) return;

    if (!withinCollectRange(d.lat, d.lon)) {
      onDenied();
      return;
    }

    if (map) {
      const pt = map.project([d.lon, d.lat]);
      triggerParticleExplosion(pt.x, pt.y);
      spawnFloatingText(pt.x, pt.y - 20, `+1 <span class="hud-gem-icon"></span>`);
      spawnFlyingGemToHUD(pt.x, pt.y);
    }

    // Blacklist this diamond ID forever so no cloud sync or reload can ever restore it
    if (!state.collectedDiamondIds) state.collectedDiamondIds = [];
    state.collectedDiamondIds.push(did);
    // Keep list capped at recent 100 IDs
    if (state.collectedDiamondIds.length > 100) state.collectedDiamondIds.shift();

    delete state.liveDiamonds[did];
    state.diamonds = (Number(state.diamonds) || 0) + 1;
    Store.save();
    if (markers[did]) { markers[did].remove(); delete markers[did]; }
    onCollect();
  }

  function pruneExpired() {
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    const now = Date.now();
    let changed = false;
    for (const did in state.liveDiamonds) {
      if (now - state.liveDiamonds[did].spawnedAt > CONFIG.DIAMOND_LIFETIME_MS) {
        delete state.liveDiamonds[did];
        changed = true;
      }
    }
    if (changed) Store.save();
  }

  function trySpawn() {
    if (!playerPos) return;
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    pruneExpired();

    const now = Date.now();
    const spawnInterval = CONFIG.DIAMOND_SPAWN_CHECK_MS || 12 * 60 * 1000;

    // Do not accumulate diamonds around a player who has stopped moving.
    if (state.lastDiamondMovementAt &&
        now - state.lastDiamondMovementAt >= (CONFIG.DIAMOND_IDLE_TIMEOUT_MS || 60 * 60 * 1000)) {
      return;
    }

    // Cooldown gate: Prevent force-close reload exploit
    if (state.lastDiamondSpawn && (now - state.lastDiamondSpawn < spawnInterval)) {
      return;
    }

    const count = Object.keys(state.liveDiamonds).length;
    if (count >= CONFIG.DIAMOND_MAX_ACTIVE) return;

    const p = Geo.randomPointInRadius(
      playerPos.lat,
      playerPos.lon,
      CONFIG.DIAMOND_SPAWN_RADIUS_METERS,
      CONFIG.DIAMOND_COLLECT_RADIUS_METERS
    );
    state.liveDiamonds[id()] = { lat: p.lat, lon: p.lon, spawnedAt: now };
    state.lastDiamondSpawn = now;
    Store.save();
    renderAll();
  }

  function init(mapboxMap, callbacks) {
    map = mapboxMap;
    onCollect = callbacks.onCollect || onCollect;
    onDenied = callbacks.onDenied || onDenied;
    pruneExpired();
    renderAll();

    // Regular spawn ticker
    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(trySpawn, CONFIG.DIAMOND_SPAWN_CHECK_MS || 12 * 60 * 1000);
  }

  let lastPosUpdate = 0;
  let lastRenderPos = null;

  function setPlayerPosition(lat, lon) {
    const now = Date.now();
    playerPos = { lat, lon };

    const storedPosition = Store.get().lastDiamondPlayerPosition;
    const movedDistance = storedPosition
      ? Geo.haversine(storedPosition.lat, storedPosition.lon, lat, lon)
      : Infinity;
    if (!storedPosition || movedDistance >= (CONFIG.DIAMOND_MOVEMENT_THRESHOLD_METERS || 10)) {
      const state = Store.get();
      state.lastDiamondMovementAt = now;
      state.lastDiamondPlayerPosition = { lat, lon };
      Store.save();
    }

    // Throttle checks: Only re-render if moved > 2 meters or 3 seconds elapsed
    const distMoved = lastRenderPos ? Geo.haversine(lastRenderPos.lat, lastRenderPos.lon, lat, lon) : 999;

    if (distMoved > 2 || (now - lastPosUpdate > 3000)) {
      lastPosUpdate = now;
      lastRenderPos = { lat, lon };
      pruneExpired();
      trySpawn();
      renderAll();
    }
  }

  return { init, setPlayerPosition, renderAll };
})();