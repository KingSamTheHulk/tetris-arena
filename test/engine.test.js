import test from "node:test";
import assert from "node:assert/strict";
import {
  TetrisGame,
  findBestPlacement,
  rotationsFor,
  emptyBoard,
  collides,
  COLS,
  ROWS,
  TARGET_LINES,
} from "../public/engine.js";

const fixed = () => 0.5;

test("each tetromino exposes four rotation states", () => {
  for (const type of ["I", "J", "L", "O", "S", "T", "Z"]) {
    assert.equal(rotationsFor(type).length, 4);
  }
});

test("pieces collide with walls and floor", () => {
  const board = emptyBoard();
  const matrix = rotationsFor("O")[0];
  assert.equal(collides(board, matrix, -1, 0), true);
  assert.equal(collides(board, matrix, COLS - 1, 0), true);
  assert.equal(collides(board, matrix, 0, ROWS), true);
  assert.equal(collides(board, matrix, 4, 0), false);
});

test("hard drop locks a piece and spawns the next one", () => {
  const game = new TetrisGame(fixed);
  const firstId = game.pieceCount;
  const distance = game.hardDrop();
  assert.ok(distance > 0);
  assert.equal(game.pieceCount, firstId + 1);
  assert.ok(game.active);
  const filled = game.board.flat().filter(Boolean).length;
  assert.ok(filled > 0);
});

test("completed rows clear and lines increase", () => {
  const game = new TetrisGame(fixed);
  game.board[ROWS - 1] = Array(COLS).fill(null).map((_, x) => (x < 6 ? "T" : null));
  game.active = { type: "I", rotation: 0, x: 6, y: 0 };
  game.hardDrop();
  assert.equal(game.lines, 1);
  assert.equal(game.board[ROWS - 1].every((cell) => cell === null), true);
});

test("gravity eventually locks a piece", () => {
  const game = new TetrisGame(fixed);
  const firstId = game.pieceCount;
  game.tick(4000, 125);
  game.tick(500, 125);
  assert.equal(game.pieceCount, firstId + 1);
});

test("AI completes a line when one is available", () => {
  const board = emptyBoard();
  board[ROWS - 1] = Array(COLS).fill(null).map((_, x) => (x < 6 ? "T" : null));
  const plan = findBestPlacement(board, "I", () => 0.99);
  assert.ok(plan);
  assert.equal(plan.lines, 1);
  assert.equal(plan.rotation, 0);
  assert.equal(plan.x, 6);
});

test("AI placements stay inside the board for every piece type", () => {
  const board = emptyBoard();
  for (const type of ["I", "J", "L", "O", "S", "T", "Z"]) {
    const plan = findBestPlacement(board, type, () => 0.99);
    assert.ok(plan, `missing plan for ${type}`);
    const width = rotationsFor(type)[plan.rotation][0].length;
    assert.ok(plan.x >= 0 && plan.x + width <= COLS);
    assert.ok(plan.y >= 0 && plan.y < ROWS);
  }
});

test("AI can stack pieces for many turns without crashing", () => {
  const game = new TetrisGame(() => 0.42);
  let pieces = 0;
  while (pieces < 40 && !game.over) {
    const piece = game.active;
    const plan = findBestPlacement(game.board, piece.type, () => 0.99);
    assert.ok(plan);
    let guard = 0;
    while (game.active.rotation !== plan.rotation && guard++ < 12) game.rotate(1);
    while (game.active.x !== plan.x && guard++ < 40) {
      game.move(Math.sign(plan.x - game.active.x));
    }
    game.hardDrop();
    pieces += 1;
  }
  assert.equal(game.board.length, ROWS);
  assert.ok(game.lines > 0);
  assert.equal(TARGET_LINES, 15);
});
