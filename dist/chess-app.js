(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var require_chess_app = __commonJS({
    "src/chess-app.jsx"() {
      const { useState, useEffect, useRef, useCallback } = React;
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
        { id: "magnus", label: "Magnus Bot (Approx)", limitStrength: false, skill: 20, elo: null, note: "Very strong Stockfish preset (not real Magnus)." }
      ];
      const AI_PRESET_MAP = Object.fromEntries(AI_PRESETS.map((preset) => [preset.id, preset]));
      const AI_LEVELS = [
        { id: "pathetic", label: "Pathetic (Random)", mode: AI_MODE_RANDOM, preset: "custom", depth: 1, note: "Pure random legal moves." },
        { id: "novice", label: "Novice", mode: AI_MODE_STOCKFISH, preset: "beginner", depth: 4, note: "Makes obvious mistakes." },
        { id: "easy", label: "Easy", mode: AI_MODE_STOCKFISH, preset: "beginner", depth: 6, note: "Beginner-friendly Stockfish." },
        { id: "medium", label: "Medium", mode: AI_MODE_STOCKFISH, preset: "club", depth: 9, note: "Club-level challenge." },
        { id: "hard", label: "Hard", mode: AI_MODE_STOCKFISH, preset: "master", depth: 12, note: "Very sharp tactically." },
        { id: "brutal", label: "Brutal", mode: AI_MODE_STOCKFISH, preset: "custom", depth: 16, note: "Strong unrestricted engine." },
        { id: "magnus", label: "Magnus (Approx)", mode: AI_MODE_STOCKFISH, preset: "magnus", depth: 20, note: "Maximum strength preset, not real Magnus." }
      ];
      const AI_LEVEL_MAP = Object.fromEntries(AI_LEVELS.map((level) => [level.id, level]));
      function clampStockfishDepth(depth) {
        const parsed = Number(depth);
        if (!Number.isFinite(parsed)) return DEFAULT_STOCKFISH_DEPTH;
        return Math.max(STOCKFISH_DEPTH_MIN, Math.min(STOCKFISH_DEPTH_MAX, Math.floor(parsed)));
      }
      function resolveAiPreset(id) {
        var _a;
        return (_a = AI_PRESET_MAP[id]) != null ? _a : AI_PRESET_MAP.custom;
      }
      function resolveAiLevel(id) {
        var _a;
        return (_a = AI_LEVEL_MAP[id]) != null ? _a : AI_LEVEL_MAP.pathetic;
      }
      function normalizePresenceStatus(status) {
        return status === "playing" ? "playing" : "lobby";
      }
      function presenceLabel(status) {
        return normalizePresenceStatus(status) === "playing" ? "playing" : "in lobby";
      }
      function Chess3D() {
        const mountRef = useRef(null);
        const sr = useRef({
          board: mkBoard(),
          turn: W,
          selected: null,
          legalMovesList: [],
          ep: null,
          // en passant square
          mode: null,
          // 'pvp' | 'pvai'
          playerColor: W,
          status: "idle",
          // idle | playing | check | checkmate | stalemate | resigned | timeout
          timeControlId: "blitz",
          clockIncrementMs: 0,
          clockMs: { [W]: null, [B]: null },
          clockLastTickAt: 0,
          moveHistory: [],
          halfmoveClock: 0,
          fullmoveNumber: 1,
          openingWhite: "Start Position",
          openingBlack: "Awaiting White move",
          aiMode: AI_MODE_RANDOM,
          aiDepth: DEFAULT_STOCKFISH_DEPTH,
          aiPreset: "custom",
          aiLevelId: "pathetic",
          aiThinkToken: 0,
          aiTimerId: null,
          pieceMeshes: /* @__PURE__ */ new Map(),
          labelSprites: /* @__PURE__ */ new Map(),
          highlights: [],
          graveyardMeshes: [],
          captured: { [W]: [], [B]: [] },
          // pieces each color has captured
          scene: null,
          camera: null,
          renderer: null,
          raycaster: new THREE.Raycaster(),
          mouse: new THREE.Vector2(),
          squareMeshes: [],
          animId: null,
          spherical: { theta: 0, phi: 0.85, radius: 14 },
          orbitActive: false,
          lastMouse: { x: 0, y: 0 },
          dragStart: null,
          wasDrag: false,
          // ── Network ──
          netClient: null,
          // P2PMeshClient instance
          presenceClient: null,
          // lobby presence socket
          netPeerId: null,
          // opponent's peer ID
          netRole: null
          // "host" | "join"
        });
        const handleClickRef = useRef(null);
        const netMsgRef = useRef(null);
        const [ui, setUi] = useState({
          mode: null,
          turn: W,
          status: "idle",
          playerColor: W,
          aiThinking: false,
          timeControlId: "blitz",
          clockMs: { [W]: null, [B]: null },
          aiMode: AI_MODE_RANDOM,
          aiDepth: DEFAULT_STOCKFISH_DEPTH,
          aiPreset: "custom",
          aiLevelId: "pathetic",
          openingWhite: "Start Position",
          openingBlack: "Awaiting White move"
        });
        const [net, setNet] = useState({
          screen: null,
          // null | "lobby" | "waiting" | "joining"
          code: "",
          // host's generated room code
          inputCode: "",
          // joiner's typed code
          timeControlId: "blitz",
          peerStatus: "",
          // "" | "waiting" | "connected" | "disconnected"
          statusMsg: "",
          // human-readable connection status
          error: "",
          nameReady: false,
          nameInput: "",
          playerName: "",
          selfId: "",
          onlinePlayers: [],
          presenceState: "offline",
          // offline | connecting | online
          incomingChallenge: null,
          outgoingChallenge: null,
          aiMode: AI_MODE_RANDOM,
          stockfishDepth: DEFAULT_STOCKFISH_DEPTH,
          stockfishPreset: "custom",
          aiLevelId: "pathetic"
        });
        const stockfishRef = useRef({
          worker: null,
          ready: false,
          readyResolvers: [],
          readyRejectors: [],
          pendingSearch: null
        });
        const refresh = useCallback(() => {
          const s = sr.current;
          setUi({
            mode: s.mode,
            turn: s.turn,
            status: s.status,
            playerColor: s.playerColor,
            aiThinking: s.aiThinking || false,
            timeControlId: s.timeControlId,
            clockMs: { ...s.clockMs },
            aiMode: s.aiMode,
            aiDepth: s.aiDepth,
            aiPreset: s.aiPreset,
            aiLevelId: s.aiLevelId,
            openingWhite: s.openingWhite,
            openingBlack: s.openingBlack
          });
        }, []);
        const terminateStockfish = useCallback(() => {
          var _a;
          const state = stockfishRef.current;
          if ((_a = state.pendingSearch) == null ? void 0 : _a.reject) {
            state.pendingSearch.reject(new Error("search-cancelled"));
            state.pendingSearch = null;
          }
          if (state.readyRejectors.length) {
            for (const rejectReady of state.readyRejectors) {
              rejectReady(new Error("engine-terminated"));
            }
          }
          state.ready = false;
          state.readyResolvers = [];
          state.readyRejectors = [];
          if (state.worker) {
            try {
              state.worker.terminate();
            } catch (e) {
            }
            state.worker = null;
          }
        }, []);
        const ensureStockfishReady = useCallback(async () => {
          const state = stockfishRef.current;
          if (!state.worker) {
            const worker = new Worker(STOCKFISH_WORKER_PATH);
            state.worker = worker;
            state.ready = false;
            worker.addEventListener("message", (event) => {
              var _a, _b;
              const line = String((_a = event.data) != null ? _a : "").trim();
              if (!line) return;
              if (line === "uciok") {
                try {
                  worker.postMessage("isready");
                } catch (e) {
                }
                return;
              }
              if (line === "readyok") {
                state.ready = true;
                const waiters = [...state.readyResolvers];
                state.readyResolvers = [];
                state.readyRejectors = [];
                for (const resolveReady of waiters) resolveReady(worker);
                return;
              }
              if (line.startsWith("bestmove ")) {
                if (!state.pendingSearch) return;
                const move = (_b = line.split(/\s+/)[1]) != null ? _b : "";
                const pending = state.pendingSearch;
                state.pendingSearch = null;
                pending.resolve(move);
              }
            });
            worker.addEventListener("error", () => {
              var _a;
              const err = new Error("stockfish-worker-error");
              if ((_a = state.pendingSearch) == null ? void 0 : _a.reject) {
                state.pendingSearch.reject(err);
                state.pendingSearch = null;
              }
              if (state.readyRejectors.length) {
                for (const rejectReady of state.readyRejectors) rejectReady(err);
              }
              state.ready = false;
              state.readyResolvers = [];
              state.readyRejectors = [];
              try {
                worker.terminate();
              } catch (e) {
              }
              if (state.worker === worker) state.worker = null;
            });
            try {
              worker.postMessage("uci");
            } catch (e) {
              terminateStockfish();
              throw new Error("stockfish-init-failed");
            }
          }
          if (state.ready && state.worker) return state.worker;
          return await new Promise((resolve, reject) => {
            const currentWorker = state.worker;
            if (!currentWorker) {
              reject(new Error("stockfish-missing-worker"));
              return;
            }
            const timeout = setTimeout(() => {
              state.readyResolvers = state.readyResolvers.filter((fn) => fn !== onReady);
              state.readyRejectors = state.readyRejectors.filter((fn) => fn !== onFail);
              reject(new Error("stockfish-ready-timeout"));
            }, 12e3);
            const onReady = (worker) => {
              clearTimeout(timeout);
              resolve(worker);
            };
            const onFail = (err) => {
              clearTimeout(timeout);
              reject(err instanceof Error ? err : new Error(String(err)));
            };
            state.readyResolvers.push(onReady);
            state.readyRejectors.push(onFail);
            try {
              currentWorker.postMessage("isready");
            } catch (e) {
              clearTimeout(timeout);
              state.readyResolvers = state.readyResolvers.filter((fn) => fn !== onReady);
              state.readyRejectors = state.readyRejectors.filter((fn) => fn !== onFail);
              reject(new Error("stockfish-ready-post-failed"));
            }
          });
        }, [terminateStockfish]);
        const applyStockfishPreset = useCallback((worker, presetId) => {
          const preset = resolveAiPreset(presetId);
          worker.postMessage("setoption name Ponder value false");
          worker.postMessage("setoption name Threads value 1");
          worker.postMessage("setoption name Skill Level value " + preset.skill);
          if (preset.limitStrength && Number.isFinite(preset.elo)) {
            worker.postMessage("setoption name UCI_LimitStrength value true");
            worker.postMessage("setoption name UCI_Elo value " + preset.elo);
          } else {
            worker.postMessage("setoption name UCI_LimitStrength value false");
          }
        }, []);
        const requestStockfishBestMove = useCallback(async (fen, depth, presetId) => {
          const worker = await ensureStockfishReady();
          const state = stockfishRef.current;
          if (state.pendingSearch) {
            try {
              worker.postMessage("stop");
            } catch (e) {
            }
            state.pendingSearch.reject(new Error("search-superseded"));
            state.pendingSearch = null;
          }
          const safeDepth = clampStockfishDepth(depth);
          applyStockfishPreset(worker, presetId);
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              var _a;
              if (((_a = state.pendingSearch) == null ? void 0 : _a.reject) === rejectSearch) {
                state.pendingSearch = null;
              }
              try {
                worker.postMessage("stop");
              } catch (e) {
              }
              reject(new Error("stockfish-search-timeout"));
            }, 15e3);
            const resolveSearch = (bestMove) => {
              clearTimeout(timeout);
              resolve(bestMove);
            };
            const rejectSearch = (err) => {
              clearTimeout(timeout);
              reject(err instanceof Error ? err : new Error(String(err)));
            };
            state.pendingSearch = { resolve: resolveSearch, reject: rejectSearch };
            try {
              worker.postMessage("position fen " + fen);
              worker.postMessage("go depth " + safeDepth);
            } catch (e) {
              clearTimeout(timeout);
              state.pendingSearch = null;
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
        }, [ensureStockfishReady, applyStockfishPreset]);
        const syncBoard = useCallback(() => {
          const s = sr.current;
          if (!s.scene) return;
          s.pieceMeshes.forEach((m) => s.scene.remove(m));
          s.pieceMeshes.clear();
          s.labelSprites.forEach((sp) => s.scene.remove(sp));
          s.labelSprites.clear();
          const SYMBOLS = {
            [W]: { [P.KING]: "\u2654", [P.QUEEN]: "\u2655", [P.ROOK]: "\u2656", [P.BISHOP]: "\u2657", [P.KNIGHT]: "\u2658", [P.PAWN]: "\u2659" },
            [B]: { [P.KING]: "\u265A", [P.QUEEN]: "\u265B", [P.ROOK]: "\u265C", [P.BISHOP]: "\u265D", [P.KNIGHT]: "\u265E", [P.PAWN]: "\u265F" }
          };
          const makePieceSprite = (type, color) => {
            const sz = 128;
            const cv = document.createElement("canvas");
            cv.width = cv.height = sz;
            const cx = cv.getContext("2d");
            const isW = color === W;
            cx.beginPath();
            cx.arc(sz / 2, sz / 2, sz / 2 - 3, 0, Math.PI * 2);
            cx.fillStyle = isW ? "rgba(20,10,0,0.78)" : "rgba(255,245,220,0.78)";
            cx.fill();
            cx.strokeStyle = isW ? "rgba(200,160,80,0.9)" : "rgba(100,60,10,0.9)";
            cx.lineWidth = 5;
            cx.stroke();
            cx.font = `${sz * 0.56}px serif`;
            cx.textAlign = "center";
            cx.textBaseline = "middle";
            cx.fillStyle = isW ? "#f5e8cc" : "#1a0800";
            cx.shadowColor = isW ? "rgba(0,0,0,0.8)" : "rgba(255,220,150,0.6)";
            cx.shadowBlur = 6;
            cx.fillText(SYMBOLS[color][type], sz / 2, sz / 2 + 4);
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            const mat = new THREE.SpriteMaterial({
              map: tex,
              transparent: true,
              depthWrite: false,
              opacity: 0
              // starts invisible; animate loop drives opacity from phi
            });
            const sp = new THREE.Sprite(mat);
            sp.scale.set(0.55, 0.55, 1);
            return sp;
          };
          const PIECE_TOP = {
            [P.PAWN]: 0.58,
            [P.ROOK]: 0.76,
            [P.KNIGHT]: 0.82,
            [P.BISHOP]: 0.88,
            [P.QUEEN]: 0.92,
            [P.KING]: 0.96
          };
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const p = s.board[r][c];
              if (!p) continue;
              const mesh = makePiece(p.type, p.color);
              const wx = c - 3.5, wz = r - 3.5;
              mesh.position.set(wx, 0.04, wz);
              mesh.traverse((ch) => {
                if (ch.isMesh) ch.userData = { row: r, col: c, isPiece: true };
              });
              mesh.userData = { row: r, col: c, isPiece: true };
              s.scene.add(mesh);
              s.pieceMeshes.set(`${r},${c}`, mesh);
              const sp = makePieceSprite(p.type, p.color);
              sp.position.set(wx, PIECE_TOP[p.type] + 0.18, wz);
              s.scene.add(sp);
              s.labelSprites.set(`${r},${c}`, sp);
            }
          }
        }, []);
        const syncHighlights = useCallback(() => {
          const s = sr.current;
          if (!s.scene) return;
          s.highlights.forEach((m) => s.scene.remove(m));
          s.highlights = [];
          if (s.selected) {
            const [sr2, sc] = s.selected;
            const hm = new THREE.Mesh(
              new THREE.BoxGeometry(0.98, 0.02, 0.98),
              new THREE.MeshPhongMaterial({ color: 4521864, transparent: true, opacity: 0.55, depthWrite: false })
            );
            hm.position.set(sc - 3.5, 0.06, sr2 - 3.5);
            s.scene.add(hm);
            s.highlights.push(hm);
          }
          s.legalMovesList.forEach(([mr, mc]) => {
            const hasTarget = !!s.board[mr][mc];
            const geo = hasTarget ? new THREE.RingGeometry(0.36, 0.5, 20) : new THREE.CircleGeometry(0.21, 20);
            const hm = new THREE.Mesh(
              geo,
              new THREE.MeshPhongMaterial({ color: hasTarget ? 16729156 : 4521864, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
            );
            hm.rotation.x = -Math.PI / 2;
            hm.position.set(mc - 3.5, 0.065, mr - 3.5);
            s.scene.add(hm);
            s.highlights.push(hm);
          });
        }, []);
        const syncGraveyard = useCallback(() => {
          const s = sr.current;
          if (!s.scene) return;
          s.graveyardMeshes.forEach((m) => s.scene.remove(m));
          s.graveyardMeshes = [];
          const SCALE = 0.44;
          const COLS = 2;
          const COL_GAP = 0.72;
          const ROW_GAP = 0.8;
          const FLANK_X = 5.1;
          const BASE_Y = 0.18;
          const START_Z = -((Math.min(16, 16) / COLS - 1) / 2) * ROW_GAP;
          const placeGraveyard = (pieces, pieceColor, xBase) => {
            pieces.forEach((piece, idx) => {
              const col = idx % COLS;
              const row = Math.floor(idx / COLS);
              const x = xBase + (col - (COLS - 1) / 2) * COL_GAP;
              const z = START_Z + row * ROW_GAP;
              const mesh = makePiece(piece.type, pieceColor);
              mesh.scale.setScalar(SCALE);
              mesh.position.set(x, BASE_Y, z);
              mesh.rotation.y = Math.random() * 0.3 - 0.15;
              s.scene.add(mesh);
              s.graveyardMeshes.push(mesh);
            });
          };
          placeGraveyard(s.captured[W], B, +FLANK_X);
          placeGraveyard(s.captured[B], W, -FLANK_X);
        }, []);
        const updateStatus = useCallback((board, turn, ep) => {
          const moves = allLegalMoves(board, turn, ep);
          if (moves.length === 0) return isInCheck(board, turn) ? "checkmate" : "stalemate";
          if (isInCheck(board, turn)) return "check";
          return "playing";
        }, []);
        const timeoutGame = useCallback((flaggedColor, { relay = true } = {}) => {
          const s = sr.current;
          if (!s.mode) return;
          if (s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;
          const color = flaggedColor === W || flaggedColor === B ? flaggedColor : s.turn;
          s.turn = color;
          s.status = "timeout";
          s.selected = null;
          s.legalMovesList = [];
          s.aiThinking = false;
          if (s.aiTimerId) {
            clearTimeout(s.aiTimerId);
            s.aiTimerId = null;
          }
          s.aiThinkToken += 1;
          s.clockLastTickAt = 0;
          if (typeof s.clockMs[color] === "number") {
            s.clockMs[color] = 0;
          }
          if (relay && s.mode === "net" && s.netClient && s.netPeerId) {
            s.netClient.sendTo(s.netPeerId, { type: "timeout", color });
          }
          syncHighlights();
          refresh();
        }, [syncHighlights, refresh]);
        const tickClock = useCallback((now = performance.now(), { relayOnTimeout = true } = {}) => {
          var _a;
          const s = sr.current;
          if (!s.mode || s.timeControlId === "casual") return false;
          if (!(s.status === "playing" || s.status === "check")) return false;
          if (!s.clockLastTickAt) {
            s.clockLastTickAt = now;
            return false;
          }
          const elapsed = Math.max(0, now - s.clockLastTickAt);
          if (elapsed <= 0) return false;
          const active = s.turn;
          const current = (_a = s.clockMs) == null ? void 0 : _a[active];
          if (typeof current !== "number") {
            s.clockLastTickAt = now;
            return false;
          }
          const next = current - elapsed;
          s.clockLastTickAt = now;
          if (next <= 0) {
            s.clockMs[active] = 0;
            timeoutGame(active, { relay: relayOnTimeout });
            return true;
          }
          s.clockMs[active] = next;
          return true;
        }, [timeoutGame]);
        const doMove = useCallback((from, to, { relay = true } = {}) => {
          var _a;
          const s = sr.current;
          tickClock(performance.now(), { relayOnTimeout: relay });
          if (s.status === "timeout") return false;
          if (!Array.isArray(from) || !Array.isArray(to)) return false;
          const fr = from[0], fc = from[1];
          const tr = to[0], tc = to[1];
          const inRange = (n) => Number.isInteger(n) && n >= 0 && n < 8;
          if (!inRange(fr) || !inRange(fc) || !inRange(tr) || !inRange(tc)) return false;
          const piece = (_a = s.board[fr]) == null ? void 0 : _a[fc];
          if (!piece) return false;
          const legal = legalMoves(s.board, fr, fc, s.ep).find(([mr, mc, marker]) => {
            if (mr !== tr || mc !== tc) return false;
            const wanted = typeof to[2] === "string" ? to[2] : null;
            const got = typeof marker === "string" ? marker : null;
            return wanted === got;
          });
          if (!legal) return false;
          const captured = s.board[legal[0]][legal[1]];
          const isEP = piece.type === P.PAWN && s.ep && legal[0] === s.ep[0] && legal[1] === s.ep[1];
          const epPiece = isEP ? s.board[fr][legal[1]] : null;
          const isCapture = !!(captured || isEP);
          const isCastle = legal[2] === "castleK" || legal[2] === "castleQ";
          const newBoard = applyMove(s.board, [fr, fc], legal, s.ep);
          const uciMove = moveToUci([fr, fc], legal, piece);
          if (captured) s.captured[piece.color].push({ type: captured.type, color: captured.color });
          if (epPiece) s.captured[piece.color].push({ type: epPiece.type, color: epPiece.color });
          let newEp = null;
          if (piece.type === P.PAWN && Math.abs(legal[0] - fr) === 2) {
            newEp = [(fr + legal[0]) / 2, legal[1]];
          }
          if (piece.type === P.PAWN || isCapture) s.halfmoveClock = 0;
          else s.halfmoveClock += 1;
          if (piece.color === B) s.fullmoveNumber += 1;
          if (uciMove) s.moveHistory = [...s.moveHistory, uciMove];
          const opening = describeOpening(s.moveHistory);
          s.openingWhite = opening.white;
          s.openingBlack = opening.black;
          s.board = newBoard;
          s.ep = newEp;
          s.turn = s.turn === W ? B : W;
          s.selected = null;
          s.legalMovesList = [];
          const newStatus = updateStatus(newBoard, s.turn, newEp);
          s.status = newStatus;
          if (s.timeControlId !== "casual") {
            if (typeof s.clockMs[piece.color] === "number" && s.clockIncrementMs > 0) {
              s.clockMs[piece.color] += s.clockIncrementMs;
            }
            s.clockLastTickAt = performance.now();
          }
          if (newStatus === "checkmate") Sounds.checkmate();
          else if (newStatus === "stalemate") Sounds.stalemate();
          else if (newStatus === "check") Sounds.check();
          else if (isCastle) Sounds.castle();
          else if (isCapture) Sounds.capture();
          else Sounds.move();
          if (relay && s.mode === "net" && s.netClient && s.netPeerId) {
            s.netClient.sendTo(s.netPeerId, { type: "move", from: [fr, fc], to: legal });
          }
          syncBoard();
          syncHighlights();
          syncGraveyard();
          refresh();
          return true;
        }, [syncBoard, syncHighlights, syncGraveyard, refresh, updateStatus, tickClock]);
        const resignGame = useCallback((resigningColor = null, { relay = true } = {}) => {
          const s = sr.current;
          if (!s.mode) return;
          if (s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;
          const color = resigningColor === W || resigningColor === B ? resigningColor : s.mode === "net" ? s.playerColor : s.turn;
          s.turn = color;
          s.status = "resigned";
          s.selected = null;
          s.legalMovesList = [];
          s.aiThinking = false;
          if (s.aiTimerId) {
            clearTimeout(s.aiTimerId);
            s.aiTimerId = null;
          }
          s.aiThinkToken += 1;
          s.clockLastTickAt = 0;
          if (relay && s.mode === "net" && s.netClient && s.netPeerId) {
            s.netClient.sendTo(s.netPeerId, { type: "resign", color });
          }
          syncHighlights();
          refresh();
        }, [syncHighlights, refresh]);
        const aiMove = useCallback(() => {
          const s = sr.current;
          if (s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;
          const moves = allLegalMoves(s.board, s.turn, s.ep);
          if (!moves.length) return;
          s.aiThinkToken += 1;
          const thinkToken = s.aiThinkToken;
          if (s.aiTimerId) {
            clearTimeout(s.aiTimerId);
            s.aiTimerId = null;
          }
          const delay = s.aiMode === AI_MODE_STOCKFISH ? 220 + Math.random() * 220 : 800 + Math.random() * 900 + Math.random() * 500;
          s.aiThinking = true;
          setUi((v) => ({ ...v, aiThinking: true }));
          s.aiTimerId = setTimeout(async () => {
            sr.current.aiTimerId = null;
            const stale = () => {
              const cur = sr.current;
              return cur.aiThinkToken !== thinkToken || cur.status === "checkmate" || cur.status === "stalemate" || cur.status === "resigned" || cur.status === "timeout" || cur.turn === cur.playerColor;
            };
            if (stale()) {
              sr.current.aiThinking = false;
              setUi((v) => ({ ...v, aiThinking: false }));
              return;
            }
            let chosenMove = null;
            if (sr.current.aiMode === AI_MODE_STOCKFISH) {
              try {
                const fen = boardToFen(
                  sr.current.board,
                  sr.current.turn,
                  sr.current.ep,
                  sr.current.halfmoveClock,
                  sr.current.fullmoveNumber
                );
                const bestMove = await requestStockfishBestMove(
                  fen,
                  sr.current.aiDepth,
                  sr.current.aiPreset
                );
                if (bestMove && bestMove !== "(none)") {
                  chosenMove = uciToMove(bestMove, sr.current.board, sr.current.ep);
                }
              } catch (err) {
                console.warn("Stockfish search failed, using random fallback", err);
              }
            }
            if (stale()) {
              sr.current.aiThinking = false;
              setUi((v) => ({ ...v, aiThinking: false }));
              return;
            }
            if (!chosenMove) {
              const fallback = allLegalMoves(sr.current.board, sr.current.turn, sr.current.ep);
              if (fallback.length) {
                const mv = fallback[Math.floor(Math.random() * fallback.length)];
                chosenMove = { from: mv.from, to: mv.to };
              }
            }
            sr.current.aiThinking = false;
            setUi((v) => ({ ...v, aiThinking: false }));
            if (chosenMove) doMove(chosenMove.from, chosenMove.to);
          }, delay);
        }, [doMove, requestStockfishBestMove]);
        useEffect(() => {
          const timer = setInterval(() => {
            const s = sr.current;
            if (!s.mode || s.timeControlId === "casual") return;
            if (!(s.status === "playing" || s.status === "check")) return;
            const changed = tickClock(performance.now());
            if (changed && s.status !== "timeout") {
              refresh();
            }
          }, 100);
          return () => clearInterval(timer);
        }, [tickClock, refresh]);
        handleClickRef.current = useCallback((e) => {
          const s = sr.current;
          if (!s.mode || s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;
          if (s.mode === "pvai" && s.turn !== s.playerColor) return;
          if (s.mode === "net" && s.turn !== s.playerColor) return;
          const rect = s.renderer.domElement.getBoundingClientRect();
          s.mouse.x = (e.clientX - rect.left) / rect.width * 2 - 1;
          s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          s.raycaster.setFromCamera(s.mouse, s.camera);
          const targets = [];
          s.squareMeshes.flat().forEach((m) => targets.push(m));
          s.pieceMeshes.forEach((g) => g.traverse((ch) => {
            if (ch.isMesh) targets.push(ch);
          }));
          const hits = s.raycaster.intersectObjects(targets, false);
          if (!hits.length) return;
          const { row, col } = hits[0].object.userData;
          if (row === void 0) return;
          if (s.selected) {
            const [sr2, sc] = s.selected;
            const legal = s.legalMovesList.find(([mr, mc]) => mr === row && mc === col);
            if (legal) {
              doMove([sr2, sc], legal);
              if (s.mode === "pvai" && s.status !== "checkmate" && s.status !== "stalemate" && s.status !== "resigned" && s.status !== "timeout") {
                aiMove();
              }
            } else {
              const clicked = s.board[row][col];
              if ((clicked == null ? void 0 : clicked.color) === s.turn) {
                s.selected = [row, col];
                s.legalMovesList = legalMoves(s.board, row, col, s.ep);
                Sounds.select();
              } else {
                s.selected = null;
                s.legalMovesList = [];
              }
              syncHighlights();
            }
          } else {
            const clicked = s.board[row][col];
            if ((clicked == null ? void 0 : clicked.color) === s.turn) {
              s.selected = [row, col];
              s.legalMovesList = legalMoves(s.board, row, col, s.ep);
              Sounds.select();
              syncHighlights();
            }
          }
        }, [doMove, aiMove, syncHighlights]);
        useEffect(() => {
          const s = sr.current;
          const el = mountRef.current;
          if (!el) return;
          const W3 = el.clientWidth, H3 = el.clientHeight;
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(856343);
          scene.fog = new THREE.Fog(856343, 18, 30);
          s.scene = scene;
          const camera = new THREE.PerspectiveCamera(42, W3 / H3, 0.1, 100);
          s.camera = camera;
          const renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(W3, H3);
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.1;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          el.appendChild(renderer.domElement);
          s.renderer = renderer;
          scene.add(new THREE.AmbientLight(16774368, 0.3));
          const sun = new THREE.DirectionalLight(16774368, 1.6);
          sun.position.set(4, 14, 5);
          sun.castShadow = true;
          sun.shadow.mapSize.width = 2048;
          sun.shadow.mapSize.height = 2048;
          sun.shadow.camera.near = 0.5;
          sun.shadow.camera.far = 50;
          sun.shadow.camera.left = -9;
          sun.shadow.camera.right = 9;
          sun.shadow.camera.top = 9;
          sun.shadow.camera.bottom = -9;
          sun.shadow.bias = -4e-4;
          scene.add(sun);
          const fill = new THREE.DirectionalLight(9090280, 0.55);
          fill.position.set(-7, 5, -5);
          scene.add(fill);
          const rim = new THREE.DirectionalLight(16772829, 0.4);
          rim.position.set(2, 3, -10);
          scene.add(rim);
          const bounce = new THREE.PointLight(13928474, 0.55, 18);
          bounce.position.set(-3, 0.4, 3);
          scene.add(bounce);
          const cool = new THREE.PointLight(4482764, 0.3, 16);
          cool.position.set(5, 1.5, -4);
          scene.add(cool);
          const makeSquareTex = (isLight, sz = 256) => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = sz;
            const cx = cv.getContext("2d");
            const base = isLight ? { r: 238, g: 215, b: 175 } : { r: 105, g: 68, b: 38 };
            cx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
            cx.fillRect(0, 0, sz, sz);
            for (let i = 0; i < 6; i++) {
              const grd = cx.createRadialGradient(
                Math.random() * sz,
                Math.random() * sz,
                0,
                Math.random() * sz,
                Math.random() * sz,
                sz * (0.3 + Math.random() * 0.5)
              );
              const alpha = isLight ? 0.06 + Math.random() * 0.07 : 0.08 + Math.random() * 0.1;
              const lighter = isLight ? `rgba(255,245,220,${alpha})` : `rgba(160,100,50,${alpha})`;
              const darker = isLight ? `rgba(180,140,80,${alpha})` : `rgba(40,18,6,${alpha})`;
              grd.addColorStop(0, lighter);
              grd.addColorStop(1, darker);
              cx.fillStyle = grd;
              cx.fillRect(0, 0, sz, sz);
            }
            const nVeins = isLight ? 7 : 5;
            for (let v = 0; v < nVeins; v++) {
              cx.globalAlpha = isLight ? 0.1 + Math.random() * 0.13 : 0.12 + Math.random() * 0.16;
              cx.strokeStyle = isLight ? `rgb(${base.r - 55},${base.g - 40},${base.b - 25})` : `rgb(${base.r + 50},${base.g + 30},${base.b + 14})`;
              cx.lineWidth = 0.6 + Math.random() * 1.4;
              cx.beginPath();
              const sx = Math.random() * sz, sy = Math.random() * sz;
              cx.moveTo(sx, sy);
              cx.bezierCurveTo(
                sx + Math.random() * 100 - 50,
                sy + Math.random() * 100 - 50,
                sx + Math.random() * 140 - 70,
                sy + Math.random() * 140 - 70,
                sx + Math.random() * sz * 0.8 - sz * 0.4 + sz / 2,
                sy + Math.random() * sz * 0.8 - sz * 0.4 + sz / 2
              );
              cx.stroke();
              cx.globalAlpha *= 0.5;
              cx.lineWidth = 0.3 + Math.random() * 0.6;
              cx.beginPath();
              cx.moveTo(sx + Math.random() * 6 - 3, sy + Math.random() * 6 - 3);
              cx.bezierCurveTo(
                sx + Math.random() * 90 - 45,
                sy + Math.random() * 90 - 45,
                sx + Math.random() * 120 - 60,
                sy + Math.random() * 120 - 60,
                sx + Math.random() * sz * 0.7 - sz * 0.35 + sz / 2,
                sy + Math.random() * sz * 0.7 - sz * 0.35 + sz / 2
              );
              cx.stroke();
            }
            cx.globalAlpha = 1;
            for (let i = 0; i < 900; i++) {
              const v = isLight ? Math.floor(Math.random() * 40 + (Math.random() > 0.5 ? base.r - 30 : base.r + 20)) : Math.floor(Math.random() * 35 + (Math.random() > 0.5 ? base.r - 20 : base.r + 25));
              cx.globalAlpha = 0.025 + Math.random() * 0.04;
              cx.fillStyle = isLight ? `rgb(${v},${v - 20},${v - 50})` : `rgb(${v + 30},${v + 10},${v - 5})`;
              const dot = Math.random() * 1.8 + 0.3;
              cx.fillRect(Math.random() * sz, Math.random() * sz, dot, dot);
            }
            cx.globalAlpha = 1;
            const gloss = cx.createLinearGradient(0, 0, sz * 0.7, sz * 0.7);
            gloss.addColorStop(0, `rgba(255,255,240,0)`);
            gloss.addColorStop(0.3, `rgba(255,255,240,${isLight ? 0.07 : 0.04})`);
            gloss.addColorStop(0.6, `rgba(255,255,240,${isLight ? 0.1 : 0.06})`);
            gloss.addColorStop(1, `rgba(255,255,240,0)`);
            cx.fillStyle = gloss;
            cx.fillRect(0, 0, sz, sz);
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            return tex;
          };
          const makeBorderTex = (sz = 512) => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = sz;
            const cx = cv.getContext("2d");
            cx.fillStyle = "rgb(52,22,5)";
            cx.fillRect(0, 0, sz, sz);
            for (let i = 0; i < 16; i++) {
              const y = i / 16 * sz;
              cx.globalAlpha = 0.08 + Math.random() * 0.1;
              cx.fillStyle = Math.random() > 0.5 ? "rgb(80,35,10)" : "rgb(25,8,1)";
              cx.fillRect(0, y, sz, sz / 16 + Math.random() * 12 - 6);
            }
            for (let i = 0; i < 100; i++) {
              const x = Math.random() * sz;
              cx.globalAlpha = 0.18 + Math.random() * 0.32;
              cx.strokeStyle = Math.random() > 0.45 ? `rgb(${8 + Math.floor(Math.random() * 12)},${3 + Math.floor(Math.random() * 5)},0)` : `rgb(${75 + Math.floor(Math.random() * 30)},${32 + Math.floor(Math.random() * 18)},${8 + Math.floor(Math.random() * 8)})`;
              cx.lineWidth = 0.5 + Math.random() * 2.5;
              cx.beginPath();
              cx.moveTo(x + Math.random() * 16 - 8, 0);
              cx.bezierCurveTo(
                x + Math.random() * 22 - 11,
                sz * 0.3,
                x + Math.random() * 22 - 11,
                sz * 0.65,
                x + Math.random() * 16 - 8,
                sz
              );
              cx.stroke();
            }
            for (let i = 0; i < 8; i++) {
              const grd = cx.createLinearGradient(Math.random() * sz, 0, Math.random() * sz + 60, sz);
              grd.addColorStop(0, "rgba(255,200,100,0)");
              grd.addColorStop(0.45, `rgba(255,200,100,${0.06 + Math.random() * 0.1})`);
              grd.addColorStop(1, "rgba(255,200,100,0)");
              cx.globalAlpha = 1;
              cx.fillStyle = grd;
              cx.fillRect(0, 0, sz, sz);
            }
            for (let i = 0; i < 1200; i++) {
              cx.globalAlpha = 0.03 + Math.random() * 0.06;
              cx.fillStyle = Math.random() > 0.5 ? "rgb(6,2,0)" : "rgb(90,42,12)";
              const d = Math.random() * 2 + 0.4;
              cx.fillRect(Math.random() * sz, Math.random() * sz, d, d);
            }
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(2, 2);
            return tex;
          };
          const makeSquareRoughTex = (isLight, sz = 128) => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = sz;
            const cx = cv.getContext("2d");
            cx.fillStyle = isLight ? "#666" : "#777";
            cx.fillRect(0, 0, sz, sz);
            for (let i = 0; i < 10; i++) {
              const grd = cx.createLinearGradient(Math.random() * sz, 0, Math.random() * sz + 30, sz);
              const pk = 0.12 + Math.random() * 0.18;
              grd.addColorStop(0, "rgba(255,255,255,0)");
              grd.addColorStop(0.4 + Math.random() * 0.2, `rgba(255,255,255,${pk})`);
              grd.addColorStop(1, "rgba(255,255,255,0)");
              cx.fillStyle = grd;
              cx.fillRect(0, 0, sz, sz);
            }
            for (let i = 0; i < 500; i++) {
              const v = Math.floor(Math.random() * 80 + 80);
              cx.fillStyle = `rgb(${v},${v},${v})`;
              const d = Math.random() * 2 + 0.3;
              cx.fillRect(Math.random() * sz, Math.random() * sz, d, d);
            }
            return new THREE.CanvasTexture(cv);
          };
          const borderTex = makeBorderTex();
          const borderRough = makeSquareRoughTex(false, 256);
          const border = new THREE.Mesh(
            new THREE.BoxGeometry(8.7, 0.35, 8.7),
            new THREE.MeshStandardMaterial({
              map: borderTex,
              roughnessMap: borderRough,
              color: 16777215,
              roughness: 0.62,
              metalness: 0.02
            })
          );
          border.position.y = -0.18;
          border.receiveShadow = true;
          scene.add(border);
          s.squareMeshes = [];
          for (let r = 0; r < 8; r++) {
            s.squareMeshes[r] = [];
            for (let c = 0; c < 8; c++) {
              const light = (r + c) % 2 === 0;
              const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(1, 0.12, 1),
                new THREE.MeshStandardMaterial({
                  map: makeSquareTex(light),
                  roughnessMap: makeSquareRoughTex(light),
                  color: 16777215,
                  roughness: light ? 0.42 : 0.55,
                  metalness: 0.01
                })
              );
              mesh.position.set(c - 3.5, 0, r - 3.5);
              mesh.receiveShadow = true;
              mesh.userData = { row: r, col: c, isSquare: true };
              scene.add(mesh);
              s.squareMeshes[r][c] = mesh;
            }
          }
          const makeLabel = (text, sz = 96) => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = sz;
            const cx = cv.getContext("2d");
            cx.shadowColor = "rgba(0,0,0,0.9)";
            cx.shadowBlur = 10;
            cx.shadowOffsetX = 0;
            cx.shadowOffsetY = 0;
            cx.fillStyle = "#d4b87a";
            cx.font = `bold ${sz * 0.68}px "Palatino Linotype", Palatino, serif`;
            cx.textAlign = "center";
            cx.textBaseline = "middle";
            cx.fillText(text, sz / 2, sz / 2);
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            return tex;
          };
          const spriteMat = (tex) => new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true
          });
          const LABEL_Y = 0.22;
          const LABEL_DIST = 4.82;
          const LABEL_SIZE = 0.58;
          const files = "abcdefgh".split("");
          const ranks = "87654321".split("");
          files.forEach((letter, i) => {
            const wx = i - 3.5;
            [LABEL_DIST, -LABEL_DIST].forEach((wz) => {
              const sp = new THREE.Sprite(spriteMat(makeLabel(letter)));
              sp.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
              sp.position.set(wx, LABEL_Y, wz);
              scene.add(sp);
            });
          });
          ranks.forEach((rank, i) => {
            const wz = i - 3.5;
            [LABEL_DIST, -LABEL_DIST].forEach((wx) => {
              const sp = new THREE.Sprite(spriteMat(makeLabel(rank)));
              sp.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
              sp.position.set(wx, LABEL_Y, wz);
              scene.add(sp);
            });
          });
          const updateCam = () => {
            const { theta, phi, radius } = s.spherical;
            camera.position.set(
              radius * Math.sin(phi) * Math.sin(theta),
              radius * Math.cos(phi),
              radius * Math.sin(phi) * Math.cos(theta)
            );
            camera.lookAt(0, 0.5, 0);
          };
          s.updateCam = updateCam;
          updateCam();
          const onDown = (e) => {
            if (e.button === 2) {
              s.orbitActive = true;
              s.lastMouse = { x: e.clientX, y: e.clientY };
            } else {
              s.dragStart = { x: e.clientX, y: e.clientY };
              s.wasDrag = false;
            }
          };
          const onMove = (e) => {
            if (s.orbitActive) {
              const dx = e.clientX - s.lastMouse.x;
              const dy = e.clientY - s.lastMouse.y;
              s.spherical.theta -= dx * 8e-3;
              s.spherical.phi = Math.max(0.18, Math.min(1.45, s.spherical.phi + dy * 8e-3));
              s.lastMouse = { x: e.clientX, y: e.clientY };
              updateCam();
            } else if (s.dragStart) {
              const dx = e.clientX - s.dragStart.x, dy = e.clientY - s.dragStart.y;
              if (Math.hypot(dx, dy) > 4) s.wasDrag = true;
            }
          };
          const onUp = (e) => {
            if (e.button === 2) {
              s.orbitActive = false;
              return;
            }
            if (!s.wasDrag && s.dragStart) handleClickRef.current(e);
            s.dragStart = null;
          };
          const onWheel = (e) => {
            s.spherical.radius = Math.max(5, Math.min(22, s.spherical.radius + e.deltaY * 0.012));
            updateCam();
          };
          renderer.domElement.addEventListener("mousedown", onDown);
          renderer.domElement.addEventListener("mousemove", onMove);
          renderer.domElement.addEventListener("mouseup", onUp);
          renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
          renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
          const animate = () => {
            s.animId = requestAnimationFrame(animate);
            const phi = s.spherical.phi;
            const fadeStart = 0.3;
            const fadeEnd = 0.62;
            const labelOpacity = Math.max(0, Math.min(
              1,
              1 - (phi - fadeStart) / (fadeEnd - fadeStart)
            ));
            if (s.labelSprites.size > 0) {
              s.labelSprites.forEach((sp) => {
                sp.material.opacity = labelOpacity;
              });
            }
            renderer.render(scene, camera);
          };
          animate();
          const onResize = () => {
            if (!el) return;
            camera.aspect = el.clientWidth / el.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(el.clientWidth, el.clientHeight);
          };
          window.addEventListener("resize", onResize);
          return () => {
            var _a, _b;
            cancelAnimationFrame(s.animId);
            window.removeEventListener("resize", onResize);
            renderer.domElement.removeEventListener("mousedown", onDown);
            renderer.domElement.removeEventListener("mousemove", onMove);
            renderer.domElement.removeEventListener("mouseup", onUp);
            renderer.domElement.removeEventListener("wheel", onWheel);
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
            renderer.dispose();
            try {
              (_a = sr.current.netClient) == null ? void 0 : _a.close();
            } catch (e) {
            }
            try {
              (_b = sr.current.presenceClient) == null ? void 0 : _b.close();
            } catch (e) {
            }
            if (sr.current.aiTimerId) {
              clearTimeout(sr.current.aiTimerId);
              sr.current.aiTimerId = null;
            }
            terminateStockfish();
          };
        }, [terminateStockfish]);
        const startGameRef = useRef(null);
        const presenceMsgRef = useRef(null);
        const buildOnlinePlayers = useCallback(() => {
          var _a, _b;
          const client = sr.current.presenceClient;
          if (!client) return [];
          const safeName = (v) => {
            const t = String(v != null ? v : "").trim();
            return t || "Player";
          };
          const list = [];
          if (client.localId) {
            list.push({
              id: client.localId,
              name: safeName((_a = client.meta) == null ? void 0 : _a.name),
              status: normalizePresenceStatus((_b = client.meta) == null ? void 0 : _b.status),
              isSelf: true
            });
          }
          for (const [id, meta] of client.peerMeta.entries()) {
            list.push({
              id,
              name: safeName(meta == null ? void 0 : meta.name),
              status: normalizePresenceStatus(meta == null ? void 0 : meta.status),
              isSelf: false
            });
          }
          list.sort((a, b) => {
            if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          return list;
        }, []);
        const refreshOnlinePlayers = useCallback(() => {
          const players = buildOnlinePlayers();
          setNet((v) => {
            var _a, _b;
            return {
              ...v,
              onlinePlayers: players,
              selfId: (_b = (_a = players.find((p) => p.isSelf)) == null ? void 0 : _a.id) != null ? _b : v.selfId
            };
          });
        }, [buildOnlinePlayers]);
        const disconnectNet = useCallback(() => {
          const s = sr.current;
          if (s.netClient) {
            try {
              s.netClient.close();
            } catch (e) {
            }
            s.netClient = null;
          }
          s.netPeerId = null;
          s.netRole = null;
        }, []);
        const disconnectPresence = useCallback(() => {
          const s = sr.current;
          if (s.presenceClient) {
            try {
              s.presenceClient.close();
            } catch (e) {
            }
            s.presenceClient = null;
          }
          setNet((v) => ({
            ...v,
            presenceState: "offline",
            onlinePlayers: [],
            selfId: "",
            incomingChallenge: null,
            outgoingChallenge: null
          }));
        }, []);
        const setPresenceStatus = useCallback((status) => {
          const nextStatus = normalizePresenceStatus(status);
          const client = sr.current.presenceClient;
          if (client) {
            client.updateMeta({ status: nextStatus });
          }
          setNet((v) => {
            const selfId = v.selfId;
            if (!selfId) return v;
            return {
              ...v,
              onlinePlayers: v.onlinePlayers.map(
                (p) => p.id === selfId ? { ...p, status: nextStatus } : p
              )
            };
          });
        }, []);
        const connectPresence = useCallback(async (rawName) => {
          const desiredName = String(rawName != null ? rawName : "").replace(/\s+/g, " ").trim().slice(0, 24);
          if (!desiredName) {
            setNet((v) => ({ ...v, error: "Enter your name." }));
            return false;
          }
          try {
            window.localStorage.setItem(NAME_STORAGE_KEY, desiredName);
          } catch (e) {
          }
          const s = sr.current;
          if (s.presenceClient) {
            try {
              s.presenceClient.close();
            } catch (e) {
            }
            s.presenceClient = null;
          }
          setNet((v) => ({
            ...v,
            presenceState: "connecting",
            statusMsg: "Connecting online lobby...",
            error: "",
            playerName: desiredName,
            nameInput: desiredName
          }));
          const client = new P2PMeshClient({
            app: PRESENCE_APP,
            room: PRESENCE_ROOM,
            signalUrl: getSignalUrl(),
            enableRtc: false,
            meta: { name: desiredName, status: "lobby" },
            onStatus: (msg) => {
              setNet((v) => ({ ...v, statusMsg: v.screen === "lobby" ? msg : v.statusMsg }));
            },
            onSelfMeta: (meta) => {
              var _a;
              const assigned = String((_a = meta == null ? void 0 : meta.name) != null ? _a : desiredName).trim() || desiredName;
              try {
                window.localStorage.setItem(NAME_STORAGE_KEY, assigned);
              } catch (e) {
              }
              setNet((v) => ({ ...v, playerName: assigned, nameInput: assigned }));
              refreshOnlinePlayers();
            },
            onPeerJoin: () => refreshOnlinePlayers(),
            onPeerLeave: () => refreshOnlinePlayers(),
            onPeerMeta: () => refreshOnlinePlayers(),
            onServerMessage: (msg) => {
              var _a;
              return (_a = presenceMsgRef.current) == null ? void 0 : _a.call(presenceMsgRef, msg);
            }
          });
          s.presenceClient = client;
          try {
            await client.connect();
            setNet((v) => {
              var _a, _b, _c, _d, _e;
              return {
                ...v,
                nameReady: true,
                playerName: String((_b = (_a = client.meta) == null ? void 0 : _a.name) != null ? _b : desiredName).trim() || desiredName,
                nameInput: String((_d = (_c = client.meta) == null ? void 0 : _c.name) != null ? _d : desiredName).trim() || desiredName,
                selfId: (_e = client.localId) != null ? _e : "",
                presenceState: "online",
                statusMsg: "Online lobby connected",
                error: ""
              };
            });
            refreshOnlinePlayers();
            return true;
          } catch (e) {
            s.presenceClient = null;
            setNet((v) => ({
              ...v,
              presenceState: "offline",
              error: `Could not connect online lobby: ${e.message}`,
              statusMsg: ""
            }));
            return false;
          }
        }, [refreshOnlinePlayers]);
        const ensurePresenceConnected = useCallback(async () => {
          if (sr.current.presenceClient) return true;
          const fallbackName = (net.playerName || net.nameInput || "").trim();
          if (!fallbackName) {
            setNet((v) => ({ ...v, error: "Enter your name first." }));
            return false;
          }
          return connectPresence(fallbackName);
        }, [connectPresence, net.playerName, net.nameInput]);
        const submitName = useCallback(async () => {
          const ok = await connectPresence(net.nameInput);
          if (!ok) return;
          setNet((v) => ({ ...v, screen: null, error: "" }));
        }, [connectPresence, net.nameInput]);
        const openOnlineLobby = useCallback(async () => {
          const ok = await ensurePresenceConnected();
          if (!ok) return;
          setPresenceStatus("lobby");
          setNet((v) => ({
            ...v,
            screen: "lobby",
            error: "",
            incomingChallenge: null,
            outgoingChallenge: null
          }));
          refreshOnlinePlayers();
        }, [ensurePresenceConnected, setPresenceStatus, refreshOnlinePlayers]);
        const hostGame = useCallback(async (timeControlIdInput, roomCodeInput = null) => {
          const signalUrl = getSignalUrl();
          const timeControl = resolveTimeControl(timeControlIdInput);
          const code = String(roomCodeInput || genRoomCode()).trim().toUpperCase();
          if (!code) return false;
          setNet((v) => ({
            ...v,
            screen: "waiting",
            code,
            timeControlId: timeControl.id,
            peerStatus: "waiting",
            error: "",
            statusMsg: "Connecting to game server..."
          }));
          const s = sr.current;
          disconnectNet();
          const client = new P2PMeshClient({
            app: "chess3d",
            room: `room-${code}`,
            signalUrl,
            onStatus: (msg) => setNet((v) => ({ ...v, statusMsg: msg })),
            onPeerJoin: (peerId) => {
              s.netPeerId = peerId;
              setNet((v) => ({ ...v, peerStatus: "connecting", statusMsg: "Peer found - establishing connection..." }));
            },
            onPeerOpen: (peerId) => {
              var _a;
              s.netPeerId = peerId;
              client.sendTo(peerId, { type: "start", yourColor: B, timeControlId: timeControl.id });
              setNet((v) => ({ ...v, screen: null, peerStatus: "connected", statusMsg: "", outgoingChallenge: null, incomingChallenge: null }));
              (_a = startGameRef.current) == null ? void 0 : _a.call(startGameRef, "net", W, timeControl.id);
            },
            onPeerClose: () => setNet((v) => ({ ...v, peerStatus: "disconnected", statusMsg: "Opponent disconnected" })),
            onMessage: (msg) => {
              var _a;
              return (_a = netMsgRef.current) == null ? void 0 : _a.call(netMsgRef, msg);
            }
          });
          s.netClient = client;
          s.netRole = "host";
          try {
            await client.connect();
            return true;
          } catch (e) {
            setNet((v) => ({ ...v, screen: "lobby", error: `Could not reach signaling server: ${e.message}`, statusMsg: "" }));
            disconnectNet();
            return false;
          }
        }, [disconnectNet]);
        const joinGame = useCallback(async (code) => {
          const clean = String(code != null ? code : "").trim().toUpperCase();
          if (!clean) {
            setNet((v) => ({ ...v, error: "Missing room code" }));
            return false;
          }
          const signalUrl = getSignalUrl();
          setNet((v) => ({
            ...v,
            screen: "joining",
            peerStatus: "waiting",
            error: "",
            statusMsg: "Connecting to game server..."
          }));
          const s = sr.current;
          disconnectNet();
          const client = new P2PMeshClient({
            app: "chess3d",
            room: `room-${clean}`,
            signalUrl,
            onStatus: (msg) => setNet((v) => ({ ...v, statusMsg: msg })),
            onPeerJoin: () => setNet((v) => ({ ...v, statusMsg: "Host found - establishing connection..." })),
            onPeerOpen: (peerId) => {
              s.netPeerId = peerId;
              setNet((v) => ({ ...v, peerStatus: "connected", statusMsg: "Connected! Waiting for host to start..." }));
            },
            onPeerClose: () => setNet((v) => ({ ...v, peerStatus: "disconnected", statusMsg: "Host disconnected" })),
            onMessage: (msg) => {
              var _a;
              return (_a = netMsgRef.current) == null ? void 0 : _a.call(netMsgRef, msg);
            }
          });
          s.netClient = client;
          s.netRole = "join";
          try {
            await client.connect();
            return true;
          } catch (e) {
            setNet((v) => ({ ...v, screen: "lobby", error: `Could not reach signaling server: ${e.message}`, statusMsg: "" }));
            disconnectNet();
            return false;
          }
        }, [disconnectNet]);
        const challengePlayer = useCallback(async (peerId) => {
          var _a;
          if (ui.mode === "net") {
            setNet((v) => ({ ...v, error: "Finish the current game before challenging another player." }));
            return;
          }
          const target = net.onlinePlayers.find((p) => p.id === peerId && !p.isSelf);
          if (!target) {
            setNet((v) => ({ ...v, error: "Selected player is no longer online." }));
            return;
          }
          if (normalizePresenceStatus(target.status) === "playing") {
            setNet((v) => ({ ...v, error: `${target.name} is already playing.` }));
            return;
          }
          const presenceOk = await ensurePresenceConnected();
          if (!presenceOk) return;
          const roomCode = genRoomCode();
          const timeControlId = resolveTimeControl(net.timeControlId).id;
          const hosted = await hostGame(timeControlId, roomCode);
          if (!hosted) return;
          (_a = sr.current.presenceClient) == null ? void 0 : _a.sendDirect(peerId, {
            type: "challenge",
            roomCode,
            timeControlId,
            fromName: net.playerName || "Player"
          });
          setNet((v) => ({
            ...v,
            outgoingChallenge: {
              toId: peerId,
              toName: target.name,
              roomCode,
              timeControlId
            },
            statusMsg: `Challenge sent to ${target.name}...`,
            error: ""
          }));
        }, [hostGame, ensurePresenceConnected, net.onlinePlayers, net.timeControlId, net.playerName, ui.mode]);
        const acceptChallenge = useCallback(async () => {
          var _a;
          const challenge = net.incomingChallenge;
          if (!challenge) return;
          setNet((v) => ({ ...v, incomingChallenge: null, error: "" }));
          (_a = sr.current.presenceClient) == null ? void 0 : _a.sendDirect(challenge.fromId, {
            type: "challenge-accepted",
            roomCode: challenge.roomCode,
            timeControlId: challenge.timeControlId,
            byName: net.playerName || "Player"
          });
          await joinGame(challenge.roomCode);
        }, [joinGame, net.incomingChallenge, net.playerName]);
        const declineChallenge = useCallback(() => {
          var _a;
          const challenge = net.incomingChallenge;
          if (!challenge) return;
          (_a = sr.current.presenceClient) == null ? void 0 : _a.sendDirect(challenge.fromId, {
            type: "challenge-declined",
            roomCode: challenge.roomCode,
            byName: net.playerName || "Player"
          });
          setNet((v) => ({ ...v, incomingChallenge: null }));
        }, [net.incomingChallenge, net.playerName]);
        const startGame = useCallback((mode, playerColor = W, timeControlId = "casual", aiConfig = null) => {
          var _a, _b, _c, _d, _e, _f, _g, _h;
          const s = sr.current;
          const timeControl = resolveTimeControl(timeControlId);
          if (mode !== "net") disconnectNet();
          const nextAiMode = (_b = (_a = aiConfig == null ? void 0 : aiConfig.mode) != null ? _a : s.aiMode) != null ? _b : AI_MODE_RANDOM;
          const nextAiPreset = (_d = (_c = aiConfig == null ? void 0 : aiConfig.preset) != null ? _c : s.aiPreset) != null ? _d : "custom";
          const nextAiDepth = clampStockfishDepth((_f = (_e = aiConfig == null ? void 0 : aiConfig.depth) != null ? _e : s.aiDepth) != null ? _f : DEFAULT_STOCKFISH_DEPTH);
          const nextAiLevelId = (_h = (_g = aiConfig == null ? void 0 : aiConfig.levelId) != null ? _g : s.aiLevelId) != null ? _h : "pathetic";
          if (s.aiTimerId) {
            clearTimeout(s.aiTimerId);
            s.aiTimerId = null;
          }
          s.aiThinkToken += 1;
          s.board = mkBoard();
          s.turn = W;
          s.selected = null;
          s.legalMovesList = [];
          s.ep = null;
          s.mode = mode;
          s.playerColor = playerColor;
          s.status = "playing";
          s.timeControlId = timeControl.id;
          s.clockIncrementMs = timeControl.incrementMs;
          s.clockMs = timeControl.initialMs == null ? { [W]: null, [B]: null } : { [W]: timeControl.initialMs, [B]: timeControl.initialMs };
          s.clockLastTickAt = timeControl.initialMs == null ? 0 : performance.now();
          s.aiThinking = false;
          s.captured = { [W]: [], [B]: [] };
          s.moveHistory = [];
          s.halfmoveClock = 0;
          s.fullmoveNumber = 1;
          const opening = describeOpening([]);
          s.openingWhite = opening.white;
          s.openingBlack = opening.black;
          s.aiMode = nextAiMode;
          s.aiDepth = nextAiDepth;
          s.aiPreset = nextAiPreset;
          s.aiLevelId = nextAiLevelId;
          if (mode !== "pvai" || nextAiMode === AI_MODE_RANDOM) {
            terminateStockfish();
          }
          s.spherical.theta = playerColor === W ? 0 : Math.PI;
          s.spherical.phi = 0.85;
          s.spherical.radius = 14;
          if (s.updateCam) s.updateCam();
          syncBoard();
          syncHighlights();
          syncGraveyard();
          refresh();
          setPresenceStatus(mode === "net" ? "playing" : "lobby");
          if (mode === "pvai" && nextAiMode === AI_MODE_STOCKFISH) {
            ensureStockfishReady().then((worker) => {
              worker.postMessage("ucinewgame");
              worker.postMessage("isready");
            }).catch(() => {
            });
          }
          if (mode === "pvai" && playerColor === B) {
            setTimeout(() => {
              if (sr.current.turn !== sr.current.playerColor) aiMove();
            }, 600);
          }
        }, [syncBoard, syncHighlights, syncGraveyard, refresh, aiMove, disconnectNet, setPresenceStatus, ensureStockfishReady, terminateStockfish]);
        startGameRef.current = startGame;
        presenceMsgRef.current = async ({ from, payload }) => {
          var _a, _b, _c, _d;
          if (!payload || typeof payload !== "object") return;
          if (payload.type === "challenge") {
            const roomCode = String((_a = payload.roomCode) != null ? _a : "").trim().toUpperCase();
            if (!roomCode) return;
            const timeControlId = resolveTimeControl(payload.timeControlId).id;
            const fromName = String((_b = payload.fromName) != null ? _b : "Player").trim() || "Player";
            if (ui.mode === "net" || net.screen === "waiting" || net.screen === "joining") {
              (_c = sr.current.presenceClient) == null ? void 0 : _c.sendDirect(from, {
                type: "challenge-declined",
                roomCode,
                byName: net.playerName || "Player"
              });
              return;
            }
            setNet((v) => ({
              ...v,
              screen: "lobby",
              incomingChallenge: {
                fromId: from,
                fromName,
                roomCode,
                timeControlId
              },
              error: ""
            }));
            return;
          }
          if (payload.type === "challenge-accepted") {
            setNet((v) => ({
              ...v,
              outgoingChallenge: null,
              statusMsg: "Challenge accepted. Waiting for game connection...",
              error: ""
            }));
            return;
          }
          if (payload.type === "challenge-declined") {
            const byName = String((_d = payload.byName) != null ? _d : "Opponent").trim() || "Opponent";
            setNet((v) => ({
              ...v,
              outgoingChallenge: null,
              screen: "lobby",
              error: `${byName} declined your challenge.`
            }));
            disconnectNet();
            setPresenceStatus("lobby");
            return;
          }
        };
        netMsgRef.current = ({ from, data }) => {
          var _a;
          const s = sr.current;
          if (!data || typeof data !== "object") return;
          if (data.type === "start") {
            const myColor = data.yourColor === B ? B : W;
            const gameClock = resolveTimeControl(data.timeControlId).id;
            if (from) s.netPeerId = from;
            setNet((v) => ({ ...v, screen: null, peerStatus: "connected", statusMsg: "", timeControlId: gameClock, outgoingChallenge: null, incomingChallenge: null }));
            (_a = startGameRef.current) == null ? void 0 : _a.call(startGameRef, "net", myColor, gameClock);
            return;
          }
          if (from && s.netPeerId && from !== s.netPeerId) return;
          if (data.type === "move") {
            if (s.mode !== "net" || s.turn === s.playerColor) return;
            const { from: mvFrom, to } = data;
            if (!Array.isArray(mvFrom) || !Array.isArray(to)) return;
            if (mvFrom.length < 2 || to.length < 2) return;
            doMove(mvFrom, to, { relay: false });
            return;
          }
          if (data.type === "resign") {
            const resignedColor = (data == null ? void 0 : data.color) === W || (data == null ? void 0 : data.color) === B ? data.color : s.playerColor === W ? B : W;
            setNet((v) => ({ ...v, statusMsg: "Opponent resigned" }));
            resignGame(resignedColor, { relay: false });
            return;
          }
          if (data.type === "timeout") {
            const flaggedColor = (data == null ? void 0 : data.color) === W || (data == null ? void 0 : data.color) === B ? data.color : s.playerColor === W ? B : W;
            setNet((v) => ({ ...v, statusMsg: "Opponent flagged on time" }));
            timeoutGame(flaggedColor, { relay: false });
            return;
          }
        };
        useEffect(() => {
          let saved = "";
          try {
            saved = window.localStorage.getItem(NAME_STORAGE_KEY) || "";
          } catch (e) {
          }
          if (saved) {
            setNet((v) => ({ ...v, nameInput: v.nameInput || saved }));
          }
        }, []);
        useEffect(() => {
          if (ui.mode === "net" && (ui.status === "checkmate" || ui.status === "stalemate" || ui.status === "resigned" || ui.status === "timeout")) {
            setPresenceStatus("lobby");
          }
        }, [ui.mode, ui.status, setPresenceStatus]);
        const turnLabel = ui.turn === W ? "White" : "Black";
        const statusMsg = () => {
          if (ui.status === "checkmate") return `\u2620 Checkmate \u2014 ${ui.turn === W ? "Black" : "White"} wins!`;
          if (ui.status === "stalemate") return "\u{1F91D} Stalemate \u2014 Draw";
          if (ui.status === "resigned") return `\u{1F3F3} ${ui.turn === W ? "White" : "Black"} resigned \u2014 ${ui.turn === W ? "Black" : "White"} wins!`;
          if (ui.status === "timeout") return `\u23F0 ${ui.turn === W ? "White" : "Black"} flagged \u2014 ${ui.turn === W ? "Black" : "White"} wins!`;
          if (ui.status === "check") return `\u26A0 ${turnLabel} is in Check!`;
          if (ui.status === "playing") {
            if (ui.mode === "net") {
              return ui.turn === ui.playerColor ? "\u2694 Your turn" : "\u23F3 Opponent's turn";
            }
            return `${turnLabel}'s turn`;
          }
          return "";
        };
        const isOver = ui.status === "checkmate" || ui.status === "stalemate" || ui.status === "resigned" || ui.status === "timeout";
        const activeTimeControl = resolveTimeControl(ui.timeControlId);
        const hasClock = activeTimeControl.initialMs != null;
        const currentAiPreset = resolveAiPreset(ui.aiPreset);
        const currentAiLevel = resolveAiLevel(ui.aiLevelId);
        const aiSummary = ui.aiMode === AI_MODE_RANDOM ? "Pathetic (random moves)" : currentAiLevel.label + " \xB7 " + currentAiPreset.label + " \xB7 depth " + ui.aiDepth;
        const btn = (label, onClick, color = "#8b6914", extra = {}) => /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick,
            style: {
              padding: "11px 22px",
              background: color,
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.95em",
              cursor: "pointer",
              fontFamily: "'Palatino Linotype', Palatino, serif",
              fontWeight: "bold",
              letterSpacing: "0.03em",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              transition: "filter 0.15s",
              ...extra
            },
            onMouseEnter: (e) => e.currentTarget.style.filter = "brightness(1.2)",
            onMouseLeave: (e) => e.currentTarget.style.filter = ""
          },
          label
        );
        const cardStyle = {
          background: "linear-gradient(145deg, #1a1200, #0d1117 60%)",
          border: "2px solid #6b4f10",
          borderRadius: "18px",
          padding: "44px 48px",
          textAlign: "center",
          color: "#f0d9b5",
          minWidth: "360px",
          maxWidth: "420px",
          boxShadow: "0 0 60px rgba(180,130,30,0.15)"
        };
        const overlayStyle = {
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(4px)",
          zIndex: 20
        };
        const inputStyle = {
          width: "100%",
          padding: "10px 14px",
          fontSize: "1.3em",
          letterSpacing: "0.18em",
          textAlign: "center",
          fontFamily: "monospace",
          fontWeight: "bold",
          background: "#0d1117",
          color: "#d4a843",
          border: "2px solid #6b4f10",
          borderRadius: "8px",
          outline: "none",
          boxSizing: "border-box",
          textTransform: "uppercase"
        };
        const serverInputStyle = {
          width: "100%",
          padding: "10px 12px",
          fontSize: "0.9em",
          letterSpacing: "0.02em",
          textAlign: "left",
          fontFamily: "monospace",
          fontWeight: "bold",
          background: "#0d1117",
          color: "#d4a843",
          border: "2px solid #6b4f10",
          borderRadius: "8px",
          outline: "none",
          boxSizing: "border-box",
          textTransform: "none"
        };
        const timeSelectStyle = {
          ...serverInputStyle,
          appearance: "none",
          cursor: "pointer"
        };
        const nameInputStyle = {
          ...serverInputStyle,
          fontFamily: "'Palatino Linotype', Palatino, serif",
          fontWeight: "normal",
          textTransform: "none",
          letterSpacing: "0.01em"
        };
        return /* @__PURE__ */ React.createElement("div", { style: {
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "#0d1117",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Palatino Linotype', Palatino, serif"
        } }, /* @__PURE__ */ React.createElement("style", null, `
        @keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `), /* @__PURE__ */ React.createElement("div", { style: {
          padding: "10px 20px",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #2a1f0a",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
          zIndex: 10,
          flexShrink: 0
        } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "1.5em", color: "#d4a843", fontWeight: "bold", letterSpacing: "0.06em" } }, "\u265F 3D CHESS"), ui.mode && /* @__PURE__ */ React.createElement("div", { style: {
          padding: "5px 14px",
          borderRadius: "20px",
          fontSize: "0.88em",
          background: isOver ? "#5c1010" : ui.status === "check" ? "#6b3a00" : "rgba(255,255,255,0.08)",
          color: isOver ? "#ff8888" : ui.status === "check" ? "#ffcc44" : "#d4c5a9",
          border: `1px solid ${isOver ? "#aa3333" : ui.status === "check" ? "#cc8800" : "#3a2f1a"}`,
          fontWeight: "bold"
        } }, statusMsg()), ui.mode === "pvai" && ui.aiThinking && /* @__PURE__ */ React.createElement("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "5px 14px",
          borderRadius: "20px",
          background: "rgba(80,60,20,0.4)",
          border: "1px solid #6b4f10",
          color: "#c8a040",
          fontSize: "0.84em",
          fontStyle: "italic"
        } }, /* @__PURE__ */ React.createElement("span", { style: { animation: "pulse 1s ease-in-out infinite" } }, "\u25CF"), "AI is thinking\u2026"), ui.mode === "pvai" && /* @__PURE__ */ React.createElement("div", { style: {
          padding: "5px 12px",
          borderRadius: "20px",
          fontSize: "0.8em",
          background: "rgba(30,50,90,0.35)",
          border: "1px solid #355a95",
          color: "#9bc2ff"
        } }, "AI: ", aiSummary), ui.mode && /* @__PURE__ */ React.createElement("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          padding: "5px 12px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid #3a2f1a",
          color: "#c9b38b",
          fontSize: "0.76em"
        } }, /* @__PURE__ */ React.createElement("span", null, "White opening: ", ui.openingWhite), /* @__PURE__ */ React.createElement("span", null, "Black defense: ", ui.openingBlack)), ui.mode === "net" && /* @__PURE__ */ React.createElement("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "5px 14px",
          borderRadius: "20px",
          background: net.peerStatus === "connected" ? "rgba(20,60,20,0.5)" : "rgba(80,20,20,0.5)",
          border: `1px solid ${net.peerStatus === "connected" ? "#2a6a2a" : "#6a2a2a"}`,
          color: net.peerStatus === "connected" ? "#88cc88" : "#cc8888",
          fontSize: "0.82em"
        } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.6em", animation: net.peerStatus === "connected" ? "" : "pulse 1.5s ease-in-out infinite" } }, "\u25CF"), net.peerStatus === "connected" ? `Online \xB7 Playing as ${ui.playerColor === W ? "White" : "Black"}` : "Disconnected"), ui.mode && hasClock && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [W, B].map((color) => {
          var _a;
          return /* @__PURE__ */ React.createElement(
            "div",
            {
              key: color,
              style: {
                padding: "5px 10px",
                borderRadius: "8px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.82em",
                minWidth: "88px",
                border: `1px solid ${ui.turn === color && !isOver ? "#b68c2c" : "#3a2f1a"}`,
                background: ui.turn === color && !isOver ? "rgba(122,86,24,0.35)" : "rgba(255,255,255,0.06)",
                color: color === W ? "#f5e8cc" : "#d4c5a9"
              }
            },
            color === W ? "W" : "B",
            " ",
            formatClock((_a = ui.clockMs) == null ? void 0 : _a[color])
          );
        }), /* @__PURE__ */ React.createElement("div", { style: { color: "#8a7a58", fontSize: "0.74em", letterSpacing: "0.03em" } }, activeTimeControl.label)), /* @__PURE__ */ React.createElement("span", { style: { color: "#4a3f2f", fontSize: "0.78em", marginLeft: "4px" } }, "Right-click drag = orbit \xA0\xB7\xA0 Scroll = zoom"), /* @__PURE__ */ React.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: "10px" } }, ui.mode && !isOver && btn("\u{1F3F3} Resign", () => resignGame(), "#6a1f1f"), ui.mode && btn("\u27F5 Menu", () => {
          disconnectNet();
          setPresenceStatus("lobby");
          const s = sr.current;
          s.mode = null;
          s.status = "idle";
          setNet((v) => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
          setUi((v) => ({ ...v, mode: null, status: "idle" }));
        }, "#2a2010"), ui.mode && ui.mode !== "net" && btn("\u21BA Restart", () => startGame(ui.mode, ui.playerColor, ui.timeControlId), "#1a2a1a"))), /* @__PURE__ */ React.createElement("div", { ref: mountRef, style: { flex: 1, width: "100%", position: "relative" } }), !net.nameReady && /* @__PURE__ */ React.createElement("div", { style: overlayStyle }, /* @__PURE__ */ React.createElement("div", { style: cardStyle }, /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 10px", color: "#d4a843", fontSize: "1.7em" } }, "Choose Your Name"), /* @__PURE__ */ React.createElement("p", { style: { color: "#6a5a3a", margin: "0 0 18px", fontSize: "0.86em" } }, "This name is shown in the online lobby and challenge list."), net.error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ff8888", background: "rgba(80,0,0,0.4)", border: "1px solid #aa3333", borderRadius: "8px", padding: "8px 14px", marginBottom: "14px", fontSize: "0.85em" } }, net.error), /* @__PURE__ */ React.createElement(
          "input",
          {
            style: nameInputStyle,
            placeholder: "Your name",
            maxLength: 24,
            value: net.nameInput,
            onChange: (e) => setNet((v) => ({ ...v, nameInput: e.target.value, error: "" })),
            onKeyDown: (e) => e.key === "Enter" && net.presenceState !== "connecting" && submitName()
          }
        ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "16px" } }, btn(net.presenceState === "connecting" ? "Connecting..." : "Continue", () => {
          if (net.presenceState !== "connecting") submitName();
        }, "#1a3a2a", { minWidth: "170px" })))), net.nameReady && !ui.mode && !net.screen && /* @__PURE__ */ React.createElement("div", { style: overlayStyle }, /* @__PURE__ */ React.createElement("div", { style: cardStyle }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "4em", marginBottom: "4px", filter: "drop-shadow(0 0 12px #d4a84388)" } }, "\u265F"), /* @__PURE__ */ React.createElement("h1", { style: { margin: "0 0 6px", color: "#d4a843", fontSize: "2em", letterSpacing: "0.08em" } }, "3D CHESS"), /* @__PURE__ */ React.createElement("p", { style: { color: "#6a5a3a", margin: "0 0 28px", fontSize: "0.82em", letterSpacing: "0.04em" } }, "RIGHT-CLICK DRAG TO ORBIT \xA0\xB7\xA0 SCROLL TO ZOOM", /* @__PURE__ */ React.createElement("br", null), "LEFT-CLICK TO SELECT & MOVE"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "13px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" } }, "TIME CONTROL"), /* @__PURE__ */ React.createElement(
          "select",
          {
            style: timeSelectStyle,
            value: net.timeControlId,
            onChange: (e) => setNet((v) => ({ ...v, timeControlId: e.target.value }))
          },
          TIME_CONTROLS.map((tc) => /* @__PURE__ */ React.createElement("option", { key: tc.id, value: tc.id }, tc.label))
        )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" } }, "AI DIFFICULTY"), /* @__PURE__ */ React.createElement(
          "select",
          {
            style: timeSelectStyle,
            value: net.aiLevelId,
            onChange: (e) => {
              const level = resolveAiLevel(e.target.value);
              setNet((v) => ({
                ...v,
                aiLevelId: level.id,
                aiMode: level.mode,
                stockfishPreset: level.preset,
                stockfishDepth: clampStockfishDepth(level.depth)
              }));
            }
          },
          AI_LEVELS.map((level) => /* @__PURE__ */ React.createElement("option", { key: level.id, value: level.id }, level.label))
        ), /* @__PURE__ */ React.createElement("div", { style: { color: "#6a5a3a", fontSize: "0.72em" } }, resolveAiLevel(net.aiLevelId).note)), net.aiMode === AI_MODE_STOCKFISH && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" } }, "STOCKFISH DEPTH (", net.stockfishDepth, ")"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "range",
            min: STOCKFISH_DEPTH_MIN,
            max: STOCKFISH_DEPTH_MAX,
            value: net.stockfishDepth,
            onChange: (e) => setNet((v) => ({ ...v, aiMode: AI_MODE_STOCKFISH, stockfishDepth: clampStockfishDepth(e.target.value) }))
          }
        )), btn("\u265F\u265F  Player vs Player", () => startGame("pvp", W, net.timeControlId), "#5c3d1e"), btn("\u26AA  Play as White vs AI", () => startGame("pvai", W, net.timeControlId, { mode: net.aiMode, depth: net.stockfishDepth, preset: net.stockfishPreset, levelId: net.aiLevelId }), "#1a3a1a"), btn("\u26AB  Play as Black vs AI", () => startGame("pvai", B, net.timeControlId, { mode: net.aiMode, depth: net.stockfishDepth, preset: net.stockfishPreset, levelId: net.aiLevelId }), "#1a1a3a"), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid #2a1f0a", margin: "4px 0" } }), btn("\u{1F310}  Play Online", () => openOnlineLobby(), "#1a2040")), /* @__PURE__ */ React.createElement("p", { style: { color: "#3a3020", margin: "22px 0 0", fontSize: "0.75em" } }, "Pathetic = random. Higher levels use Stockfish presets + adjustable depth."))), net.screen === "lobby" && /* @__PURE__ */ React.createElement("div", { style: overlayStyle }, /* @__PURE__ */ React.createElement("div", { style: { ...cardStyle, minWidth: "560px", maxWidth: "760px", width: "92vw" } }, /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 6px", color: "#d4a843", fontSize: "1.6em" } }, "\u{1F310} Online Lobby"), /* @__PURE__ */ React.createElement("p", { style: { color: "#6a5a3a", margin: "0 0 18px", fontSize: "0.82em" } }, "Signed in as ", /* @__PURE__ */ React.createElement("strong", null, net.playerName || "Player"), " \xB7 ", net.presenceState === "online" ? "connected" : net.presenceState), net.error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ff8888", background: "rgba(80,0,0,0.4)", border: "1px solid #aa3333", borderRadius: "8px", padding: "8px 14px", marginBottom: "14px", fontSize: "0.85em" } }, net.error), net.incomingChallenge && /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid #6b4f10", borderRadius: "10px", padding: "12px", marginBottom: "14px", background: "rgba(60,40,10,0.35)" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#f0d9b5", marginBottom: "8px", fontSize: "0.94em" } }, "Challenge from ", /* @__PURE__ */ React.createElement("strong", null, net.incomingChallenge.fromName), " (", resolveTimeControl(net.incomingChallenge.timeControlId).label, ")"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "10px", justifyContent: "center" } }, btn("Accept", () => acceptChallenge(), "#1a3a2a", { fontSize: "0.84em", padding: "8px 14px" }), btn("Decline", () => declineChallenge(), "#5a1f1f", { fontSize: "0.84em", padding: "8px 14px" }))), net.outgoingChallenge && /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid #2a5f9f", borderRadius: "10px", padding: "10px", marginBottom: "14px", background: "rgba(25,45,75,0.35)", color: "#9bc2ff", fontSize: "0.84em" } }, "Waiting for ", /* @__PURE__ */ React.createElement("strong", null, net.outgoingChallenge.toName), " to accept your challenge..."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "10px" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" } }, "TIME CONTROL (for your outgoing challenge)"), /* @__PURE__ */ React.createElement(
          "select",
          {
            style: timeSelectStyle,
            value: net.timeControlId,
            onChange: (e) => setNet((v) => ({ ...v, timeControlId: e.target.value, error: "" }))
          },
          TIME_CONTROLS.map((tc) => /* @__PURE__ */ React.createElement("option", { key: tc.id, value: tc.id }, tc.label))
        )), /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid #2a1f0a", borderRadius: "10px", overflow: "hidden", background: "rgba(0,0,0,0.22)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr auto", padding: "9px 12px", borderBottom: "1px solid #2a1f0a", color: "#8a7a58", fontSize: "0.76em", letterSpacing: "0.04em" } }, /* @__PURE__ */ React.createElement("div", null, "PLAYER"), /* @__PURE__ */ React.createElement("div", null, "STATUS / ACTION")), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: "280px", overflowY: "auto" } }, net.onlinePlayers.length <= 1 ? /* @__PURE__ */ React.createElement("div", { style: { padding: "14px 12px", color: "#7d6e4f", fontSize: "0.84em" } }, "No other players online yet.") : net.onlinePlayers.map((player) => /* @__PURE__ */ React.createElement("div", { key: player.id, style: { display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "10px", padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "left" } }, /* @__PURE__ */ React.createElement("div", { style: { color: "#f0d9b5", fontSize: "0.93em" } }, player.name, player.isSelf ? " (You)" : ""), /* @__PURE__ */ React.createElement("div", { style: { color: "#7d6e4f", fontSize: "0.75em" } }, player.id.slice(0, 8))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, /* @__PURE__ */ React.createElement("span", { style: { color: normalizePresenceStatus(player.status) === "playing" ? "#f39a9a" : "#8fd39a", fontSize: "0.8em", minWidth: "72px", textAlign: "right" } }, presenceLabel(player.status)), !player.isSelf && btn("Challenge", () => challengePlayer(player.id), "#1a3a2a", { fontSize: "0.8em", padding: "7px 12px" })))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "16px" } }, btn("\u2190 Back", () => setNet((v) => ({ ...v, screen: null, error: "" })), "#2a2010", { fontSize: "0.85em", padding: "8px 18px" })))), net.screen === "waiting" && /* @__PURE__ */ React.createElement("div", { style: overlayStyle }, /* @__PURE__ */ React.createElement("div", { style: cardStyle }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "2.5em", marginBottom: "12px" } }, "\u23F3"), /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 8px", color: "#d4a843" } }, "Waiting for Opponent"), /* @__PURE__ */ React.createElement("div", { style: { color: "#7d6e4f", fontSize: "0.72em", margin: "0 0 10px" } }, "Clock: ", resolveTimeControl(net.timeControlId).label), /* @__PURE__ */ React.createElement("p", { style: { color: "#6a5a3a", margin: "0 0 22px", fontSize: "0.84em" } }, "Waiting for opponent to join this game:"), /* @__PURE__ */ React.createElement("div", { style: {
          fontSize: "2.8em",
          fontFamily: "monospace",
          fontWeight: "bold",
          letterSpacing: "0.22em",
          color: "#f0d9b5",
          background: "rgba(255,255,255,0.06)",
          border: "2px solid #6b4f10",
          borderRadius: "10px",
          padding: "14px 24px",
          marginBottom: "18px",
          userSelect: "all",
          cursor: "text"
        } }, net.code), /* @__PURE__ */ React.createElement("div", { style: { color: "#888", fontSize: "0.8em", marginBottom: "22px", animation: "pulse 2s ease-in-out infinite" } }, net.statusMsg || "Waiting for someone to join\u2026"), btn("Cancel", () => {
          disconnectNet();
          setPresenceStatus("lobby");
          setNet((v) => ({ ...v, screen: "lobby", outgoingChallenge: null }));
        }, "#3a1010", { fontSize: "0.85em", padding: "8px 18px" }))), net.screen === "joining" && /* @__PURE__ */ React.createElement("div", { style: overlayStyle }, /* @__PURE__ */ React.createElement("div", { style: cardStyle }, /* @__PURE__ */ React.createElement("div", { style: {
          fontSize: "2em",
          marginBottom: "12px",
          display: "inline-block",
          animation: "spin 1.2s linear infinite"
        } }, "\u2699"), /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 16px", color: "#d4a843" } }, "Joining Game\u2026"), /* @__PURE__ */ React.createElement("div", { style: { color: "#7d6e4f", fontSize: "0.72em", margin: "0 0 10px" } }, "Clock: ", resolveTimeControl(net.timeControlId).label), /* @__PURE__ */ React.createElement("div", { style: { color: "#a09070", fontSize: "0.88em", marginBottom: "22px" } }, net.statusMsg || "Connecting\u2026"), btn("Cancel", () => {
          disconnectNet();
          setPresenceStatus("lobby");
          setNet((v) => ({ ...v, screen: "lobby", outgoingChallenge: null }));
        }, "#3a1010", { fontSize: "0.85em", padding: "8px 18px" }))), ui.mode === "net" && net.peerStatus === "disconnected" && /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(3px)",
          zIndex: 20
        } }, /* @__PURE__ */ React.createElement("div", { style: { ...cardStyle, border: "2px solid #8b2020" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "3em", marginBottom: "8px" } }, "\u{1F50C}"), /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 10px", color: "#d4a843" } }, "Opponent Disconnected"), /* @__PURE__ */ React.createElement("p", { style: { color: "#a09070", margin: "0 0 24px", fontSize: "0.88em" } }, "The connection to your opponent was lost."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "12px", justifyContent: "center" } }, btn("\u{1F310} Play Again Online", () => {
          setPresenceStatus("lobby");
          setNet((v) => ({ ...v, screen: "lobby", peerStatus: "", error: "", outgoingChallenge: null, incomingChallenge: null }));
        }, "#1a2040"), btn("\u27F5 Main Menu", () => {
          disconnectNet();
          setPresenceStatus("lobby");
          const s = sr.current;
          s.mode = null;
          s.status = "idle";
          setNet((v) => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
          setUi((v) => ({ ...v, mode: null, status: "idle" }));
        }, "#2a2010")))), ui.mode && isOver && net.peerStatus !== "disconnected" && /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(3px)",
          zIndex: 20,
          pointerEvents: "none"
        } }, /* @__PURE__ */ React.createElement("div", { style: {
          background: "linear-gradient(145deg, #1a0800, #0d1117)",
          border: "2px solid #8b2020",
          borderRadius: "16px",
          padding: "36px 48px",
          textAlign: "center",
          color: "#f0d9b5",
          boxShadow: "0 0 40px rgba(200,50,50,0.2)",
          pointerEvents: "all"
        } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "3.5em", marginBottom: "8px" } }, ui.status === "checkmate" ? "\u265A" : ui.status === "resigned" ? "\u{1F3F3}" : ui.status === "timeout" ? "\u23F0" : "\u{1F91D}"), /* @__PURE__ */ React.createElement("h2", { style: { margin: "0 0 22px", color: "#d4a843", fontSize: "1.5em" } }, statusMsg()), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "14px", justifyContent: "center" } }, ui.mode !== "net" && btn("\u21BA Play Again", () => startGame(ui.mode, ui.playerColor, ui.timeControlId), "#1a3a1a"), btn("\u27F5 Menu", () => {
          disconnectNet();
          setPresenceStatus("lobby");
          const s = sr.current;
          s.mode = null;
          s.status = "idle";
          setNet((v) => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
          setUi((v) => ({ ...v, mode: null, status: "idle" }));
        }, "#3a1a1a")))));
      }
      const rootEl = document.getElementById("app");
      if (rootEl) {
        const root = ReactDOM.createRoot(rootEl);
        root.render(/* @__PURE__ */ React.createElement(Chess3D, null));
      }
    }
  });
  require_chess_app();
})();
