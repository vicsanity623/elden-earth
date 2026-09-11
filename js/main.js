import { loadAssets, images } from './engine/assets.js';
import { Input } from './engine/input.js';
import { Camera } from './engine/camera.js';
import { World, TILE, BIOME } from './world/worldgen.js';
import { Player } from './entities/player.js';
import { NPC } from './entities/npc.js';
import { Spawner } from './systems/spawner.js';
import { GameClock } from './systems/time.js';
import { Survival } from './systems/survival.js';
import { Inventory } from './systems/inventory.js';
import { QuestSystem } from './systems/questsystem.js';
import { rollPlayerDamage, inRange, ATTACK_RANGE, ATTACK_COOLDOWN, PLAYER_ATTACK_STAMINA_COST } from './systems/combat.js';
import { rollLootTable, ITEMS, RARITY } from './data/items.js';
import { MAIN_NPC, SIDE_NPC } from './data/quests.js';
import { saveGame, loadGame, hasSave, clearSave } from './systems/save.js';
import { updateHUD, showToast, spawnFloatText } from './ui/hud.js';
import { showDialogue, showReminder, showSystemMessage, showLoot, showItemDetail, openModal, closeModal, anyModalOpen } from './ui/modal.js';

const TILE_IMG = {
  [BIOME.GRASS]: ['tile_grass.png', 'tile_grass2.png'],
  [BIOME.FOREST]: ['tile_grass2.png', 'tile_grass.png'],
  [BIOME.SAND]: ['tile_sand.png'],
  [BIOME.WATER]: ['tile_water.png'],
  [BIOME.STONE]: ['tile_stone.png', 'tile_cave.png'],
  [BIOME.CAVE]: ['tile_cave.png'],
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const camera = new Camera();

let dpr = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.viewW = w; camera.viewH = h;
}
window.addEventListener('resize', resize);
resize();

let input = null;
let state = null;
let running = false;
let lastTime = 0;
let saveTimer = 0;
let saveNeeded = false;

function requestSave() { saveNeeded = true; }

const SPAWN_POS = { x: 0, y: 0 };
const MAIN_NPC_POS = { x: 0, y: -60 };
const SIDE_NPC_POS = { x: 15200, y: -9600 };

function newGameState(seed) {
  const world = new World(seed);
  const spawner = new Spawner(world, seed);
  const player = new Player(SPAWN_POS.x, SPAWN_POS.y + 10);
  const clock = new GameClock(6);
  const survival = new Survival();
  const inventory = new Inventory();
  inventory.add('sword_common', 1);
  inventory.add('potion_health', 2);
  inventory.add('water_flask', 2);
  inventory.add('bread', 2);
  inventory.equipment.weapon = 'sword_common';
  const quests = new QuestSystem(seed);
  const mainNPC = new NPC(MAIN_NPC_POS.x, MAIN_NPC_POS.y, MAIN_NPC.name, MAIN_NPC.img, 'main');
  const sideNPC = new NPC(SIDE_NPC_POS.x, SIDE_NPC_POS.y, SIDE_NPC.name, SIDE_NPC.img, 'side');

  return {
    seed, world, spawner, player, clock, survival, inventory, quests,
    mainNPC, sideNPC, lastSafeX: player.x, lastSafeY: player.y,
    metSideNpc: false, playingTime: 0, _hpBonusApplied: 0,
  };
}

// Equipment hpBonus (e.g. Band of Vigor) is applied on top of survival.maxHp as a
// delta, so level-ups and save/load stay consistent. The bonus is stripped again
// at serialize time and re-applied on load.
function applyEquipmentBonuses(s = state) {
  const bonus = s.inventory.totalHpBonus();
  const applied = s._hpBonusApplied || 0;
  if (bonus === applied) return;
  const delta = bonus - applied;
  s.survival.maxHp += delta;
  if (delta > 0) s.survival.hp += delta;
  else s.survival.hp = Math.min(s.survival.hp, s.survival.maxHp);
  s._hpBonusApplied = bonus;
}

function serializeState(s) {
  const surv = s.survival.serialize();
  surv.dead = false; // never persist a dead state — always let the player reload alive
  const applied = s._hpBonusApplied || 0;
  surv.maxHp = Math.max(1, surv.maxHp - applied);
  surv.hp = Math.min(surv.hp, surv.maxHp);
  return {
    seed: s.seed,
    player: { x: s.player.x, y: s.player.y },
    clock: s.clock.serialize(),
    survival: surv,
    inventory: s.inventory.serialize(),
    quests: s.quests.serialize(),
    metSideNpc: s.metSideNpc,
  };
}

function loadState(data) {
  if (!data || data.seed == null || !data.player || data.player.x == null ||
      !data.clock || !data.survival || !data.inventory || !data.quests) {
    console.warn('save data corrupted — starting new game');
    clearSave();
    return null;
  }
  const s = newGameState(data.seed);
  s.player.x = data.player.x; s.player.y = data.player.y;
  s.clock.load(data.clock);
  s.survival.load(data.survival);
  s.inventory.load(data.inventory);
  s.quests.load(data.quests);
  s.metSideNpc = data.metSideNpc;
  s.lastSafeX = s.player.x; s.lastSafeY = s.player.y;
  s._hpBonusApplied = 0;
  applyEquipmentBonuses(s);
  return s;
}

// ---------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------
async function boot() {
  await loadAssets();
  document.getElementById('btnNewGame').addEventListener('click', () => startNewGame());
  if (hasSave()) {
    document.getElementById('btnContinue').style.display = 'block';
    document.getElementById('btnContinue').addEventListener('click', () => continueGame());
  }
}
boot();

function startNewGame() {
  clearSave();
  state = newGameState(Math.floor(Math.random() * 2147483647));
  enterWorld();
}
function continueGame() {
  const data = loadGame();
  if (!data) { startNewGame(); return; }
  state = loadState(data);
  if (!state) { startNewGame(); return; }
  enterWorld();
}

