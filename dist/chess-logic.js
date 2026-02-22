// ─── Chess Logic ──────────────────────────────────────────────────────────────

const P = { PAWN: "P", ROOK: "R", KNIGHT: "N", BISHOP: "B", QUEEN: "Q", KING: "K" };
const W = "w", B = "b";
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
    for (const [dr, dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
      const nr = r + dr, nc = c + dc;
      if (inB(nr, nc) && (!board[nr][nc] || enemy(nr, nc))) moves.push([nr, nc]);
    }
  } else if (type === P.KING) {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nr = r + dr, nc = c + dc;
      if (inB(nr, nc) && (!board[nr][nc] || enemy(nr, nc))) moves.push([nr, nc]);
    }
    // Castling (disabled during attack-map generation to avoid recursion)
    if (includeCastling && !piece.moved) {
      const row = color === W ? 7 : 0;
      if (r === row) {
        // Kingside
        if (!board[row][5] && !board[row][6] && board[row][7]?.type === P.ROOK && !board[row][7]?.moved) {
          if (!isInCheck(board, color) && !squareAttacked(board, row, 5, color) && !squareAttacked(board, row, 6, color))
            moves.push([row, 6, 'castleK']);
        }
        // Queenside
        if (!board[row][3] && !board[row][2] && !board[row][1] && board[row][0]?.type === P.ROOK && !board[row][0]?.moved) {
          if (!isInCheck(board, color) && !squareAttacked(board, row, 3, color) && !squareAttacked(board, row, 2, color))
            moves.push([row, 2, 'castleQ']);
        }
      }
    }
  } else {
    const dirs = type === P.ROOK ? [[1,0],[-1,0],[0,1],[0,-1]]
               : type === P.BISHOP ? [[1,1],[1,-1],[-1,1],[-1,-1]]
               : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inB(nr, nc)) break;
        if (board[nr][nc]) { if (enemy(nr, nc)) moves.push([nr, nc]); break; }
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
        if (ms.some(m => m[0] === r && m[1] === c)) return true;
      }
    }
  }
  return false;
}

function isInCheck(board, color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === P.KING && board[r][c]?.color === color)
        return squareAttacked(board, r, c, color);
  return false;
}

function applyMove(board, from, to, ep) {
  const nb = board.map(r => r.map(p => p ? { ...p } : null));
  const piece = { ...nb[from[0]][from[1]], moved: true };
  nb[to[0]][to[1]] = piece;
  nb[from[0]][from[1]] = null;

  // En passant capture
  if (piece.type === P.PAWN && ep && to[0] === ep[0] && to[1] === ep[1]) {
    nb[from[0]][to[1]] = null;
  }
  // Promotion
  if (piece.type === P.PAWN && (to[0] === 0 || to[0] === 7)) {
    nb[to[0]][to[1]] = { type: P.QUEEN, color: piece.color, moved: true };
  }
  // Castling
  if (to[2] === 'castleK') {
    const row = to[0];
    nb[row][5] = { ...nb[row][7], moved: true };
    nb[row][7] = null;
  }
  if (to[2] === 'castleQ') {
    const row = to[0];
    nb[row][3] = { ...nb[row][0], moved: true };
    nb[row][0] = null;
  }
  return nb;
}

function legalMoves(board, r, c, ep) {
  const piece = board[r][c];
  if (!piece) return [];
  return pseudoMoves(board, r, c, ep).filter(to => {
    const nb = applyMove(board, [r, c], to, ep);
    return !isInCheck(nb, piece.color);
  });
}

function allLegalMoves(board, color, ep) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color)
        legalMoves(board, r, c, ep).forEach(to => moves.push({ from: [r, c], to }));
  return moves;
}

