// --- Chess Logic -------------------------------------------------------------

const P = { PAWN: "P", ROOK: "R", KNIGHT: "N", BISHOP: "B", QUEEN: "Q", KING: "K" };
const W = "w", B = "b";

const PROMOTION_TYPES = [P.QUEEN, P.ROOK, P.BISHOP, P.KNIGHT];
const PROMOTION_TO_UCI = {
  [P.QUEEN]: "q",
  [P.ROOK]: "r",
  [P.BISHOP]: "b",
  [P.KNIGHT]: "n",
};
const UCI_TO_PROMOTION = {
  q: P.QUEEN,
  r: P.ROOK,
  b: P.BISHOP,
  n: P.KNIGHT,
};

function normalizePromotionType(type) {
  return PROMOTION_TYPES.includes(type) ? type : P.QUEEN;
}

function promotionTypeToUci(type) {
  return PROMOTION_TO_UCI[normalizePromotionType(type)] ?? "q";
}

const TIME_CONTROLS = [
  { id: "casual", label: "Casual (No Clock)", initialMs: null, incrementMs: 0 },
  { id: "bullet", label: "Bullet 1+0", initialMs: 60_000, incrementMs: 0 },
  { id: "blitz", label: "Blitz 3+2", initialMs: 180_000, incrementMs: 2_000 },
  { id: "rapid", label: "Rapid 10+0", initialMs: 600_000, incrementMs: 0 },
  { id: "classic", label: "Classic 30+0", initialMs: 1_800_000, incrementMs: 0 },
];

const TIME_CONTROL_MAP = Object.fromEntries(TIME_CONTROLS.map((tc) => [tc.id, tc]));

function resolveTimeControl(id) {
  return TIME_CONTROL_MAP[id] ?? TIME_CONTROL_MAP.casual;
}

function formatClock(ms) {
  if (typeof ms !== "number") return "--:--";
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (safeMs < 10_000) {
    const tenths = Math.floor((safeMs % 1000) / 100);
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function mkBoard() {
  const b = Array(8).fill(null).map(() => Array(8).fill(null));
  const back = [P.ROOK, P.KNIGHT, P.BISHOP, P.QUEEN, P.KING, P.BISHOP, P.KNIGHT, P.ROOK];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: B };
    b[1][c] = { type: P.PAWN, color: B };
    b[6][c] = { type: P.PAWN, color: W };
    b[7][c] = { type: back[c], color: W };
  }
  return b;
}

const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function coordToSquare(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return "";
  const r = Number(coord[0]);
  const c = Number(coord[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inB(r, c)) return "";
  return `${"abcdefgh"[c]}${8 - r}`;
}

function squareToCoord(square) {
  const txt = String(square ?? "").trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(txt)) return null;
  const c = txt.charCodeAt(0) - 97;
  const r = 8 - Number(txt[1]);
  return [r, c];
}

function moveToUci(from, to, piece = null, promotionType = null) {
  const fromSq = coordToSquare(from);
  const toSq = coordToSquare(to);
  if (!fromSq || !toSq) return "";
  const promote =
    piece?.type === P.PAWN &&
    (to?.[0] === 0 || to?.[0] === 7)
      ? promotionTypeToUci(promotionType)
      : "";
  return fromSq + toSq + promote;
}

function uciToMove(uci, board, ep) {
  const text = String(uci ?? "").trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(text)) return null;

  const from = squareToCoord(text.slice(0, 2));
  const to = squareToCoord(text.slice(2, 4));
  if (!from || !to) return null;

  const [fr, fc] = from;
  const piece = board?.[fr]?.[fc];
  if (!piece) return null;

  const promotionType = text[4] ? UCI_TO_PROMOTION[text[4]] ?? null : null;

  const legal = legalMoves(board, fr, fc, ep).find(([mr, mc]) => mr === to[0] && mc === to[1]);
  if (!legal) return null;

  return { from, to: legal, promotionType };
}

