// ============================================================
// Elden Earth — sign in
// Google Identity Services if a client ID is configured,
// otherwise a plain guest profile stored on-device.
// ============================================================
const Auth = (() => {

  function decodeJwt(token) {
    try {
      const payload = token.split(".")[1];
      const json = decodeURIComponent(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function init(onSignedIn) {
    const guestBtn = document.getElementById("guest-btn");
    const slot = document.getElementById("g_id_signin_slot");

    // Auto-login immediately if player has already started a save
    const state = Store.get();
    if (state && state.player && state.player.id) {
      onSignedIn(state.player);
      return;
    }

    guestBtn.addEventListener("click", () => {
      const s = Store.get();
      if (!s.player.id) {
        s.player.id = "guest-" + Math.random().toString(36).slice(2, 10);
        s.player.name = "Traveler";
        Store.save();
      }
      onSignedIn(s.player);
    });

    if (!CONFIG.GOOGLE_CLIENT_ID) {
      slot.innerHTML = `<p class="fine-print">Google sign-in isn't configured for this deployment — continue as a guest below.</p>`;
      return;
    }

    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (!window.google || !google.accounts || !google.accounts.id) {
        if (attempts < 30) {
          setTimeout(tryInit, 150);
        } else {
          console.warn("[Auth] Google GSI script failed to load. Check network connection.");
        }
        return;
      }

      try {
        google.accounts.id.initialize({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          callback: (resp) => {
            const payload = decodeJwt(resp.credential);
            if (!payload) return;
            
            const googleId = "google-" + payload.sub;
            const playerName = payload.given_name || payload.name || "Traveler";
            const playerAvatar = payload.picture ? "img:" + payload.picture : "🙂";

            // 1. Fetch entire cloud save & plots from Firestore first
            Store.syncFromCloud(googleId).then(() => {
              const s = Store.get();
              s.player.id = googleId;
              // Only use Google name if the player has NOT chosen a custom name yet
              if (!s.player.name || s.player.name === "Traveler") {
                s.player.name = playerName;
              }
              // Only use Google avatar if none selected
              if (!s.player.avatar || s.player.avatar === "🙂") {
                s.player.avatar = playerAvatar;
              }
              Store.save();
              // 2. Launch game with fully restored data
              onSignedIn(s.player);
            });
          },
        });

        google.accounts.id.renderButton(slot, {
          theme: "filled_black",
          shape: "pill",
          size: "large",
          width: 280,
        });
      } catch (err) {
        console.error("[Auth] Google render error:", err);
      }
    };

    tryInit();
  }

  return { init };
})();
