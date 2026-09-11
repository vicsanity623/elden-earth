// ============================================================
// Elden Earth — spin wheel
// Draws the 10-slice wheel and animates it to a weighted
// randomly chosen slice.
// ============================================================
const Wheel = (() => {
  let canvas, ctx;
  let rotation = 0; // current resting rotation, degrees

  function draw() {
    const slices = CONFIG.WHEEL_SLICES;
    const n = slices.length;
    const sliceAngle = (2 * Math.PI) / n;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to render mini 3D faceted crystal onto canvas
    function renderCanvas3DGem(x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      const w = size / 2, h = size;

      // Top facet
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.45);
      ctx.lineTo(w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(-w, -h * 0.15);
      ctx.closePath();
      ctx.fillStyle = "#a8f5ec";
      ctx.fill();

      // Left shadow facet
      ctx.beginPath();
      ctx.moveTo(-w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#1d7a6e";
      ctx.fill();

      // Right bright facet
      ctx.beginPath();
      ctx.moveTo(w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#4fd6c4";
      ctx.fill();

      // Specular glint
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.45);
      ctx.lineTo(w * 0.35, -h * 0.25);
      ctx.lineTo(0, 0);
      ctx.lineTo(-w * 0.35, -h * 0.25);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.fill();

      ctx.restore();
    }

    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = slices[i].color;
      ctx.fill();
      ctx.strokeStyle = "rgba(13,20,32,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label & 3D Icon Rendering
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.fillStyle = "#0d1420";
      ctx.font = "bold 15px Manrope, sans-serif";

      if (slices[i].type === "diamond") {
        ctx.textAlign = "right";
        ctx.fillText("+1", radius - 26, 5);
        renderCanvas3DGem(radius - 14, 0, 18);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(slices[i].label, radius - 14, 5);
      }
      ctx.restore();
    }

    // hub
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#0d1420";
    ctx.fill();
    ctx.strokeStyle = "#d4af61";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function init() {
    canvas = document.getElementById("wheel-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d", { alpha: true });
    
    // Promote Canvas to Dedicated GPU Hardware Texture
    canvas.style.transition = "none";
    canvas.style.transform = "rotate(0deg) translateZ(0)";
    canvas.style.willChange = "transform";
    
    draw();
  }

  // --- Cryptographically Secure Hardware Entropy Engine (CSPRNG) ---
  // Generates uniform floating point [0, 1) using 53 bits of kernel entropy
  function cryptoRandom() {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(2);
      window.crypto.getRandomValues(buf);
      const high = buf[0] >>> 5;
      const low = buf[1] >>> 6;
      return (high * 67108864 + low) / 9007199254740992;
    }
    return Math.random(); // Graceful fallback if unsupported
  }

  // Modulo-Bias-Free Rejection Sampling Integer Roll
  function cryptoRandomInt(max) {
    if (max <= 1) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      const maxUint32 = 4294967296; // 2^32
      const limit = maxUint32 - (maxUint32 % max);
      let val;
      do {
        window.crypto.getRandomValues(array);
        val = array[0];
      } while (val >= limit); // Discards bias at the top of the integer range
      return val % max;
    }
    return Math.floor(Math.random() * max);
  }

  // Provably Fair Weighted Slice Selector (Zero Modulo Bias)
  function pickWeightedIndex() {
    const slices = CONFIG.WHEEL_SLICES;
    const totalWeight = slices.reduce((sum, s) => sum + (s.weight || 10), 0);
    
    // Cryptographic integer roll from 0 to totalWeight - 1
    let roll = cryptoRandomInt(totalWeight);

    for (let i = 0; i < slices.length; i++) {
      const w = slices[i].weight || 10;
      if (roll < w) return i;
      roll -= w;
    }
    return 0;
  }

let isCurrentlySpinning = false;
let spinTimeoutId = null;

// Spins to weighted slice with realistic landing animation & failsafe recovery
  function spin(callback) {
    if (isCurrentlySpinning) return;
    isCurrentlySpinning = true;

    // Clear any leftover timeout from a previous aborted spin
    if (spinTimeoutId !== null) {
      clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
    }

    const n = CONFIG.WHEEL_SLICES.length;
    const sliceDeg = 360 / n;
    const targetIndex = pickWeightedIndex();

    // Cryptographically randomized needle landing angle within slice
    const jitter = (cryptoRandom() - 0.5) * (sliceDeg * 0.75);
    const targetCenter = targetIndex * sliceDeg + sliceDeg / 2 + jitter;

    // Cryptographically randomized spin force (5 to 8 full rotations)
    const extraSpins = 5 + cryptoRandomInt(4);
    const neededRotation = (360 - targetCenter) % 360;

    // keep rotation monotonically increasing so it always spins "forward"
    const base = Math.ceil(rotation / 360) * 360;
    const finalRotation = base + extraSpins * 360 + neededRotation;

    // Silky Smooth 60fps Hardware-Accelerated Spin
    canvas.style.transition = "transform 4.2s cubic-bezier(0.16, 0.85, 0.2, 1)";
    canvas.style.transform = `rotate(${finalRotation}deg) translateZ(0)`;
    rotation = finalRotation;

    let finished = false;
    const finishSpin = () => {
      if (finished) return;
      finished = true;
      isCurrentlySpinning = false;
      canvas.removeEventListener("transitionend", finishSpin);
      if (spinTimeoutId === canvas) clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
      callback(CONFIG.WHEEL_SLICES[targetIndex]);
    };

    // Primary listener: CSS transition finishes
    canvas.addEventListener("transitionend", finishSpin, { once: true });

    // Failsafe backup timer: Resolves spin even if browser backgrounded or interrupted
    spinTimeoutId = setTimeout(finishSpin, 4300);
  }

  function resetSpinningState() {
    isCurrentlySpinning = false;
    if (spinTimeoutId !== null) {
      clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
    }
  }

  return { init, spin };
})();