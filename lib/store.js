import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "scores.json");

const defaults = () => ({ player: 100, ai: 100, matches: [] });

let cache = null;

function normalize(raw) {
  const state = defaults();
  if (raw && typeof raw === "object") {
    if (Number.isFinite(raw.player)) state.player = raw.player;
    if (Number.isFinite(raw.ai)) state.ai = raw.ai;
    if (Array.isArray(raw.matches)) state.matches = raw.matches.slice(0, 20);
  }
  return state;
}

export async function getState() {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(await readFile(DATA_FILE, "utf8")));
  } catch {
    cache = defaults();
  }
  return cache;
}

async function persist() {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(cache, null, 2)}\n`);
  await rename(temp, DATA_FILE);
}

const clampInt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
};

export async function recordResult({ winner, playerLines, aiLines }) {
  const state = await getState();
  const delta = winner === "player" ? 5 : -5;
  state.player += delta;
  state.ai -= delta;

  const match = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    winner,
    delta,
    playerLines: clampInt(playerLines),
    aiLines: clampInt(aiLines),
  };
  state.matches.unshift(match);
  state.matches = state.matches.slice(0, 20);

  await persist();
  return { ...state, match };
}

export async function resetState() {
  cache = defaults();
  await persist();
  return cache;
}
