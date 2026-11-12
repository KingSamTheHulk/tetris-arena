export const COLS = 10;
export const ROWS = 20;
export const LEVEL = 15;
export const TARGET_LINES = 15;
export const GRAVITY_MS = 125;
export const SOFT_DROP_MS = 30;
export const LOCK_DELAY_MS = 420;

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]],
};

export const COLORS = {
  I: "#38d9f5",
  J: "#4c7dff",
  L: "#ff9843",
  O: "#ffd93b",
  S: "#4ade80",
  T: "#b06cff",
  Z: "#ff5c7a",
};

const TYPES = Object.keys(SHAPES);
const CLEAR_SCORES = [0, 100, 300, 500, 800];
const rotationCache = new Map();

function rotateCW(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      out[x][rows - 1 - y] = matrix[y][x];
    }
  }
  return out;
}

export function rotationsFor(type) {
  if (!rotationCache.has(type)) {
    const rotations = [SHAPES[type].map((row) => row.slice())];
    for (let i = 1; i < 4; i++) rotations.push(rotateCW(rotations[i - 1]));
    rotationCache.set(type, rotations);
  }
  return rotationCache.get(type);
}

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function collides(board, matrix, px, py) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const bx = px + x;
      const by = py + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

export class TetrisGame {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.board = emptyBoard();
    this.bag = [];
    this.queue = [];
    this.active = null;
    this.lines = 0;
    this.score = 0;
    this.over = false;
    this.dropAccum = 0;
    this.lockAccum = 0;
    this.pieceCount = 0;
    this.lastClear = 0;
    this.events = [];
    this.fillQueue();
    this.spawn();
  }

  nextType() {
    if (this.bag.length === 0) {
      this.bag = [...TYPES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  fillQueue() {
    while (this.queue.length < 5) this.queue.push(this.nextType());
  }

  spawn() {
    const type = this.queue.shift();
    this.fillQueue();
    const matrix = rotationsFor(type)[0];
    const x = Math.floor((COLS - matrix[0].length) / 2);
    if (collides(this.board, matrix, x, 0)) {
      this.active = null;
      this.over = true;
      this.events.push({ type: "topout" });
      return;
    }
    this.active = { type, rotation: 0, x, y: 0 };
    this.pieceCount += 1;
    this.dropAccum = 0;
    this.lockAccum = 0;
  }

  matrix() {
    if (!this.active) return null;
    return rotationsFor(this.active.type)[this.active.rotation];
  }

  move(dx) {
    const piece = this.active;
    if (!piece) return false;
    if (!collides(this.board, this.matrix(), piece.x + dx, piece.y)) {
      piece.x += dx;
      if (this.lockAccum > 0) this.lockAccum = 0;
      return true;
    }
    return false;
  }

  rotate(direction = 1) {
    const piece = this.active;
    if (!piece) return false;
    const rotations = rotationsFor(piece.type);
    const next = (piece.rotation + (direction > 0 ? 1 : 3)) % 4;
    const matrix = rotations[next];
    const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
    for (const [dx, dy] of kicks) {
      if (!collides(this.board, matrix, piece.x + dx, piece.y + dy)) {
        piece.rotation = next;
        piece.x += dx;
        piece.y += dy;
        if (this.lockAccum > 0) this.lockAccum = 0;
        return true;
      }
    }
    return false;
  }

  stepDown() {
    const piece = this.active;
    if (!piece) return false;
    if (!collides(this.board, this.matrix(), piece.x, piece.y + 1)) {
      piece.y += 1;
      this.score += 1;
      return true;
    }
    return false;
  }

  hardDrop() {
    const piece = this.active;
    if (!piece) return 0;
    let distance = 0;
    while (!collides(this.board, this.matrix(), piece.x, piece.y + 1)) {
      piece.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
    this.lockPiece();
    return distance;
  }

  tick(dt, gravityMs = GRAVITY_MS) {
    const piece = this.active;
    if (!piece || this.over) return;
    const matrix = this.matrix();
    if (collides(this.board, matrix, piece.x, piece.y + 1)) {
      this.dropAccum = 0;
      this.lockAccum += dt;
      if (this.lockAccum >= LOCK_DELAY_MS) this.lockPiece();
      return;
    }
    this.lockAccum = 0;
    this.dropAccum += dt;
    while (this.dropAccum >= gravityMs) {
      if (collides(this.board, matrix, piece.x, piece.y + 1)) break;
      piece.y += 1;
      this.dropAccum -= gravityMs;
    }
    if (this.dropAccum >= gravityMs) this.dropAccum = 0;
  }

  lockPiece() {
    const piece = this.active;
    if (!piece) return;
    const matrix = this.matrix();
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) this.board[by][bx] = piece.type;
      }
    }
    this.active = null;
    this.dropAccum = 0;
    this.lockAccum = 0;

    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(Boolean)) full.push(y);
    }
    this.lastClear = full.length;
    if (full.length) {
      const kept = this.board.filter((_, y) => !full.includes(y));
      while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
      this.board = kept;
      this.lines += full.length;
      this.score += CLEAR_SCORES[full.length] * LEVEL;
      this.events.push({ type: "clear", count: full.length });
    }
    this.spawn();
  }
}

function evaluateBoard(board, lines) {
  const heights = new Array(COLS).fill(0);
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (board[y][x]) {
        if (!seen) {
          seen = true;
          heights[x] = ROWS - y;
        }
      } else if (seen) {
        holes += 1;
      }
    }
  }
  let aggregate = 0;
  let bumpiness = 0;
  for (let x = 0; x < COLS; x++) {
    aggregate += heights[x];
    if (x > 0) bumpiness += Math.abs(heights[x] - heights[x - 1]);
  }
  return 0.760666 * lines - 0.510066 * aggregate - 0.35663 * holes - 0.184483 * bumpiness;
}

function placeAndClear(board, matrix, px, py, type) {
  const next = board.map((row) => row.slice());
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const by = py + y;
      const bx = px + x;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) next[by][bx] = type;
    }
  }
  const full = [];
  for (let y = 0; y < ROWS; y++) if (next[y].every(Boolean)) full.push(y);
  let result = next;
  if (full.length) {
    result = next.filter((_, y) => !full.includes(y));
    while (result.length < ROWS) result.unshift(Array(COLS).fill(null));
  }
  return { board: result, lines: full.length };
}

export function findBestPlacement(board, type, rng = Math.random) {
  const rotations = rotationsFor(type);
  const seen = new Set();
  const options = [];

  for (let rotation = 0; rotation < rotations.length; rotation++) {
    const matrix = rotations[rotation];
    const signature = matrix.map((row) => row.join("")).join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    const width = matrix[0].length;

    for (let x = 0; x <= COLS - width; x++) {
      if (collides(board, matrix, x, 0)) continue;
      let y = 0;
      while (!collides(board, matrix, x, y + 1)) y += 1;
      const simulated = placeAndClear(board, matrix, x, y, type);
      options.push({
        rotation,
        x,
        y,
        lines: simulated.lines,
        score: evaluateBoard(simulated.board, simulated.lines),
      });
    }
  }

  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);

  const roll = rng();
  if (roll < 0.06 && options.length > 1) {
    return options[Math.floor(rng() * Math.min(options.length, 8))];
  }
  if (roll < 0.3 && options.length > 1) {
    return options[1 + Math.floor(rng() * Math.min(3, options.length - 1))];
  }
  return options[0];
}
