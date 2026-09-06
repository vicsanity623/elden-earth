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
    ctx = canvas.getContext("2d");
    canvas.style.transition = "none";
    canvas.style.transform = "rotate(0deg)";
    draw();
  }

  // Helper to pick slice based on weighted odds
  function pickWeightedIndex() {
    const slices = CONFIG.WHEEL_SLICES;
    const totalWeight = slices.reduce((sum, s) => sum + (s.weight || 10), 0);
    let roll = Math.random() * totalWeight;

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

    // Add slight random offset within slice so needle doesn't always hit dead-center
    const jitter = (Math.random() - 0.5) * (sliceDeg * 0.7);
    const targetCenter = targetIndex * sliceDeg + sliceDeg / 2 + jitter;

    const extraSpins = 5 + Math.floor(Math.random() * 2);
    const neededRotation = (360 - targetCenter) % 360;

    // keep rotation monotonically increasing so it always spins "forward"
    const base = Math.ceil(rotation / 360) * 360;
    const finalRotation = base + extraSpins * 360 + neededRotation;

    canvas.style.transition = "transform 4.2s cubic-bezier(0.16, 0.85, 0.2, 1)";
    canvas.style.transform = `rotate(${finalRotation}deg)`;
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