function boardToFen(board, turn, ep, halfmoveClock = 0, fullmoveNumber = 1) {
  const pieceToFen = {
    [P.PAWN]: "p",
    [P.ROOK]: "r",
    [P.KNIGHT]: "n",
    [P.BISHOP]: "b",
    [P.QUEEN]: "q",
    [P.KING]: "k",
  };

  const rows = [];
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let row = "";
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      const ch = pieceToFen[piece.type] ?? "";
      row += piece.color === W ? ch.toUpperCase() : ch;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }

  const wk = board[7][4];
  const wra = board[7][0];
  const wrh = board[7][7];
  const bk = board[0][4];
  const bra = board[0][0];
  const brh = board[0][7];

  let castling = "";
  if (wk && wk.type === P.KING && wk.color === W && !wk.moved) {
    if (wrh && wrh.type === P.ROOK && wrh.color === W && !wrh.moved) castling += "K";
    if (wra && wra.type === P.ROOK && wra.color === W && !wra.moved) castling += "Q";
  }
  if (bk && bk.type === P.KING && bk.color === B && !bk.moved) {
    if (brh && brh.type === P.ROOK && brh.color === B && !brh.moved) castling += "k";
    if (bra && bra.type === P.ROOK && bra.color === B && !bra.moved) castling += "q";
  }
  if (!castling) castling = "-";

  const epSquare = Array.isArray(ep) && ep.length >= 2 ? coordToSquare(ep) : "";
  const safeTurn = turn === B ? B : W;
  const safeHalfmove = Number.isInteger(halfmoveClock) && halfmoveClock >= 0 ? halfmoveClock : 0;
  const safeFullmove = Number.isInteger(fullmoveNumber) && fullmoveNumber >= 1 ? fullmoveNumber : 1;

  return `${rows.join("/")} ${safeTurn} ${castling} ${epSquare || "-"} ${safeHalfmove} ${safeFullmove}`;
}

function positionKey(board, turn, ep) {
  const fen = boardToFen(board, turn, ep, 0, 1);
  const parts = fen.split(" ");
  return parts.slice(0, 4).join(" ");
}

const WHITE_OPENING_BY_FIRST_MOVE = {
  e2e4: "King's Pawn Opening",
  d2d4: "Queen's Pawn Opening",
  c2c4: "English Opening",
  g1f3: "Zukertort Opening",
  b2b3: "Larsen Opening",
  f2f4: "Bird Opening",
};

const BLACK_DEFENSE_BY_REPLY = {
  e2e4: {
    e7e5: "Open Game",
    c7c5: "Sicilian Defense",
    e7e6: "French Defense",
    c7c6: "Caro-Kann Defense",
    d7d5: "Scandinavian Defense",
    g7g6: "Modern Defense",
    d7d6: "Pirc Setup",
  },
  d2d4: {
    d7d5: "Queen's Pawn Symmetry",
    g8f6: "Indian Defense",
    f7f5: "Dutch Defense",
    e7e6: "QGD Setup",
    d7d6: "Old Indian Setup",
  },
  c2c4: {
    e7e5: "Reversed Sicilian Setup",
    c7c5: "Symmetrical English",
    g8f6: "English / Indian Setup",
    e7e6: "English / Neo-Catalan Setup",
  },
};

const OPENING_LINE_BOOK = [
  {
    seq: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
    white: "Ruy Lopez",
    black: "Open Game (Ruy Lopez)",
  },
  {
    seq: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
    white: "Italian Game",
    black: "Open Game (Italian)",
  },
  {
    seq: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3"],
    white: "Open Sicilian",
    black: "Sicilian Najdorf/Scheveningen Setup",
  },
  {
    seq: ["d2d4", "d7d5", "c2c4"],
    white: "Queen's Gambit",
    black: "Queen's Gambit Declined/Accepted Setup",
  },
  {
    seq: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"],
    white: "Nimzo-Indian Attack Setup",
    black: "Nimzo-Indian Defense",
  },
  {
    seq: ["d2d4", "g8f6", "c2c4", "g7g6"],
    white: "Queen's Pawn with c4",
    black: "King's Indian / Grunfeld Setup",
  },
  {
    seq: ["e2e3", "d7d5", "d2d3"],
    white: "Cow Opening (Anna Cramling)",
    black: "d5 Setup vs Cow",
  },
  {
    seq: ["e2e3", "d7d5", "d2d3", "e7e5", "g1e2", "f8d6", "e2g3", "g8f6", "b1d2"],
    white: "Cow Opening (Anna Cramling)",
    black: "Classical Setup vs Cow",
  },
];