function enterWorld() {
  document.getElementById('titleScreen').classList.add('hidden');
  document.getElementById('hudTop').classList.remove('hidden');
  document.getElementById('hudBottom').classList.remove('hidden');
  document.getElementById('minimapCanvas').classList.remove('hidden');
  document.getElementById('btnMenu').classList.remove('hidden');
  resetMinimapState();
  setupInput();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function setupInput() {
  if (input) return; // only bind once
  input = new Input(
    document.getElementById('joystickZone'),
    document.getElementById('joystickBase'),
    document.getElementById('joystickNub')
  );
  input.bindButton(document.getElementById('btnAttack'), onAttackPress);
  input.bindButton(document.getElementById('btnInteract'), onInteractPress);
  input.bindButton(document.getElementById('btnInventory'), () => openInventory());
  input.bindButton(document.getElementById('btnMap'), () => openWorldMap());
  document.getElementById('btnCloseInv').addEventListener('click', () => closeModal('inventoryModal'));
  document.getElementById('btnCloseMap').addEventListener('click', () => closeModal('mapModal'));
  document.getElementById('btnCloseShop').addEventListener('click', () => closeModal('shopModal'));
  document.getElementById('btnMenu').addEventListener('click', () => openInventory('quests'));

  // minimap tap opens world map
  const mm = document.getElementById('minimapCanvas');
  mm.addEventListener('touchstart', e => { e.preventDefault(); openWorldMap(); }, { passive: false });
  mm.addEventListener('mousedown', e => { e.preventDefault(); openWorldMap(); });

  document.querySelectorAll('.invTab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.invTab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.invPanel').forEach(p => p.classList.add('hidden'));
      document.getElementById('invPanel' + capitalize(tab.dataset.tab)).classList.remove('hidden');
    });
  });

  document.querySelectorAll('.shopTabs .invTab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shopTabs .invTab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.shopPanel').forEach(p => p.classList.add('hidden'));
      document.getElementById('shopPanel' + capitalize(tab.dataset.shop)).classList.remove('hidden');
    });
  });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------
function loop(now) {
  if (!running) return;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 0.05);

  // save timer runs every frame — even while dead or a modal is open — so
  // short play sessions still get persisted
  saveTimer += dt;
  if (saveTimer > 6 || (saveNeeded && saveTimer > 1.2)) {
    saveTimer = 0; saveNeeded = false;
    if (state) saveGame(serializeState(state));
  }

  if (!anyModalOpen() && !state.survival.dead) {
    update(dt);
  }
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  const { player, world, spawner, clock, survival, quests } = state;
  clock.update(dt);
  const gameHoursDelta = dt * clock.gameHoursPerRealSecond;
  survival.tick(gameHoursDelta, clock.isNight, dt);

  player.update(dt, input);
  moveWithCollision(player, dt, world, spawner);

  spawner.populateAround(player.x, player.y, 1400);
  spawner.prune(player.x, player.y, 1400);

  for (const enemy of spawner.enemies) {
    enemy.update(dt, player, world);
    if (!enemy.dead) {
      const dmg = enemy.tryAttack(player);
      if (dmg > 0) {
        const armor = state.inventory.totalArmor();
        const finalDmg = Math.max(1, dmg - armor * 0.4);
        survival.damage(finalDmg);
        player.hitFlash = 0.2;
        const sp = camera.worldToScreen(player.x, player.y);
        spawnFloatText('-' + Math.round(finalDmg), sp.x, sp.y - 20, '#ff6a5a');
      }
    }
  }

  if (Math.hypot(player.x - state.mainNPC.x, player.y - state.mainNPC.y) < 260 &&
      Math.hypot(player.x - SIDE_NPC_POS.x, player.y - SIDE_NPC_POS.y) > 300) {
    // near main npc & safe-ish: treat as a safe checkpoint for respawn
    state.lastSafeX = player.x; state.lastSafeY = player.y;
  }

  if (!state.metSideNpc && Math.hypot(player.x - state.sideNPC.x, player.y - state.sideNPC.y) < 250) {
    state.metSideNpc = true;
    quests.onSideNpcMet();
  }

  camera.follow(player.x, player.y);
  updateMinimap(dt);
  updateHUD(survival, clock, quests);

  if (quests.shouldShowReminder(clock.totalGameHours)) {
    showReminder(MAIN_NPC.name,
      "Wanderer... have you forgotten the task at hand? The Reach doesn't wait for the idle.",
      null);
  }

  if (survival.dead) {
    onPlayerDeath();
  }
}

function moveWithCollision(player, dt, world, spawner) {
  if (player.vx === 0 && player.vy === 0) return;
  const tryMove = (nx, ny) => {
    if (world.isWater(nx, ny)) return false;
    const chunkList = world.chunksInRadius(nx, ny, 90);
    for (const [cx, cy] of chunkList) {
      const chunk = world.getChunk(cx, cy);
      for (const prop of chunk.props) {
        if (!prop.solid) continue;
        if (Math.hypot(prop.x - nx, prop.y - ny) < prop.radius + 12) return false;
      }
    }
    return true;
  };
  const nx = player.x + player.vx * dt;
  const ny = player.y + player.vy * dt;
  if (tryMove(nx, player.y)) player.x = nx;
  if (tryMove(player.x, ny)) player.y = ny;
}

// ---------------------------------------------------------------
// ACTIONS
// ---------------------------------------------------------------
function onAttackPress() {
  if (anyModalOpen() || state.survival.dead) return;
  const { player, survival, inventory, spawner, quests } = state;
  if (!player.canAttack()) return;
  if (!survival.spendStamina(PLAYER_ATTACK_STAMINA_COST)) { showToast('Too exhausted to swing!'); return; }
  player.triggerAttack(ATTACK_COOLDOWN);
  const hb = player.attackHitbox(ATTACK_RANGE);

  let hitSomething = false;
  for (const enemy of spawner.enemies) {
    if (enemy.dead) continue;
    if (!inRange(hb.x, hb.y, enemy.x, enemy.y, hb.r)) continue;
    const dmg = rollPlayerDamage(inventory.weaponDef(), inventory.totalDmgBonus());
    const killed = enemy.takeDamage(dmg);
    hitSomething = true;
    const sp = camera.worldToScreen(enemy.x, enemy.y);
    spawnFloatText('-' + dmg, sp.x, sp.y - 30, '#ffd35a');
    if (killed) onEnemyKilled(enemy);
    break;
  }
  if (!hitSomething) {
    for (const c of spawner.caches) {
      if (c.opened) continue;
      if (!inRange(hb.x, hb.y, c.x, c.y, hb.r)) continue;
      const dmg = rollPlayerDamage(inventory.weaponDef(), inventory.totalDmgBonus());
      const opened = c.takeDamage(dmg);
      const sp = camera.worldToScreen(c.x, c.y);
      spawnFloatText('-' + dmg, sp.x, sp.y - 20, '#dcdcdc');
      if (opened) onCacheOpened(c);
      break;
    }
  }
}

