// --- App Config + Shared Helpers --------------------------------------------

const PRESENCE_APP = "chess3d";
const PRESENCE_ROOM = "lobby";
const NAME_STORAGE_KEY = "chess3d_player_name";

const STOCKFISH_WORKER_PATH = "./stockfish-18-lite-single.js";
const DEFAULT_STOCKFISH_DEPTH = 10;
const STOCKFISH_DEPTH_MIN = 1;
const STOCKFISH_DEPTH_MAX = 20;

const AI_MODE_RANDOM = "random";
const AI_MODE_STOCKFISH = "stockfish";

const AI_PRESETS = [
  { id: "custom", label: "Custom Engine", limitStrength: false, skill: 20, elo: null, note: "No strength cap." },
  { id: "beginner", label: "Beginner Bot (~900)", limitStrength: true, skill: 2, elo: 900, note: "Good for learning." },
  { id: "club", label: "Club Bot (~1500)", limitStrength: true, skill: 8, elo: 1500, note: "Solid club level." },
  { id: "master", label: "Master Bot (~2200)", limitStrength: true, skill: 16, elo: 2200, note: "Strong tactical play." },
  { id: "magnus", label: "Magnus Bot (Approx)", limitStrength: false, skill: 20, elo: null, note: "Very strong Stockfish preset (not real Magnus)." },
];

const AI_PRESET_MAP = Object.fromEntries(AI_PRESETS.map((preset) => [preset.id, preset]));

const AI_LEVELS = [
  { id: "pathetic", label: "Pathetic", mode: AI_MODE_RANDOM, preset: "custom", depth: 1, note: "Pure random legal moves." },
  { id: "novice", label: "Novice", mode: AI_MODE_STOCKFISH, preset: "beginner", depth: 4, note: "Makes obvious mistakes." },
  { id: "easy", label: "Easy", mode: AI_MODE_STOCKFISH, preset: "beginner", depth: 6, note: "Beginner-friendly Stockfish." },
  { id: "medium", label: "Medium", mode: AI_MODE_STOCKFISH, preset: "club", depth: 9, note: "Club-level challenge." },
  { id: "hard", label: "Hard", mode: AI_MODE_STOCKFISH, preset: "master", depth: 12, note: "Very sharp tactically." },
  { id: "brutal", label: "Brutal", mode: AI_MODE_STOCKFISH, preset: "custom", depth: 16, note: "Strong unrestricted engine." },
  { id: "magnus", label: "Magnus (Approx)", mode: AI_MODE_STOCKFISH, preset: "magnus", depth: 20, note: "Maximum strength preset, not real Magnus." },
];

const AI_LEVEL_MAP = Object.fromEntries(AI_LEVELS.map((level) => [level.id, level]));

const TERMINAL_STATUSES = new Set(["checkmate", "stalemate", "draw", "resigned", "timeout"]);

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function clampStockfishDepth(depth) {
  const parsed = Number(depth);
  if (!Number.isFinite(parsed)) return DEFAULT_STOCKFISH_DEPTH;
  return Math.max(STOCKFISH_DEPTH_MIN, Math.min(STOCKFISH_DEPTH_MAX, Math.floor(parsed)));
}

function resolveAiPreset(id) {
  return AI_PRESET_MAP[id] ?? AI_PRESET_MAP.custom;
}

function resolveAiLevel(id) {
  return AI_LEVEL_MAP[id] ?? AI_LEVEL_MAP.pathetic;
}

function normalizePresenceStatus(status) {
  return status === "playing" ? "playing" : "lobby";
}

function presenceLabel(status) {
  return normalizePresenceStatus(status) === "playing" ? "playing" : "in lobby";
}

function drawReasonLabel(reason) {
  const normalized = String(reason ?? "").toLowerCase();
  if (normalized === "threefold-repetition") return "Threefold repetition";
  if (normalized === "fifty-move-rule") return "50-move rule";
  if (normalized === "insufficient-material") return "Insufficient material";
  return "Draw";
}

function formatSignalError(error, signalUrl = "") {
  const raw = String(error?.message ?? error ?? "").trim();
  const msg = raw || "Unknown error";
  const low = msg.toLowerCase();
  const endpoint = String(signalUrl || "").trim();
  const endpointHint = endpoint ? ` (${endpoint})` : "";

  if (low.includes("socket error")) {
    return `socket error${endpointHint}. Check that the signaling worker URL is live and uses wss://.`;
  }

  if (low.includes("closed before welcome")) {
    return `connection closed before welcome${endpointHint}. Verify worker route and room handling.`;
  }

  if (low.includes("already connected")) {
    return "already connected. Refresh this tab if connection state is stale.";
  }

  if (low.includes("network")) {
    return `network error${endpointHint}. Check internet connectivity and Cloudflare worker status.`;
  }

  return msg;
}
