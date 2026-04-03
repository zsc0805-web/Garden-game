/* Garden Growers - single file game logic (Canvas) */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const moneyEl = document.getElementById("money");
const heldEl = document.getElementById("held");
const inventoryEl = document.getElementById("inventory");

const modalEl = document.getElementById("modal");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const settingsBtn = document.getElementById("settingsBtn");

const BASE_CANVAS_W = canvas.width;
const BASE_CANVAS_H = canvas.height;
let W = canvas.width;
let H = canvas.height;
const BASE_FARM_W = Math.floor(BASE_CANVAS_W * 0.75);

// Layout: farm + shops. First expand: +100px width (right). 2nd & 3rd: +100px height each (down).
const world = {
  farm: { x: 0, y: 0, w: BASE_FARM_W, h: H },
  shops: { x: BASE_FARM_W, y: 0, w: BASE_CANVAS_W - BASE_FARM_W, h: H },
};

function syncGameLayout() {
  document.documentElement.style.setProperty("--game-canvas-w", `${W}px`);
  document.documentElement.style.setProperty("--game-canvas-h", `${H}px`);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function circleRectOverlap(cx, cy, r, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  return dist(cx, cy, closestX, closestY) <= r;
}

function canvasPointerToGame(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

const prices = {
  carrotSeed: 10,
  strawberrySeed: 50,
  carrotSell: 20,
  beetrootSeed: 1000,
  beetrootSell: 3000,
  appleSeed: 10000,
  appleSell: 1000,
  lilySeed: 100000,
  lilySell: 300000,
  shovel: 1000,
  burnerBooster: 3000,
  gearNuke: 100000,
};

const STORAGE_KEY = "gardenGrowers.gardeningGameMyGame.v1";
const EXPAND_PLOT_STEP_PX = 100;
const MAX_PLOT_EXPANSIONS = 3;
/** Cash back per seed burned = this fraction × one crop sell price (same as Sell shop uses). */
const BURNER_REFUND_RATIO = 0.4;
const BURNER_BOOST_DURATION_MS = 10000;
/** Apple tree: 3 min to mature; apples regrow 1 min after pick; 3 fruit slots on the canopy. */
const APPLE_TREE_GROW_MS = 180000;
const APPLE_FRUIT_REGROW_MS = 60000;
const APPLE_FRUIT_SLOTS = 3;
/** Lily: carrot-like crop; 6 min to harvest (3 min invisible, 3 min growing, then full). */
const LILY_GROW_MS = 360000;
const LILY_STAGE0_MS = 180000;
const NUKE_FX_MS = 2000;
/** Freezer: 5 min to freeze one harvested crop; output gets Frozen mutation (×5 sell). */
const FREEZER_DURATION_MS = 300000;
const FROZEN_SELL_MULT = 5;

/** Harvested crops only — RMB in backpack toggles favorite; Sell All skips these stacks. */
const BACKPACK_CROP_KEYS = [
  "carrot1",
  "carrot2",
  "carrot10",
  "strawberry1",
  "strawberry2",
  "strawberry10",
  "beetroot1",
  "beetroot2",
  "beetroot10",
  "apple1",
  "apple2",
  "apple10",
  "lily1",
  "lily2",
  "lily10",
];

function isBackpackCropKey(k) {
  return typeof k === "string" && BACKPACK_CROP_KEYS.includes(k);
}

function frozenCropInventoryKey(baseKey) {
  return "frozen" + baseKey[0].toUpperCase() + baseKey.slice(1);
}

const FROZEN_CROP_KEYS = BACKPACK_CROP_KEYS.map(frozenCropInventoryKey);

function frostKeyToBaseKey(fk) {
  if (!fk || typeof fk !== "string" || !fk.startsWith("frozen")) return null;
  const rest = fk.slice(6);
  if (!rest) return null;
  return rest.charAt(0).toLowerCase() + rest.slice(1);
}

function isFrozenInventoryKey(k) {
  return typeof k === "string" && FROZEN_CROP_KEYS.includes(k);
}

function getCropSellPriceForBaseKey(baseKey) {
  const mul = baseKey.endsWith("10") ? 10 : baseKey.endsWith("2") ? 2 : 1;
  if (baseKey.startsWith("carrot") || baseKey.startsWith("strawberry")) return getCarrotSellPrice(mul);
  if (baseKey.startsWith("beetroot")) return getBeetrootSellPrice(mul);
  if (baseKey.startsWith("apple")) return getAppleSellPrice(mul);
  if (baseKey.startsWith("lily")) return getLilySellPrice(mul);
  return 0;
}

function getFrozenCropSellPrice(frozenKey) {
  const b = frostKeyToBaseKey(frozenKey);
  if (!b) return 0;
  return getCropSellPriceForBaseKey(b) * FROZEN_SELL_MULT;
}

const FROZEN_BASE_LABELS = {
  carrot1: "Carrot",
  carrot2: "Carrot ×2",
  carrot10: "Carrot ×10",
  strawberry1: "Strawberry",
  strawberry2: "Strawberry ×2",
  strawberry10: "Strawberry ×10",
  beetroot1: "Beetroot",
  beetroot2: "Beetroot ×2",
  beetroot10: "Beetroot ×10",
  apple1: "Apple",
  apple2: "Apple ×2",
  apple10: "Apple ×10",
  lily1: "Lily",
  lily2: "Lily ×2",
  lily10: "Lily ×10",
};

function frozenCropDisplayLabel(fk) {
  const b = frostKeyToBaseKey(fk);
  if (!b) return fk;
  return `Frozen ${FROZEN_BASE_LABELS[b] ?? b}`;
}

function getCarrotSellPrice(multiplier) {
  return prices.carrotSell * multiplier;
}

function getBeetrootSellPrice(multiplier) {
  return prices.beetrootSell * multiplier;
}

function getAppleSellPrice(multiplier) {
  return prices.appleSell * multiplier;
}

function getLilySellPrice(multiplier) {
  return prices.lilySell * multiplier;
}

function isBurnerBoostActive() {
  return state.timeMs < state.burnerBoostUntilMs;
}

/** Refund when burning `count` seeds of `seedKey` (carrotSeed / strawberrySeed / beetrootSeed). */
function burnRefundForSeedType(seedKey, count) {
  if (count <= 0) return 0;
  if (isBurnerBoostActive()) {
    return count * prices[seedKey];
  }
  if (seedKey === "beetrootSeed") {
    return Math.floor(count * getBeetrootSellPrice(1) * BURNER_REFUND_RATIO);
  }
  if (seedKey === "appleSeed") {
    return Math.floor(count * getAppleSellPrice(1) * BURNER_REFUND_RATIO);
  }
  if (seedKey === "lilySeed") {
    return Math.floor(count * getLilySellPrice(1) * BURNER_REFUND_RATIO);
  }
  return Math.floor(count * getCarrotSellPrice(1) * BURNER_REFUND_RATIO);
}

function defaultSaveData() {
  return {
    v: 1,
    money: 20,
    inventory: {
      carrotSeed: 0,
      strawberrySeed: 0,
      beetrootSeed: 0,
      appleSeed: 0,
      lilySeed: 0,
      shovel: 0,
      burnerBooster: 0,
      gearNuke: 0,
      carrot1: 0,
      carrot2: 0,
      carrot10: 0,
      strawberry1: 0,
      strawberry2: 0,
      strawberry10: 0,
      beetroot1: 0,
      beetroot2: 0,
      beetroot10: 0,
      apple1: 0,
      apple2: 0,
      apple10: 0,
      lily1: 0,
      lily2: 0,
      lily10: 0,
      ...Object.fromEntries(FROZEN_CROP_KEYS.map((k) => [k, 0])),
    },
    player: { x: world.farm.w * 0.5, y: world.farm.h * 0.55, held: null },
    plants: [],
    redeemedCodes: {},
    plotExpansions: 0,
    backpackFavorites: {},
    freezer: { cropKey: null, readyAtMs: 0 },
  };
}

function applyPlotExpansions(expansions) {
  const n = clamp(Math.floor(Number(expansions) || 0), 0, MAX_PLOT_EXPANSIONS);
  const extraW = n >= 1 ? EXPAND_PLOT_STEP_PX : 0;
  const extraH = n >= 2 ? (n - 1) * EXPAND_PLOT_STEP_PX : 0;

  canvas.width = BASE_CANVAS_W + extraW;
  canvas.height = BASE_CANVAS_H + extraH;
  W = canvas.width;
  H = canvas.height;

  world.farm.w = BASE_FARM_W + extraW;
  world.farm.h = H;
  world.shops.x = world.farm.w;
  world.shops.w = W - world.farm.w;
  world.shops.h = H;

  syncGameLayout();
  recomputeShopRects();
}

function getNextPlotExpandCost() {
  const n = Number(state.plotExpansions) || 0;
  return 1000 * Math.pow(10, n);
}

/** Label for the *next* purchase (before incrementing plotExpansions). */
function getNextExpandSizeLabel() {
  const n = Number(state.plotExpansions) || 0;
  if (n >= MAX_PLOT_EXPANSIONS) return "—";
  if (n === 0) return `+${EXPAND_PLOT_STEP_PX}px wide (right)`;
  return `+${EXPAND_PLOT_STEP_PX}px tall (down)`;
}

function tryExpandPlot() {
  const cost = getNextPlotExpandCost();
  const expansions = Number(state.plotExpansions) || 0;

  if (expansions >= MAX_PLOT_EXPANSIONS) {
    return { ok: false, reason: "Plot is already max size (3 expansions)." };
  }
  if (state.money < cost) {
    const need = cost - state.money;
    return {
      ok: false,
      reason: `Not enough money (need $${cost}, have $${state.money}, short $${need}).`,
    };
  }

  // Apply layout first, then money — avoid setMoney() saving stale plotExpansions mid-update.
  state.plotExpansions = expansions + 1;
  applyPlotExpansions(state.plotExpansions);
  state.money -= cost;
  moneyEl.textContent = String(state.money);
  saveGame();
  return { ok: true, reason: "" };
}

function saveGame() {
  try {
    pruneBackpackFavorites();
    const data = {
      v: 1,
      money: state.money,
      inventory: { ...state.inventory },
      player: {
        x: state.player.x,
        y: state.player.y,
        held: state.player.held?.kind ?? null,
      },
      plants: state.plants
        .filter((p) => !p.harvested)
        .map((p) => {
          if (p.type === "strawberry") {
            return {
              id: p.id,
              type: "strawberry",
              x: p.x,
              y: p.y,
              plantedAtMs: p.plantedAtMs,
              multiplier: p.multiplier ?? 1,
              fruits: Array.isArray(p.fruits)
                ? p.fruits.map((f) => ({ nextGrowAtMs: f.nextGrowAtMs }))
                : [],
            };
          }
          if (p.type === "apple") {
            return {
              id: p.id,
              type: "apple",
              x: p.x,
              y: p.y,
              plantedAtMs: p.plantedAtMs,
              multiplier: p.multiplier ?? 1,
              fruits: Array.isArray(p.fruits)
                ? p.fruits.map((f) => ({ nextGrowAtMs: f.nextGrowAtMs }))
                : [],
            };
          }
          return {
            id: p.id,
            type:
              p.type === "beetroot"
                ? "beetroot"
                : p.type === "lily"
                  ? "lily"
                  : "carrot",
            x: p.x,
            y: p.y,
            plantedAtMs: p.plantedAtMs,
            multiplier: p.multiplier ?? 1,
          };
        }),
      redeemedCodes: state.redeemedCodes ?? {},
      plotExpansions: state.plotExpansions ?? 0,
      backpackFavorites: { ...(state.backpackFavorites ?? {}) },
      freezer: {
        cropKey: state.freezer?.cropKey ?? null,
        readyAtMs:
          typeof state.freezer?.readyAtMs === "number" && Number.isFinite(state.freezer.readyAtMs)
            ? state.freezer.readyAtMs
            : 0,
      },
      burnerBoostUntilMs:
        typeof state.burnerBoostUntilMs === "number" && Number.isFinite(state.burnerBoostUntilMs)
          ? state.burnerBoostUntilMs
          : 0,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return false;

    if (typeof data.money === "number" && Number.isFinite(data.money)) setMoney(Math.max(0, Math.floor(data.money)));

    state.plotExpansions = Math.max(
      0,
      Math.min(
        MAX_PLOT_EXPANSIONS,
        Math.floor(Number(data.plotExpansions) || 0),
      ),
    );
    applyPlotExpansions(state.plotExpansions);

    const inv = data.inventory ?? {};
    for (const k of [
      "carrotSeed",
      "strawberrySeed",
      "beetrootSeed",
      "appleSeed",
      "lilySeed",
      "shovel",
      "burnerBooster",
      "gearNuke",
      "carrot1",
      "carrot2",
      "carrot10",
      "strawberry1",
      "strawberry2",
      "strawberry10",
      "beetroot1",
      "beetroot2",
      "beetroot10",
      "apple1",
      "apple2",
      "apple10",
      "lily1",
      "lily2",
      "lily10",
      ...FROZEN_CROP_KEYS,
    ]) {
      const n = inv[k];
      state.inventory[k] = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }

    const fr = data.freezer;
    state.freezer = {
      cropKey: typeof fr?.cropKey === "string" && isBackpackCropKey(fr.cropKey) ? fr.cropKey : null,
      readyAtMs:
        typeof fr?.readyAtMs === "number" && Number.isFinite(fr.readyAtMs) ? Math.max(0, fr.readyAtMs) : 0,
    };

    const pl = data.player ?? {};
    if (typeof pl.x === "number" && typeof pl.y === "number") {
      state.player.x = clamp(pl.x, state.player.r, W - state.player.r);
      state.player.y = clamp(pl.y, state.player.r, H - state.player.r);
    }
    if (typeof pl.held === "string") state.player.held = { kind: pl.held };
    else state.player.held = null;

    const plants = Array.isArray(data.plants) ? data.plants : [];
    state.plants = plants
      .filter((p) => p && typeof p.x === "number" && typeof p.y === "number")
      .map((p) => {
        const type =
          p.type === "strawberry"
            ? "strawberry"
            : p.type === "apple"
              ? "apple"
              : p.type === "beetroot"
                ? "beetroot"
                : p.type === "lily"
                  ? "lily"
                  : "carrot";
        const base = {
          id: typeof p.id === "string" ? p.id : String(Math.random()).slice(2),
          type,
          x: clamp(p.x, 18, world.farm.w - 18),
          y: clamp(p.y, 18, world.farm.h - 18),
          plantedAtMs: typeof p.plantedAtMs === "number" ? p.plantedAtMs : Date.now(),
          stage: 0,
          harvested: false,
          multiplier: p.multiplier === 10 ? 10 : p.multiplier === 2 ? 2 : 1,
        };
        if (type === "strawberry") {
          const fruits = Array.isArray(p.fruits) ? p.fruits : [];
          return {
            ...base,
            fruits: [0, 1].map((i) => {
              const f = fruits[i] ?? {};
              return {
                nextGrowAtMs: typeof f.nextGrowAtMs === "number" ? f.nextGrowAtMs : base.plantedAtMs + 5000 + 3000,
              };
            }),
          };
        }
        if (type === "apple") {
          const fruits = Array.isArray(p.fruits) ? p.fruits : [];
          return {
            ...base,
            fruits: Array.from({ length: APPLE_FRUIT_SLOTS }, (_, i) => {
              const f = fruits[i] ?? {};
              return {
                nextGrowAtMs:
                  typeof f.nextGrowAtMs === "number"
                    ? f.nextGrowAtMs
                    : base.plantedAtMs + APPLE_TREE_GROW_MS + APPLE_FRUIT_REGROW_MS,
              };
            }),
          };
        }
        return base;
      });

    state.redeemedCodes =
      data.redeemedCodes && typeof data.redeemedCodes === "object" ? { ...data.redeemedCodes } : {};

    state.backpackFavorites = {};
    const bf = data.backpackFavorites;
    if (bf && typeof bf === "object") {
      for (const k of Object.keys(bf)) {
        if (bf[k] && isBackpackCropKey(k)) state.backpackFavorites[k] = true;
      }
    }
    pruneBackpackFavorites();

    state.burnerBoostUntilMs =
      typeof data.burnerBoostUntilMs === "number" && Number.isFinite(data.burnerBoostUntilMs)
        ? data.burnerBoostUntilMs
        : 0;

    state.nukeFx = { parts: [], untilMs: 0, flashUntilMs: 0 };

    renderInventory();
    return true;
  } catch {
    return false;
  }
}

function wipeProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const d = defaultSaveData();
  setMoney(d.money);
  state.inventory = { ...d.inventory };
  state.player.x = d.player.x;
  state.player.y = d.player.y;
  state.player.held = null;
  state.plants = [];
  state.redeemedCodes = {};
  state.plotExpansions = 0;
  state.burnerBoostUntilMs = 0;
  state.backpackFavorites = {};
  state.freezer = { cropKey: null, readyAtMs: 0 };
  state.nukeFx = { parts: [], untilMs: 0, flashUntilMs: 0 };
  applyPlotExpansions(0);
  renderInventory();
  closeMenu();
  saveGame();
}

function rollCarrotMultiplier() {
  // 1%: 10x, 10%: 2x, else: 1x
  const r = Math.random();
  if (r < 0.01) return 10;
  if (r < 0.11) return 2;
  return 1;
}

function triggerGardenNuke() {
  state.plants = [];
  state.inventory.gearNuke = Math.max(0, state.inventory.gearNuke - 1);
  const cx = world.farm.w * 0.5;
  const cy = world.farm.h * 0.5;
  const now = state.timeMs;
  state.nukeFx.untilMs = now + NUKE_FX_MS;
  state.nukeFx.flashUntilMs = now + 280;
  state.nukeFx.parts = [];
  for (let i = 0; i < 170; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 140 + Math.random() * 400;
    state.nukeFx.parts.push({
      x: cx + (Math.random() - 0.5) * 70,
      y: cy + (Math.random() - 0.5) * 70,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      r: 2.5 + Math.random() * 10,
      hue: 5 + Math.random() * 42,
      life: 0.9 + Math.random() * 0.75,
    });
  }
  if (state.inventory.gearNuke <= 0 && state.player.held?.kind === "gearNuke") state.player.held = null;
  setHeldText();
  renderInventory();
  saveGame();
}

function updateNukeFx(dt) {
  const parts = state.nukeFx.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 720 * dt;
    p.vx *= 0.992;
    p.life -= dt * 0.95;
    if (p.life <= 0 || p.y > world.farm.h + 100 || p.x < -100 || p.x > world.farm.w + 100) parts.splice(i, 1);
  }
  if (state.timeMs > state.nukeFx.untilMs && parts.length === 0) {
    state.nukeFx.flashUntilMs = 0;
  }
}

function drawNukeFx() {
  const now = state.timeMs;
  if (now < state.nukeFx.flashUntilMs) {
    const t = (state.nukeFx.flashUntilMs - now) / 280;
    ctx.fillStyle = `rgba(255,252,220,${0.15 + t * 0.5})`;
    ctx.fillRect(world.farm.x, world.farm.y, world.farm.w, world.farm.h);
  }
  if (now < state.nukeFx.untilMs) {
    const pulse = 1 - (state.nukeFx.untilMs - now) / NUKE_FX_MS;
    const shockR = Math.min(world.farm.w, world.farm.h) * 0.48 * (0.2 + pulse * 0.85);
    ctx.strokeStyle = `rgba(255,220,120,${0.55 * (1 - pulse * 0.4)})`;
    ctx.lineWidth = 5 + 8 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(world.farm.w * 0.5, world.farm.h * 0.5, shockR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,140,60,${0.35 * (1 - pulse)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(world.farm.w * 0.5, world.farm.h * 0.5, shockR * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of state.nukeFx.parts) {
    const a = Math.min(1, Math.max(0, p.life));
    ctx.fillStyle = `hsla(${p.hue},92%,58%,${a * 0.92})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
    ctx.beginPath();
    ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

const state = {
  timeMs: 0,
  money: 20,
  ui: {
    openMenu: null, // "gears" | "seeds" | "sell" | "freezer" | "burner" | "expand" | "settings" | "backpack" | null
    touchedShop: null, // debounce which shop opened
    menuOpenedAtMs: 0,
    burnerSeedPick: {
      carrotSeed: false,
      strawberrySeed: false,
      beetrootSeed: false,
      appleSeed: false,
      lilySeed: false,
    },
  },
  player: {
    x: world.farm.w * 0.5,
    y: world.farm.h * 0.55,
    r: 13,
    speed: 220, // px/s
    vx: 0,
    vy: 0,
    held: null, // { kind: "carrotSeed" } | { kind: "carrot" } | null
  },
  inventory: {
    carrotSeed: 0,
    strawberrySeed: 0,
    beetrootSeed: 0,
    appleSeed: 0,
    lilySeed: 0,
    shovel: 0,
    burnerBooster: 0,
    gearNuke: 0,
    carrot1: 0,
    carrot2: 0,
    carrot10: 0,
    strawberry1: 0,
    strawberry2: 0,
    strawberry10: 0,
    beetroot1: 0,
    beetroot2: 0,
    beetroot10: 0,
    apple1: 0,
    apple2: 0,
    apple10: 0,
    lily1: 0,
    lily2: 0,
    lily10: 0,
    ...Object.fromEntries(FROZEN_CROP_KEYS.map((k) => [k, 0])),
  },
  redeemedCodes: {},
  plotExpansions: 0,
  burnerBoostUntilMs: 0,
  plants: [], // {id, x, y, plantedAtMs, stage, harvested}
  /** Fireball particles + flash timing after garden nuke */
  nukeFx: { parts: [], untilMs: 0, flashUntilMs: 0 },
  /** Crop inventory keys marked in backpack — Sell All keeps those stacks. */
  backpackFavorites: {},
  /** One crop freezing; max plot only. */
  freezer: { cropKey: null, readyAtMs: 0 },
};

function pruneBackpackFavorites() {
  if (!state.backpackFavorites) return;
  for (const k of Object.keys(state.backpackFavorites)) {
    if (!isBackpackCropKey(k) || (state.inventory[k] ?? 0) <= 0) delete state.backpackFavorites[k];
  }
}

function toggleBackpackFavorite(key) {
  if (!isBackpackCropKey(key) || (state.inventory[key] ?? 0) <= 0) return;
  if (!state.backpackFavorites) state.backpackFavorites = {};
  if (state.backpackFavorites[key]) delete state.backpackFavorites[key];
  else state.backpackFavorites[key] = true;
  saveGame();
  renderMenu();
}

/** Count that would be sold by Sell All for this crop line (favorited = keep entire stack). */
function sellableCropCount(key) {
  if (!isBackpackCropKey(key)) return 0;
  const c = state.inventory[key] ?? 0;
  if (c <= 0) return 0;
  if (state.backpackFavorites?.[key]) return 0;
  return c;
}

function freezerUnlocked() {
  return (Number(state.plotExpansions) || 0) >= MAX_PLOT_EXPANSIONS;
}

function tryDepositFreezer() {
  if (state.freezer.cropKey) return false;
  const h = state.player.held?.kind;
  if (!h || !isBackpackCropKey(h)) return false;
  if ((state.inventory[h] ?? 0) < 1) return false;
  state.inventory[h] -= 1;
  if (state.inventory[h] <= 0 && state.player.held?.kind === h) state.player.held = null;
  state.freezer.cropKey = h;
  state.freezer.readyAtMs = state.timeMs + FREEZER_DURATION_MS;
  setHeldText();
  renderInventory();
  saveGame();
  return true;
}

function claimFrozenFromFreezer() {
  const base = state.freezer.cropKey;
  if (!base) return;
  const fk = frozenCropInventoryKey(base);
  state.inventory[fk] = (state.inventory[fk] ?? 0) + 1;
  state.player.held = { kind: fk };
  state.freezer.cropKey = null;
  state.freezer.readyAtMs = 0;
  setHeldText();
  renderInventory();
  saveGame();
}

function tryFreezerE() {
  if (state.ui.openMenu) return false;
  if (!freezerUnlocked()) return false;
  if (shops.freezer.w <= 0) return false;
  if (!circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.freezer)) return false;

  const fz = state.freezer;
  if (fz.cropKey && state.timeMs >= fz.readyAtMs) {
    claimFrozenFromFreezer();
    return true;
  }
  if (fz.cropKey) return false;

  return tryDepositFreezer();
}

function setMoney(v) {
  state.money = v;
  moneyEl.textContent = String(state.money);
  saveGame();
}

function setHeldText() {
  if (!state.player.held) {
    heldEl.textContent = "None";
    return;
  }
  const k = state.player.held.kind;
  if (k === "shovel") heldEl.textContent = "Shovel";
  else if (k === "gearNuke") heldEl.textContent = "Garden nuke";
  else if (k === "burnerBooster") heldEl.textContent = "Burner booster";
  else if (k === "appleSeed") heldEl.textContent = "Apple Seed";
  else if (k === "apple1" || k === "apple2" || k === "apple10")
    heldEl.textContent = k === "apple10" ? "Apple ×10" : k === "apple2" ? "Apple ×2" : "Apple";
  else if (k === "lilySeed") heldEl.textContent = "Lily Seed";
  else if (k === "lily1" || k === "lily2" || k === "lily10")
    heldEl.textContent = k === "lily10" ? "Lily ×10" : k === "lily2" ? "Lily ×2" : "Lily";
  else if (isFrozenInventoryKey(k)) heldEl.textContent = frozenCropDisplayLabel(k);
  else heldEl.textContent = k;
}

function updateBurnerBoostHud() {
  const el = document.getElementById("burnerBoostHud");
  if (!el) return;
  const left = state.burnerBoostUntilMs - state.timeMs;
  if (left <= 0) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `Burner boost time: ${(left / 1000).toFixed(1)}s`;
}

function openMenu(kind) {
  state.ui.openMenu = kind;
  state.ui.menuOpenedAtMs = state.timeMs;
  if (kind === "burner") {
    state.ui.burnerSeedPick = {
      carrotSeed: false,
      strawberrySeed: false,
      beetrootSeed: false,
      appleSeed: false,
      lilySeed: false,
    };
  }
  modalEl.classList.remove("hidden");
  renderMenu();
}

function closeMenu() {
  state.ui.openMenu = null;
  modalEl.classList.add("hidden");
  renderMenu();
}

const SHOP_LONG_PRESS_BUY_MS = 3000;

/** Tap: one purchase. Hold 3s: buy as many as you can afford at once. */
function attachShopBuyButtonWithBulk(el, unitPrice, buyOne, buyMany) {
  let timer = null;
  let downAt = 0;
  let suppressShortTap = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    downAt = performance.now();
    suppressShortTap = false;
    timer = setTimeout(() => {
      timer = null;
      const max = Math.floor(state.money / unitPrice);
      if (max <= 0) return;
      suppressShortTap = true;
      buyMany(max);
    }, SHOP_LONG_PRESS_BUY_MS);
  });

  const onEnd = (e) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (e.type === "pointerleave" || e.type === "pointercancel") return;
    if (e.button !== 0) return;
    if (suppressShortTap) {
      suppressShortTap = false;
      return;
    }
    if (!el.contains(e.target)) return;
    if (performance.now() - downAt >= SHOP_LONG_PRESS_BUY_MS) return;
    buyOne();
  };

  el.addEventListener("pointerup", onEnd);
  el.addEventListener("pointerleave", onEnd);
  el.addEventListener("pointercancel", onEnd);
}

function renderMenu() {
  modalBodyEl.innerHTML = "";

  if (!state.ui.openMenu) return;

  if (state.ui.openMenu === "backpack") {
    modalTitleEl.textContent = "Backpack (100 slots)";

    const grid = document.createElement("div");
    grid.className = "bp-grid";

    // Stacked slots: put item types first, then empty slots up to 100.
    const slotItems = [
      { key: "carrotSeed", label: "Carrot Seed", count: state.inventory.carrotSeed, dot: "#ff8a2b" },
      { key: "strawberrySeed", label: "Strawberry Seed", count: state.inventory.strawberrySeed, dot: "#ff3b4f" },
      { key: "beetrootSeed", label: "Beetroot Seed", count: state.inventory.beetrootSeed, dot: "#b13b5a" },
      { key: "appleSeed", label: "Apple Seed", count: state.inventory.appleSeed, dot: "#5a9e3e" },
      { key: "lilySeed", label: "Lily Seed", count: state.inventory.lilySeed, dot: "#e8a8d8" },
      { key: "shovel", label: "Shovel", count: state.inventory.shovel, dot: "#c0c8e8" },
      { key: "gearNuke", label: "Garden nuke", count: state.inventory.gearNuke, dot: "#ff5533" },
      { key: "burnerBooster", label: "Burner booster", count: state.inventory.burnerBooster, dot: "#ff9a4a" },
      { key: "carrot1", label: "Carrot", count: state.inventory.carrot1, dot: "#ff8a2b" },
      { key: "carrot2", label: "Carrot ×2", count: state.inventory.carrot2, dot: "#ffb13b" },
      { key: "carrot10", label: "Carrot ×10", count: state.inventory.carrot10, dot: "#ffd86b" },
      { key: "strawberry1", label: "Strawberry", count: state.inventory.strawberry1, dot: "#ff4a4a" },
      { key: "strawberry2", label: "Strawberry ×2", count: state.inventory.strawberry2, dot: "#ff6b6b" },
      { key: "strawberry10", label: "Strawberry ×10", count: state.inventory.strawberry10, dot: "#ff8a8a" },
      { key: "beetroot1", label: "Beetroot", count: state.inventory.beetroot1, dot: "#b13b5a" },
      { key: "beetroot2", label: "Beetroot ×2", count: state.inventory.beetroot2, dot: "#d15a7a" },
      { key: "beetroot10", label: "Beetroot ×10", count: state.inventory.beetroot10, dot: "#f08aa4" },
      { key: "apple1", label: "Apple", count: state.inventory.apple1, dot: "#e02020" },
      { key: "apple2", label: "Apple ×2", count: state.inventory.apple2, dot: "#ff4444" },
      { key: "apple10", label: "Apple ×10", count: state.inventory.apple10, dot: "#ff6666" },
      { key: "lily1", label: "Lily", count: state.inventory.lily1, dot: "#f0c8e8" },
      { key: "lily2", label: "Lily ×2", count: state.inventory.lily2, dot: "#f5a8d8" },
      { key: "lily10", label: "Lily ×10", count: state.inventory.lily10, dot: "#ff88c8" },
      ...FROZEN_CROP_KEYS.map((fk) => ({
        key: fk,
        label: frozenCropDisplayLabel(fk),
        count: state.inventory[fk] ?? 0,
        dot: "#a8dcff",
      })),
    ].filter((x) => x.count > 0);

    for (let i = 0; i < 100; i++) {
      const slot = document.createElement("div");
      slot.className = "bp-slot";

      const it = slotItems[i];
      if (!it) {
        slot.classList.add("bp-empty");
        slot.innerHTML = `<div class="bp-top"><span class="bp-dot" style="opacity:.2"></span><span class="bp-qty"></span></div><div class="bp-name"></div>`;
        grid.appendChild(slot);
        continue;
      }

      if (state.player.held?.kind === it.key) slot.classList.add("selected");

      const fav =
        isBackpackCropKey(it.key) && state.backpackFavorites?.[it.key]
          ? `<span class="bp-fav" aria-hidden="true">♥</span>`
          : "";
      slot.innerHTML = `
        ${fav}
        <div class="bp-top">
          <span class="bp-dot" style="background:${it.dot}"></span>
          <span class="bp-qty">x${it.count}</span>
        </div>
        <div class="bp-name">${it.label}</div>
      `;

      slot.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      slot.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (it.count <= 0) return;
        if (e.button === 2) {
          if (isBackpackCropKey(it.key)) toggleBackpackFavorite(it.key);
          return;
        }
        if (e.button === 0) selectInventoryItem(it.key);
      });

      grid.appendChild(slot);
    }

    modalBodyEl.appendChild(grid);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent =
      "Right-click a crop to favorite (♥) — favorited stacks are not sold by Sell All. B toggles backpack. Press WASD/Arrows to close (after 1 second).";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "settings") {
    modalTitleEl.textContent = "Settings";

    // Codes
    const codesWrap = document.createElement("div");
    codesWrap.className = "list";

    const codesTitle = document.createElement("div");
    codesTitle.style.fontWeight = "900";
    codesTitle.style.marginBottom = "8px";
    codesTitle.textContent = "Codes";
    codesWrap.appendChild(codesTitle);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.flexWrap = "wrap";
    row.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Enter code (letters only; case ignored)";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.flex = "1";
    input.style.minWidth = "220px";
    input.style.padding = "10px 12px";
    input.style.borderRadius = "12px";
    input.style.border = "1px solid rgba(255,255,255,.18)";
    input.style.background = "rgba(0,0,0,.18)";
    input.style.color = "var(--text)";

    const redeemBtn = document.createElement("button");
    redeemBtn.className = "btn primary";
    redeemBtn.type = "button";
    redeemBtn.style.flex = "0 0 auto";
    redeemBtn.innerHTML = `<span>Redeem</span><span class="small"></span>`;

    const msg = document.createElement("div");
    msg.className = "small";
    msg.textContent = "";

    // Strips weird spaces / fullwidth chars so pasted text still matches.
    function canonicalCode(s) {
      let t = String(s).replace(/^\uFEFF/, "");
      try {
        t = t.normalize("NFKC");
      } catch {
        /* ignore */
      }
      return t
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    }

    function isCodeRedeemed(key) {
      if (state.redeemedCodes?.[key]) return true;
      if (key === "c4rr0t" && state.redeemedCodes?.C4rr0t) return true;
      return false;
    }

    function markCodeRedeemed(key) {
      state.redeemedCodes[key] = true;
      if (key === "c4rr0t") delete state.redeemedCodes.C4rr0t;
    }

    function redeem() {
      const raw = String(input.value);
      const code = canonicalCode(raw);

      if (!code) return;

      if (code === "reset") {
        state.redeemedCodes = {};
        saveGame();
        msg.textContent = "Code history cleared — you can redeem codes again.";
        input.value = "";
        return;
      }

      if (isCodeRedeemed(code)) {
        msg.textContent = "Code already redeemed on this save.";
        return;
      }

      if (code === "c4rr0t") {
        state.inventory.carrot1 += 1;
        markCodeRedeemed(code);
        renderInventory();
        saveGame();
        msg.textContent = "Redeemed! +1 Carrot";
        input.value = "";
        return;
      }

      if (code === "plsadmin") {
        state.inventory.lilySeed += 1;
        state.inventory.lily2 += 1;
        state.inventory.lily10 += 1;
        markCodeRedeemed(code);
        renderInventory();
        saveGame();
        msg.textContent = "Redeemed! +1 Lily Seed, +1 Lily ×2, +1 Lily ×10";
        input.value = "";
        return;
      }

      if (code === "iceage") {
        let totalCrops = 0;
        for (const k of BACKPACK_CROP_KEYS) {
          const n = state.inventory[k] ?? 0;
          if (n <= 0) continue;
          const fk = frozenCropInventoryKey(k);
          state.inventory[fk] = (state.inventory[fk] ?? 0) + n;
          state.inventory[k] = 0;
          totalCrops += n;
        }
        if (totalCrops <= 0) {
          msg.textContent = "No harvest crops in inventory to convert.";
          input.value = "";
          return;
        }
        const hk = state.player.held?.kind;
        if (hk && isBackpackCropKey(hk)) {
          state.player.held = { kind: frozenCropInventoryKey(hk) };
        }
        pruneBackpackFavorites();
        markCodeRedeemed(code);
        setHeldText();
        renderInventory();
        saveGame();
        msg.textContent = `Redeemed! ${totalCrops} harvest crop(s) converted to Frozen (×5 sell value).`;
        input.value = "";
        return;
      }

      if (code === "github") {
        const fk = frozenCropInventoryKey("lily10");
        state.inventory[fk] = (state.inventory[fk] ?? 0) + 1;
        markCodeRedeemed(code);
        setMoney(state.money + 1000000);
        renderInventory();
        msg.textContent = "Redeemed! +$1,000,000 and +1 Frozen Lily ×10";
        input.value = "";
        return;
      }

      msg.textContent = "Invalid code.";
    }

    redeemBtn.addEventListener("click", redeem);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") redeem();
    });

    row.appendChild(input);
    row.appendChild(redeemBtn);
    codesWrap.appendChild(row);
    codesWrap.appendChild(msg);
    modalBodyEl.appendChild(codesWrap);

    const wipeBtn = document.createElement("button");
    wipeBtn.className = "btn danger";
    wipeBtn.type = "button";
    wipeBtn.innerHTML = `<span>Wipe Progress</span><span class="small">Reset save</span>`;
    wipeBtn.addEventListener("click", () => wipeProgress());
    modalBodyEl.appendChild(wipeBtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent = "This will delete your saved money, inventory, and planted crops.";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "expand") {
    modalTitleEl.textContent = "Expand Plot";

    const exp = Number(state.plotExpansions) || 0;
    const atMax = exp >= MAX_PLOT_EXPANSIONS;
    const cost = atMax ? null : getNextPlotExpandCost();

    const info = document.createElement("div");
    info.className = "list";
    info.innerHTML = `
      <div class="list-row"><span>Current expansions</span><span class="small">x${state.plotExpansions ?? 0} / ${MAX_PLOT_EXPANSIONS}</span></div>
      <div class="list-row"><span>Next expansion</span><span class="small">${getNextExpandSizeLabel()}</span></div>
      <div class="list-row"><span>Cost</span><span class="small">${atMax ? "—" : `$${cost}`}</span></div>
    `;
    modalBodyEl.appendChild(info);

    const msg = document.createElement("div");
    msg.className = "small";
    msg.textContent = "";

    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.type = "button";
    btn.disabled = atMax;
    btn.innerHTML = atMax
      ? `<span>Plot maxed</span><span class="small">${MAX_PLOT_EXPANSIONS} expansions</span>`
      : `<span>Buy Expansion</span><span class="small">$${cost}</span>`;
    if (!atMax) {
      btn.addEventListener("click", () => {
        const res = tryExpandPlot();
        if (!res.ok) {
          msg.style.color = "#ff6b6b";
          msg.textContent = res.reason;
          return;
        }
        msg.style.color = "";
        renderMenu();
      });
    }
    modalBodyEl.appendChild(btn);
    modalBodyEl.appendChild(msg);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent =
      "Costs: $1,000 → $10,000 → $100,000. First purchase widens the plot (+100px right); 2nd and 3rd add height (+100px down each). If purchase fails, read the red message below.";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "burner") {
    modalTitleEl.textContent = "Burner";
    const pick = state.ui.burnerSeedPick;
    const pct = Math.round(BURNER_REFUND_RATIO * 100);
    const boost = isBurnerBoostActive();

    const intro = document.createElement("div");
    intro.className = "small";
    intro.textContent = boost
      ? `Burner boost active: full seed shop price back per seed (e.g. carrot seed $${prices.carrotSeed} each).`
      : `Tick seed types to destroy all of that type in your inventory. You get ${pct}% of the matching crop sell value per seed (same prices as the Sell shop). Equip a Burner booster and press Space to enable 10s of boosted burns.`;
    modalBodyEl.appendChild(intro);

    const list = document.createElement("div");
    list.className = "list";

    const rows = [
      { key: "carrotSeed", label: "Carrot seeds", count: state.inventory.carrotSeed },
      { key: "strawberrySeed", label: "Strawberry seeds", count: state.inventory.strawberrySeed },
      { key: "beetrootSeed", label: "Beetroot seeds", count: state.inventory.beetrootSeed },
      { key: "appleSeed", label: "Apple seeds", count: state.inventory.appleSeed },
      { key: "lilySeed", label: "Lily seeds", count: state.inventory.lilySeed },
    ];

    for (const r of rows) {
      const row = document.createElement("label");
      row.className = "list-row";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.cursor = r.count <= 0 ? "default" : "pointer";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!pick[r.key];
      cb.disabled = r.count <= 0;
      cb.addEventListener("change", () => {
        state.ui.burnerSeedPick[r.key] = cb.checked;
        renderMenu();
      });

      const lab = document.createElement("span");
      lab.style.flex = "1";
      lab.textContent = `${r.label} (x${r.count})`;

      const refund = burnRefundForSeedType(r.key, r.count);
      const val = document.createElement("span");
      val.className = "small";
      val.textContent = r.count > 0 ? `~$${refund}` : "—";

      row.appendChild(cb);
      row.appendChild(lab);
      row.appendChild(val);
      list.appendChild(row);
    }
    modalBodyEl.appendChild(list);

    let selTotal = 0;
    if (pick.carrotSeed) selTotal += burnRefundForSeedType("carrotSeed", state.inventory.carrotSeed);
    if (pick.strawberrySeed) selTotal += burnRefundForSeedType("strawberrySeed", state.inventory.strawberrySeed);
    if (pick.beetrootSeed) selTotal += burnRefundForSeedType("beetrootSeed", state.inventory.beetrootSeed);
    if (pick.appleSeed) selTotal += burnRefundForSeedType("appleSeed", state.inventory.appleSeed);
    if (pick.lilySeed) selTotal += burnRefundForSeedType("lilySeed", state.inventory.lilySeed);

    const totalEl = document.createElement("div");
    totalEl.className = "small";
    totalEl.textContent = `Selected payout: $${selTotal}`;
    modalBodyEl.appendChild(totalEl);

    const burnBtn = document.createElement("button");
    burnBtn.className = "btn danger";
    burnBtn.type = "button";
    burnBtn.innerHTML = `<span>Burn selected</span><span class="small">Removes seeds · adds cash</span>`;
    burnBtn.addEventListener("click", () => {
      const p = state.ui.burnerSeedPick;
      let add = 0;
      let any = false;
      if (p.carrotSeed && state.inventory.carrotSeed > 0) {
        add += burnRefundForSeedType("carrotSeed", state.inventory.carrotSeed);
        state.inventory.carrotSeed = 0;
        any = true;
        if (state.player.held?.kind === "carrotSeed") state.player.held = null;
      }
      if (p.strawberrySeed && state.inventory.strawberrySeed > 0) {
        add += burnRefundForSeedType("strawberrySeed", state.inventory.strawberrySeed);
        state.inventory.strawberrySeed = 0;
        any = true;
        if (state.player.held?.kind === "strawberrySeed") state.player.held = null;
      }
      if (p.beetrootSeed && state.inventory.beetrootSeed > 0) {
        add += burnRefundForSeedType("beetrootSeed", state.inventory.beetrootSeed);
        state.inventory.beetrootSeed = 0;
        any = true;
        if (state.player.held?.kind === "beetrootSeed") state.player.held = null;
      }
      if (p.appleSeed && state.inventory.appleSeed > 0) {
        add += burnRefundForSeedType("appleSeed", state.inventory.appleSeed);
        state.inventory.appleSeed = 0;
        any = true;
        if (state.player.held?.kind === "appleSeed") state.player.held = null;
      }
      if (p.lilySeed && state.inventory.lilySeed > 0) {
        add += burnRefundForSeedType("lilySeed", state.inventory.lilySeed);
        state.inventory.lilySeed = 0;
        any = true;
        if (state.player.held?.kind === "lilySeed") state.player.held = null;
      }
      if (!any) return;
      setMoney(state.money + add);
      setHeldText();
      renderInventory();
      closeMenu();
    });
    modalBodyEl.appendChild(burnBtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent = "Stand by the Burner (above Expand) to open. Does not affect planted crops.";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "freezer") {
    modalTitleEl.textContent = "Freezer";
    const intro = document.createElement("div");
    intro.className = "small";
    intro.textContent =
      "Equip one harvested crop (not seeds). Press E while touching the blue tube to deposit 1. After 5 minutes, press E again at the freezer to claim a Frozen crop (×5 sell value).";
    modalBodyEl.appendChild(intro);

    const fz = state.freezer;
    const list = document.createElement("div");
    list.className = "list";
    if (!fz.cropKey) {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<span>Tube</span><span class="small">Empty</span>`;
      list.appendChild(row);
    } else if (state.timeMs < fz.readyAtMs) {
      const left = Math.max(0, fz.readyAtMs - state.timeMs);
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<span>Freezing ${FROZEN_BASE_LABELS[fz.cropKey] ?? fz.cropKey}…</span><span class="small">${(left / 60000).toFixed(1)} min left</span>`;
      list.appendChild(row);
    } else {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<span>Ready</span><span class="small">Press E at the freezer to claim</span>`;
      list.appendChild(row);
    }
    modalBodyEl.appendChild(list);

    const depBtn = document.createElement("button");
    depBtn.className = "btn primary";
    depBtn.type = "button";
    depBtn.innerHTML = `<span>Deposit 1 crop</span><span class="small">Uses equipped harvest</span>`;
    depBtn.disabled =
      !!fz.cropKey ||
      !state.player.held?.kind ||
      !isBackpackCropKey(state.player.held.kind) ||
      (state.inventory[state.player.held.kind] ?? 0) < 1;
    depBtn.addEventListener("click", () => {
      if (tryDepositFreezer()) renderMenu();
    });
    modalBodyEl.appendChild(depBtn);

    const claimBtn = document.createElement("button");
    claimBtn.className = "btn primary";
    claimBtn.type = "button";
    claimBtn.innerHTML = `<span>Claim frozen crop</span><span class="small">When ready</span>`;
    claimBtn.disabled = !fz.cropKey || state.timeMs < fz.readyAtMs;
    claimBtn.addEventListener("click", () => {
      if (fz.cropKey && state.timeMs >= fz.readyAtMs) {
        claimFrozenFromFreezer();
        renderMenu();
      }
    });
    modalBodyEl.appendChild(claimBtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent = "Unlocked after 3 plot expansions. Stand under the Sell shop (blue glass tube).";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "gears") {
    modalTitleEl.textContent = "Gears";

    const shovelBtn = document.createElement("button");
    shovelBtn.className = "btn primary";
    shovelBtn.type = "button";
    shovelBtn.innerHTML = `<span>Shovel</span><span class="small">$${prices.shovel} each · single use</span>`;
    attachShopBuyButtonWithBulk(
      shovelBtn,
      prices.shovel,
      () => {
        if (state.money < prices.shovel) return;
        state.inventory.shovel += 1;
        setMoney(state.money - prices.shovel);
        renderInventory();
        if (!state.player.held) selectInventoryItem("shovel");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.shovel;
        state.inventory.shovel += n;
        setMoney(state.money - cost);
        renderInventory();
        if (!state.player.held) selectInventoryItem("shovel");
      },
    );
    modalBodyEl.appendChild(shovelBtn);

    const boosterBtn = document.createElement("button");
    boosterBtn.className = "btn primary";
    boosterBtn.type = "button";
    boosterBtn.innerHTML = `<span>Burner booster</span><span class="small">$${prices.burnerBooster} · press Space to use</span>`;
    attachShopBuyButtonWithBulk(
      boosterBtn,
      prices.burnerBooster,
      () => {
        if (state.money < prices.burnerBooster) return;
        state.inventory.burnerBooster += 1;
        setMoney(state.money - prices.burnerBooster);
        renderInventory();
        if (!state.player.held) selectInventoryItem("burnerBooster");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.burnerBooster;
        state.inventory.burnerBooster += n;
        setMoney(state.money - cost);
        renderInventory();
        if (!state.player.held) selectInventoryItem("burnerBooster");
      },
    );
    modalBodyEl.appendChild(boosterBtn);

    const nukeBtn = document.createElement("button");
    nukeBtn.className = "btn danger";
    nukeBtn.type = "button";
    nukeBtn.innerHTML = `<span>Garden nuke</span><span class="small">$${prices.gearNuke} · equip · Space clears all plants</span>`;
    attachShopBuyButtonWithBulk(
      nukeBtn,
      prices.gearNuke,
      () => {
        if (state.money < prices.gearNuke) return;
        state.inventory.gearNuke += 1;
        setMoney(state.money - prices.gearNuke);
        renderInventory();
        if (!state.player.held) selectInventoryItem("gearNuke");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.gearNuke;
        state.inventory.gearNuke += n;
        setMoney(state.money - cost);
        renderInventory();
        if (!state.player.held) selectInventoryItem("gearNuke");
      },
    );
    modalBodyEl.appendChild(nukeBtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent =
      "Shovel: dig crops on the field (uses 1 per dig). Burner booster: equip and press Space to start 10s — during that time, burning seeds at the Burner refunds full seed shop price. Garden nuke: equip and press Space for one big clear + explosion (uses 1 per blast). Hold buy 3s for bulk. ";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "seeds") {
    modalTitleEl.textContent = "Seeds";
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.type = "button";
    btn.innerHTML = `<span>Carrot Seed</span><span class="small">$${prices.carrotSeed}</span>`;
    attachShopBuyButtonWithBulk(
      btn,
      prices.carrotSeed,
      () => {
        if (state.money < prices.carrotSeed) return;
        setMoney(state.money - prices.carrotSeed);
        state.inventory.carrotSeed += 1;
        renderInventory();
        if (!state.player.held) selectInventoryItem("carrotSeed");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.carrotSeed;
        setMoney(state.money - cost);
        state.inventory.carrotSeed += n;
        renderInventory();
        if (!state.player.held) selectInventoryItem("carrotSeed");
      },
    );
    modalBodyEl.appendChild(btn);

    const sbtn = document.createElement("button");
    sbtn.className = "btn primary";
    sbtn.type = "button";
    sbtn.innerHTML = `<span>Strawberry Seed</span><span class="small">$${prices.strawberrySeed}</span>`;
    attachShopBuyButtonWithBulk(
      sbtn,
      prices.strawberrySeed,
      () => {
        if (state.money < prices.strawberrySeed) return;
        setMoney(state.money - prices.strawberrySeed);
        state.inventory.strawberrySeed += 1;
        renderInventory();
        if (!state.player.held) selectInventoryItem("strawberrySeed");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.strawberrySeed;
        setMoney(state.money - cost);
        state.inventory.strawberrySeed += n;
        renderInventory();
        if (!state.player.held) selectInventoryItem("strawberrySeed");
      },
    );
    modalBodyEl.appendChild(sbtn);

    const bbtn = document.createElement("button");
    bbtn.className = "btn primary";
    bbtn.type = "button";
    bbtn.innerHTML = `<span>Beetroot Seed</span><span class="small">$${prices.beetrootSeed}</span>`;
    attachShopBuyButtonWithBulk(
      bbtn,
      prices.beetrootSeed,
      () => {
        if (state.money < prices.beetrootSeed) return;
        setMoney(state.money - prices.beetrootSeed);
        state.inventory.beetrootSeed += 1;
        renderInventory();
        if (!state.player.held) selectInventoryItem("beetrootSeed");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.beetrootSeed;
        setMoney(state.money - cost);
        state.inventory.beetrootSeed += n;
        renderInventory();
        if (!state.player.held) selectInventoryItem("beetrootSeed");
      },
    );
    modalBodyEl.appendChild(bbtn);

    const abtn = document.createElement("button");
    abtn.className = "btn primary";
    abtn.type = "button";
    abtn.innerHTML = `<span>Apple Seed</span><span class="small">$${prices.appleSeed}</span>`;
    attachShopBuyButtonWithBulk(
      abtn,
      prices.appleSeed,
      () => {
        if (state.money < prices.appleSeed) return;
        setMoney(state.money - prices.appleSeed);
        state.inventory.appleSeed += 1;
        renderInventory();
        if (!state.player.held) selectInventoryItem("appleSeed");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.appleSeed;
        setMoney(state.money - cost);
        state.inventory.appleSeed += n;
        renderInventory();
        if (!state.player.held) selectInventoryItem("appleSeed");
      },
    );
    modalBodyEl.appendChild(abtn);

    const lbtn = document.createElement("button");
    lbtn.className = "btn primary";
    lbtn.type = "button";
    lbtn.innerHTML = `<span>Lily Seed</span><span class="small">$${prices.lilySeed}</span>`;
    attachShopBuyButtonWithBulk(
      lbtn,
      prices.lilySeed,
      () => {
        if (state.money < prices.lilySeed) return;
        setMoney(state.money - prices.lilySeed);
        state.inventory.lilySeed += 1;
        renderInventory();
        if (!state.player.held) selectInventoryItem("lilySeed");
      },
      (n) => {
        if (n <= 0) return;
        const cost = n * prices.lilySeed;
        setMoney(state.money - cost);
        state.inventory.lilySeed += n;
        renderInventory();
        if (!state.player.held) selectInventoryItem("lilySeed");
      },
    );
    modalBodyEl.appendChild(lbtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent =
      "Hold a buy button 3 seconds to buy as many of that item as you can afford. Press WASD/Arrows to close (after 1 second).";
    modalBodyEl.appendChild(note);
    return;
  }

  if (state.ui.openMenu === "sell") {
    modalTitleEl.textContent = "Sell Shop";

    const list = document.createElement("div");
    list.className = "list";

    const baseSellItems = [
      { key: "carrot1", label: "Carrot", count: state.inventory.carrot1, price: getCarrotSellPrice(1) },
      { key: "carrot2", label: "Carrot ×2", count: state.inventory.carrot2, price: getCarrotSellPrice(2) },
      { key: "carrot10", label: "Carrot ×10", count: state.inventory.carrot10, price: getCarrotSellPrice(10) },
      { key: "strawberry1", label: "Strawberry", count: state.inventory.strawberry1, price: getCarrotSellPrice(1) },
      { key: "strawberry2", label: "Strawberry ×2", count: state.inventory.strawberry2, price: getCarrotSellPrice(2) },
      { key: "strawberry10", label: "Strawberry ×10", count: state.inventory.strawberry10, price: getCarrotSellPrice(10) },
      { key: "beetroot1", label: "Beetroot", count: state.inventory.beetroot1, price: getBeetrootSellPrice(1) },
      { key: "beetroot2", label: "Beetroot ×2", count: state.inventory.beetroot2, price: getBeetrootSellPrice(2) },
      { key: "beetroot10", label: "Beetroot ×10", count: state.inventory.beetroot10, price: getBeetrootSellPrice(10) },
      { key: "apple1", label: "Apple", count: state.inventory.apple1, price: getAppleSellPrice(1) },
      { key: "apple2", label: "Apple ×2", count: state.inventory.apple2, price: getAppleSellPrice(2) },
      { key: "apple10", label: "Apple ×10", count: state.inventory.apple10, price: getAppleSellPrice(10) },
      { key: "lily1", label: "Lily", count: state.inventory.lily1, price: getLilySellPrice(1) },
      { key: "lily2", label: "Lily ×2", count: state.inventory.lily2, price: getLilySellPrice(2) },
      { key: "lily10", label: "Lily ×10", count: state.inventory.lily10, price: getLilySellPrice(10) },
    ];
    const frozenSellItems = FROZEN_CROP_KEYS.map((fk) => ({
      key: fk,
      label: frozenCropDisplayLabel(fk),
      count: state.inventory[fk] ?? 0,
      price: getFrozenCropSellPrice(fk),
      frozen: true,
    }));
    const items = [...baseSellItems, ...frozenSellItems].filter((i) => i.count > 0);

    if (items.every((i) => i.count === 0)) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "You don't have any plants to sell yet.";
      list.appendChild(empty);
    } else {
      for (const it of items) {
        const row = document.createElement("div");
        row.className = "list-row";
        const sellN = it.frozen ? it.count : sellableCropCount(it.key);
        const total = sellN * it.price;
        const favTag =
          !it.frozen && state.backpackFavorites?.[it.key] ? ` <span class="small">(♥ kept)</span>` : "";
        row.innerHTML = `<span>${it.label} × ${it.count}${favTag}</span><span class="small">$${total}</span>`;
        list.appendChild(row);
      }
    }

    modalBodyEl.appendChild(list);

    const sellAllBtn = document.createElement("button");
    sellAllBtn.className = "btn danger";
    sellAllBtn.type = "button";
    const total =
      sellableCropCount("carrot1") * getCarrotSellPrice(1) +
      sellableCropCount("carrot2") * getCarrotSellPrice(2) +
      sellableCropCount("carrot10") * getCarrotSellPrice(10);
    const stTotal =
      sellableCropCount("strawberry1") * getCarrotSellPrice(1) +
      sellableCropCount("strawberry2") * getCarrotSellPrice(2) +
      sellableCropCount("strawberry10") * getCarrotSellPrice(10);
    const btTotal =
      sellableCropCount("beetroot1") * getBeetrootSellPrice(1) +
      sellableCropCount("beetroot2") * getBeetrootSellPrice(2) +
      sellableCropCount("beetroot10") * getBeetrootSellPrice(10);
    const apTotal =
      sellableCropCount("apple1") * getAppleSellPrice(1) +
      sellableCropCount("apple2") * getAppleSellPrice(2) +
      sellableCropCount("apple10") * getAppleSellPrice(10);
    const liTotal =
      sellableCropCount("lily1") * getLilySellPrice(1) +
      sellableCropCount("lily2") * getLilySellPrice(2) +
      sellableCropCount("lily10") * getLilySellPrice(10);
    const fzTotal = FROZEN_CROP_KEYS.reduce(
      (s, fk) => s + (state.inventory[fk] ?? 0) * getFrozenCropSellPrice(fk),
      0,
    );
    sellAllBtn.innerHTML = `<span>Sell All</span><span class="small">+$${total + stTotal + btTotal + apTotal + liTotal + fzTotal}</span>`;
    sellAllBtn.addEventListener("click", () => {
      const totalNow =
        sellableCropCount("carrot1") * getCarrotSellPrice(1) +
        sellableCropCount("carrot2") * getCarrotSellPrice(2) +
        sellableCropCount("carrot10") * getCarrotSellPrice(10);
      const stTotalNow =
        sellableCropCount("strawberry1") * getCarrotSellPrice(1) +
        sellableCropCount("strawberry2") * getCarrotSellPrice(2) +
        sellableCropCount("strawberry10") * getCarrotSellPrice(10);
      const btTotalNow =
        sellableCropCount("beetroot1") * getBeetrootSellPrice(1) +
        sellableCropCount("beetroot2") * getBeetrootSellPrice(2) +
        sellableCropCount("beetroot10") * getBeetrootSellPrice(10);
      const apTotalNow =
        sellableCropCount("apple1") * getAppleSellPrice(1) +
        sellableCropCount("apple2") * getAppleSellPrice(2) +
        sellableCropCount("apple10") * getAppleSellPrice(10);
      const liTotalNow =
        sellableCropCount("lily1") * getLilySellPrice(1) +
        sellableCropCount("lily2") * getLilySellPrice(2) +
        sellableCropCount("lily10") * getLilySellPrice(10);
      const fzTotalNow = FROZEN_CROP_KEYS.reduce(
        (s, fk) => s + (state.inventory[fk] ?? 0) * getFrozenCropSellPrice(fk),
        0,
      );
      const grand = totalNow + stTotalNow + btTotalNow + apTotalNow + liTotalNow + fzTotalNow;
      if (grand <= 0) return;
      for (const key of BACKPACK_CROP_KEYS) {
        if (state.backpackFavorites?.[key]) continue;
        state.inventory[key] = 0;
      }
      for (const fk of FROZEN_CROP_KEYS) state.inventory[fk] = 0;
      const hk = state.player.held?.kind;
      if (hk && isBackpackCropKey(hk) && (state.inventory[hk] ?? 0) <= 0) state.player.held = null;
      if (hk && isFrozenInventoryKey(hk) && (state.inventory[hk] ?? 0) <= 0) state.player.held = null;
      setHeldText();
      setMoney(state.money + grand);
      renderInventory();
      renderMenu();
    });
    modalBodyEl.appendChild(sellAllBtn);

    const note = document.createElement("div");
    note.className = "small";
    note.textContent = "Touch the Sell shop to open this menu. Press WASD/Arrows to close (after 1 second).";
    modalBodyEl.appendChild(note);
  }
}

function renderInventory() {
  inventoryEl.innerHTML = "";

  const items = [
    { key: "carrotSeed", label: "Carrot Seed", count: state.inventory.carrotSeed, chip: "#ff8a2b" },
    { key: "strawberrySeed", label: "Strawberry Seed", count: state.inventory.strawberrySeed, chip: "#ff3b4f" },
    { key: "beetrootSeed", label: "Beetroot Seed", count: state.inventory.beetrootSeed, chip: "#b13b5a" },
    { key: "appleSeed", label: "Apple Seed", count: state.inventory.appleSeed, chip: "#5a9e3e" },
    { key: "lilySeed", label: "Lily Seed", count: state.inventory.lilySeed, chip: "#e8a8d8" },
    { key: "shovel", label: "Shovel", count: state.inventory.shovel, chip: "#9aa3c4" },
    { key: "gearNuke", label: "Garden nuke", count: state.inventory.gearNuke, chip: "#ff5533" },
    { key: "burnerBooster", label: "Burner booster", count: state.inventory.burnerBooster, chip: "#ff9a4a" },
    { key: "carrot1", label: "Carrot", count: state.inventory.carrot1, chip: "#ff8a2b" },
    { key: "carrot2", label: "Carrot ×2", count: state.inventory.carrot2, chip: "#ffb13b" },
    { key: "carrot10", label: "Carrot ×10", count: state.inventory.carrot10, chip: "#ffd86b" },
    { key: "strawberry1", label: "Strawberry", count: state.inventory.strawberry1, chip: "#ff4a4a" },
    { key: "strawberry2", label: "Strawberry ×2", count: state.inventory.strawberry2, chip: "#ff6b6b" },
    { key: "strawberry10", label: "Strawberry ×10", count: state.inventory.strawberry10, chip: "#ff8a8a" },
    { key: "beetroot1", label: "Beetroot", count: state.inventory.beetroot1, chip: "#b13b5a" },
    { key: "beetroot2", label: "Beetroot ×2", count: state.inventory.beetroot2, chip: "#d15a7a" },
    { key: "beetroot10", label: "Beetroot ×10", count: state.inventory.beetroot10, chip: "#f08aa4" },
    { key: "apple1", label: "Apple", count: state.inventory.apple1, chip: "#e02020" },
    { key: "apple2", label: "Apple ×2", count: state.inventory.apple2, chip: "#ff4444" },
    { key: "apple10", label: "Apple ×10", count: state.inventory.apple10, chip: "#ff6666" },
    { key: "lily1", label: "Lily", count: state.inventory.lily1, chip: "#f0c8e8" },
    { key: "lily2", label: "Lily ×2", count: state.inventory.lily2, chip: "#f5a8d8" },
    { key: "lily10", label: "Lily ×10", count: state.inventory.lily10, chip: "#ff88c8" },
    ...FROZEN_CROP_KEYS.map((fk) => ({
      key: fk,
      label: frozenCropDisplayLabel(fk),
      count: state.inventory[fk] ?? 0,
      chip: "#a8dcff",
    })),
  ];

  for (const it of items) {
    if (it.count <= 0) continue;
    const el = document.createElement("div");
    el.className = "inv-item";
    if (state.player.held?.kind === it.key) el.classList.add("selected");
    el.innerHTML = `
      <span class="chip" style="background:${it.chip}"></span>
      <span class="inv-name">${it.label}</span>
      <span class="inv-count">x${it.count}</span>
    `;

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectInventoryItem(it.key);
    });
    inventoryEl.appendChild(el);
  }

  setHeldText();
}

function selectInventoryItem(key) {
  // Only allow selecting if you have at least 1
  if (key === "carrotSeed" && state.inventory.carrotSeed <= 0) return;
  if (key === "strawberrySeed" && state.inventory.strawberrySeed <= 0) return;
  if (key === "beetrootSeed" && state.inventory.beetrootSeed <= 0) return;
  if (key === "appleSeed" && state.inventory.appleSeed <= 0) return;
  if (key === "shovel" && state.inventory.shovel <= 0) return;
  if (key === "gearNuke" && state.inventory.gearNuke <= 0) return;
  if (key === "burnerBooster" && state.inventory.burnerBooster <= 0) return;
  if (key === "carrot1" && state.inventory.carrot1 <= 0) return;
  if (key === "carrot2" && state.inventory.carrot2 <= 0) return;
  if (key === "carrot10" && state.inventory.carrot10 <= 0) return;
  if (key === "strawberry1" && state.inventory.strawberry1 <= 0) return;
  if (key === "strawberry2" && state.inventory.strawberry2 <= 0) return;
  if (key === "strawberry10" && state.inventory.strawberry10 <= 0) return;
  if (key === "beetroot1" && state.inventory.beetroot1 <= 0) return;
  if (key === "beetroot2" && state.inventory.beetroot2 <= 0) return;
  if (key === "beetroot10" && state.inventory.beetroot10 <= 0) return;
  if (key === "apple1" && state.inventory.apple1 <= 0) return;
  if (key === "apple2" && state.inventory.apple2 <= 0) return;
  if (key === "apple10" && state.inventory.apple10 <= 0) return;
  if (key === "lilySeed" && state.inventory.lilySeed <= 0) return;
  if (key === "lily1" && state.inventory.lily1 <= 0) return;
  if (key === "lily2" && state.inventory.lily2 <= 0) return;
  if (key === "lily10" && state.inventory.lily10 <= 0) return;
  if (isFrozenInventoryKey(key) && (state.inventory[key] ?? 0) <= 0) return;
  state.player.held = { kind: key };
  setHeldText();
  renderInventory();
  saveGame();
}

function plantAtPlayer() {
  if (state.player.held?.kind === "burnerBooster") return;
  if (
    !state.player.held ||
    (state.player.held.kind !== "carrotSeed" &&
      state.player.held.kind !== "strawberrySeed" &&
      state.player.held.kind !== "beetrootSeed" &&
      state.player.held.kind !== "appleSeed" &&
      state.player.held.kind !== "lilySeed")
  )
    return;
  // must be in farm area
  if (state.player.x > world.farm.w - 8) return;
  if (state.player.held.kind === "carrotSeed" && state.inventory.carrotSeed <= 0) return;
  if (state.player.held.kind === "strawberrySeed" && state.inventory.strawberrySeed <= 0) return;
  if (state.player.held.kind === "beetrootSeed" && state.inventory.beetrootSeed <= 0) return;
  if (state.player.held.kind === "appleSeed" && state.inventory.appleSeed <= 0) return;
  if (state.player.held.kind === "lilySeed" && state.inventory.lilySeed <= 0) return;

  if (state.player.held.kind === "carrotSeed") state.inventory.carrotSeed -= 1;
  else if (state.player.held.kind === "strawberrySeed") state.inventory.strawberrySeed -= 1;
  else if (state.player.held.kind === "beetrootSeed") state.inventory.beetrootSeed -= 1;
  else if (state.player.held.kind === "appleSeed") state.inventory.appleSeed -= 1;
  else state.inventory.lilySeed -= 1;
  renderInventory();

  const id = crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  const multiplier = rollCarrotMultiplier();
  const type =
    state.player.held.kind === "strawberrySeed"
      ? "strawberry"
      : state.player.held.kind === "beetrootSeed"
        ? "beetroot"
        : state.player.held.kind === "appleSeed"
          ? "apple"
          : state.player.held.kind === "lilySeed"
            ? "lily"
            : "carrot";
  state.plants.push({
    id,
    type,
    x: clamp(state.player.x, 18, world.farm.w - 18),
    y: clamp(state.player.y, 18, world.farm.h - 18),
    plantedAtMs: state.timeMs,
    stage: 0, // 0 invisible, 1 half, 2 full
    harvested: false,
    multiplier,
    ...(type === "strawberry"
      ? {
          fruits: [
            { nextGrowAtMs: state.timeMs + 5000 + 3000 },
            { nextGrowAtMs: state.timeMs + 5000 + 3000 },
          ],
        }
      : type === "apple"
        ? {
            fruits: Array.from({ length: APPLE_FRUIT_SLOTS }, () => ({
              nextGrowAtMs: state.timeMs + APPLE_TREE_GROW_MS + APPLE_FRUIT_REGROW_MS,
            })),
          }
        : {}),
  });
  saveGame();

  // If out of seeds, stop holding it
  const out =
    (type === "carrot" && state.inventory.carrotSeed <= 0) ||
    (type === "strawberry" && state.inventory.strawberrySeed <= 0) ||
    (type === "beetroot" && state.inventory.beetrootSeed <= 0) ||
    (type === "apple" && state.inventory.appleSeed <= 0) ||
    (type === "lily" && state.inventory.lilySeed <= 0);
  if (out) {
    state.player.held = null;
    renderInventory();
    saveGame();
  }
}

const SPACE_HOLD_MASS_PLANT_MS = 3000;

/** After holding Space 3s: plant every seed of the equipped seed type on the player's tile (same x/y as single plant). */
function plantAllHeldSeedsAtPlayer() {
  const held = state.player.held;
  if (
    !held ||
    (held.kind !== "carrotSeed" &&
      held.kind !== "strawberrySeed" &&
      held.kind !== "beetrootSeed" &&
      held.kind !== "appleSeed" &&
      held.kind !== "lilySeed")
  )
    return true;
  if (state.player.x > world.farm.w - 8) return true;

  const kind = held.kind;
  const n =
    kind === "carrotSeed"
      ? state.inventory.carrotSeed
      : kind === "strawberrySeed"
        ? state.inventory.strawberrySeed
        : kind === "beetrootSeed"
          ? state.inventory.beetrootSeed
          : kind === "appleSeed"
            ? state.inventory.appleSeed
            : state.inventory.lilySeed;
  if (n <= 0) return true;

  const type =
    kind === "strawberrySeed"
      ? "strawberry"
      : kind === "beetrootSeed"
        ? "beetroot"
        : kind === "appleSeed"
          ? "apple"
          : kind === "lilySeed"
            ? "lily"
            : "carrot";
  const x = clamp(state.player.x, 18, world.farm.w - 18);
  const y = clamp(state.player.y, 18, world.farm.h - 18);

  for (let i = 0; i < n; i++) {
    const id = crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    const multiplier = rollCarrotMultiplier();
    state.plants.push({
      id,
      type,
      x,
      y,
      plantedAtMs: state.timeMs,
      stage: 0,
      harvested: false,
      multiplier,
      ...(type === "strawberry"
        ? {
            fruits: [
              { nextGrowAtMs: state.timeMs + 5000 + 3000 },
              { nextGrowAtMs: state.timeMs + 5000 + 3000 },
            ],
          }
        : type === "apple"
          ? {
              fruits: Array.from({ length: APPLE_FRUIT_SLOTS }, () => ({
                nextGrowAtMs: state.timeMs + APPLE_TREE_GROW_MS + APPLE_FRUIT_REGROW_MS,
              })),
            }
          : {}),
    });
  }

  if (kind === "carrotSeed") state.inventory.carrotSeed = 0;
  else if (kind === "strawberrySeed") state.inventory.strawberrySeed = 0;
  else if (kind === "beetrootSeed") state.inventory.beetrootSeed = 0;
  else if (kind === "appleSeed") state.inventory.appleSeed = 0;
  else state.inventory.lilySeed = 0;
  state.player.held = null;
  renderInventory();
  saveGame();
  return true;
}

function tryDigWithShovelAt(gx, gy) {
  if (state.ui.openMenu) return false;
  if (state.player.held?.kind !== "shovel") return false;
  if (state.inventory.shovel <= 0) {
    state.player.held = null;
    setHeldText();
    renderInventory();
    saveGame();
    return false;
  }
  if (gx < 0 || gx >= world.farm.w || gy < 0 || gy >= world.farm.h) return false;

  const hitR = 52;
  let best = null;
  let bestD = Infinity;
  for (const p of state.plants) {
    if (p.harvested) continue;
    const d = dist(gx, gy, p.x, p.y);
    if (d < hitR && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) return false;

  state.plants = state.plants.filter((p) => p.id !== best.id);
  state.inventory.shovel -= 1;
  state.player.held = null;
  renderInventory();
  saveGame();
  return true;
}

function tryPickupNearby() {
  // pick up fully grown crops (carrot/strawberry fruit)
  for (const p of state.plants) {
    if (p.harvested) continue;
    const mul = p.multiplier ?? 1;
    const pickupRadius = 28 + (mul - 1) * 18; // bigger carrots can be harvested farther
    if (p.type === "strawberry") {
      // must be a grown bush (5s), then fruits can be picked when ready
      const bushAge = state.timeMs - p.plantedAtMs;
      if (bushAge < 5000) continue;
      const fruitOffsets = [
        { x: -14 * mul, y: -10 * mul },
        { x: 14 * mul, y: -8 * mul },
      ];
      for (let i = 0; i < 2; i++) {
        const f = p.fruits?.[i];
        if (!f) continue;
        if (state.timeMs < f.nextGrowAtMs) continue;
        const fx = p.x + fruitOffsets[i].x;
        const fy = p.y + fruitOffsets[i].y;
        const fruitPickupRadius = pickupRadius + 8 * mul;
        if (dist(state.player.x, state.player.y, fx, fy) > fruitPickupRadius) continue;

        // harvest fruit
        f.nextGrowAtMs = state.timeMs + 3000; // regrow in 3s
        if (mul === 10) state.inventory.strawberry10 += 1;
        else if (mul === 2) state.inventory.strawberry2 += 1;
        else state.inventory.strawberry1 += 1;
        state.player.held = { kind: `strawberry${mul}` };
        renderInventory();
        saveGame();
        return;
      }
      continue;
    }

    if (p.type === "apple") {
      const treeAge = state.timeMs - p.plantedAtMs;
      if (treeAge < APPLE_TREE_GROW_MS) continue;
      const fruitOffsets = [
        { x: -16 * mul, y: -22 * mul },
        { x: 0, y: -26 * mul },
        { x: 16 * mul, y: -20 * mul },
      ];
      for (let i = 0; i < APPLE_FRUIT_SLOTS; i++) {
        const f = p.fruits?.[i];
        if (!f) continue;
        if (state.timeMs < f.nextGrowAtMs) continue;
        const fx = p.x + fruitOffsets[i].x;
        const fy = p.y + fruitOffsets[i].y;
        const fruitPickupRadius = pickupRadius + 10 * mul;
        if (dist(state.player.x, state.player.y, fx, fy) > fruitPickupRadius) continue;

        f.nextGrowAtMs = state.timeMs + APPLE_FRUIT_REGROW_MS;
        if (mul === 10) state.inventory.apple10 += 1;
        else if (mul === 2) state.inventory.apple2 += 1;
        else state.inventory.apple1 += 1;
        state.player.held = { kind: `apple${mul}` };
        renderInventory();
        saveGame();
        return;
      }
      continue;
    }

    // carrot
    if (p.stage < 2) continue;
    if (dist(state.player.x, state.player.y, p.x, p.y) > pickupRadius) continue;

    p.harvested = true;
    if (p.type === "beetroot") {
      if (mul === 10) state.inventory.beetroot10 += 1;
      else if (mul === 2) state.inventory.beetroot2 += 1;
      else state.inventory.beetroot1 += 1;
      state.player.held = { kind: `beetroot${mul}` };
    } else if (p.type === "lily") {
      if (mul === 10) state.inventory.lily10 += 1;
      else if (mul === 2) state.inventory.lily2 += 1;
      else state.inventory.lily1 += 1;
      state.player.held = { kind: `lily${mul}` };
    } else {
      if (mul === 10) state.inventory.carrot10 += 1;
      else if (mul === 2) state.inventory.carrot2 += 1;
      else state.inventory.carrot1 += 1;
      state.player.held = { kind: `carrot${mul}` }; // carrot1/carrot2/carrot10
    }
    renderInventory();
    saveGame();
    return;
  }
}

const E_HOLD_MASS_PICKUP_MS = 3000;

/** After holding E 3s: harvest every ready crop/strawberry fruit in pickup range. Clears held; adds all to inventory. */
function pickupAllReadyTouchingPlayer() {
  if (state.ui.openMenu) return true;

  const px = state.player.x;
  const py = state.player.y;
  let any = false;

  for (const p of state.plants) {
    if (p.harvested) continue;
    if (p.type !== "strawberry") continue;
    const bushAge = state.timeMs - p.plantedAtMs;
    if (bushAge < 5000) continue;
    const mul = p.multiplier ?? 1;
    const pickupRadius = 28 + (mul - 1) * 18;
    const fruitOffsets = [
      { x: -14 * mul, y: -10 * mul },
      { x: 14 * mul, y: -8 * mul },
    ];
    for (let i = 0; i < 2; i++) {
      const f = p.fruits?.[i];
      if (!f) continue;
      if (state.timeMs < f.nextGrowAtMs) continue;
      const fx = p.x + fruitOffsets[i].x;
      const fy = p.y + fruitOffsets[i].y;
      const fruitPickupRadius = pickupRadius + 8 * mul;
      if (dist(px, py, fx, fy) > fruitPickupRadius) continue;

      f.nextGrowAtMs = state.timeMs + 3000;
      if (mul === 10) state.inventory.strawberry10 += 1;
      else if (mul === 2) state.inventory.strawberry2 += 1;
      else state.inventory.strawberry1 += 1;
      any = true;
    }
  }

  for (const p of state.plants) {
    if (p.harvested) continue;
    if (p.type !== "apple") continue;
    const treeAge = state.timeMs - p.plantedAtMs;
    if (treeAge < APPLE_TREE_GROW_MS) continue;
    const mul = p.multiplier ?? 1;
    const pickupRadius = 28 + (mul - 1) * 18;
    const fruitOffsets = [
      { x: -16 * mul, y: -22 * mul },
      { x: 0, y: -26 * mul },
      { x: 16 * mul, y: -20 * mul },
    ];
    for (let i = 0; i < APPLE_FRUIT_SLOTS; i++) {
      const f = p.fruits?.[i];
      if (!f) continue;
      if (state.timeMs < f.nextGrowAtMs) continue;
      const fx = p.x + fruitOffsets[i].x;
      const fy = p.y + fruitOffsets[i].y;
      const fruitPickupRadius = pickupRadius + 10 * mul;
      if (dist(px, py, fx, fy) > fruitPickupRadius) continue;

      f.nextGrowAtMs = state.timeMs + APPLE_FRUIT_REGROW_MS;
      if (mul === 10) state.inventory.apple10 += 1;
      else if (mul === 2) state.inventory.apple2 += 1;
      else state.inventory.apple1 += 1;
      any = true;
    }
  }

  for (const p of state.plants) {
    if (p.harvested) continue;
    if (p.type === "strawberry" || p.type === "apple") continue;
    if (p.stage < 2) continue;
    const mul = p.multiplier ?? 1;
    const pickupRadius = 28 + (mul - 1) * 18;
    if (dist(px, py, p.x, p.y) > pickupRadius) continue;

    p.harvested = true;
    if (p.type === "beetroot") {
      if (mul === 10) state.inventory.beetroot10 += 1;
      else if (mul === 2) state.inventory.beetroot2 += 1;
      else state.inventory.beetroot1 += 1;
    } else if (p.type === "lily") {
      if (mul === 10) state.inventory.lily10 += 1;
      else if (mul === 2) state.inventory.lily2 += 1;
      else state.inventory.lily1 += 1;
    } else {
      if (mul === 10) state.inventory.carrot10 += 1;
      else if (mul === 2) state.inventory.carrot2 += 1;
      else state.inventory.carrot1 += 1;
    }
    any = true;
  }

  if (any) {
    state.player.held = null;
    renderInventory();
    saveGame();
  }
  return true;
}

// Shops positions (gears above seeds in the right column). Burner sits above Expand with a gap.
const shops = {
  gears: { x: 0, y: 20, w: 0, h: 115, label: "GEARS" },
  seeds: { x: 0, y: 145, w: 0, h: 115, label: "SEEDS" },
  sell: { x: 0, y: 270, w: 0, h: 115, label: "SELL" },
  freezer: { x: 0, y: 0, w: 0, h: 58, label: "FREEZER" },
  burner: { x: 0, y: 0, w: 0, h: 56, label: "BURNER" },
  expand: { x: 0, y: 490, w: 0, h: 70, label: "EXPAND PLOT" },
};

function recomputeShopRects() {
  const inset = Math.min(30, Math.max(18, Math.floor(world.shops.w * 0.12)));
  const w = Math.max(100, world.shops.w - inset * 2);
  shops.gears.x = world.shops.x + inset;
  shops.gears.w = w;
  shops.seeds.x = world.shops.x + inset;
  shops.seeds.w = w;
  shops.sell.x = world.shops.x + inset;
  shops.sell.w = w;
  shops.expand.x = world.shops.x + inset;
  shops.expand.w = w;
  shops.expand.y = H - shops.expand.h - 20;
  const gapAboveExpand = 12;
  const gapStack = 8;
  const burnerH = 56;
  /** Short tube so it fits between Sell (fixed y) and Burner on small canvases. */
  const freezerH = 48;
  shops.burner.w = w;
  shops.burner.x = world.shops.x + inset;
  shops.burner.h = burnerH;
  shops.burner.y = shops.expand.y - gapAboveExpand - burnerH;
  if (freezerUnlocked()) {
    shops.freezer.x = world.shops.x + inset;
    shops.freezer.w = w;
    shops.freezer.h = freezerH;
    shops.freezer.y = shops.burner.y - gapStack - freezerH;
  } else {
    shops.freezer.x = world.shops.x + inset;
    shops.freezer.w = 0;
    shops.freezer.h = 0;
    shops.freezer.y = -9999;
  }
}

const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);

  // Backpack toggle (B)
  if (k === "b") {
    state.timeMs = Date.now();
    if (state.ui.openMenu === "backpack") closeMenu();
    else openMenu("backpack");
  }

  // Settings: close with Esc only (not movement keys)
  if (k === "escape" && state.ui.openMenu === "settings") {
    e.preventDefault();
    closeMenu();
  }

  // Other menus: movement keys close (after 1s), but not while Settings is open
  if (
    ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(k) &&
    state.ui.openMenu &&
    state.ui.openMenu !== "settings"
  ) {
    const elapsed = state.timeMs - state.ui.menuOpenedAtMs;
    if (elapsed >= 1000) closeMenu();
  }

  // Prevent page scroll with space / arrows
  if (k === " " || e.code === "Space") e.preventDefault();
  if (["arrowup", "arrowleft", "arrowdown", "arrowright"].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/** Mouse position in game space (farm hover tooltips). */
const pointerCanvas = { x: 0, y: 0, active: false };
canvas.addEventListener("pointermove", (e) => {
  const pos = canvasPointerToGame(e.clientX, e.clientY);
  pointerCanvas.x = pos.x;
  pointerCanvas.y = pos.y;
  pointerCanvas.active = true;
});
canvas.addEventListener("pointerleave", () => {
  pointerCanvas.active = false;
});

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const { x, y } = canvasPointerToGame(e.clientX, e.clientY);
  if (tryDigWithShovelAt(x, y)) e.preventDefault();
});

settingsBtn?.addEventListener("click", () => {
  state.timeMs = Date.now();
  if (state.ui.openMenu === "settings") closeMenu();
  else openMenu("settings");
});

// Main loop
let lastTs = performance.now();
function tick(ts) {
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  state.timeMs = Date.now(); // use real time so growth persists across reloads

  update(dt);
  draw();
  requestAnimationFrame(tick);
}

function update(dt) {
  // update player velocity
  let vx = 0,
    vy = 0;
  if (!state.ui.openMenu) {
    if (keys.has("w") || keys.has("arrowup")) vy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) vy += 1;
    if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
    if (keys.has("d") || keys.has("arrowright")) vx += 1;
  }
  const len = Math.hypot(vx, vy) || 1;
  vx /= len;
  vy /= len;

  state.player.vx = vx * state.player.speed;
  state.player.vy = vy * state.player.speed;

  // movement
  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;

  // bounds
  state.player.x = clamp(state.player.x, state.player.r, W - state.player.r);
  state.player.y = clamp(state.player.y, state.player.r, H - state.player.r);

  // planting (Space) - only when menu closed
  const spacePressed = keys.has(" ") || keys.has("space");
  if (spacePressed && !state.ui.openMenu) {
    if (state.player.held?.kind === "gearNuke") {
      if (!update._spaceLatch) {
        update._spaceLatch = true;
        if (state.inventory.gearNuke > 0) triggerGardenNuke();
      }
    } else if (state.player.held?.kind === "burnerBooster") {
      if (!update._spaceLatch) {
        update._spaceLatch = true;
        if (state.inventory.burnerBooster > 0) {
          state.inventory.burnerBooster -= 1;
          state.burnerBoostUntilMs = state.timeMs + BURNER_BOOST_DURATION_MS;
          state.player.held = null;
          renderInventory();
          saveGame();
        } else {
          state.player.held = null;
          setHeldText();
          renderInventory();
        }
      }
    } else {
      if (!update._spaceHoldActive) {
        update._spaceHoldActive = true;
        update._spaceHoldStartMs = state.timeMs;
        update._spaceMassPlanted = false;
      }
      if (!update._spaceLatch) {
        update._spaceLatch = true;
        plantAtPlayer();
      }
      if (
        !update._spaceMassPlanted &&
        state.timeMs - update._spaceHoldStartMs >= SPACE_HOLD_MASS_PLANT_MS
      ) {
        if (plantAllHeldSeedsAtPlayer()) update._spaceMassPlanted = true;
      }
    }
  } else {
    update._spaceLatch = false;
    update._spaceHoldActive = false;
    update._spaceMassPlanted = false;
  }

  updateNukeFx(dt);
  updateBurnerBoostHud();

  // pickup (E)
  const ePressed = keys.has("e");
  if (ePressed && !state.ui.openMenu) {
    if (!update._eHoldActive) {
      update._eHoldActive = true;
      update._eHoldStartMs = state.timeMs;
      update._eMassPickupDone = false;
    }
    if (!update._eLatch) {
      update._eLatch = true;
      if (!tryFreezerE()) tryPickupNearby();
    }
    if (!update._eMassPickupDone && state.timeMs - update._eHoldStartMs >= E_HOLD_MASS_PICKUP_MS) {
      if (pickupAllReadyTouchingPlayer()) update._eMassPickupDone = true;
    }
  } else {
    update._eLatch = false;
    update._eHoldActive = false;
    update._eMassPickupDone = false;
  }

  // reset position (R) - helps if you "lose" the character
  const rPressed = keys.has("r");
  if (rPressed) {
    if (!update._rLatch) {
      update._rLatch = true;
      state.player.x = world.farm.w * 0.5;
      state.player.y = world.farm.h * 0.55;
    }
  } else {
    update._rLatch = false;
  }

  // plant growth stages
  for (const p of state.plants) {
    if (p.harvested) continue;
    const ageMs = state.timeMs - p.plantedAtMs;
    if (p.type === "strawberry") {
      // bush growth: 0-2.5s sapling, 2.5-5s growing, 5s+ grown
      if (ageMs < 2500) p.stage = 0;
      else if (ageMs < 5000) p.stage = 1;
      else p.stage = 2;
      continue;
    }
    if (p.type === "apple") {
      // tree: 0-1m sapling, 1-3m growing, 3m+ full
      if (ageMs < 60000) p.stage = 0;
      else if (ageMs < APPLE_TREE_GROW_MS) p.stage = 1;
      else p.stage = 2;
      continue;
    }
    if (p.type === "beetroot") {
      // beetroot growth: 0-1s invisible, 1s-30s half, 60s full
      if (ageMs < 1000) p.stage = 0;
      else if (ageMs < 60000) p.stage = 1;
      else p.stage = 2;
      continue;
    }
    if (p.type === "lily") {
      if (ageMs < LILY_STAGE0_MS) p.stage = 0;
      else if (ageMs < LILY_GROW_MS) p.stage = 1;
      else p.stage = 2;
      continue;
    }
    // carrot growth
    if (ageMs < 1000) p.stage = 0; // invisible
    else if (ageMs < 2000) p.stage = 1; // half carrot
    else p.stage = 2; // full carrot
  }

  // shop touch detection (open menu when touching)
  const touchingGears = circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.gears);
  const touchingSeeds = circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.seeds);
  const touchingSell = circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.sell);
  const touchingFreezer =
    freezerUnlocked() && shops.freezer.w > 0
      ? circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.freezer)
      : false;
  const touchingBurner = circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.burner);
  const touchingExpand = circleRectOverlap(state.player.x, state.player.y, state.player.r, shops.expand);

  let touched = null;
  if (touchingGears) touched = "gears";
  else if (touchingSeeds) touched = "seeds";
  else if (touchingSell) touched = "sell";
  else if (touchingFreezer) touched = "freezer";
  else if (touchingBurner) touched = "burner";
  else if (touchingExpand) touched = "expand";

  if (touched && state.ui.touchedShop !== touched && !state.ui.openMenu) {
    state.ui.touchedShop = touched;
    openMenu(touched);
  }

  if (!touched) state.ui.touchedShop = null;
}