function onEnemyKilled(enemy) {
  const { survival, inventory, quests } = state;
  const ups = survival.addXP(enemy.stats.xp);
  const drops = rollLootTable(enemy.stats.isElite ? 'enemy_elite' : 'enemy_common', Math.random);
  let goldGain = 0;
  for (const d of drops) {
    inventory.add(d.item, d.qty);
    if (d.item === 'gold') { survival.gold += d.qty; goldGain += d.qty; }
  }
  quests.onEnemyKilled(enemy.stats.type, enemy.stats.isElite);
  for (const d of drops) if (d.item !== 'gold') quests.onItemCollected(d.item, inventory);
  const sp = camera.worldToScreen(enemy.x, enemy.y);
  spawnFloatText(`+${enemy.stats.xp} XP`, sp.x, sp.y - 44, '#b183ff');
  if (goldGain > 0) spawnFloatText(`+${goldGain} gold`, sp.x, sp.y - 60, '#e9c877');
  for (const d of drops) {
    const r = ITEMS[d.item].rarity;
    if (d.item !== 'gold' && (r === 'rare' || r === 'legendary')) showToast(`Looted: ${ITEMS[d.item].name}!`);
  }
  showToast(`Defeated ${enemy.stats.name}`);
  if (ups.length) showToast(`Level up! You are now level ${ups[ups.length - 1]}.`, 2800);
  requestSave();
}

function onCacheOpened(cache) {
  const { inventory, quests } = state;
  const drops = rollLootTable(cache.tier.key, Math.random);
  quests.onCacheOpened();
  showLoot(drops, () => {
    for (const d of drops) {
      inventory.add(d.item, d.qty);
      if (d.item === 'gold') state.survival.gold += d.qty;
      else quests.onItemCollected(d.item, inventory);
    }
    showToast('Loot added to your bag.');
    requestSave();
  });
}

function onInteractPress() {
  if (anyModalOpen() || state.survival.dead) return;
  const { player, mainNPC, sideNPC, quests, clock } = state;
  if (Math.hypot(player.x - mainNPC.x, player.y - mainNPC.y) < 90) { talkToMainNPC(); return; }
  if (Math.hypot(player.x - sideNPC.x, player.y - sideNPC.y) < 90) { talkToSideNPC(); return; }

  // no one nearby: offer to make camp if no enemies close
  const enemiesNear = state.spawner.nearbyEnemies(player.x, player.y, 260).length;
  if (enemiesNear > 0) { showToast('Too dangerous to make camp here!'); return; }
  showSystemMessage('Make camp and rest until the stamina returns? (advances time several hours)', () => {
    const hours = 4;
    clock.totalGameHours += hours;
    state.survival.tick(0, false);
    state.survival.rest(100);
    state.survival.stamina = state.survival.maxStamina;
    state.lastSafeX = player.x; state.lastSafeY = player.y;
    showToast('You rest by a quiet fire. Time passes...');
    requestSave();
  });
}

function grantQuestReward(reward) {
  const { survival, inventory, player } = state;
  survival.addXP(reward.xp || 0);
  survival.gold += reward.gold || 0;
  (reward.items || []).forEach(it => inventory.add(it, 1));
  const sp = camera.worldToScreen(player.x, player.y);
  if (reward.xp) spawnFloatText(`+${reward.xp} XP`, sp.x, sp.y - 40, '#b183ff');
  if (reward.gold) spawnFloatText(`+${reward.gold} gold`, sp.x, sp.y - 56, '#e9c877');
  (reward.items || []).forEach(it => showToast(`Received: ${ITEMS[it].name}`));
  requestSave();
}

function talkToMainNPC() {
  const { quests, clock } = state;
  if (quests.isMainObjectivesComplete()) {
    const completed = quests.turnInMain(clock.totalGameHours);
    grantQuestReward(completed.reward);
    showDialogue(MAIN_NPC.name,
      `${completed.onComplete}\n\nNew task: "${quests.currentMain.title}" — ${quests.currentMain.text}`,
      [{ label: 'Onward.', onSelect: () => {} }]);
  } else {
    const objectives = quests.objectiveSummary(quests.mainProgress).join('\n');
    showDialogue(MAIN_NPC.name, `${quests.currentMain.text}\n\n${objectives}`,
      [{ label: 'I\'ll return when it\'s done.', onSelect: () => {} }]);
  }
}

function talkToSideNPC() {
  const { quests, clock } = state;
  const tradeChoice = { label: 'Trade', onSelect: () => openShop() };
  if (!quests.currentSide) {
    showDialogue(SIDE_NPC.name, "You've done more for this old trader than I ever expected. Safe travels, wanderer.",
      [tradeChoice, { label: 'Farewell.', onSelect: () => {} }]);
    return;
  }
  if (quests.isSideObjectivesComplete()) {
    const completed = quests.turnInSide(clock.totalGameHours);
    grantQuestReward(completed.reward);
    const next = quests.currentSide ? `New task: "${quests.currentSide.title}" — ${quests.currentSide.text}` : "That's the last favor I've got, friend.";
    showDialogue(SIDE_NPC.name, `${completed.onComplete}\n\n${next}`,
      [tradeChoice, { label: 'Take care.', onSelect: () => {} }]);
  } else {
    const objectives = quests.objectiveSummary(quests.sideProgress).join('\n');
    showDialogue(SIDE_NPC.name, `${quests.currentSide.text}\n\n${objectives}`,
      [tradeChoice, { label: 'I\'ll be back.', onSelect: () => {} }]);
  }
}

function onPlayerDeath() {
  showSystemMessage('You collapse in the wilds... The Reach shows mercy, this once.', () => {
    state.survival.revive();
    state.player.x = state.lastSafeX; state.player.y = state.lastSafeY;
  });
}

