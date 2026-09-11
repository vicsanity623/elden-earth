// ============================================================
// Elden Earth — Global Community Chat (Last 25 Messages, Moderated)
// ============================================================
const Chat = (() => {
  let drawer = null;
  let listEl = null;
  rs = d.g >= 12 ? "PM" : "AM";
    return `${hrs % 12 || 12}:${mins} ${ampm}`;
    }

    co-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
        </div>
      `;

      listEl.appendChild(row);
    });

    // AutotTime < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (now - lastSentTime)) / 1000);
      showToast(`⏳ Please wait ${waitSec}s before sending another message.`);
      return;
    }

    const db
    try {
      await db.collection("chat").add({
        text: cleanText,
        senderId,
        senderName,
        avatar,
        timestamp: now,
      });
    } catch (err) {
      console.warn("[Chat] Send failed:", err);
    }
  }

  function listen() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("chat")
        .orderBy("timestamp", "desc")
        .limit(MAX_MESSAGES)
        .onSnapshot((snapshot) => {
          messages.length = 0;
          
      console.warn("[Chat] Setup notice:", e);
    }
  }
  
  // --- REAL-TIME PRESENCE & ONLINE COUNT ENGINE ---
  async function sendHeartbeat() {
    if (document.hidden) return; // 0% network in pocket
    const db = Store.getDb();
    const state = Store.get();
    if (!db || !state?.player?.id) return;

    try {
      await db.collection("presence").doc(state.player.id).set({
        lastSeen: Date.now(),
        name: state.player.name || "Traveler"
      }, { merge: true });
    } catch (e) {}
  }

  asyn
  }

  function close() {
    if (!drawer) return;
    isOpen = false;
    drawer.classList.add("hidden");
  }

  function init() {
    drawer = document.getElementById("chat-drawer");
    
    // Cache online e
      }
    });

    listen();
  }

  return { init, open, close };
})();
