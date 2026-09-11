// ============================================================
// Elden Earth — land grid & real-time multiplayer sync (Mapbox 3D)
// ============================================================
const Grid = (() => {
  let map = null;
  let onBuyAttempt = () => {};
  let pendingTile = null;
  let globalPlots = {};
  let activeMarkers = [];
  let isBuyMode = false;
  let playerCoords = null;
  let selectedPlotId = null;

  function tileId(tx, ty) { return tx + "_" + ty; }

  function pickRarity() {
    const rarities = CONFIG.PLOT_RARITIES;
    const totalWeight = rarities.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const r of rarities) {
      if (roll < r.weight) return r;
      roll -= r.weight;
    }
    return rarities[0];
  }

  function rarityInfo(key) {
    return CONFIG.PLOT_RARITIES.find(r => r.key === key) || CONFIG.PLOT_RARITIES[0];
  }

  function getAllPlots() {
    const state = Store.get();
    return Object.assign({}, globalPlots, state.plots);
  }

  function promptBuyTile(tx, ty) {
    const state = Store.get();
    if (state.player && state.player.id && state.player.id.startsWith("guest-")) {
      showToast("YOU ARE A GUEST IN THIS REALM. Sign in with Google to buy plots.");
      onBuyAttempt(false, null);
      return;
    }
    const tid = tileId(tx, ty);
    const allPlots = getAllPlots();

    if (allPlots[tid]) {
      if (allPlots[tid].ownerId === state.player.id) openPlotModal(tid, allPlots[tid]);
      else showToast(`This tile is already claimed by ${allPlots[tid].ownerName || "another player"}!`);
      return;
    }

    // Check if player holds an unplanted Citadel Capsule
    const hasCapsule = state.capsule && state.capsule.awarded && !state.capsule.planted;

    // Allow opening modal if player has 100 EB OR a free capsule to plant!
    if (state.eb < CONFIG.PLOT_COST_EB && !hasCapsule && !hasBagPlots(state)) {
      onBuyAttempt(false, null);
      return;
    }

    pendingTile = { tx, ty };
    scheduleRender();
    const modal = document.getElementById("buy-modal");
    const plantBtn = document.getElementById("plant-capsule-confirm-btn");

    // Seamless toggle: Shows or hides the plant button without touching innerHTML!
    if (plantBtn) {
      plantBtn.style.display = hasCapsule ? "inline-block" : "none";
    }
    const bagBtn = document.getElementById("plot-bag-btn");
    if (bagBtn) bagBtn.style.display = hasBagPlots(state) ? "inline-block" : "none";

    if (modal) modal.classList.remove("hidden");
  }

  function hasBagPlots(state) {
    return Object.values(state.plotBag || {}).some(count => Number(count) > 0);
  }

  function addPlotToBag(state, rarityKey) {
    state.plotBag = state.plotBag || {};
    let slot = rarityKey;
    let suffix = 0;
    while (Number(state.plotBag[slot]) >= 99) {
      suffix++;
      slot = `${rarityKey}_${suffix}`;
    }
    state.plotBag[slot] = (Number(state.plotBag[slot]) || 0) + 1;
  }

  function openPlotModal(tid, plot) {
    selectedPlotId = tid;
    const rarity = rarityInfo(plot.rarity);
    document.getElementById("plot-modal-rarity").textContent = `${rarity.label} PLOT`;
    document.getElementById("plot-modal-rarity").style.color = rarity.color;
    document.getElementById("plot-modal-name").textContent = `${plot.ownerName || "Traveler"}'s Plot`;
    document.getElementById("plot-modal-coords").textContent = `Coords: [${plot.tx}, ${plot.ty}]`;
    document.getElementById("plot-modal-rate").textContent = `${rarity.rate} EB / sec`;
    document.getElementById("plot-modal-location").textContent = [plot.city, plot.state, plot.country].filter(Boolean).join(", ") || "Unknown";
    document.getElementById("plot-modal")?.classList.remove("hidden");
  }

  function relocatePlot() {
    const state = Store.get();
    const plot = state.plots[selectedPlotId];
    if (!plot || plot.ownerId !== state.player.id) return;
    if (!confirm("Relocate this plot? The tile will become unoccupied and the plot will return to your bag.")) return;

    addPlotToBag(state, plot.rarity);
    delete state.plots[selectedPlotId];
    delete globalPlots[selectedPlotId];
    Store.save();

    const db = Store.getDb();
    if (db) db.collection("plots").doc(selectedPlotId).delete().catch(e => console.warn("[Plots] Relocation sync notice:", e));

    document.getElementById("plot-modal")?.classList.add("hidden");
    selectedPlotId = null;
    render();
    if (typeof showToast === "function") showToast(`Plot relocated. ${rarityInfo(plot.rarity).label} plot returned to your bag!`, 3500);
  }

  function openPlotBag() {
    const state = Store.get();
    const items = document.getElementById("plot-bag-items");
    if (!items) return;
    items.innerHTML = "";
    for (const slot in (state.plotBag || {})) {
      const rarityKey = slot.split("_")[0];
      const rarity = rarityInfo(rarityKey);
      const count = Number(state.plotBag[slot]) || 0;
      if (!count) continue;
      const button = document.createElement("button");
      button.className = "btn btn-primary";
      button.textContent = `${rarity.label} Plot x${count}`;
      button.style.borderColor = rarity.color;
      button.addEventListener("click", () => placeBagPlot(slot));
      items.appendChild(button);
    }
    document.getElementById("buy-modal")?.classList.add("hidden");
    document.getElementById("plot-bag-modal")?.classList.remove("hidden");
  }

  async function placeBagPlot(slot) {
    if (!pendingTile) return;
    const state = Store.get();
    const { tx, ty } = pendingTile;
    const tid = tileId(tx, ty);
    const rarityKey = slot.split("_")[0];
    const count = Number(state.plotBag?.[slot]) || 0;
    if (!count || getAllPlots()[tid]) return;

    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const centerLat = (corners[0][0] + corners[2][0]) / 2;
    const centerLon = (corners[0][1] + corners[2][1]) / 2;
    const territory = await Geo.getTerritoryInfo(centerLat, centerLon);
    const rarity = rarityInfo(rarityKey);
    const sourceId = Object.keys(state.plots).find(id => state.plots[id].rarity === rarityKey);
    const plotData = {
      ...(sourceId ? state.plots[sourceId] : {}),
      tx, ty, city: territory.city, state: territory.state, country: territory.country,
      rarity: rarityKey, rate: rarity.rate, ownerId: state.player.id,
      ownerName: state.player.name || "Traveler", avatar: state.player.avatar || "🙂", claimedAt: Date.now(),
    };
    state.plotBag[slot] = count - 1;
    if (!state.plotBag[slot]) delete state.plotBag[slot];
    state.plots[tid] = plotData;
    globalPlots[tid] = plotData;
    pendingTile = null;
    Store.save();
    const db = Store.getDb();
    if (db) await db.collection("plots").doc(tid).set(plotData).catch(e => console.warn("[Plots] Relocation sync notice:", e));
    document.getElementById("plot-bag-modal")?.classList.add("hidden");
    render();
    showPlotFloatText(tx, ty, `RELOCATED ${rarity.label.toUpperCase()} TO NEW LOCATION`);
  }

  function showPlotFloatText(tx, ty, text) {
    if (!map) return;
    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const lat = (corners[0][0] + corners[2][0]) / 2;
    const lon = (corners[0][1] + corners[2][1]) / 2;
    const pt = map.project([lon, lat]);
    const popup = document.createElement("div");
    popup.className = "combat-text-popup";
    popup.style.left = `${pt.x}px`;
    popup.style.top = `${pt.y}px`;
    popup.textContent = text;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1500);
  }

  async function executeBuy() {
    if (!pendingTile) return;
    const { tx, ty } = pendingTile;
    pendingTile = null;

    const state = Store.get();
    if (state.player.id && state.player.id.startsWith("guest-")) {
      showToast("YOU ARE A GUEST IN THIS REALM. Sign in with Google to buy plots.");
      onBuyAttempt(false, null);
      return;
    }

    const modal = document.getElementById("buy-modal");
    if (modal) modal.classList.add("hidden");

    const tid = tileId(tx, ty);
    const allPlots = getAllPlots();
    if (allPlots[tid] || state.eb < CONFIG.PLOT_COST_EB) return;

    state.eb -= CONFIG.PLOT_COST_EB;
    const rarity = pickRarity();

    // Determine real-world City, State & Country from tile center
    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const centerLat = (corners[0][0] + corners[2][0]) / 2;
    const centerLon = (corners[0][1] + corners[2][1]) / 2;
    const territory = await Geo.getTerritoryInfo(centerLat, centerLon);

    if (map) {
      const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
      const centerLat = (corners[0][0] + corners[2][0]) / 2;
      const centerLon = (corners[0][1] + corners[2][1]) / 2;
      const pt = map.project([centerLon, centerLat]);

      const popup = document.createElement("div");
      popup.className = "combat-text-popup";
      popup.style.left = `${pt.x}px`;
      popup.style.top = `${pt.y}px`;
      popup.innerHTML = `+1 ${rarity.label} Plot!`;
      document.body.appendChild(popup);
      setTimeout(() => popup.remove(), 1100);
    }

    const plotData = {
      tx,
      ty,
      city: territory.city,
      state: territory.state,
      country: territory.country,
      rarity: rarity.key,
      rate: rarity.rate,
      ownerId: state.player.id || "guest-" + Math.random().toString(36).slice(2, 8),
      ownerName: state.player.name || "Traveler",
      avatar: state.player.avatar || "🙂",
      claimedAt: Date.now(),
    };

    state.plots[tid] = plotData;
    globalPlots[tid] = plotData;
    Store.save();
    onBuyAttempt(true, rarity);
    render();

    // 1. Trigger Multi-Tier Stackable Dividends (Mayor, Governor, President)
    if (typeof Leaderboard !== "undefined" && Leaderboard.awardTerritoryDividends) {
      Leaderboard.awardTerritoryDividends(territory, state.player.id, CONFIG.PLOT_COST_EB);
    }

    // 2. Broadcast land claim to global feed
    if (typeof Feed !== "undefined") {
      Feed.broadcast("land", { rarity: rarity.label, location: territory.city, tileId: tid });
    }

    // 3. Save to Firebase Firestore
    const db = Store.getDb();
    if (db) {
      try {
        await db.collection("plots").doc(tid).set(plotData);
      } catch (err) {
        console.warn("[Multiplayer] Broadcast error:", err);
      }
    }
  }

  function visibleTileRange() {
    const bounds = map.getBounds();
    const ts = CONFIG.TILE_SIZE_METERS;
    const sw = Geo.tileForLatLon(bounds.getSouth(), bounds.getWest(), ts);
    const ne = Geo.tileForLatLon(bounds.getNorth(), bounds.getEast(), ts);
    return {
      minTx: Math.min(sw.tx, ne.tx), maxTx: Math.max(sw.tx, ne.tx),
      minTy: Math.min(sw.ty, ne.ty), maxTy: Math.max(sw.ty, ne.ty),
    };
  }

  let renderScheduled = false;

  function scheduleRender() {
    if (renderScheduled || document.hidden) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      render();
      renderScheduled = false;
    });
  }

  function render() {
    // Battery Saver: Don't spend GPU/CPU cycles if phone is in pocket or map not ready!
    if (!map || !map.getStyle() || document.hidden) return;

    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    const state = Store.get();
    const allPlots = getAllPlots();
    const zoom = map.getZoom();

    // Update 3D Standing Grass Foliage (Safeguarded against WebGL context interruption)
    if (typeof Foliage !== "undefined" && Foliage.update) {
      try {
        Foliage.update();
      } catch (err) {
        console.warn("[Foliage] Update safely bypassed:", err);
      }
    }

    // 1. RENDER CLAIMED PLOTS (Instantly)
    const claimedFeatures = [];
    for (const tid in allPlots) {
      const plot = allPlots[tid];
      const bounds = Geo.tileBounds(plot.tx, plot.ty, CONFIG.TILE_SIZE_METERS);
      const coords = bounds.map(pt => [pt[1], pt[0]]);
      coords.push(coords[0]);

      claimedFeatures.push({
        type: "Feature",
        properties: {
          color: rarityInfo(plot.rarity).color,
          rarity: plot.rarity,
          ownerId: plot.ownerId,
        },
        geometry: { type: "Polygon", coordinates: [coords] },
      });
    }

    const claimedGeoJSON = { type: "FeatureCollection", features: claimedFeatures };

    if (map.getSource("plots-source")) {
      map.getSource("plots-source").setData(claimedGeoJSON);
    } else {
      map.addSource("plots-source", { type: "geojson", data: claimedGeoJSON });

      // 1. Subtle Lush Green Grass Base Underlay (All Claimed Parcels)
      map.addLayer({
        id: "plots-grass-base",
        type: "fill",
        source: "plots-source",
        paint: {
          "fill-color": "#27ae60",
          "fill-opacity": 0.28, // Soft meadow green tint
        },
      });

      // 2. Rarity Tint Layer (Common, Rare, Epic, Legendary overlay)
      map.addLayer({
        id: "plots-fill",
        type: "fill",
        source: "plots-source",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.45,
        },
      });

      map.addLayer({
        id: "plots-line",
        type: "line",
        source: "plots-source",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
        },
      });
    }

    // 2. RENDER EMPTY PURCHASE GRID ONLY IN "BUY LAND" MODE OR ZOOM 18+
    const emptyGridFeatures = [];
    if (isBuyMode && playerCoords) {
      const ts = CONFIG.TILE_SIZE_METERS;
      const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 50;
      const centerTile = Geo.tileForLatLon(playerCoords.lat, playerCoords.lon, ts);
      const tileRadius = Math.ceil(radiusM / ts);

      for (let dx = -tileRadius; dx <= tileRadius; dx++) {
        for (let dy = -tileRadius; dy <= tileRadius; dy++) {
          const tx = centerTile.tx + dx;
          const ty = centerTile.ty + dy;
          const tid = tileId(tx, ty);
          if (allPlots[tid]) continue;

          const bounds = Geo.tileBounds(tx, ty, ts);
          const cLat = (bounds[0][0] + bounds[2][0]) / 2;
          const cLon = (bounds[0][1] + bounds[2][1]) / 2;

          // Only tiles inside player radius
          if (Geo.haversine(playerCoords.lat, playerCoords.lon, cLat, cLon) <= radiusM) {
            const coords = bounds.map(pt => [pt[1], pt[0]]);
            coords.push(coords[0]);

            emptyGridFeatures.push({
              type: "Feature",
              properties: {
                tx,
                ty,
                selected: pendingTile && pendingTile.tx === tx && pendingTile.ty === ty,
              },
              geometry: { type: "Polygon", coordinates: [coords] },
            });
          }
        }
      }
    }

    const emptyGeoJSON = { type: "FeatureCollection", features: emptyGridFeatures };

    if (map.getSource("empty-grid-source")) {
      map.getSource("empty-grid-source").setData(emptyGeoJSON);
    } else {
      map.addSource("empty-grid-source", { type: "geojson", data: emptyGeoJSON });

      map.addLayer({
        id: "empty-grid-fill",
        type: "fill",
        source: "empty-grid-source",
        paint: {
          "fill-color": ["case", ["==", ["get", "selected"], true], "#ffffff", "#4fd6c4"],
          "fill-opacity": ["case", ["==", ["get", "selected"], true], 0.65, 0.14],
        },
      });

      map.addLayer({
        id: "empty-grid-line",
        type: "line",
        source: "empty-grid-source",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], true], "#ffffff", "#4fd6c4"],
          "line-width": ["case", ["==", ["get", "selected"], true], 2.5, 1.2],
        },
      });
    }

    // 3. RENDER CLUSTERED AVATARS & EXTRACTOR BEACONS (1 Avatar per Connected Territory)
    if (zoom >= 14) {
      const visited = new Set();
      let playerExtractorRendered = false;

      // Find all connected tile clusters using 4-directional flood fill
      for (const startTid in allPlots) {
        if (visited.has(startTid)) continue;

        const startPlot = allPlots[startTid];
        const clusterOwnerId = startPlot.ownerId;
        const cluster = [];
        const queue = [startPlot];
        visited.add(startTid);

        while (queue.length > 0) {
          const current = queue.shift();
          cluster.push(current);

          // Guarantee integer values to prevent string concatenation ("100" + 1 = "1001")
          const cx = parseInt(current.tx, 10);
          const cy = parseInt(current.ty, 10);

          // Check 4 adjacent orthogonal neighbors (N, S, E, W)
          const neighbors = [
            tileId(cx + 1, cy),
            tileId(cx - 1, cy),
            tileId(cx, cy + 1),
            tileId(cx, cy - 1),
          ];

          for (const nId of neighbors) {
            if (!visited.has(nId) && allPlots[nId] && allPlots[nId].ownerId === clusterOwnerId) {
              visited.add(nId);
              queue.push(allPlots[nId]);
            }
          }
        }

        // Calculate average centroid for the entire connected cluster
        let totalLat = 0;
        let totalLon = 0;

        for (const p of cluster) {
          const px = parseInt(p.tx, 10);
          const py = parseInt(p.ty, 10);
          const centerMerc = Geo.fromMercator(
            px * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2,
            py * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2
          );
          totalLat += centerMerc.lat;
          totalLon += centerMerc.lon;
        }

        const centroidLat = totalLat / cluster.length;
        const centroidLon = totalLon / cluster.length;

        // 5KM HORIZON CULLING: Don't render signboards for plots in Ohio, Canada, or Indiana!
        const refLat = (playerCoords && playerCoords.lat) ? playerCoords.lat : (map ? map.getCenter().lat : null);
        const refLon = (playerCoords && playerCoords.lon) ? playerCoords.lon : (map ? map.getCenter().lng : null);
        if (refLat && refLon) {
          const dist = Geo.haversine(refLat, refLon, centroidLat, centroidLon);
          if (dist > 5000) continue; // Skip distant signboards! Saves massive CPU & battery
        }

        const isSelf = clusterOwnerId === state.player.id;
        const rep = cluster[0];
        const avatar = isSelf ? (state.player.avatar || "🙂") : (rep.avatar || "🙂");

        const innerContent = avatar.startsWith("img:")
          ? `<img src="${avatar.slice(4)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">`
          : `<span style="font-size:15px;line-height:1;">${avatar}</span>`;

        // Count badge if more than 1 tile connected
        const countBadge = cluster.length > 1
          ? `<span style="position:absolute;bottom:-4px;right:-4px;background:#d4af61;color:#0b1118;font-size:10px;font-weight:800;border-radius:10px;padding:1px 5px;box-shadow:0 0 4px rgba(0,0,0,0.9);line-height:1.2;">${cluster.length}</span>`
          : "";

        const el = document.createElement("div");
        el.className = "custom-plot-icon standing-plot-sign";
        el.innerHTML = `
          <div class="sign-avatar-disc">
            ${innerContent}
            ${countBadge}
          </div>
          <div class="sign-stem"></div>
          <div class="sign-ground-shadow"></div>
        `;

        el.addEventListener("click", () => {
          const evt = new CustomEvent("openPlayerInfo", { detail: { cluster, isSelf } });
          window.dispatchEvent(evt);
        });

        // "viewport" makes the sign stand vertically upright & billboard toward the player camera
        const m = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",              // Anchors the bottom tip of the stem to the exact ground coordinates
          pitchAlignment: "viewport",    // Stands vertically upright (not flat on the ground)
          rotationAlignment: "viewport", // Rotates to continuously face the camera
        })
          .setLngLat([centroidLon, centroidLat])
          .addTo(map);

        activeMarkers.push(m);

        // Mount Extractor at the centroid if criteria met
        if (isSelf && Object.keys(state.plots || {}).length >= (CONFIG.EXTRACTOR_MIN_TILES || 5) && !playerExtractorRendered) {
          playerExtractorRendered = true;

          const beaconEl = document.createElement("div");
          beaconEl.className = "extractor-3d-wrap standing-extractor-wrap";
          beaconEl.innerHTML = `
            <div class="beacon-root">
              <div class="beacon-ground-aura"></div>
              <div class="orbit-ring ring-1"></div>
              <div class="orbit-ring ring-2"></div>
              <div class="beacon-core-gem">
                <svg viewBox="0 0 32 38" class="beacon-svg">
                  <polygon points="16,2 29,12 16,16 3,12" fill="#d4fbf6"/>
                  <polygon points="3,12 16,16 16,36" fill="#1d7a6e"/>
                  <polygon points="29,12 16,16 16,36" fill="#4fd6c4"/>
                  <polygon points="16,2 20,8 16,16 12,8" fill="#ffffff"/>
                </svg>
              </div>
            </div>
          `;
          beaconEl.addEventListener("click", () => {
            const evt = new CustomEvent("openExtractorModal");
            window.dispatchEvent(evt);
          });

          // Upright 2.5D billboard that faces the player's camera smoothly
          const extMarker = new mapboxgl.Marker({
            element: beaconEl,
            anchor: "bottom",              // Grounded at the bottom
            pitchAlignment: "viewport",    // Stands vertically upright in 3D
            rotationAlignment: "viewport", // Always rotates to face the player
          })
            .setLngLat([centroidLon + 0.00008, centroidLat + 0.00008])
            .addTo(map);

          activeMarkers.push(extMarker);
        }
      }
    }
  }

  function setPlayerPosition(lat, lon) {
    playerCoords = { lat, lon };
  }

  function setBuyMode(active, coords = null) {
    isBuyMode = active;
    if (coords) playerCoords = coords;
    scheduleRender();
  }

  function setGlobalPlot(tid, data) {
    globalPlots[tid] = data;
    scheduleRender();
  }

  function listenToGlobalPlots() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("plots").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const tid = change.doc.id;
          const data = change.doc.data();
          if (change.type === "added" || change.type === "modified") {
            globalPlots[tid] = data;
          } else if (change.type === "removed") {
            delete globalPlots[tid];
          }
        });
        render();
      }, (err) => console.warn("[Multiplayer] Sync error:", err));
    } catch (err) {
      console.warn("[Multiplayer] Listener error:", err);
    }
  }

  function init(mapboxMap, callbacks) {
    map = mapboxMap;
    onBuyAttempt = callbacks.onBuyAttempt || onBuyAttempt;

    map.on("click", (e) => {
      if (!isBuyMode) return; // Only allow buying in Buy Land mode
      const { lng, lat } = e.lngLat;
      const t = Geo.tileForLatLon(lat, lng, CONFIG.TILE_SIZE_METERS);
      promptBuyTile(t.tx, t.ty);
    });

    // Wire up Persistent Click Listeners for Claim Modal
    const confirmBtn = document.getElementById("buy-confirm-btn");
    const cancelBtn = document.getElementById("buy-cancel-btn");
    const plantBtn = document.getElementById("plant-capsule-confirm-btn");
    const bagBtn = document.getElementById("plot-bag-btn");
    const buyModal = document.getElementById("buy-modal");

    confirmBtn?.addEventListener("click", () => {
      executeBuy();
    });

    cancelBtn?.addEventListener("click", () => {
      pendingTile = null;
      if (buyModal) buyModal.classList.add("hidden");
    });

    plantBtn?.addEventListener("click", () => {
      if (pendingTile && typeof Citadels !== "undefined") {
        const corners = Geo.tileBounds(pendingTile.tx, pendingTile.ty, CONFIG.TILE_SIZE_METERS);
        const cLat = (corners[0][0] + corners[2][0]) / 2;
        const cLon = (corners[0][1] + corners[2][1]) / 2;
        const planted = Citadels.plantCapsule(pendingTile.tx, pendingTile.ty, cLat, cLon);
        if (planted) {
          pendingTile = null;
          if (buyModal) buyModal.classList.add("hidden");
        }
      }
    });

    bagBtn?.addEventListener("click", openPlotBag);
    document.getElementById("plot-relocate-btn")?.addEventListener("click", relocatePlot);

    // Debounced renders prevent lag during rapid zoom/orbit gestures
    map.on("moveend zoomend", scheduleRender);

    // Auto-refresh plots when phone is unlocked
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleRender();
      }
    });

    listenToGlobalPlots();
    scheduleRender();
  }

  return { init, render, promptBuyTile, executeBuy, getAllPlots, setBuyMode, setGlobalPlot, setPlayerPosition };
})();