function describeOpening(moveHistory) {
  const history = Array.isArray(moveHistory) ? moveHistory : [];
  if (!history.length) {
    return {
      white: "Start Position",
      black: "Awaiting White move",
      line: "Unclassified",
    };
  }

  const first = history[0] ?? "";
  const second = history[1] ?? "";

  let white = WHITE_OPENING_BY_FIRST_MOVE[first] ?? "Unclassified Opening";
  let black =
    history.length < 2
      ? "Awaiting Black reply"
      : (BLACK_DEFENSE_BY_REPLY[first]?.[second] ?? "Unclassified Defense");

  for (const line of OPENING_LINE_BOOK) {
    if (line.seq.length > history.length) continue;
    let matched = true;
    for (let i = 0; i < line.seq.length; i++) {
      if (line.seq[i] !== history[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      white = line.white;
      black = line.black;
    }
  }

  return {
    white,
    black,
    line: `${white} / ${black}`,
  };
}

function pseudoMoves(board, r, c, ep, includeCastling = true) {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;
  const dir = color === W ? -1 : 1;
  const opp = color === W ? B : W;
  const free = (rr, cc) => inB(rr, cc) && !board[rr][cc];
  const enemy = (rr, cc) => inB(rr, cc) && board[rr][cc]?.color === opp;
  const moves = [];

  if (type === P.PAWN) {
    if (free(r + dir, c)) {
      moves.push([r + dir, c]);
      const home = color === W ? 6 : 1;
      if (r === home && free(r + 2 * dir, c)) moves.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      if (enemy(r + dir, c + dc)) moves.push([r + dir, c + dc]);
      if (ep && ep[0] === r + dir && ep[1] === c + dc) moves.push([r + dir, c + dc]);
    }
  } else if (type === P.KNIGHT) {
    for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inB(nr, nc) && (!board[nr][nc] || enemy(nr, nc))) moves.push([nr, nc]);
    }
  } else if (type === P.KING) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inB(nr, nc) && (!board[nr][nc] || enemy(nr, nc))) moves.push([nr, nc]);
    }

    // Castling (disabled during attack-map generation to avoid recursion)
    if (includeCastling && !piece.moved) {
      const row = color === W ? 7 : 0;
      if (r === row) {
        // Kingside
        if (!board[row][5] && !board[row][6] && board[row][7]?.type === P.ROOK && !board[row][7]?.moved) {
          if (!isInCheck(board, color) && !squareAttacked(board, row, 5, color) && !squareAttacked(board, row, 6, color)) {
            moves.push([row, 6, "castleK"]);
          }
        }
        // Queenside
        if (!board[row][3] && !board[row][2] && !board[row][1] && board[row][0]?.type === P.ROOK && !board[row][0]?.moved) {
          if (!isInCheck(board, color) && !squareAttacked(board, row, 3, color) && !squareAttacked(board, row, 2, color)) {
            moves.push([row, 2, "castleQ"]);
          }
        }
      }
    }
  } else {
    const dirs =
      type === P.ROOK
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : type === P.BISHOP
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (const [dr, dc] of dirs) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (!inB(nr, nc)) break;
        if (board[nr][nc]) {
          if (enemy(nr, nc)) moves.push([nr, nc]);
          break;
        }
        moves.push([nr, nc]);
      }
    }
  }

  return moves;
}

