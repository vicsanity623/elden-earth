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
    if (state.player.id && state.player.id.startsWith("guest-")) {
      alert("YOU ARE A GUEST IN THIS REALM. Sign in with Google to buy plots.");
      onBuyAttempt(false, null);
      return;
    }
    const tid = tileId(tx, ty);
    const allPlots = getAllPlots();

    if (allPlots[tid]) {
      const owner = allPlots[tid].ownerName || "another player";
      alert(`This tile is already claimed by ${owner}!`);
      return;
    }

    if (state.eb < CONFIG.PLOT_COST_EB) {
      onBuyAttempt(false, null);
      return;
    }

    pendingTile = { tx, ty };
    const modal = document.getElementById("buy-modal");
    if (modal) modal.classList.remove("hidden");
  }

  async function executeBuy() {
    if (!pendingTile) return;
    const { tx, ty } = pendingTile;
    pendingTile = null;

    const state = Store.get();
    if (state.player.id && state.player.id.startsWith("guest-")) {
      alert("YOU ARE A GUEST IN THIS REALM. Sign in with Google to buy plots.");
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

  function render() {
    if (!map || !map.getStyle()) return;

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
              properties: { tx, ty },
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
          "fill-color": "#4fd6c4",
          "fill-opacity": 0.08,
        },
      });

      map.addLayer({
        id: "empty-grid-line",
        type: "line",
        source: "empty-grid-source",
        paint: {
          "line-color": "#4fd6c4",
          "line-width": 1.5,
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

  function setBuyMode(active, coords = null) {
    isBuyMode = active;
    if (coords) playerCoords = coords;
    render();
  }

  function setGlobalPlot(tid, data) {
    globalPlots[tid] = data;
    render();
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

    // Wire up Confirm & Cancel buttons for Claim Land modal
    const confirmBtn = document.getElementById("buy-confirm-btn");
    const cancelBtn = document.getElementById("buy-cancel-btn");
    const buyModal = document.getElementById("buy-modal");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        executeBuy();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        pendingTile = null;
        if (buyModal) buyModal.classList.add("hidden");
      });
    }

    // Render only on true camera movements and when Firestore broadcasts updates
    map.on("moveend zoomend", render);
    listenToGlobalPlots();
    render();
  }

  return { init, render, promptBuyTile, executeBuy, getAllPlots, setBuyMode, setGlobalPlot };
})();
