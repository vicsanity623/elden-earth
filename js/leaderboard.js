// ============================================================
// Elden Earth — Mayors, Governors & Presidents (Stackable Dividends)
// ============================================================
const Leaderboard = (() => {
  let modal = null;
  let currentTab = "plots"; // "plots" | "rent" | "mayors" | "governors" | "presidents"
  let cachedData = null;
  let lastFetchTime = 0;
  const CACHE_TTL_MS = 60000;

  async function fetchRankings(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
      return cachedData;
    }

    const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : {};
    const state = Store.get();
    const db = Store.getDb();

    const playerStats = {};
    const cityCounts = {};    // city -> { ownerId -> count }
    const stateCounts = {};   // state -> { ownerId -> count }
    const countryCounts = {}; // country -> { ownerId -> count }

    // Mapping of State codes to Full Names
    const STATE_NAMES = {
      "AZ": "Arizona", "OH": "Ohio", "IL": "Illinois", "PR": "Puerto Rico",
      "CA": "California", "NY": "New York", "TX": "Texas", "FL": "Florida",
      "BC": "British Columbia", "ON": "Ontario", "QC": "Quebec"
    };

    for (const tid in allPlots) {
      const p = allPlots[tid];
      const oid = p.ownerId || "unknown";

      if (!playerStats[oid]) {
        playerStats[oid] = {
          id: oid,
          name: p.ownerName || "Traveler",
          avatar: p.avatar || "🙂",
          plotsCount: 0,
          cash: 0
        };
      }
      playerStats[oid].plotsCount++;

      // 1. Normalize City Name (Eliminates duplicates like Phoenix AR vs AZ)
      let rawCity = p.city || "";
      if (!rawCity) {
        const cMerc = Geo.fromMercator(
          p.tx * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2,
          p.ty * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2
        );
        if (cMerc.lon > -85 && cMerc.lon < -80) rawCity = "Warren Township, OH 🇺🇸";
        else if (cMerc.lon > -1 && cMerc.lon < 2) rawCity = "Mont-de-Marsan, FR 🇫🇷";
        else rawCity = "Phoenix, AZ 🇺🇸";
      }

      // Fix legacy "Phoenix, AR" typo -> "Phoenix, AZ"
      if (rawCity.includes("Phoenix, AR")) rawCity = "Phoenix, AZ 🇺🇸";
      if (rawCity.includes("Nanaimo, British Columbia")) rawCity = "Nanaimo, BC 🇨🇦";

      // 2. Extract State & Country automatically from city string
      let stateName = p.state;
      let country = p.country;

      if (!stateName || !country) {
        if (rawCity.includes("OH")) { stateName = "Ohio 🇺🇸"; country = "United States 🇺🇸"; }
        else if (rawCity.includes("AZ")) { stateName = "Arizona 🇺🇸"; country = "United States 🇺🇸"; }
        else if (rawCity.includes("IL")) { stateName = "Illinois 🇺🇸"; country = "United States 🇺🇸"; }
        else if (rawCity.includes("Puerto Rico")) { stateName = "Puerto Rico 🇺🇸"; country = "United States 🇺🇸"; }
        else if (rawCity.includes("🇨🇦") || rawCity.includes("BC")) { stateName = "British Columbia 🇨🇦"; country = "Canada 🇨🇦"; }
        else if (rawCity.includes("🇫🇷") || rawCity.includes("FR")) { stateName = "Nouvelle-Aquitaine 🇫🇷"; country = "France 🇫🇷"; }
        else { stateName = "Arizona 🇺🇸"; country = "United States 🇺🇸"; }
      }

      // City Aggregation (Cleaned & De-duplicated)
      if (!cityCounts[rawCity]) cityCounts[rawCity] = {};
      cityCounts[rawCity][oid] = (cityCounts[rawCity][oid] || 0) + 1;

      // State Aggregation (Governors)
      if (!stateCounts[stateName]) stateCounts[stateName] = {};
      stateCounts[stateName][oid] = (stateCounts[stateName][oid] || 0) + 1;

      // Country Aggregation (Presidents)
      if (!countryCounts[country]) countryCounts[country] = {};
      countryCounts[country][oid] = (countryCounts[country][oid] || 0) + 1;
    }

    // Always represent self
    if (state.player?.id && !playerStats[state.player.id]) {
      playerStats[state.player.id] = {
        id: state.player.id,
        name: state.player.name || "Traveler",
        avatar: state.player.avatar || "🙂",
        plotsCount: Object.keys(state.plots || {}).length,
        cash: state.cash || 0
      };
    }

    // Helper to find top owner in a territory
    function pickTopRuler(countsObj) {
      const results = [];
      for (const place in countsObj) {
        let maxPlots = 0;
        let topOid = null;
        for (const oid in countsObj[place]) {
          if (countsObj[place][oid] > maxPlots) {
            maxPlots = countsObj[place][oid];
            topOid = oid;
          }
        }
        if (topOid) {
          results.push({
            territory: place,
            ownerId: topOid,
            plots: maxPlots,
            name: playerStats[topOid]?.name || "Traveler",
            avatar: playerStats[topOid]?.avatar || "🙂"
          });
        }
      }
      return results;
    }

    const mayors = pickTopRuler(cityCounts);
    const governors = pickTopRuler(stateCounts);
    const presidents = pickTopRuler(countryCounts);

    // Sync cloud cash balances for rent leaderboard
    const playerArray = Object.values(playerStats);
    if (db) {
      try {
        const snap = await db.collection("saves").limit(50).get();
        snap.forEach(doc => {
          const d = doc.data();
          const target = playerArray.find(p => p.id === doc.id);
          if (target) target.cash = d.cash || 0;
        });
      } catch (e) {
        console.warn("[Leaderboard] Saves query notice:", e);
      }
    }

    const me = playerArray.find(p => p.id === state.player?.id);
    if (me) me.cash = state.cash || 0;

    cachedData = { players: playerArray, mayors, governors, presidents };
    lastFetchTime = Date.now();
    return cachedData;
  }

  // Award Stackable Dividends: 2 EB (Mayor) + 2 EB (Governor) + 2 EB (President)
  async function awardTerritoryDividends(territory, buyerId, plotCostEB = 100) {
    if (!territory) return;
    const db = Store.getDb();
    const state = Store.get();
    const data = await fetchRankings();

    const mayor = data.mayors.find(m => m.territory === territory.city);
    const governor = data.governors.find(g => g.territory === territory.state);
    const president = data.presidents.find(p => p.territory === territory.country);

    // Track total EB earned per player for this purchase
    const payouts = {}; // ownerId -> { amount, titles: [] }

    if (mayor && mayor.ownerId !== buyerId) {
      if (!payouts[mayor.ownerId]) payouts[mayor.ownerId] = { amount: 0, titles: [], name: mayor.name };
      payouts[mayor.ownerId].amount += 2;
      payouts[mayor.ownerId].titles.push(`Mayor of ${mayor.territory}`);
    }

    if (governor && governor.ownerId !== buyerId) {
      if (!payouts[governor.ownerId]) payouts[governor.ownerId] = { amount: 0, titles: [], name: governor.name };
      payouts[governor.ownerId].amount += 2;
      payouts[governor.ownerId].titles.push(`Governor of ${governor.territory}`);
    }

    if (president && president.ownerId !== buyerId) {
      if (!payouts[president.ownerId]) payouts[president.ownerId] = { amount: 0, titles: [], name: president.name };
      payouts[president.ownerId].amount += 2;
      payouts[president.ownerId].titles.push(`President of ${president.territory}`);
    }

    // Execute payouts
    for (const oid in payouts) {
      const payout = payouts[oid];

      // If local player, update immediately
      if (oid === state.player.id) {
        state.eb = (Number(state.eb) || 0) + payout.amount;
        state.totalDividends = (Number(state.totalDividends) || 0) + payout.amount;
        Store.save();
        if (typeof showToast === "function") {
          showToast(`👑 Royalty Payout! +${payout.amount} EB collected (${payout.titles.join(", ")})!`);
        }
      } else if (db) {
        // Atomically deposit into cloud save
        try {
          await db.collection("saves").doc(oid).set({
            eb: firebase.firestore.FieldValue.increment(payout.amount),
            totalDividends: firebase.firestore.FieldValue.increment(payout.amount),
          }, { merge: true });
        } catch (err) {
          console.warn("[Dividends] Deposit error:", err);
        }
      }

      // Broadcast to live feed
      if (typeof Feed !== "undefined") {
        Feed.broadcast("dividend", {
          mayorName: payout.name,
          city: territory.city,
          amount: payout.amount,
          titlesDesc: payout.titles.join(" & ")
        });
      }
    }
  }

  function render(data) {
    const listEl = document.getElementById("leaderboard-list");
    if (!listEl || !data) return;

    const fragment = document.createDocumentFragment();
    const state = Store.get();
    const myId = state.player?.id;

    if (currentTab === "plots") {
      const sorted = [...data.players].sort((a, b) => (b.plotsCount || 0) - (a.plotsCount || 0));
      sorted.forEach((p, idx) => {
        const isSelf = p.id === myId;
        const rankMedal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
        const row = document.createElement("div");
        row.className = "lb-row" + (isSelf ? " self-row" : "");
        row.innerHTML = `
          <div class="lb-rank">${rankMedal}</div>
          <div class="lb-avatar">${renderAvatar(p.avatar)}</div>
          <div class="lb-info">
            <span class="lb-name">${p.name} ${isSelf ? "<em>(You)</em>" : ""}</span>
            <span class="lb-sub">${p.plotsCount} Plots Claimed</span>
          </div>
          <div class="lb-metric">${p.plotsCount} <span class="lb-unit">Plots</span></div>
        `;
        fragment.appendChild(row);
      });
    } else if (currentTab === "rent") {
      const sorted = [...data.players].sort((a, b) => (b.cash || 0) - (a.cash || 0));
      sorted.forEach((p, idx) => {
        const isSelf = p.id === myId;
        const rankMedal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
        const row = document.createElement("div");
        row.className = "lb-row" + (isSelf ? " self-row" : "");
        row.innerHTML = `
          <div class="lb-rank">${rankMedal}</div>
          <div class="lb-avatar">${renderAvatar(p.avatar)}</div>
          <div class="lb-info">
            <span class="lb-name">${p.name} ${isSelf ? "<em>(You)</em>" : ""}</span>
            <span class="lb-sub">Total Passive Rent</span>
          </div>
          <div class="lb-metric gold">$${(Number(p.cash) || 0).toFixed(6)}</div>
        `;
        fragment.appendChild(row);
      });
    } else if (currentTab === "mayors") {
      renderRulersList(fragment, data.mayors, "👑", "Mayor of", myId);
    } else if (currentTab === "governors") {
      renderRulersList(fragment, data.governors, "🏛️", "Governor of", myId);
    } else if (currentTab === "presidents") {
      renderRulersList(fragment, data.presidents, "🦅", "President of", myId);
    }

    listEl.innerHTML = "";
    listEl.appendChild(fragment);
  }

  function renderRulersList(fragment, rulers, icon, titleLabel, myId) {
    if (!rulers || rulers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "feed-empty-msg";
      empty.textContent = `No ${titleLabel} established yet. Claim land to take this title!`;
      fragment.appendChild(empty);
      return;
    }

    rulers.forEach((r) => {
      const isSelf = r.ownerId === myId;
      const row = document.createElement("div");
      row.className = "lb-row mayor-row" + (isSelf ? " self-row" : "");
      row.innerHTML = `
        <div class="lb-rank">${icon}</div>
        <div class="lb-avatar mayor-crown-wrap">${renderAvatar(r.avatar)}<span class="crown-icon">${icon}</span></div>
        <div class="lb-info">
          <span class="lb-name">${r.name} ${isSelf ? "<em>(You)</em>" : ""}</span>
          <span class="lb-sub">${titleLabel} <strong>${r.territory}</strong> (${r.plots} Plots)</span>
        </div>
        <div class="lb-metric teal">+2 EB <span class="lb-unit">Royalty</span></div>
      `;
      fragment.appendChild(row);
    });
  }

  function renderAvatar(avatar) {
    if (avatar && avatar.startsWith("img:")) {
      return `<img src="${avatar.slice(4)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
    return `<span>${avatar || "🙂"}</span>`;
  }

  async function open() {
    if (!modal) modal = document.getElementById("leaderboard-modal");
    if (modal) modal.classList.remove("hidden");

    if (cachedData) render(cachedData);
    const data = await fetchRankings();
    render(data);
  }

  function init() {
    modal = document.getElementById("leaderboard-modal");
    document.getElementById("leaderboard-btn")?.addEventListener("click", open);

    const tabs = document.querySelectorAll(".lb-tab-btn");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentTab = tab.dataset.tab;

        if (cachedData) {
          render(cachedData);
        } else {
          fetchRankings().then(data => render(data));
        }
      });
    });
  }

  return { init, open, fetchRankings, awardTerritoryDividends };
})();