function squareAttacked(board, r, c, color) {
  const opp = color === W ? B : W;
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      if (board[rr][cc]?.color === opp) {
        const ms = pseudoMoves(board, rr, cc, null, false);
        if (ms.some((m) => m[0] === r && m[1] === c)) return true;
      }
    }
  }
  return false;
}

function isInCheck(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.type === P.KING && board[r][c]?.color === color) {
        return squareAttacked(board, r, c, color);
      }
    }
  }
  return false;
}

function applyMove(board, from, to, ep, promotionType = null) {
  const nb = board.map((r) => r.map((p) => (p ? { ...p } : null)));
  const piece = { ...nb[from[0]][from[1]], moved: true };
  nb[to[0]][to[1]] = piece;
  nb[from[0]][from[1]] = null;

  // En passant capture
  if (piece.type === P.PAWN && ep && to[0] === ep[0] && to[1] === ep[1]) {
    nb[from[0]][to[1]] = null;
  }

  // Promotion
  if (piece.type === P.PAWN && (to[0] === 0 || to[0] === 7)) {
    nb[to[0]][to[1]] = { type: normalizePromotionType(promotionType), color: piece.color, moved: true };
  }

  // Castling
  if (to[2] === "castleK") {
    const row = to[0];
    nb[row][5] = { ...nb[row][7], moved: true };
    nb[row][7] = null;
  }
  if (to[2] === "castleQ") {
    const row = to[0];
    nb[row][3] = { ...nb[row][0], moved: true };
    nb[row][0] = null;
  }

  return nb;
}

function legalMoves(board, r, c, ep) {
  const piece = board[r][c];
  if (!piece) return [];
  return pseudoMoves(board, r, c, ep).filter((to) => {
    const nb = applyMove(board, [r, c], to, ep);
    return !isInCheck(nb, piece.color);
  });
}

function allLegalMoves(board, color, ep) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        legalMoves(board, r, c, ep).forEach((to) => moves.push({ from: [r, c], to }));
      }
    }
  }
  return moves;
}

function isInsufficientMaterial(board) {
  const nonKingPieces = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.type === P.KING) continue;
      nonKingPieces.push({
        type: piece.type,
        color: piece.color,
        squareColor: (r + c) % 2,
      });
    }
  }

  if (nonKingPieces.length === 0) return true;

  if (nonKingPieces.some((p) => [P.PAWN, P.ROOK, P.QUEEN].includes(p.type))) {
    return false;
  }

  if (nonKingPieces.length === 1) {
    return [P.BISHOP, P.KNIGHT].includes(nonKingPieces[0].type);
  }

  if (nonKingPieces.length === 2) {
    const bishops = nonKingPieces.filter((p) => p.type === P.BISHOP);
    const knights = nonKingPieces.filter((p) => p.type === P.KNIGHT);

    if (knights.length === 2) return true;

    if (bishops.length === 2) {
      return bishops[0].squareColor === bishops[1].squareColor;
    }
  }

  return false;
}

function evaluateGameStatus(board, turn, ep, { halfmoveClock = 0, positionCounts = null } = {}) {
  const moves = allLegalMoves(board, turn, ep);
  if (moves.length === 0) {
    return {
      status: isInCheck(board, turn) ? "checkmate" : "stalemate",
      drawReason: null,
    };
  }

  if (isInsufficientMaterial(board)) {
    return { status: "draw", drawReason: "insufficient-material" };
  }

  if (halfmoveClock >= 100) {
    return { status: "draw", drawReason: "fifty-move-rule" };
  }

  if (positionCounts instanceof Map) {
    const key = positionKey(board, turn, ep);
    if ((positionCounts.get(key) ?? 0) >= 3) {
      return { status: "draw", drawReason: "threefold-repetition" };
    }
  }

  if (isInCheck(board, turn)) {
    return { status: "check", drawReason: null };
  }

  return { status: "playing", drawReason: null };
}
