import {
  TetrisGame,
  findBestPlacement,
  rotationsFor,
  collides,
  COLS,
  ROWS,
  COLORS,
  TARGET_LINES,
  GRAVITY_MS,
  SOFT_DROP_MS,
} from "./engine.js";

const CELL = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const NEXT_W = 84;
const NEXT_H = 62;
const countdownMs = 650;
const aiThinkMs = 240;
const aiActionMs = 75;
const RATINGS_KEY = "tetris-arena:ratings";

const el = (id) => document.getElementById(id);

function readLocalRatings() {
  try {
    const raw = JSON.parse(localStorage.getItem(RATINGS_KEY));
    if (raw && Number.isFinite(raw.player) && Number.isFinite(raw.ai)) {
      return { player: raw.player, ai: raw.ai };
    }
  } catch {
    // ignore malformed or unavailable storage
  }
  return null;
}

function writeLocalRatings(ratings) {
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings));
  } catch {
    // ignore unavailable storage
  }
}

const els = {
  playerBoard: el("playerBoard"),
  aiBoard: el("aiBoard"),
  playerNext: el("playerNext"),
  aiNext: el("aiNext"),
  playerLines: el("playerLines"),
  aiLines: el("aiLines"),
  playerProgress: el("playerProgress"),
  aiProgress: el("aiProgress"),
  playerRating: el("playerRating"),
  aiRating: el("aiRating"),
  playerPanel: el("playerPanel"),
  aiPanel: el("aiPanel"),
  aiStatus: el("aiStatus"),
  overlay: el("overlay"),
  startView: el("startView"),
  resultView: el("resultView"),
  startBtn: el("startBtn"),
  rematchBtn: el("rematchBtn"),
  resultKicker: el("resultKicker"),
  resultTitle: el("resultTitle"),
  resultDetail: el("resultDetail"),
  ratingChange: el("ratingChange"),
  finalRatings: el("finalRatings"),
  countdown: el("countdown"),
  resetRatings: el("resetRatings"),
};

const state = {
  phase: "idle",
  soft: false,
  raf: 0,
  last: 0,
  ratings: { player: 100, ai: 100 },
};

let player = null;
let ai = null;
let aiController = null;

function setupCanvas(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.dataset.dpr = String(dpr);
  canvas.dataset.w = String(width);
  canvas.dataset.h = String(height);
}

function contextFor(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Number(canvas.dataset.dpr) || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawBlock(ctx, x, y, color, size, ghost = false) {
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, size - 6, size - 6, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, size - 3, size - 3, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.roundRect(x + 3.5, y + 3.5, Math.max(4, size - 7), 4, 2);
  ctx.fill();
}

function drawBoard(canvas, game) {
  const ctx = contextFor(canvas);
  const width = Number(canvas.dataset.w);
  const height = Number(canvas.dataset.h);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080d17";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(120, 170, 230, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, height);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(width, y * CELL + 0.5);
    ctx.stroke();
  }

  if (!game) return;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const type = game.board[y][x];
      if (type) drawBlock(ctx, x * CELL, y * CELL, COLORS[type] || "#7c8aa5", CELL);
    }
  }

  const piece = game.active;
  if (!piece) return;
  const matrix = rotationsFor(piece.type)[piece.rotation];
  const color = COLORS[piece.type];

  let ghostY = piece.y;
  while (!collides(game.board, matrix, piece.x, ghostY + 1)) ghostY += 1;
  if (ghostY !== piece.y) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (matrix[y][x] && ghostY + y >= 0) {
          drawBlock(ctx, (piece.x + x) * CELL, (ghostY + y) * CELL, color, CELL, true);
        }
      }
    }
  }

  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x] && piece.y + y >= 0) {
        drawBlock(ctx, (piece.x + x) * CELL, (piece.y + y) * CELL, color, CELL);
      }
    }
  }
}

function drawNext(canvas, type) {
  const ctx = contextFor(canvas);
  const width = Number(canvas.dataset.w);
  const height = Number(canvas.dataset.h);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080d17";
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 10);
  ctx.fill();
  if (!type) return;

  const matrix = rotationsFor(type)[0];
  const size = 14;
  const pieceWidth = matrix[0].length * size;
  const pieceHeight = matrix.length * size;
  const originX = (width - pieceWidth) / 2;
  const originY = (height - pieceHeight) / 2;

  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x]) {
        drawBlock(ctx, originX + x * size, originY + y * size, COLORS[type], size);
      }
    }
  }
}

