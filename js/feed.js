// ============================================================
// Elden Earth — Live Activity Feed (Permanent, Scrollable, 50-Event Log)
// ============================================================
const Feed = (() => {
  let feedCard = null;
  let feedList = null;
  let toggleBtn = null;
  let unreadBadge = null;
  let isCollapsed = false;
  let unreadCount = 0;
  const MAX_EVENTS = 50;
  const events = [];

  // Universal ISO 3166-1 country code to flag emoji
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return "🌐";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  let cachedCityName = null;
  async function resolveCity(lat, lon) {
    if (cachedCityName) return cachedCityName;
    if (!lat || !lon) return "the Realm 🌐";

    const US_STATES = {
      "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
      "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
      "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
      "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN",
      "Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
      "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC",
      "North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA",
      "Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX",
      "Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
      "Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC"
    };

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.village || "Phoenix";
      const rawState = addr.state || "";
      const stateCode = US_STATES[rawState] || (rawState.length === 2 ? rawState.toUpperCase() : "");
      const stateStr = stateCode ? `, ${stateCode}` : "";
      const flag = getFlagEmoji(addr.country_code);

      cachedCityName = `${city}${stateStr} ${flag}`;
      return cachedCityName;
    } catch (e) {
      return "the Realm 🌐";
    }
  }

  // Format relative time (e.g., "Just now", "2m ago")
  function formatTime(timestamp) {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function renderFeedList() {
    if (!feedList) return;
    feedList.innerHTML = "";

    if (events.length === 0) {
      feedList.innerHTML = `<div class="feed-empty-msg">No activity yet. Claim a plot to begin!</div>`;
      return;
    }

    events.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "feed-item";
      row.innerHTML = `
        <div class="feed-item-content">${ev.message}</div>
        <div class="feed-item-time">${formatTime(ev.timestamp)}</div>
      `;
      feedList.appendChild(row);
    });
  }

  function addEventLocally(ev) {
    // Deduplication: prevent matching ID or exact same message within 8 seconds
    const isDuplicate = events.some(e => 
      e.id === ev.id || 
      (e.message === ev.message && Math.abs(e.timestamp - ev.timestamp) < 8000)
    );
    if (isDuplicate) return;

    events.push(ev);

    // Strictly sort by timestamp descending (Newest events ALWAYS at the top!)
    events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (events.length > MAX_EVENTS) {
      events.length = MAX_EVENTS;
    }

    if (isCollapsed) {
      unreadCount++;
      updateBadge();
    }

    renderFeedList();
  }

  function updateBadge() {
    if (!unreadBadge) return;
    if (unreadCount > 0 && isCollapsed) {
      unreadBadge.textContent = unreadCount > 9 ? "9+" : unreadCount;
      unreadBadge.classList.remove("hidden");
    } else {
      unreadBadge.classList.add("hidden");
    }
  }

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      feedCard.classList.add("collapsed");
      if (toggleBtn) toggleBtn.textContent = "▾";
    } else {
      feedCard.classList.remove("collapsed");
      if (toggleBtn) toggleBtn.textContent = "▴";
      unreadCount = 0;
      updateBadge();
    }
  }

  // Push an event to Firebase Firestore
  async function broadcast(type, details = {}) {
    const db = Store.getDb();
    const state = Store.get();
    const playerName = state?.player?.name || "Traveler";

    let message = "";
    if (type === "land") {
      const location = details.location || "the Realm 🌐";
      const rarityLabel = details.rarity || "land";
      message = `<strong>${playerName}</strong> claimed a ${rarityLabel} plot in <em>${location}</em>`;
    } else if (type === "jackpot") {
      const amount = details.amount || 25;
      message = `🎉 <strong>${playerName}</strong> hit the <strong>${amount} EB</strong> Jackpot on the Wheel!`;
    } else if (type === "daily") {
      const day = details.day || 1;
      message = `📅 <strong>${playerName}</strong> has logged in for <strong>${day} day${day > 1 ? "s" : ""} in a row!</strong> Welcome back! 🔥`;
    } else if (type === "dividend") {
      const mayor = details.mayorName || "The Mayor";
      const city = details.city || "the Realm";
      const amount = details.amount || 2;
      message = `👑 <strong>${mayor}</strong> collected a <strong>${amount} EB</strong> Mayorship dividend from a land sale in <em>${city}</em>!`;
    }

    const now = Date.now();
    const localEv = {
      id: "ev_" + now + "_" + Math.random().toString(36).slice(2, 6),
      message,
      type,
      timestamp: now,
    };

    // Instant local preview
    addEventLocally(localEv);

    if (!db) return;

    try {
      await db.collection("feed").add({
        message,
        type,
        timestamp: now,
      });
    } catch (err) {
      console.warn("[Feed] Broadcast error:", err);
    }
  }

  // Live Firestore listener (fetches last 50, then listens for new)
  function listen() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("feed")
        .orderBy("timestamp", "desc")
        .limit(MAX_EVENTS)
        .onSnapshot((snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const ev = {
              id: change.doc.id,
              message: data.message,
              type: data.type,
              timestamp: data.timestamp || Date.now(),
            };

            if (change.type === "added") {
              addEventLocally(ev);
            }
          });
        }, (err) => console.warn("[Feed] Listener warning:", err));
    } catch (e) {
      console.warn("[Feed] Setup error:", e);
    }
  }

  function init() {
    feedCard = document.getElementById("live-feed-card");
    feedList = document.getElementById("feed-scroll-container");
    toggleBtn = document.getElementById("feed-toggle-icon");
    unreadBadge = document.getElementById("feed-unread-badge");

    const header = document.getElementById("feed-interactive-header");
    if (header) {
      header.addEventListener("click", toggleCollapse);
    }

    // Stop wheel / map gesture propagation when scrolling inside feed
    if (feedCard) {
      feedCard.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
      feedCard.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
      feedCard.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    }

    // Add initial welcoming realm broadcast so the box is never blank
    addEventLocally({
      id: "welcome_ev",
      message: `✨ Welcome to <strong>Elden Earth</strong>. Walk the realm & claim the ground beneath your feet!`,
      type: "system",
      timestamp: Date.now()
    });

    listen();
  }

  return { init, broadcast, resolveCity };
})();
