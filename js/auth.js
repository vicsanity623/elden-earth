// ============================================================
// Elden Earth — Authentication Bridge
// Passes Google Token & Anonymous Guests directly into Firebase Auth
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
    let completedUid = null;

    function completeSignIn(player, uid) {
      if (completedUid === uid) return;
      completedUid = uid;
      onSignedIn(player);
    }

    // Ensure Firebase App is initialized via Store before calling auth()
    if (typeof Store !== "undefined" && Store.getDb) {
      Store.getDb();
    }

    // Initialize Firebase Auth Listener
    if (typeof firebase !== "undefined" && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged(async (user) => {
          if (user) {
            console.log(`[FirebaseAuth] Active session authenticated: ${user.uid} (${user.isAnonymous ? "Guest" : "Google"})`);
            
            const s = Store.get();
            if (s && s.player) {
              s.player.id = user.uid;

              if (!user.isAnonymous) {
                if (user.displayName && (!s.player.name || s.player.name === "Traveler")) {
                  s.player.name = user.displayName;
                }
                if (user.photoURL && (!s.player.avatar || s.player.avatar === "🙂")) {
                  s.player.avatar = "img:" + user.photoURL;
                }
              }

              await Store.syncFromCloud(user.uid);
              completeSignIn(s.player, user.uid);
            }
          }
        });
      } catch (e) {
        console.warn("[Auth] Firebase auth listener notice:", e);
      }
    }

    // --- GUEST LOGIN HANDLER (Firebase Anonymous Auth) ---
    let guestTriggered = false;
    async function handleGuestLogin(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (guestTriggered) return;
      guestTriggered = true;

      try {
        if (firebase.auth) {
          const cred = await firebase.auth().signInAnonymously();
          const s = Store.get();
          s.player.id = cred.user.uid;
          if (!s.player.name) s.player.name = "Traveler";
          Store.save();
            completeSignIn(s.player, cred.user.uid);
        }
      } catch (err) {
        console.warn("[Auth] Anonymous login notice, falling back to local:", err);
        const s = Store.get();
        if (!s.player.id) s.player.id = "guest-" + Math.random().toString(36).slice(2, 10);
        Store.save();
        completeSignIn(s.player, s.player.id);
      }
    }

    if (guestBtn) {
      guestBtn.addEventListener("click", handleGuestLogin);
      guestBtn.addEventListener("touchend", handleGuestLogin);
    }

    // --- GOOGLE SIGN-IN HANDOFF TO FIREBASE AUTH ---
    if (!CONFIG.GOOGLE_CLIENT_ID) return;

    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (!window.google || !google.accounts || !google.accounts.id) {
        if (attempts < 50) {
          setTimeout(tryInit, 150);
        } else if (slot) {
          slot.innerHTML = `<p class="fine-print" style="color:var(--text-dim);font-size:11.5px;margin-bottom:12px;">🔒 Google Sign-In unavailable in Private Mode.<br>Continue as Guest below or open in a normal tab.</p>`;
        }
        return;
      }

      try {
        google.accounts.id.initialize({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          callback: async (resp) => {
            if (!resp.credential) return;

            // 1. Convert Google GIS token into Firebase Auth Credential!
            const credential = firebase.auth.GoogleAuthProvider.credential(resp.credential);

            try {
              // 2. Authenticate with Firebase! (request.auth is now REAL on the server!)
              const userCredential = await firebase.auth().signInWithCredential(credential);
              const fbUser = userCredential.user;
              
              const s = Store.get();
              s.player.id = fbUser.uid;
              s.player.name = fbUser.displayName || s.player.name || "Traveler";
              s.player.avatar = fbUser.photoURL ? "img:" + fbUser.photoURL : (s.player.avatar || "🙂");

              await Store.syncFromCloud(fbUser.uid);
              Store.save(true);
              completeSignIn(s.player, fbUser.uid);
            } catch (authErr) {
              console.error("[Auth] Firebase credential exchange failed:", authErr);
            }
          },
        });

        google.accounts.id.renderButton(slot, {
          theme: "filled_black",
          shape: "pill",
          size: "large",
          width: 280,
        });
      } catch (err) {
        console.error("[Auth] Google setup error:", err);
      }
    };

    tryInit();
  }

  return { init };
})();
