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

  function createGemElement(dim, did) {
    const el = document.createElement("div");
    el.className = "diamond-3d-wrapper" + (dim ? " far" : "");

    const randomDuration = (2.8 + Math.random() * 1.0).toFixed(2) + "s";
    const randomDelay = (-Math.random() * 3.5).toFixed(2) + "s";

    el.innerHTML = `
      <div class="gem-anchor" style="--hover-dur:${randomDuration}; --hover-delay:${randomDelay};">
        <div class="gem-shadow"></div>
        <div class="gem-3d">
          <svg viewBox="0 0 32 38" class="gem-svg">
            <defs>
              <linearGradient id="gemTop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a8f5ec"/>
                <stop offset="100%" stop-color="#4fd6c4"/>
              </linearGradient>
              <linearGradient id="gemLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#36b8a7"/>
                <stop offset="100%" stop-color="#1d7a6e"/>
              </linearGradient>
              <linearGradient id="gemRight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4fd6c4"/>
                <stop offset="100%" stop-color="#289b8d"/>
              </linearGradient>
              <linearGradient id="gemGlint" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <polygon points="16,2 29,12 16,16 3,12" fill="url(#gemTop)"/>
            <polygon points="3,12 16,16 16,36" fill="url(#gemLeft)"/>
            <polygon points="29,12 16,16 16,36" fill="url(#gemRight)"/>
            <polygon points="16,2 20,8 16,16 12,8" fill="url(#gemGlint)"/>
          </svg>
          <div class="gem-sparkle-1">✦</div>
          <div class="gem-sparkle-2">✦</div>
          <span class="dust-particle p1"></span>
          <span class="dust-particle p2"></span>
          <span class="dust-particle p3"></span>
        </div>
      </div>
    `;

    el.addEventListener("click", () => attemptCollect(did));
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
    if (!map) return;
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
    for (const did in live) {
      // Never render a diamond that has already been collected
      if (collected.has(did)) {
        delete live[did];
        continue;
      }
      const d = live[did];
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
    const spawnInterval = CONFIG.DIAMOND_SPAWN_CHECK_MS || 35000;

    // Cooldown gate: Prevent force-close reload exploit
    if (state.lastDiamondSpawn && (now - state.lastDiamondSpawn < spawnInterval)) {
      return;
    }

    const count = Object.keys(state.liveDiamonds).length;
    if (count >= CONFIG.DIAMOND_MAX_ACTIVE) return;

    const p = Geo.randomPointInRadius(playerPos.lat, playerPos.lon, CONFIG.DIAMOND_SPAWN_RADIUS_METERS);
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
    spawnTimer = setInterval(trySpawn, CONFIG.DIAMOND_SPAWN_CHECK_MS || 35000);
  }

  function setPlayerPosition(lat, lon) {
    playerPos = { lat, lon };
    pruneExpired();
    trySpawn();
    renderAll();
  }

  return { init, setPlayerPosition, renderAll };
})();