// ---------------------------------------------------------------
// MINIMAP + WORLD MAP
// ---------------------------------------------------------------
const MINIMAP_SIZE = 90;
const MINIMAP_RADIUS = 600;
const MINIMAP_STEP = (MINIMAP_RADIUS * 2) / MINIMAP_SIZE;
const MINIMAP_SAMPLE = 2;
const MINIMAP_INTERVAL = 0.5;

const BIOME_COLORS = {
  water: '#2a5a8a', sand: '#c4b87a', grass: '#4a7c35', forest: '#2d5a1e', stone: '#7a7a70', cave: '#3a3a30',
};

let minimapCtx = null;
let minimapTerrainCanvas = null;
let minimapDirty = true;
let minimapTimer = 0;
let lastMinimapWX = 0, lastMinimapWY = 0;

function resetMinimapState() {
  minimapDirty = true;
  minimapTimer = 0;
  lastMinimapWX = 0; lastMinimapWY = 0;
}

function updateMinimap(dt) {
  minimapTimer += dt;
  const dist = Math.hypot(state.player.x - lastMinimapWX, state.player.y - lastMinimapWY);
  if (minimapTimer > MINIMAP_INTERVAL || (dist > MINIMAP_RADIUS * 0.12 && minimapTimer > 0.1)) {
    minimapDirty = true;
    minimapTimer = 0;
    lastMinimapWX = state.player.x;
    lastMinimapWY = state.player.y;
  }
}

function drawMinimap() {
  if (!state) return;
  const canvas = document.getElementById('minimapCanvas');
  if (!minimapCtx) minimapCtx = canvas.getContext('2d');
  if (!minimapTerrainCanvas) {
    minimapTerrainCanvas = document.createElement('canvas');
    minimapTerrainCanvas.width = MINIMAP_SIZE;
    minimapTerrainCanvas.height = MINIMAP_SIZE;
  }

  if (minimapDirty) {
    renderMinimapTerrain();
    minimapDirty = false;
  }

  const ctx = minimapCtx;
  ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.drawImage(minimapTerrainCanvas, 0, 0);

  ctx.save();
  ctx.beginPath();
  ctx.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.clip();

  drawMinimapEntities(ctx);

  ctx.strokeStyle = 'rgba(233,200,119,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function renderMinimapTerrain() {
  const { player, world } = state;
  const tCtx = minimapTerrainCanvas.getContext('2d');
  const half = MINIMAP_SIZE / 2;
  const step = MINIMAP_STEP * MINIMAP_SAMPLE;

  tCtx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  tCtx.fillStyle = '#0d0f0c';
  tCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

  for (let my = 0; my < MINIMAP_SIZE; my += MINIMAP_SAMPLE) {
    for (let mx = 0; mx < MINIMAP_SIZE; mx += MINIMAP_SAMPLE) {
      const wx = player.x + (mx - half) * MINIMAP_STEP;
      const wy = player.y + (my - half) * MINIMAP_STEP;
      const biome = world.tileAtWorld(wx + 1, wy + 1) || 'grass';
      tCtx.fillStyle = BIOME_COLORS[biome] || '#4a7c35';
      tCtx.fillRect(mx, my, MINIMAP_SAMPLE, MINIMAP_SAMPLE);
    }
  }
}

function m2w(mx, my) {
  const half = MINIMAP_SIZE / 2;
  return {
    x: state.player.x + (mx - half) * MINIMAP_STEP,
    y: state.player.y + (my - half) * MINIMAP_STEP,
  };
}

function worldToMini(wx, wy) {
  const half = MINIMAP_SIZE / 2;
  return {
    x: half + (wx - state.player.x) / MINIMAP_STEP,
    y: half + (wy - state.player.y) / MINIMAP_STEP,
  };
}