function setRatings() {
  els.playerRating.textContent = String(state.ratings.player);
  els.aiRating.textContent = String(state.ratings.ai);
}

function updateHud() {
  const playerLines = player ? player.lines : 0;
  const aiLines = ai ? ai.lines : 0;
  els.playerLines.textContent = String(playerLines);
  els.aiLines.textContent = String(aiLines);
  els.playerProgress.style.width = `${Math.min(100, (playerLines / TARGET_LINES) * 100)}%`;
  els.aiProgress.style.width = `${Math.min(100, (aiLines / TARGET_LINES) * 100)}%`;
}

function renderAll() {
  drawBoard(els.playerBoard, player);
  drawBoard(els.aiBoard, ai);
  drawNext(els.playerNext, player ? player.queue[0] : null);
  drawNext(els.aiNext, ai ? ai.queue[0] : null);
  updateHud();
}

class AiController {
  constructor(game) {
    this.game = game;
    this.plan = null;
    this.lastPiece = -1;
    this.think = 0;
    this.action = 0;
  }

  tick(dt) {
    const game = this.game;
    if (game.over) return;
    const piece = game.active;
    if (!piece) {
      this.plan = null;
      return;
    }

    if (game.pieceCount !== this.lastPiece) {
      this.lastPiece = game.pieceCount;
      this.plan = findBestPlacement(game.board, piece.type);
      this.think = aiThinkMs;
      this.action = 0;
      return;
    }

    if (!this.plan) return;
    if (this.think > 0) {
      this.think -= dt;
      return;
    }

    this.action += dt;
    if (this.action < aiActionMs) return;
    this.action = 0;

    if (piece.rotation !== this.plan.rotation) {
      if (!game.rotate(1)) this.shift();
      return;
    }
    if (piece.x !== this.plan.x) this.shift();
  }

  shift() {
    const game = this.game;
    const piece = game.active;
    if (!piece || !this.plan) return;
    const dx = Math.sign(this.plan.x - piece.x);
    if (dx) game.move(dx);
  }
}

function drainEffects() {
  const pairs = [
    [player, els.playerPanel],
    [ai, els.aiPanel],
  ];
  for (const [game, panel] of pairs) {
    while (game && game.events.length) {
      const event = game.events.shift();
      if (event.type === "clear") {
        panel.classList.remove("flash");
        void panel.offsetWidth;
        panel.classList.add("flash");
        clearTimeout(panel.flashTimer);
        panel.flashTimer = setTimeout(() => panel.classList.remove("flash"), 340);
      }
    }
  }
}

function checkWinner() {
  if (!player || !ai) return null;
  if (player.lines >= TARGET_LINES) return "player";
  if (ai.lines >= TARGET_LINES) return "ai";
  if (player.over) return "ai";
  if (ai.over) return "player";
  return null;
}

function loop(now) {
  if (state.phase !== "playing") return;
  const dt = Math.min(now - state.last || 16, 100);
  state.last = now;

  player.tick(dt, state.soft ? SOFT_DROP_MS : GRAVITY_MS);
  ai.tick(dt, GRAVITY_MS);
  aiController.tick(dt);

  drainEffects();
  renderAll();

  const winner = checkWinner();
  if (winner) {
    endMatch(winner);
    return;
  }
  state.raf = requestAnimationFrame(loop);
}

function showOverlay() {
  els.overlay.hidden = false;
}

function hideOverlay() {
  els.overlay.hidden = true;
}

function showCountdown(text) {
  els.countdown.textContent = text;
  els.countdown.hidden = false;
}