function formatGrowRemaining(ms) {
  if (ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/** Time until the plant body is fully grown (harvest-ready for single crops / bush / tree canopy). */
function plantBodyRemainingMs(p) {
  const ageMs = state.timeMs - p.plantedAtMs;
  if (p.type === "strawberry") return Math.max(0, 5000 - ageMs);
  if (p.type === "apple") return Math.max(0, APPLE_TREE_GROW_MS - ageMs);
  if (p.type === "beetroot") return Math.max(0, 60000 - ageMs);
  if (p.type === "lily") return Math.max(0, LILY_GROW_MS - ageMs);
  return Math.max(0, 2000 - ageMs);
}

function getGrowTooltipAt(mx, my) {
  if (mx < world.farm.x || mx >= world.farm.w || my < 0 || my >= world.farm.h) return null;
  if (state.ui.openMenu) return null;

  let best = null;
  let bestD = Infinity;

  for (let i = state.plants.length - 1; i >= 0; i--) {
    const p = state.plants[i];
    if (p.harvested) continue;
    const ageMs = state.timeMs - p.plantedAtMs;
    const mul = p.multiplier ?? 1;
    const pickupRadius = 28 + (mul - 1) * 18;

    if (p.type === "strawberry" && ageMs >= 5000 && p.stage >= 2 && Array.isArray(p.fruits)) {
      const fruitOffsets = [
        { x: -14 * mul, y: -10 * mul },
        { x: 14 * mul, y: -8 * mul },
      ];
      const fruitPickupRadius = pickupRadius + 8 * mul;
      for (let fi = 0; fi < 2; fi++) {
        const f = p.fruits[fi];
        if (!f || state.timeMs >= f.nextGrowAtMs) continue;
        const fx = p.x + fruitOffsets[fi].x;
        const fy = p.y + fruitOffsets[fi].y;
        const d = dist(mx, my, fx, fy);
        if (d <= fruitPickupRadius + 6 && d < bestD) {
          bestD = d;
          const rem = f.nextGrowAtMs - state.timeMs;
          best = { text: `Fruit ready in ${formatGrowRemaining(rem)}`, mx, my };
        }
      }
    }

    if (p.type === "apple" && ageMs >= APPLE_TREE_GROW_MS && p.stage >= 2 && Array.isArray(p.fruits)) {
      const fruitOffsets = [
        { x: -16 * mul, y: -22 * mul },
        { x: 0, y: -26 * mul },
        { x: 16 * mul, y: -20 * mul },
      ];
      const fruitPickupRadius = pickupRadius + 10 * mul;
      for (let fi = 0; fi < APPLE_FRUIT_SLOTS; fi++) {
        const f = p.fruits[fi];
        if (!f || state.timeMs >= f.nextGrowAtMs) continue;
        const fx = p.x + fruitOffsets[fi].x;
        const fy = p.y + fruitOffsets[fi].y;
        const d = dist(mx, my, fx, fy);
        if (d <= fruitPickupRadius + 6 && d < bestD) {
          bestD = d;
          const rem = f.nextGrowAtMs - state.timeMs;
          best = { text: `Apple ready in ${formatGrowRemaining(rem)}`, mx, my };
        }
      }
    }

    const dCenter = dist(mx, my, p.x, p.y);
    if (dCenter > pickupRadius + 28) continue;
    const rem = plantBodyRemainingMs(p);
    if (rem <= 0) continue;
    if (dCenter < bestD) {
      bestD = dCenter;
      best = { text: `Grows in ${formatGrowRemaining(rem)}`, mx, my };
    }
  }
  return best;
}

function drawGrowTooltip(mx, my, text) {
  ctx.save();
  ctx.font = "600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const padX = 10;
  const h = 26;
  const tw = ctx.measureText(text).width;
  const w = Math.ceil(tw) + padX * 2;
  let tx = mx + 14;
  let ty = my - 34;
  if (tx + w > W - 4) tx = mx - w - 10;
  if (tx < 4) tx = 4;
  if (ty < 4) ty = my + 20;
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  roundRect(ctx, tx, ty, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  roundRect(ctx, tx, ty, w, h, 8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, tx + padX, ty + h * 0.52);
  ctx.restore();
}

function draw() {
  // background
  ctx.clearRect(0, 0, W, H);

  // farm ground
  ctx.fillStyle = "#7a4b2e";
  ctx.fillRect(world.farm.x, world.farm.y, world.farm.w, world.farm.h);

  // subtle dirt pattern
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 120; i++) {
    const x = (i * 73) % world.farm.w;
    const y = ((i * 191) % world.farm.h);
    ctx.fillStyle = i % 2 ? "#5f3a23" : "#8a5636";
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 8, (i % 10) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // shops panel background
  ctx.fillStyle = "#2a334a";
  ctx.fillRect(world.shops.x, world.shops.y, world.shops.w, world.shops.h);

  // divider
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(world.shops.x, 0, 2, H);

  // draw shops
  drawShopBox(shops.gears, "#9aa3c4");
  drawShopBox(shops.seeds, "#7ee081");
  drawShopBox(shops.sell, "#ff6b6b");
  if (freezerUnlocked()) drawFreezerMachine(shops.freezer);
  drawBurnerMachine(shops.burner);
  drawExpandSign(shops.expand);

  // plants
  for (const p of state.plants) {
    if (p.harvested) continue;
    if (p.type !== "strawberry" && p.type !== "apple" && p.stage === 0) continue; // carrots invisible first second
    const sizeMul = p.multiplier ?? 1;
    if (p.type === "strawberry") {
      // bush
      const bushScale = (p.stage === 1 ? 0.75 : 1) * sizeMul;
      drawBush(p.x, p.y, bushScale, p.stage);
      // fruits (two slots)
      if (p.stage >= 2 && Array.isArray(p.fruits)) {
        const fruitOffsets = [
          { x: -14 * sizeMul, y: -10 * sizeMul },
          { x: 14 * sizeMul, y: -8 * sizeMul },
        ];
        for (let i = 0; i < 2; i++) {
          const f = p.fruits[i];
          if (!f) continue;
          if (state.timeMs < f.nextGrowAtMs) continue;
          drawStrawberry(p.x + fruitOffsets[i].x, p.y + fruitOffsets[i].y, 0.8 * sizeMul);
        }
      }
    } else if (p.type === "apple") {
      const treeScale = (p.stage === 1 ? 0.82 : 1) * sizeMul;
      drawTree(p.x, p.y, treeScale, p.stage);
      if (p.stage >= 2 && Array.isArray(p.fruits)) {
        const fruitOffsets = [
          { x: -16 * sizeMul, y: -22 * sizeMul },
          { x: 0, y: -26 * sizeMul },
          { x: 16 * sizeMul, y: -20 * sizeMul },
        ];
        for (let i = 0; i < APPLE_FRUIT_SLOTS; i++) {
          const f = p.fruits[i];
          if (!f) continue;
          if (state.timeMs < f.nextGrowAtMs) continue;
          drawApple(p.x + fruitOffsets[i].x, p.y + fruitOffsets[i].y, 0.85 * sizeMul);
        }
      }
    } else {
      const base = p.stage === 1 ? 0.55 : 1;
      if (p.type === "beetroot") drawBeetroot(p.x, p.y, base * sizeMul);
      else if (p.type === "lily") drawLily(p.x, p.y, base * sizeMul);
      else drawCarrot(p.x, p.y, base * sizeMul);
    }
  }

  // player
  drawPlayer();

  // held item on player (visual)
  if (state.player.held?.kind?.startsWith("carrot")) {
    const mul = state.player.held.kind === "carrot10" ? 10 : state.player.held.kind === "carrot2" ? 2 : 1;
    drawCarrot(state.player.x + 18, state.player.y - 14, 0.75 * mul);
  } else if (state.player.held?.kind?.startsWith("lily") && !state.player.held.kind.endsWith("Seed")) {
    const mul = state.player.held.kind === "lily10" ? 10 : state.player.held.kind === "lily2" ? 2 : 1;
    drawLily(state.player.x + 18, state.player.y - 14, 0.72 * mul);
  } else if (state.player.held?.kind?.startsWith("apple")) {
    const mul = state.player.held.kind === "apple10" ? 10 : state.player.held.kind === "apple2" ? 2 : 1;
    drawApple(state.player.x + 18, state.player.y - 16, 0.85 * mul);
  } else if (state.player.held?.kind?.startsWith("strawberry")) {
    const mul = state.player.held.kind === "strawberry10" ? 10 : state.player.held.kind === "strawberry2" ? 2 : 1;
    drawStrawberry(state.player.x + 18, state.player.y - 14, 0.8 * mul);
  } else if (state.player.held?.kind?.startsWith("beetroot")) {
    const mul = state.player.held.kind === "beetroot10" ? 10 : state.player.held.kind === "beetroot2" ? 2 : 1;
    drawBeetroot(state.player.x + 18, state.player.y - 14, 0.8 * mul);
  } else if (isFrozenInventoryKey(state.player.held?.kind)) {
    const fk = state.player.held.kind;
    const base = frostKeyToBaseKey(fk);
    if (base) {
      const ox = state.player.x + 18;
      const oy = state.player.y - 14;
      const oyApple = state.player.y - 16;
      const mul = base.endsWith("10") ? 10 : base.endsWith("2") ? 2 : 1;
      if (base.startsWith("carrot")) drawCarrot(ox, oy, 0.75 * mul);
      else if (base.startsWith("strawberry")) drawStrawberry(ox, oy, 0.8 * mul);
      else if (base.startsWith("beetroot")) drawBeetroot(ox, oy, 0.8 * mul);
      else if (base.startsWith("apple")) drawApple(ox, oyApple, 0.85 * mul);
      else if (base.startsWith("lily")) drawLily(ox, oy, 0.72 * mul);
      const cy = base.startsWith("apple") ? oyApple : oy;
      const glowR = frozenGlowRadiusForHeldBase(base, mul);
      drawFrozenOverlay(ox, cy, glowR);
    }
  } else if (state.player.held?.kind === "carrotSeed") {
    drawSeed(state.player.x + 16, state.player.y - 10);
  } else if (state.player.held?.kind === "strawberrySeed") {
    drawStrawberrySeed(state.player.x + 16, state.player.y - 10);
  } else if (state.player.held?.kind === "beetrootSeed") {
    drawBeetrootSeed(state.player.x + 16, state.player.y - 10);
  } else if (state.player.held?.kind === "appleSeed") {
    drawAppleSeed(state.player.x + 16, state.player.y - 10);
  } else if (state.player.held?.kind === "lilySeed") {
    drawLilySeed(state.player.x + 16, state.player.y - 10);
  } else if (state.player.held?.kind === "gearNuke") {
    drawHeldGearNuke(state.player.x, state.player.y);
  } else if (state.player.held?.kind === "shovel") {
    drawHeldShovel(state.player.x, state.player.y);
  } else if (state.player.held?.kind === "burnerBooster") {
    drawHeldBurnerBooster(state.player.x, state.player.y);
  }

  // instructions in shops area
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("Touch shop to open", world.shops.x + 18, H - 40);
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillText("E near plant to pick up", world.shops.x + 18, H - 22);
  if (freezerUnlocked()) {
    ctx.fillStyle = "rgba(180,220,255,.68)";
    ctx.fillText("Freezer (under Sell): E deposit / claim", world.shops.x + 18, H - 6);
  }

  drawNukeFx();

  if (pointerCanvas.active && !state.ui.openMenu) {
    const tip = getGrowTooltipAt(pointerCanvas.x, pointerCanvas.y);
    if (tip) drawGrowTooltip(tip.mx, tip.my, tip.text);
  }
}

function drawHeldGearNuke(px, py) {
  ctx.save();
  ctx.translate(px + 18, py - 12);
  ctx.fillStyle = "#2a2a32";
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff5533";
  ctx.beginPath();
  ctx.arc(0, -4, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffcc66";
  ctx.beginPath();
  ctx.arc(-2, -6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a20";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(6, 10);
  ctx.stroke();
  ctx.restore();
}

function drawHeldBurnerBooster(px, py) {
  ctx.save();
  ctx.translate(px + 18, py - 12);
  ctx.fillStyle = "rgba(255,150,50,.55)";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,220,100,.75)";
  ctx.beginPath();
  ctx.arc(-2, 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.beginPath();
  ctx.arc(4, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeldShovel(px, py) {
  ctx.save();
  ctx.translate(px + 22, py - 6);
  ctx.rotate(-0.4);
  ctx.fillStyle = "#5a6278";
  ctx.fillRect(-3, -4, 6, 32);
  ctx.fillStyle = "#aeb6d4";
  ctx.beginPath();
  ctx.moveTo(-14, -12);
  ctx.lineTo(14, -4);
  ctx.lineTo(12, 6);
  ctx.lineTo(-16, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBurnerMachine(m) {
  ctx.save();
  const x = m.x;
  const y = m.y;
  const w = m.w;
  const h = m.h;

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#000";
  roundRect(ctx, x + 4, y + 5, w - 8, h - 4, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#353540";
  roundRect(ctx, x + 12, y + h * 0.38, w - 24, h * 0.5, 10);
  ctx.fill();

  ctx.fillStyle = "#2a2a32";
  roundRect(ctx, x + w * 0.32, y + 6, w * 0.36, h * 0.34, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(255,95,40,.5)";
  roundRect(ctx, x + 18, y + h * 0.42, w - 36, h * 0.28, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,190,70,.35)";
  roundRect(ctx, x + 26, y + h * 0.5, w - 52, h * 0.16, 6);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.font = "800 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("BURNER", x + 14, y + h - 8);

  ctx.restore();
}

function drawFreezerMiniCrop(cx, cy, baseKey) {
  const mul = baseKey.endsWith("10") ? 10 : baseKey.endsWith("2") ? 2 : 1;
  const sc = 0.34;
  if (baseKey.startsWith("carrot")) drawCarrot(cx, cy, sc * mul);
  else if (baseKey.startsWith("strawberry")) drawStrawberry(cx, cy, sc * mul);
  else if (baseKey.startsWith("beetroot")) drawBeetroot(cx, cy, sc * mul);
  else if (baseKey.startsWith("apple")) drawApple(cx, cy, sc * mul);
  else if (baseKey.startsWith("lily")) drawLily(cx, cy, sc * mul);
}

function drawFreezerMachine(m) {
  if (m.w <= 0) return;
  ctx.save();
  const x = m.x;
  const y = m.y;
  const w = m.w;
  const h = m.h;

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#000";
  roundRect(ctx, x + 4, y + 5, w - 8, h - 4, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  const cx = x + w * 0.5;
  const tubeTop = y + 10;
  const tubeBot = y + h - 22;
  const hw = w * 0.26;

  const grad = ctx.createLinearGradient(cx - hw, tubeTop, cx + hw, tubeBot);
  grad.addColorStop(0, "rgba(160,210,255,0.45)");
  grad.addColorStop(0.45, "rgba(80,150,240,0.75)");
  grad.addColorStop(1, "rgba(120,190,255,0.5)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - hw, tubeTop);
  ctx.lineTo(cx + hw, tubeTop);
  ctx.lineTo(cx + hw * 0.82, tubeBot);
  ctx.lineTo(cx - hw * 0.82, tubeBot);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(220,240,255,0.95)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(cx - hw * 0.35, tubeTop + 10, w * 0.05, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const fz = state.freezer;
  if (fz?.cropKey) {
    drawFreezerMiniCrop(cx, tubeTop + (tubeBot - tubeTop) * 0.48, fz.cropKey);
    const pulse = 0.5 + 0.5 * Math.sin(state.timeMs * 0.004);
    ctx.globalAlpha = 0.2 + pulse * 0.15;
    ctx.fillStyle = "rgba(200,240,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(cx - hw * 0.9, tubeTop);
    ctx.lineTo(cx + hw * 0.9, tubeTop);
    ctx.lineTo(cx + hw * 0.75, tubeBot);
    ctx.lineTo(cx - hw * 0.75, tubeBot);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "800 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("FREEZER", x + 14, y + h - 8);

  ctx.restore();
}

/**
 * Ice ring radius (px) for held frozen crops — matches each draw*() scale and rough sprite bounds.
 */
function frozenGlowRadiusForHeldBase(base, mul) {
  const sc =
    base.startsWith("carrot") ? 0.75 * mul :
    base.startsWith("strawberry") ? 0.8 * mul :
    base.startsWith("beetroot") ? 0.8 * mul :
    base.startsWith("apple") ? 0.85 * mul :
    base.startsWith("lily") ? 0.72 * mul : mul;

  if (base.startsWith("strawberry")) {
    const sy = sc * 0.82;
    const rx = 15 * sc;
    const ry = 26 * sy;
    return Math.hypot(rx, ry) * 1.08;
  }

  const localR =
    base.startsWith("carrot") ? 36 :
    base.startsWith("beetroot") ? 38 :
    base.startsWith("apple") ? 42 :
    base.startsWith("lily") ? 38 : 34;

  return localR * sc * 1.08;
}

function drawFrozenOverlay(cx, cy, r) {
  ctx.save();
  const t = state.timeMs * 0.005;
  const sparkR = Math.max(1.8, Math.min(52, r * 0.11));
  const sparkPulse = r * 0.028;
  const strokeW = Math.min(14, Math.max(1.5, r * 0.065));
  const count = Math.min(12, Math.max(5, Math.round(4 + r / 45)));

  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "rgba(160,220,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.88;
  for (let i = 0; i < count; i++) {
    const a = t + i * 1.1;
    const sx = cx + Math.cos(a) * r * 0.55;
    const sy = cy + Math.sin(a * 0.9) * r * 0.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sx, sy, sparkR + Math.sin(t * 2 + i) * sparkPulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(200,240,255,0.9)";
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.arc(cx, cy, r + Math.max(2, r * 0.06), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawExpandSign(sign) {
  ctx.save();
  const x = sign.x;
  const y = sign.y;
  const w = sign.w;
  const h = sign.h;

  // board
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#7a4b2e";
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  // little posts
  ctx.fillStyle = "#5d3a23";
  roundRect(ctx, x + 14, y + h - 10, 10, 24, 8);
  ctx.fill();
  roundRect(ctx, x + w - 24, y + h - 10, 10, 24, 8);
  ctx.fill();

  // text
  const n = state.plotExpansions ?? 0;
  const cost = n >= MAX_PLOT_EXPANSIONS ? "—" : getNextPlotExpandCost();
  const sub =
    n >= MAX_PLOT_EXPANSIONS
      ? "MAX"
      : `$${cost}  (+${EXPAND_PLOT_STEP_PX}px ${n === 0 ? "→" : "↓"})`;
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = "900 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("EXPAND PLOT", x + 16, y + 28);
  ctx.fillStyle = "rgba(255,255,255,.70)";
  ctx.font = "800 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(sub, x + 16, y + 48);

  ctx.restore();
}

function drawShopBox(shop, accent) {
  ctx.save();

  const x = shop.x;
  const y = shop.y;
  const w = shop.w;
  const h = shop.h;

  const wood1 = "#7a4b2e";
  const wood2 = "#5d3a23";
  const woodHi = "rgba(255,255,255,.10)";

  const roofH = 46;
  const signH = 30;
  const postW = 12;
  const postInset = 14;
  const counterH = 54;

  // shadow base
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  roundRect(ctx, x + 6, y + 10, w - 12, h - 10, 14);
  ctx.fill();
  ctx.globalAlpha = 1;

  // posts
  ctx.fillStyle = wood2;
  roundRect(ctx, x + postInset, y + signH - 4, postW, h - (signH - 4), 8);
  ctx.fill();
  roundRect(ctx, x + w - postInset - postW, y + signH - 4, postW, h - (signH - 4), 8);
  ctx.fill();

  // roof/awning
  ctx.fillStyle = "rgba(0,0,0,.18)";
  roundRect(ctx, x + 10, y + signH + 2, w - 20, roofH, 14);
  ctx.fill();

  const awningX = x + 12;
  const awningY = y + signH + 4;
  const awningW = w - 24;
  const awningH = roofH - 8;
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const sx = awningX + (awningW * i) / stripes;
    const sw = awningW / stripes;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,.20)" : "rgba(0,0,0,.08)";
    roundRect(ctx, sx, awningY, sw + 0.5, awningH, 10);
    ctx.fill();
  }
  // scalloped edge
  ctx.fillStyle = "rgba(255,255,255,.10)";
  for (let i = 0; i < 7; i++) {
    const cx = awningX + 14 + i * ((awningW - 28) / 6);
    ctx.beginPath();
    ctx.arc(cx, awningY + awningH + 6, 10, 0, Math.PI);
    ctx.fill();
  }

  // hanging sign board
  ctx.fillStyle = wood1;
  roundRect(ctx, x + 18, y + 4, w - 36, signH, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, x + 18, y + 4, w - 36, signH, 12);
  ctx.stroke();

  // sign accent tag
  ctx.fillStyle = accent;
  roundRect(ctx, x + 28, y + 11, 10, 16, 999);
  ctx.fill();

  // sign text
  ctx.fillStyle = "rgba(255,255,255,.90)";
  ctx.font = "800 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(shop.label, x + 44, y + 24);

  // counter
  const counterY = y + h - counterH - 10;
  ctx.fillStyle = wood1;
  roundRect(ctx, x + 18, counterY, w - 36, counterH, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, x + 18, counterY, w - 36, counterH, 14);
  ctx.stroke();

  // counter planks
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = woodHi;
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, x + 26, counterY + 10 + i * 10, w - 52, 4, 999);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // stall body backdrop
  ctx.fillStyle = "rgba(0,0,0,.12)";
  const bodyTop = y + signH + roofH + 10;
  const bodyBottom = counterY - 8;
  const bodyH = Math.max(0, bodyBottom - bodyTop);
  roundRect(ctx, x + 22, bodyTop, w - 44, bodyH, 12);
  ctx.fill();

  // small caption
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const caption =
    shop.label === "SEEDS" ? "Buy seeds" : shop.label === "GEARS" ? "Buy gears" : "Sell crops";
  ctx.fillText(caption, x + 26, counterY + counterH - 16);

  ctx.restore();
}

function drawPlayer() {
  const { x, y, r } = state.player;
  // body
  ctx.save();

  // "find me" ring
  const t = state.timeMs * 0.004;
  const pulse = 0.5 + 0.5 * Math.sin(t);
  ctx.globalAlpha = 0.22 + pulse * 0.18;
  ctx.strokeStyle = "#ffe86b";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(x, y, r + 10 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // outline for contrast on brown ground
  ctx.fillStyle = "#ff4a4a";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // subtle highlight
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 6, y - 7, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // eyes
  const eyeY = y - 4;
  const eyeX1 = x - 6;
  const eyeX2 = x + 6;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(eyeX1, eyeY, 4.3, 5.4, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeX2, eyeY, 4.3, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#23263a";
  ctx.beginPath();
  ctx.arc(eyeX1 + 1.1, eyeY + 1, 2.1, 0, Math.PI * 2);
  ctx.arc(eyeX2 + 1.1, eyeY + 1, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // tiny blush
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffb3b3";
  ctx.beginPath();
  ctx.ellipse(x - 11, y + 4, 3.8, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 11, y + 4, 3.8, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSeedSquare(x, y, color) {
  ctx.save();
  // True square (no rounding)
  const s = 18;
  const left = Math.round(x - s / 2);
  const top = Math.round(y - s / 2);

  // shadow
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.fillRect(left + 1, top + 2, s, s);
  ctx.globalAlpha = 1;

  // body
  ctx.fillStyle = color;
  ctx.fillRect(left, top, s, s);

  // border
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = 3;
  ctx.strokeRect(left + 1.5, top + 1.5, s - 3, s - 3);

  // highlight
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left + 3, top + 3, Math.round(s * 0.42), Math.round(s * 0.28));
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSeed(x, y) {
  // Carrot seed: orange square
  drawSeedSquare(x, y, "#ff8a2b");
}

function drawStrawberrySeed(x, y) {
  // Strawberry seed: red square
  drawSeedSquare(x, y, "#ff3b4f");
}

function drawBeetrootSeed(x, y) {
  // Beetroot seed: purple/red square
  drawSeedSquare(x, y, "#b13b5a");
}

function drawAppleSeed(x, y) {
  drawSeedSquare(x, y, "#5a9e3e");
}

function drawLilySeed(x, y) {
  drawSeedSquare(x, y, "#e8a8d8");
}

function drawLily(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#2d7a4a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.quadraticCurveTo(3, 4, 0, -10);
  ctx.stroke();

  ctx.fillStyle = "#4cb85c";
  ctx.beginPath();
  ctx.ellipse(-10, 2, 9, 3.5, -0.55, 0, Math.PI * 2);
  ctx.ellipse(10, 4, 9, 3.5, 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -10);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    ctx.fillStyle = i % 2 === 0 ? "#f8e8ff" : "#ffd0e8";
    ctx.beginPath();
    ctx.ellipse(0, -12, 5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#7a5a2a";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#ffe066";
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStrawberry(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  // Slight vertical squash to look "shorter"
  ctx.scale(scale, scale * 0.82);

  // leaf cap
  ctx.fillStyle = "#3bd46a";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(-10, -16, -6, -22);
  ctx.quadraticCurveTo(0, -18, 0, -14);
  ctx.quadraticCurveTo(0, -18, 6, -22);
  ctx.quadraticCurveTo(10, -16, 0, -10);
  ctx.closePath();
  ctx.fill();

  // berry body
  ctx.fillStyle = "#ff3b4f";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.quadraticCurveTo(14, 0, 6, 18);
  ctx.quadraticCurveTo(0, 26, -6, 18);
  ctx.quadraticCurveTo(-14, 0, 0, -8);
  ctx.closePath();
  ctx.fill();

  // seeds dots
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffe86b";
  const dots = [
    [-4, 0],
    [4, 2],
    [-6, 8],
    [2, 10],
    [6, 6],
  ];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, 1.4, 1.0, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // highlight
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-4, -2, 4, 7, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawBush(x, y, scale = 1, stage = 2) {
  ctx.save();
  ctx.translate(x, y);
  // Slight vertical squash to look "shorter"
  ctx.scale(scale, scale * 0.78);

  // shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 18, 20, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (stage <= 0) {
    // sapling
    ctx.strokeStyle = "#2a7f3c";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(0, 2);
    ctx.stroke();
    ctx.fillStyle = "#3bd46a";
    ctx.beginPath();
    ctx.ellipse(-6, 2, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(6, 0, 8, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // bush body
  ctx.fillStyle = "#2bbf5a";
  ctx.beginPath();
  ctx.ellipse(-14, 6, 16, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(14, 8, 16, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 2, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // darker depth
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#1f8f45";
  ctx.beginPath();
  ctx.ellipse(-6, 12, 14, 10, 0.2, 0, Math.PI * 2);
  ctx.ellipse(10, 14, 14, 10, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // stem hints
  ctx.strokeStyle = "#1d6f36";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, 18);
  ctx.lineTo(-2, 10);
  ctx.moveTo(6, 18);
  ctx.lineTo(2, 10);
  ctx.stroke();

  ctx.restore();
}

function drawTree(x, y, scale = 1, stage = 2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale * 0.72);

  if (stage <= 0) {
    ctx.strokeStyle = "#4a3520";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.fillStyle = "#3d8c3a";
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = "#5d3d22";
  ctx.fillRect(-8, 8, 16, 66);
  ctx.fillStyle = "#3d8c3a";
  ctx.beginPath();
  ctx.ellipse(0, -8, 26, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(-16, 2, 20, 18, -0.2, 0, Math.PI * 2);
  ctx.ellipse(16, 2, 20, 18, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#1f5c1e";
  ctx.beginPath();
  ctx.ellipse(-6, 4, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawApple(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#8b2500";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(12, -4, 10, 10);
  ctx.quadraticCurveTo(0, 18, -10, 10);
  ctx.quadraticCurveTo(-12, -4, 0, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e02020";
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(-3, -2, 3, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#3d2914";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(2, -16);
  ctx.stroke();
  ctx.fillStyle = "#3bd46a";
  ctx.beginPath();
  ctx.ellipse(6, -16, 5, 3, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCarrot(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // leaves
  ctx.fillStyle = "#3bd46a";
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.quadraticCurveTo(-10, -30, -4, -34);
  ctx.quadraticCurveTo(0, -27, 2, -18);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(2, -18);
  ctx.quadraticCurveTo(10, -30, 4, -34);
  ctx.quadraticCurveTo(0, -27, -2, -18);
  ctx.closePath();
  ctx.fill();

  // body
  ctx.fillStyle = "#ff8a2b";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(12, 2, 2, 22);
  ctx.quadraticCurveTo(0, 26, -2, 22);
  ctx.quadraticCurveTo(-12, 2, 0, -16);
  ctx.closePath();
  ctx.fill();

  // stripes
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#ffd1a8";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-7 + i * 4, -2 + i * 5);
    ctx.quadraticCurveTo(0, 2 + i * 5, 7 - i * 4, 8 + i * 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeetroot(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // leaves
  ctx.fillStyle = "#3bd46a";
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.quadraticCurveTo(-12, -30, -4, -36);
  ctx.quadraticCurveTo(0, -28, 2, -18);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(2, -18);
  ctx.quadraticCurveTo(12, -30, 4, -36);
  ctx.quadraticCurveTo(0, -28, -2, -18);
  ctx.closePath();
  ctx.fill();

  // root body
  ctx.fillStyle = "#b13b5a";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(14, 0, 6, 20);
  ctx.quadraticCurveTo(0, 30, -6, 20);
  ctx.quadraticCurveTo(-14, 0, 0, -16);
  ctx.closePath();
  ctx.fill();

  // highlight
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-5, -4, 5, 10, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // little tail
  ctx.strokeStyle = "#7a2238";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.lineTo(2, 36);
  ctx.stroke();

  ctx.restore();
}

function roundRect(ctx2, x, y, w, h, r) {
  // Guard against negative sizes (can happen if layout math changes)
  if (w === 0 || h === 0) return;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx2.beginPath();
  ctx2.moveTo(x + rr, y);
  ctx2.arcTo(x + w, y, x + w, y + h, rr);
  ctx2.arcTo(x + w, y + h, x, y + h, rr);
  ctx2.arcTo(x, y + h, x, y, rr);
  ctx2.arcTo(x, y, x + w, y, rr);
  ctx2.closePath();
}

// init
state.timeMs = Date.now();
loadGame();
moneyEl.textContent = String(state.money);
renderInventory();
closeMenu();
window.addEventListener("beforeunload", () => saveGame());
requestAnimationFrame((t) => {
  lastTs = t;
  state.timeMs = Date.now();
  tick(t);
});

// ensure initial rects are correct (esp. fresh save)
syncGameLayout();
recomputeShopRects();
updateBurnerBoostHud();