function drawMinimapEntities(ctx) {
  const { player, mainNPC, sideNPC, spawner } = state;
  const half = MINIMAP_SIZE / 2;
  const maxR = MINIMAP_SIZE / 2 - 5; // inside the circle border

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(half, half, 3.5, 0, Math.PI * 2);
  ctx.fill();

  const dirAngles = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 };
  const da = dirAngles[player.facing] || 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(half, half);
  ctx.lineTo(half + Math.cos(da) * 6, half + Math.sin(da) * 6);
  ctx.stroke();

  function drawClamped(wx, wy, color, r, isImportant) {
    const dx = (wx - player.x) / MINIMAP_STEP;
    const dy = (wy - player.y) / MINIMAP_STEP;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.1) return; // too close to center (shouldn't happen for NPCs far away)
    const mx = half + dx;
    const my = half + dy;
    if (dist < maxR) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const ang = Math.atan2(dy, dx);
      const ex = half + Math.cos(ang) * maxR;
      const ey = half + Math.sin(ang) * maxR;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, ey, r + (isImportant ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
      if (isImportant) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(ex, ey, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawClamped(mainNPC.x, mainNPC.y, '#e9c877', 3, true);
  drawClamped(sideNPC.x, sideNPC.y, '#8ab0e9', 3, true);

  for (const e of spawner.enemies) {
    if (e.dead) continue;
    const p = worldToMini(e.x, e.y);
    if (p.x < 0 || p.x >= MINIMAP_SIZE || p.y < 0 || p.y >= MINIMAP_SIZE) continue;
    ctx.fillStyle = e.stats.isElite ? '#d08bff' : '#e05a4e';
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
  }

  for (const c of spawner.caches) {
    if (c.opened) continue;
    const p = worldToMini(c.x, c.y);
    if (p.x < 0 || p.x >= MINIMAP_SIZE || p.y < 0 || p.y >= MINIMAP_SIZE) continue;
    ctx.fillStyle = '#6ad8e0';
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
  }
}

// ---- World Map ----
const WORLD_MAP_SIZE = 300;
const WORLD_MAP_RADIUS = 4800;
const WORLD_MAP_STEP = (WORLD_MAP_RADIUS * 2) / WORLD_MAP_SIZE;
const WORLD_MAP_SAMPLE = 3;

function openWorldMap() {
  renderWorldMap();
  openModal('mapModal');
}

function renderWorldMap() {
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const { player, world, mainNPC, sideNPC, spawner, quests } = state;
  const half = WORLD_MAP_SIZE / 2;
  const step = WORLD_MAP_STEP * WORLD_MAP_SAMPLE;

  ctx.clearRect(0, 0, WORLD_MAP_SIZE, WORLD_MAP_SIZE);
  ctx.fillStyle = '#0a0c08';
  ctx.fillRect(0, 0, WORLD_MAP_SIZE, WORLD_MAP_SIZE);

  for (let my = 0; my < WORLD_MAP_SIZE; my += WORLD_MAP_SAMPLE) {
    for (let mx = 0; mx < WORLD_MAP_SIZE; mx += WORLD_MAP_SAMPLE) {
      const wx = player.x + (mx - half) * WORLD_MAP_STEP;
      const wy = player.y + (my - half) * WORLD_MAP_STEP;
      const biome = world.tileAtWorld(wx + 1, wy + 1) || 'grass';
      ctx.fillStyle = BIOME_COLORS[biome] || '#4a7c35';
      ctx.fillRect(mx, my, WORLD_MAP_SAMPLE, WORLD_MAP_SAMPLE);
    }
  }

  function w2m(wx, wy) {
    return {
      x: half + (wx - player.x) / WORLD_MAP_STEP,
      y: half + (wy - player.y) / WORLD_MAP_STEP,
    };
  }

  function marker(wx, wy, color, label, isNpc) {
    const p = w2m(wx, wy);
    const r = isNpc ? 5 : 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (isNpc) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(label, p.x, p.y - r - 7);
      ctx.shadowBlur = 0;
    }
  }

  // Player — larger, directional
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(half, half, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(half, half, 9, 0, Math.PI * 2);
  ctx.stroke();
  const dirAngles = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 };
  const da = dirAngles[player.facing] || 0;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(half + Math.cos(da) * 4, half + Math.sin(da) * 4, 3.5, 0, Math.PI * 2);
  ctx.fill();

  marker(mainNPC.x, mainNPC.y, '#e9c877', 'Warden', true);
  marker(sideNPC.x, sideNPC.y, '#8ab0e9', 'Trader', true);

  for (const e of spawner.enemies) {
    if (e.dead) continue;
    const p = w2m(e.x, e.y);
    if (p.x < 0 || p.x >= WORLD_MAP_SIZE || p.y < 0 || p.y >= WORLD_MAP_SIZE) continue;
    ctx.fillStyle = e.stats.isElite ? '#d08bff' : '#e05a4e';
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
  }

  for (const c of spawner.caches) {
    if (c.opened) continue;
    const p = w2m(c.x, c.y);
    if (p.x < 0 || p.x >= WORLD_MAP_SIZE || p.y < 0 || p.y >= WORLD_MAP_SIZE) continue;
    ctx.fillStyle = '#6ad8e0';
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
  }

  // Visible-area rectangle
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  const vw = camera.viewW / WORLD_MAP_STEP;
  const vh = camera.viewH / WORLD_MAP_STEP;
  ctx.strokeRect(half - vw / 2, half - vh / 2, vw, vh);
  ctx.setLineDash([]);

  // Quest objective highlight — travel targets get a pulsing ring on the map
  if (quests.currentMain) {
    for (const obj of quests.currentMain.objectives) {
      if (obj.type === 'travel' && !obj.done) {
        const target = obj.target === 'side_npc' ? sideNPC : null;
        if (target) {
          const tp = w2m(target.x, target.y);
          ctx.strokeStyle = 'rgba(138,176,233,0.7)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(138,176,233,0.25)';
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8ab0e9';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
          const distTiles = Math.round(Math.hypot(target.x - player.x, target.y - player.y) / TILE);
          ctx.fillText(`Quest target · ${distTiles} tiles away`, tp.x, tp.y - 20);
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  // Tile-position coordinates
  document.getElementById('mapCoords').textContent =
    `${Math.round(player.x / TILE)}, ${Math.round(player.y / TILE)}`;
}

// ---------------------------------------------------------------
// INVENTORY UI
// ---------------------------------------------------------------
function openInventory(defaultTab) {
  renderInventory();
  openModal('inventoryModal');
  if (defaultTab) {
    document.querySelectorAll('.invTab').forEach(t => t.classList.toggle('active', t.dataset.tab === defaultTab));
    document.querySelectorAll('.invPanel').forEach(p => p.classList.add('hidden'));
    document.getElementById('invPanel' + capitalize(defaultTab)).classList.remove('hidden');
  }
}

function renderInventory() {
  renderItemsTab();
  renderEquipTab();
  renderQuestTab();
}

const RARITY_RANK = { legendary: 0, rare: 1, magic: 2, common: 3 };
const TYPE_RANK = { consumable: 0, weapon: 1, armor: 2, material: 3, currency: 4 };
const EQUIP_SLOT_NAMES = { weapon: 'Weapon', offhand: 'Offhand', chest: 'Chest', head: 'Head', ring: 'Ring', amulet: 'Amulet' };

// ---------------- Items tab ----------------
function renderItemsTab() {
  const { inventory, survival } = state;
  const panel = document.getElementById('invPanelItems');
  panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'invHeader';
  header.innerHTML =
    `<span class="goldWrap"><img src="assets/img/item_gold.png" alt="gold">${survival.gold} gold</span>` +
    `<span>Bag ${inventory.slots.length}/${inventory.maxSlots}</span>`;
  panel.appendChild(header);

  if (!inventory.slots.length) {
    const empty = document.createElement('div');
    empty.className = 'invEmpty';
    empty.textContent = 'Your bag is empty. Crack caches and hunt beasts to fill it.';
    panel.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'itemGrid';
  const view = inventory.slots.map((slot, i) => ({ slot, i }))
    .sort((a, b) => {
      const A = ITEMS[a.slot.item], B = ITEMS[b.slot.item];
      return (TYPE_RANK[A.type] - TYPE_RANK[B.type])
        || (RARITY_RANK[A.rarity] - RARITY_RANK[B.rarity])
        || A.name.localeCompare(B.name);
    });
  for (const { slot, i } of view) {
    const def = ITEMS[slot.item];
    const cell = document.createElement('div');
    cell.className = 'itemSlot';
    if (def.rarity && def.rarity !== 'common') cell.classList.add('itemRarity-' + def.rarity);
    cell.innerHTML = `<img src="assets/img/${def.img}" alt="${def.name}">${slot.qty > 1 ? `<span class="itemCount">${slot.qty}</span>` : ''}`;
    cell.onclick = () => openBagItemDetail(i);
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
}

function openBagItemDetail(index) {
  const slot = state.inventory.slots[index];
  if (!slot) return;
  const def = ITEMS[slot.item];
  const actions = [];
  if (def.type === 'consumable') {
    actions.push({ label: 'Use', primary: true, onSelect: () => consumeItem(def) });
  } else if (def.type === 'weapon' || def.type === 'armor') {
    actions.push({ label: 'Equip', primary: true, onSelect: () => equipFromBag(index) });
  }
  actions.push({ label: 'Close' });
  showItemDetail(def, { qty: slot.qty, actions });
}

function consumeItem(def) {
  const { survival, inventory } = state;
  if (def.heal) survival.heal(def.heal);
  if (def.hunger) survival.eat(def.hunger);
  if (def.thirst) survival.drink(def.thirst);
  if (def.restoreStam) survival.stamina = Math.min(survival.maxStamina, survival.stamina + def.restoreStam);
  inventory.remove(def.id, 1);
  showToast(`Used ${def.name}.`);
  requestSave();
  renderInventory();
}

function equipFromBag(index) {
  const def = state.inventory.equip(index);
  if (def) { applyEquipmentBonuses(); showToast(`Equipped ${def.name}.`); requestSave(); }
  renderInventory();
}

// ---------------- Equipment tab ----------------
function equipStatSummary(def) {
  const parts = [];
  if (def.dmg) parts.push(`DMG ${def.dmg[0]}–${def.dmg[1]}`);
  if (def.armor) parts.push(`ARM +${def.armor}`);
  if (def.dmgBonus) parts.push(`DMG +${def.dmgBonus}`);
  if (def.hpBonus) parts.push(`HP +${def.hpBonus}`);
  return parts.join(' · ') || 'No bonuses';
}

function renderEquipTab() {
  const { inventory, survival } = state;
  const panel = document.getElementById('invPanelEquip');
  panel.innerHTML = '';

  for (const key in EQUIP_SLOT_NAMES) {
    const itemId = inventory.equipment[key];
    const card = document.createElement('div');
    if (itemId) {
      const def = ITEMS[itemId];
      const color = (RARITY[def.rarity] || RARITY.common).color;
      card.className = 'equipSlotCard';
      card.innerHTML =
        `<div class="eqIcon" style="border-color:${color}; box-shadow:0 0 8px ${color}44;"><img src="assets/img/${def.img}" alt="${def.name}"></div>` +
        `<div class="eqInfo"><div class="eqName" style="color:${color}">${def.name}</div>` +
        `<div class="eqStats">${equipStatSummary(def)}</div></div>` +
        `<div class="eqSlotLabel">${EQUIP_SLOT_NAMES[key]}</div>`;
      card.onclick = () => openEquippedDetail(key);
    } else {
      card.className = 'equipSlotCard empty';
      card.innerHTML =
        `<div class="eqIcon"></div>` +
        `<div class="eqInfo"><div class="eqName">Empty</div>` +
        `<div class="eqHint">Equip ${EQUIP_SLOT_NAMES[key].toLowerCase()} gear from Items</div></div>` +
        `<div class="eqSlotLabel">${EQUIP_SLOT_NAMES[key]}</div>`;
    }
    panel.appendChild(card);
  }

  const w = inventory.weaponDef();
  const dmgBonus = inventory.totalDmgBonus();
  const dmgText = w ? `${w.dmg[0] + dmgBonus} – ${w.dmg[1] + dmgBonus}` : `${3 + dmgBonus} – ${5 + dmgBonus}`;
  const hpBonus = inventory.totalHpBonus();
  const stats = document.createElement('div');
  stats.className = 'charStats';
  stats.innerHTML =
    `<div class="charStatsTitle">Character</div>` +
    `<div class="statLine"><span>Attack Damage</span><b>${dmgText}</b></div>` +
    `<div class="statLine"><span>Total Armor</span><b>${inventory.totalArmor()}</b></div>` +
    `<div class="statLine"><span>Damage Bonus</span><b>+${dmgBonus}</b></div>` +
    `<div class="statLine"><span>Max HP</span><b>${Math.round(survival.maxHp)}${hpBonus ? ` (+${hpBonus} from gear)` : ''}</b></div>` +
    `<div class="statLine"><span>Level</span><b>${survival.level}</b></div>` +
    `<div class="statLine"><span>XP</span><b>${Math.floor(survival.xp)} / ${survival.xpToNext}</b></div>` +
    `<div class="statLine"><span>Gold</span><b>${survival.gold}</b></div>`;
  panel.appendChild(stats);
}

function openEquippedDetail(key) {
  const itemId = state.inventory.equipment[key];
  if (!itemId) return;
  const def = ITEMS[itemId];
  showItemDetail(def, {
    actions: [
      { label: 'Unequip', primary: true, onSelect: () => {
        if (!state.inventory.unequip(key)) showToast('Bag is full!');
        else { applyEquipmentBonuses(); showToast(`Unequipped ${def.name}.`); }
        renderInventory();
      }},
      { label: 'Close' },
    ],
  });
}

// ---------------- Quest log tab ----------------
function renderQuestTab() {
  const { quests } = state;
  const panel = document.getElementById('invPanelQuests');
  panel.innerHTML = '';

  if (quests.currentMain) panel.appendChild(questCard('Main Quest', quests.currentMain, quests.mainProgress, false));
  if (quests.currentSide && quests.sideUnlocked) panel.appendChild(questCard('Side Quest', quests.currentSide, quests.sideProgress, true));

  if (quests.log.length) {
    const h = document.createElement('div');
    h.className = 'questDoneHeader';
    h.textContent = `Completed (${quests.log.length})`;
    panel.appendChild(h);
    [...quests.log].reverse().slice(0, 20).forEach(entry => {
      const card = document.createElement('div');
      card.className = 'questCard done';
      card.innerHTML =
        `<h4><span class="questDoneMark">✓</span>${entry.title}</h4>` +
        `<p class="questText">${entry.text}</p>`;
      panel.appendChild(card);
    });
  }
}

function questCard(tag, quest, progress, isSide) {
  const { quests } = state;
  const card = document.createElement('div');
  card.className = 'questCard' + (isSide ? ' side' : '');

  const rewards = [];
  if (quest.reward) {
    if (quest.reward.xp) rewards.push(quest.reward.xp + ' XP');
    if (quest.reward.gold) rewards.push(quest.reward.gold + ' gold');
    (quest.reward.items || []).forEach(id => rewards.push(ITEMS[id] ? ITEMS[id].name : id));
  }

  const summary = quests.objectiveSummary(progress);
  const objs = (progress || []).map((o, i) => {
    const count = o.count || 1;
    const done = Math.min(o.done, count);
    const pct = Math.round((done / count) * 100);
    const complete = done >= count;
    const tally = o.type === 'travel' ? (complete ? '✓' : '') : `${done}/${count}`;
    return `<div class="objRow">` +
      `<div class="objLabel"><span>${summary[i] || ''}</span><span>${tally}</span></div>` +
      `<div class="objBar"><div class="objFill${complete ? ' full' : ''}" style="width:${pct}%"></div></div>` +
      `</div>`;
  }).join('');

  card.innerHTML =
    `<span class="questTag">${tag}</span>` +
    `<h4>${quest.title}</h4>` +
    `<p class="questText">${quest.text}</p>` +
    objs +
    (rewards.length ? `<div class="questRewards">Rewards: ${rewards.join(' · ')}</div>` : '');
  return card;
}

// ---------------------------------------------------------------
// SHOP (OLD EMBERIC)
// ---------------------------------------------------------------
const EMBERIC_BUY_STOCK = [
  { item: 'potion_health', qty: 3 },
  { item: 'potion_stamina', qty: 2 },
  { item: 'water_flask', qty: 3 },
  { item: 'bread', qty: 4 },
  { item: 'meat', qty: 2 },
  { item: 'berries', qty: 5 },
  { item: 'hide', qty: 3 },
  { item: 'iron_ore', qty: 3 },
];
const EMBERIC_RARE_CHANCE = 0.22;
const EMBERIC_RARE_ITEMS = ['dagger_common', 'helm_common', 'shield_common', 'axe_common', 'sword_common', 'bow_common', 'armor_common'];

function sellPrice(def) {
  if (def.type === 'currency') return 0;
  if (def.value) return def.value;
  if (def.type === 'weapon' || def.type === 'armor') {
    return { common: 12, magic: 30, rare: 80, legendary: 250 }[def.rarity] || 10;
  }
  if (def.type === 'consumable') return 5;
  return 1;
}
function buyPrice(def) { return Math.max(1, Math.round(sellPrice(def) * 2.8)); }

function openShop() {
  renderShop();
  openModal('shopModal');
}

function renderShop() {
  const { inventory, survival } = state;

  document.getElementById('shopGold').innerHTML =
    `<img src="assets/img/item_gold.png" alt="gold" style="width:14px;height:14px;vertical-align:middle;margin-right:3px;">${survival.gold} gold`;

  // Buy panel
  const buyPanel = document.getElementById('shopPanelBuy');
  buyPanel.innerHTML = '';
  const buyStock = [...EMBERIC_BUY_STOCK];
  if (Math.random() < EMBERIC_RARE_CHANCE) {
    const rare = EMBERIC_RARE_ITEMS[Math.floor(Math.random() * EMBERIC_RARE_ITEMS.length)];
    buyStock.push({ item: rare, qty: 1 });
  }
  buyStock.forEach(entry => {
    const def = ITEMS[entry.item];
    if (!def) return;
    const price = buyPrice(def);
    const canAfford = survival.gold >= price;
    const row = document.createElement('div');
    row.className = 'shopRow';
    row.innerHTML =
      `<img src="assets/img/${def.img}" alt="${def.name}">` +
      `<span class="shopRowName">${def.name} ${entry.qty > 1 ? 'x' + entry.qty : ''}</span>` +
      `<span class="shopRowCost ${canAfford ? 'canAfford' : 'cantAfford'}">${price}g</span>` +
      `<button class="shopRowBtn ${canAfford ? '' : 'disabled'}">Buy</button>`;
    if (canAfford) row.querySelector('button').onclick = () => {
      survival.gold -= price;
      inventory.add(def.id, entry.qty);
      showToast(`Bought ${def.name}${entry.qty > 1 ? ' x' + entry.qty : ''}.`);
      requestSave();
      renderShop();
    };
    buyPanel.appendChild(row);
  });

  // Sell panel
  const sellPanel = document.getElementById('shopPanelSell');
  sellPanel.innerHTML = '';
  const sellable = inventory.slots.filter(s => {
    const d = ITEMS[s.item];
    return d && d.type !== 'currency';
  });
  if (!sellable.length) {
    sellPanel.innerHTML = '<div class="shopEmpty">Nothing to sell.</div>';
  } else {
    sellable.forEach((slot, idx) => {
      const def = ITEMS[slot.item];
      const price = sellPrice(def);
      if (!price) return;
      const row = document.createElement('div');
      row.className = 'shopRow';
      row.innerHTML =
        `<img src="assets/img/${def.img}" alt="${def.name}">` +
        `<span class="shopRowName">${def.name} ${slot.qty > 1 ? 'x' + slot.qty : ''}</span>` +
        `<span class="shopRowCost canAfford">${price}g</span>` +
        `<button class="shopRowBtn sell">Sell</button>`;
      row.querySelector('button').onclick = () => {
        inventory.remove(slot.item, 1);
        survival.gold += price;
        showToast(`Sold ${def.name}.`);
        requestSave();
        renderShop();
      };
      sellPanel.appendChild(row);
    });
  }
}

// ---------------------------------------------------------------
// RENDERING
// ---------------------------------------------------------------
function render() {
  if (!state) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
  const { world, spawner, player, mainNPC, sideNPC, clock } = state;
  ctx.clearRect(0, 0, camera.viewW, camera.viewH);

  drawTiles();

  // collect all drawables sorted by y for depth
  const drawables = [];
  for (const [cx, cy] of world.chunksInRadius(player.x, player.y, 900)) {
    const chunk = world.getChunk(cx, cy);
    for (const prop of chunk.props) {
      if (camera.isVisible(prop.x, prop.y, 120)) drawables.push({ y: prop.y, draw: () => drawProp(prop) });
    }
  }
  for (const c of spawner.caches) {
    if (c.opened) continue;
    if (camera.isVisible(c.x, c.y)) drawables.push({ y: c.y, draw: () => drawCache(c) });
  }
  for (const e of spawner.enemies) {
    if (camera.isVisible(e.x, e.y, 150)) drawables.push({ y: e.y, draw: () => drawEnemy(e) });
  }
  if (camera.isVisible(mainNPC.x, mainNPC.y)) drawables.push({ y: mainNPC.y, draw: () => drawNPC(mainNPC) });
  if (camera.isVisible(sideNPC.x, sideNPC.y)) drawables.push({ y: sideNPC.y, draw: () => drawNPC(sideNPC) });
  drawables.push({ y: player.y, draw: () => drawPlayer(player) });

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  drawNightOverlay();
  drawCompassHint();
  drawMinimap();
}

function drawTiles() {
  const { world, player } = state;
  const startX = Math.floor((player.x - camera.viewW / 2) / TILE) - 1;
  const endX = Math.ceil((player.x + camera.viewW / 2) / TILE) + 1;
  const startY = Math.floor((player.y - camera.viewH / 2) / TILE) - 1;
  const endY = Math.ceil((player.y + camera.viewH / 2) / TILE) + 1;
  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const wx = tx * TILE, wy = ty * TILE;
      const biome = world.tileAtWorld(wx + 1, wy + 1);
      const variants = TILE_IMG[biome] || TILE_IMG[BIOME.GRASS];
      const variantIdx = ((tx * 31 + ty * 17) % variants.length + variants.length) % variants.length;
      const variant = variants[variantIdx];
      const img = images[variant];
      const sp = camera.worldToScreen(wx, wy);
      if (img) ctx.drawImage(img, Math.round(sp.x), Math.round(sp.y), TILE + 1, TILE + 1);
    }
  }
}

function drawProp(prop) {
  const img = images[prop.img];
  if (!img) return;
  const sp = camera.worldToScreen(prop.x, prop.y);
  const w = img.width, h = img.height;
  ctx.drawImage(img, Math.round(sp.x - w / 2), Math.round(sp.y - h + 10), w, h);
}

function drawCache(c) {
  const img = images[c.tier.img];
  if (!img) return;
  const sp = camera.worldToScreen(c.x, c.y);
  ctx.save();
  if (c.hitFlash > 0) ctx.filter = 'brightness(1.8)';
  ctx.drawImage(img, Math.round(sp.x - img.width / 2), Math.round(sp.y - img.height / 2), img.width, img.height);
  ctx.restore();
  drawHPBar(sp.x, sp.y - img.height / 2 - 6, c.hp, c.tier.hp, '#dcb85a');
}

function drawEnemy(e) {
  if (e.dead && e.deathTimer <= 0) return;
  const img = images[e.stats.img];
  if (!img) return;
  const sp = camera.worldToScreen(e.x, e.y);
  const scale = e.stats.scale || 1;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  if (e.dead) ctx.globalAlpha = Math.max(0, e.deathTimer / 0.5);
  if (e.hitFlash > 0) ctx.filter = 'brightness(2)';
  const flip = e.facing === 'left';
  if (flip) { ctx.translate(sp.x, 0); ctx.scale(-1, 1); ctx.translate(-sp.x, 0); }
  ctx.drawImage(img, Math.round(sp.x - w / 2), Math.round(sp.y - h + 8), w, h);
  ctx.restore();
  if (!e.dead) {
    if (e.stats.isElite) {
      ctx.fillStyle = '#d08bff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.stats.name, sp.x, sp.y - h + 2);
    }
    drawHPBar(sp.x, sp.y - h - 4, e.hp, e.stats.maxHp, e.stats.isElite ? '#d08bff' : '#e05a4e');
  }
}

function drawNPC(npc) {
  const img = images[npc.img];
  if (!img) return;
  const sp = camera.worldToScreen(npc.x, npc.y);
  const bob = Math.sin(performance.now() / 500 + npc.bobPhase) * 2;
  ctx.drawImage(img, Math.round(sp.x - img.width / 2), Math.round(sp.y - img.height + 10 + bob), img.width, img.height);
  ctx.fillStyle = npc.kind === 'main' ? '#e9c877' : '#8ab0e9';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(npc.kind === 'main' ? '!' : '?', sp.x, sp.y - img.height + bob - 4);
}

function drawPlayer(player) {
  const img = images['player.png'];
  const sp = camera.worldToScreen(player.x, player.y);
  const bob = player.moving ? Math.sin(performance.now() / 110) * 2 : 0;
  ctx.save();
  if (player.hitFlash > 0) ctx.filter = 'brightness(2) saturate(0.4)';
  const flip = player.facing === 'left';
  if (flip) { ctx.translate(sp.x, 0); ctx.scale(-1, 1); ctx.translate(-sp.x, 0); }
  ctx.drawImage(img, Math.round(sp.x - img.width / 2), Math.round(sp.y - img.height + 12 + bob), img.width, img.height);
  ctx.restore();

  if (player.attackAnim > 0) {
    ctx.save();
    ctx.globalAlpha = player.attackAnim / 0.22;
    ctx.strokeStyle = '#f5ecd0';
    ctx.lineWidth = 3;
    const hb = player.attackHitbox(ATTACK_RANGE);
    const hbSp = camera.worldToScreen(hb.x, hb.y);
    ctx.beginPath();
    ctx.arc(hbSp.x, hbSp.y, hb.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHPBar(sx, sy, hp, maxHp, color) {
  const w = 34, h = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(sx - w / 2, sy, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(sx - w / 2, sy, w * Math.max(0, hp / maxHp), h);
}

function drawNightOverlay() {
  const factor = state.clock.nightFactor();
  if (factor <= 0.01) return;
  ctx.fillStyle = `rgba(10,12,30,${factor * 0.62})`;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);
}

function drawCompassHint() {
  const { player, sideNPC, quests, mainNPC } = state;
  const target = (!state.metSideNpc && quests.mainProgress && quests.mainProgress.some(o => o.type === 'travel')) ? sideNPC : null;
  if (!target) return;
  const dx = target.x - player.x, dy = target.y - player.y;
  const ang = Math.atan2(dy, dx);
  const cx = camera.viewW - 34, cy = 96;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#8ab0e9';
  ctx.beginPath();
  ctx.moveTo(12, 0); ctx.lineTo(-8, 7); ctx.lineTo(-8, -7); ctx.closePath();
  ctx.fill();
  ctx.restore();
}