function hideCountdown() {
  els.countdown.hidden = true;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startMatch() {
  if (state.phase === "playing" || state.phase === "countdown") return;
  state.phase = "countdown";
  state.soft = false;

  hideOverlay();
  els.startView.hidden = true;
  els.resultView.hidden = true;
  player = new TetrisGame();
  ai = new TetrisGame();
  aiController = new AiController(ai);
  els.aiStatus.textContent = "Thinking";
  renderAll();

  for (const label of ["3", "2", "1", "GO"]) {
    showCountdown(label);
    await wait(label === "GO" ? 420 : countdownMs);
    if (state.phase !== "countdown") {
      hideCountdown();
      return;
    }
  }

  hideCountdown();
  state.phase = "playing";
  state.last = performance.now();
  state.raf = requestAnimationFrame(loop);
}

function endMatch(winner) {
  state.phase = "over";
  state.soft = false;
  cancelAnimationFrame(state.raf);
  renderAll();

  const won = winner === "player";
  const delta = won ? 5 : -5;
  state.ratings.player += delta;
  state.ratings.ai -= delta;
  setRatings();

  els.resultKicker.textContent = won ? "Victory" : "Defeat";
  els.resultTitle.textContent = won ? "You win!" : "AI wins";
  els.resultDetail.textContent = `You cleared ${player.lines} line${player.lines === 1 ? "" : "s"} · AI cleared ${ai.lines}.`;
  els.ratingChange.textContent = `${won ? "+5" : "−5"} rating`;
  els.ratingChange.className = `rating-change ${won ? "up" : "down"}`;
  els.finalRatings.textContent = `Your rating ${state.ratings.player} · AI ${state.ratings.ai}`;
  els.aiStatus.textContent = ai.over ? "Topped out" : "Done";

  els.resultView.hidden = false;
  showOverlay();
  saveResult(winner);
}

async function saveResult(winner) {
  try {
    const response = await fetch("/api/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        winner,
        playerLines: player.lines,
        aiLines: ai.lines,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.ratings = { player: data.player, ai: data.ai };
    setRatings();
    els.finalRatings.textContent = `Your rating ${data.player} · AI ${data.ai}`;
  } catch (error) {
    writeLocalRatings(state.ratings);
    console.warn("Could not reach the server, saved ratings locally:", error);
    els.finalRatings.textContent = `Your rating ${state.ratings.player} · AI ${state.ratings.ai}`;
  }
}

async function loadRatings() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Number.isFinite(data.player) && Number.isFinite(data.ai)) {
      state.ratings = { player: data.player, ai: data.ai };
    }
  } catch (error) {
    const stored = readLocalRatings();
    if (stored) state.ratings = stored;
    console.warn("Could not load ratings, using local values:", error);
  }
  setRatings();
}

function handleKeyDown(event) {
  if (state.phase !== "playing") return;
  const key = event.key;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(key)) {
    event.preventDefault();
  }
  if (event.repeat && (key === " " || key === "ArrowUp")) return;

  switch (key) {
    case "ArrowLeft":
      player.move(-1);
      break;
    case "ArrowRight":
      player.move(1);
      break;
    case "ArrowDown":
      state.soft = true;
      player.stepDown();
      break;
    case "ArrowUp":
    case "x":
    case "X":
      player.rotate(1);
      break;
    case "z":
    case "Z":
      player.rotate(-1);
      break;
    case " ":
      player.hardDrop();
      break;
    default:
      break;
  }
}

function handleKeyUp(event) {
  if (event.key === "ArrowDown") state.soft = false;
}

function wireTouchControls() {
  const buttons = els.playerPanel.querySelectorAll("[data-action]");
  buttons.forEach((button) => {
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (state.phase !== "playing") return;
      if (action === "left") player.move(-1);
      else if (action === "right") player.move(1);
      else if (action === "rotate") player.rotate(1);
      else if (action === "soft") {
        state.soft = true;
        player.stepDown();
      } else if (action === "drop") player.hardDrop();
    });
    const stopSoft = () => {
      if (action === "soft") state.soft = false;
    };
    button.addEventListener("pointerup", stopSoft);
    button.addEventListener("pointercancel", stopSoft);
    button.addEventListener("pointerleave", stopSoft);
  });
}

function wireReset() {
  els.resetRatings.addEventListener("click", async () => {
    if (!window.confirm("Reset both ratings to 100?")) return;
    try {
      const response = await fetch("/api/reset", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.ratings = { player: data.player, ai: data.ai };
    } catch (error) {
      console.warn("Could not reset ratings on the server, clearing locally:", error);
      state.ratings = { player: 100, ai: 100 };
      writeLocalRatings(state.ratings);
    }
    setRatings();
  });
}

function boot() {
  setupCanvas(els.playerBoard, BOARD_W, BOARD_H);
  setupCanvas(els.aiBoard, BOARD_W, BOARD_H);
  setupCanvas(els.playerNext, NEXT_W, NEXT_H);
  setupCanvas(els.aiNext, NEXT_W, NEXT_H);

  drawBoard(els.playerBoard, null);
  drawBoard(els.aiBoard, null);
  drawNext(els.playerNext, null);
  drawNext(els.aiNext, null);
  setRatings();

  els.startBtn.addEventListener("click", startMatch);
  els.rematchBtn.addEventListener("click", startMatch);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    state.soft = false;
  });

  wireTouchControls();
  wireReset();
  loadRatings();
}

boot();
