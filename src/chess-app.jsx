const { useState, useEffect, useRef, useCallback } = React;

const PRESENCE_APP = "chess3d";
const PRESENCE_ROOM = "lobby";
const NAME_STORAGE_KEY = "chess3d_player_name";

function normalizePresenceStatus(status) {
  return status === "playing" ? "playing" : "lobby";
}

function presenceLabel(status) {
  return normalizePresenceStatus(status) === "playing" ? "playing" : "in lobby";
}
// ─── Main Component ───────────────────────────────────────────────────────────

function Chess3D() {
  const mountRef = useRef(null);
  const sr = useRef({
    board: mkBoard(),
    turn: W,
    selected: null,
    legalMovesList: [],
    ep: null, // en passant square
    mode: null, // 'pvp' | 'pvai'
    playerColor: W,
    status: "idle", // idle | playing | check | checkmate | stalemate | resigned | timeout
    timeControlId: "blitz",
    clockIncrementMs: 0,
    clockMs: { [W]: null, [B]: null },
    clockLastTickAt: 0,
    pieceMeshes: new Map(),
    labelSprites: new Map(),
    highlights: [],
    graveyardMeshes: [],
    captured: { [W]: [], [B]: [] }, // pieces each color has captured
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
    netClient:  null,   // P2PMeshClient instance
    presenceClient: null, // lobby presence socket
    netPeerId:  null,   // opponent's peer ID
    netRole:    null,   // "host" | "join"
  });
  const handleClickRef = useRef(null);
  const netMsgRef = useRef(null); // always points to latest net message handler
  const [ui, setUi] = useState({
    mode: null,
    turn: W,
    status: "idle",
    playerColor: W,
    aiThinking: false,
    timeControlId: "blitz",
    clockMs: { [W]: null, [B]: null },
  });
  const [net, setNet] = useState({
    screen: null,      // null | "lobby" | "waiting" | "joining"
    code: "",          // host's generated room code
    inputCode: "",     // joiner's typed code
    timeControlId: "blitz",
    peerStatus: "",    // "" | "waiting" | "connected" | "disconnected"
    statusMsg: "",     // human-readable connection status
    error: "",
    nameReady: false,
    nameInput: "",
    playerName: "",
    selfId: "",
    onlinePlayers: [],
    presenceState: "offline", // offline | connecting | online
    incomingChallenge: null,
    outgoingChallenge: null,
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
    });
  }, []);

  // Sync board → 3D scene
  const syncBoard = useCallback(() => {
    const s = sr.current;
    if (!s.scene) return;
    s.pieceMeshes.forEach(m => s.scene.remove(m));
    s.pieceMeshes.clear();
    s.labelSprites.forEach(sp => s.scene.remove(sp));
    s.labelSprites.clear();

    // Chess unicode symbols — white set / black set
    const SYMBOLS = {
      [W]: { [P.KING]:'♔', [P.QUEEN]:'♕', [P.ROOK]:'♖', [P.BISHOP]:'♗', [P.KNIGHT]:'♘', [P.PAWN]:'♙' },
      [B]: { [P.KING]:'♚', [P.QUEEN]:'♛', [P.ROOK]:'♜', [P.BISHOP]:'♝', [P.KNIGHT]:'♞', [P.PAWN]:'♟' },
    };

    // Build a canvas sprite for a piece symbol.
    // White pieces: dark disc + white symbol so readable over light squares.
    // Black pieces: light disc + dark symbol so readable over dark squares.
    const makePieceSprite = (type, color) => {
      const sz  = 128;
      const cv  = document.createElement("canvas");
      cv.width  = cv.height = sz;
      const cx  = cv.getContext("2d");
      const isW = color === W;

      // Disc background
      cx.beginPath();
      cx.arc(sz/2, sz/2, sz/2 - 3, 0, Math.PI * 2);
      cx.fillStyle   = isW ? "rgba(20,10,0,0.78)" : "rgba(255,245,220,0.78)";
      cx.fill();
      // Disc border
      cx.strokeStyle = isW ? "rgba(200,160,80,0.9)" : "rgba(100,60,10,0.9)";
      cx.lineWidth   = 5;
      cx.stroke();

      // Symbol
      cx.font         = `${sz * 0.56}px serif`;
      cx.textAlign    = "center";
      cx.textBaseline = "middle";
      cx.fillStyle    = isW ? "#f5e8cc" : "#1a0800";
      // Shadow for contrast
      cx.shadowColor  = isW ? "rgba(0,0,0,0.8)" : "rgba(255,220,150,0.6)";
      cx.shadowBlur   = 6;
      cx.fillText(SYMBOLS[color][type], sz / 2, sz / 2 + 4);

      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0, // starts invisible; animate loop drives opacity from phi
      });
      const sp  = new THREE.Sprite(mat);
      sp.scale.set(0.55, 0.55, 1);
      return sp;
    };

    // Approximate top-of-piece heights so labels float just above each piece type
    const PIECE_TOP = {
      [P.PAWN]: 0.58, [P.ROOK]: 0.76, [P.KNIGHT]: 0.82,
      [P.BISHOP]: 0.88, [P.QUEEN]: 0.92, [P.KING]: 0.96,
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        const mesh = makePiece(p.type, p.color);
        const wx = c - 3.5, wz = r - 3.5;
        mesh.position.set(wx, 0.04, wz);
        mesh.traverse(ch => { if (ch.isMesh) ch.userData = { row: r, col: c, isPiece: true }; });
        mesh.userData = { row: r, col: c, isPiece: true };
        s.scene.add(mesh);
        s.pieceMeshes.set(`${r},${c}`, mesh);

        // Label sprite — sits above piece top
        const sp = makePieceSprite(p.type, p.color);
        sp.position.set(wx, PIECE_TOP[p.type] + 0.18, wz);
        s.scene.add(sp);
        s.labelSprites.set(`${r},${c}`, sp);
      }
    }
  }, []);

  // Sync highlights
  const syncHighlights = useCallback(() => {
    const s = sr.current;
    if (!s.scene) return;
    s.highlights.forEach(m => s.scene.remove(m));
    s.highlights = [];

    if (s.selected) {
      const [sr2, sc] = s.selected;
      const hm = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.02, 0.98),
        new THREE.MeshPhongMaterial({ color: 0x44ff88, transparent: true, opacity: 0.55, depthWrite: false })
      );
      hm.position.set(sc - 3.5, 0.06, sr2 - 3.5);
      s.scene.add(hm);
      s.highlights.push(hm);
    }

    s.legalMovesList.forEach(([mr, mc]) => {
      const hasTarget = !!s.board[mr][mc];
      const geo = hasTarget
        ? new THREE.RingGeometry(0.36, 0.50, 20)
        : new THREE.CircleGeometry(0.21, 20);
      const hm = new THREE.Mesh(
        geo,
        new THREE.MeshPhongMaterial({ color: hasTarget ? 0xff4444 : 0x44ff88, transparent: true, opacity: 0.70, side: THREE.DoubleSide, depthWrite: false })
      );
      hm.rotation.x = -Math.PI / 2;
      hm.position.set(mc - 3.5, 0.065, mr - 3.5);
      s.scene.add(hm);
      s.highlights.push(hm);
    });
  }, []);

  // Captured pieces displayed on the left/right flanks beside the board,
  // standing upright so they're clearly visible from the default camera angle.
  // White's captures (black pieces taken) → right flank (+x)
  // Black's captures (white pieces taken) → left flank (-x)
  const syncGraveyard = useCallback(() => {
    const s = sr.current;
    if (!s.scene) return;
    s.graveyardMeshes.forEach(m => s.scene.remove(m));
    s.graveyardMeshes = [];

    const SCALE     = 0.44;          // slightly larger than before — easier to see
    const COLS      = 2;             // 2 columns per flank
    const COL_GAP   = 0.72;          // gap between the two columns
    const ROW_GAP   = 0.80;          // gap between rows (top-to-bottom along z)
    const FLANK_X   = 5.10;          // x distance from board centre
    const BASE_Y    = 0.18;          // elevated above board level
    const START_Z   = -((Math.min(16, 16) / COLS - 1) / 2) * ROW_GAP; // centre the column vertically

    const placeGraveyard = (pieces, pieceColor, xBase) => {
      pieces.forEach((piece, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const x   = xBase + (col - (COLS - 1) / 2) * COL_GAP;
        const z   = START_Z + row * ROW_GAP;
        const mesh = makePiece(piece.type, pieceColor);
        mesh.scale.setScalar(SCALE);
        mesh.position.set(x, BASE_Y, z);
        // Stand upright — tiny random yaw so they don't look robotic
        mesh.rotation.y = Math.random() * 0.3 - 0.15;
        s.scene.add(mesh);
        s.graveyardMeshes.push(mesh);
      });
    };

    // White captured black pieces → right flank
    placeGraveyard(s.captured[W], B, +FLANK_X);
    // Black captured white pieces → left flank
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

    s.turn = color; // side that flagged
    s.status = "timeout";
    s.selected = null;
    s.legalMovesList = [];
    s.aiThinking = false;
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
    const current = s.clockMs?.[active];
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

  // Execute a move on the state
  const doMove = useCallback((from, to, { relay = true } = {}) => {
    const s = sr.current;
    tickClock(performance.now(), { relayOnTimeout: relay });
    if (s.status === "timeout") return false;

    if (!Array.isArray(from) || !Array.isArray(to)) return false;

    const fr = from[0], fc = from[1];
    const tr = to[0], tc = to[1];
    const inRange = (n) => Number.isInteger(n) && n >= 0 && n < 8;
    if (!inRange(fr) || !inRange(fc) || !inRange(tr) || !inRange(tc)) return false;

    const piece = s.board[fr]?.[fc];
    if (!piece) return false;

    // Accept only legal moves from current position; preserve castle marker when required.
    const legal = legalMoves(s.board, fr, fc, s.ep).find(([mr, mc, marker]) => {
      if (mr !== tr || mc !== tc) return false;
      const wanted = typeof to[2] === "string" ? to[2] : null;
      const got = typeof marker === "string" ? marker : null;
      return wanted === got;
    });
    if (!legal) return false;

    const captured = s.board[legal[0]][legal[1]];
    const isEP     = piece.type === P.PAWN && s.ep && legal[0] === s.ep[0] && legal[1] === s.ep[1];
    const epPiece  = isEP ? s.board[fr][legal[1]] : null;
    const isCapture = !!(captured || isEP);
    const isCastle = legal[2] === "castleK" || legal[2] === "castleQ";
    const newBoard = applyMove(s.board, [fr, fc], legal, s.ep);

    // Track captures — attacker colour captures the victim
    if (captured) s.captured[piece.color].push({ type: captured.type, color: captured.color });
    if (epPiece)  s.captured[piece.color].push({ type: epPiece.type,  color: epPiece.color });

    // Compute new en passant
    let newEp = null;
    if (piece.type === P.PAWN && Math.abs(legal[0] - fr) === 2) {
      newEp = [(fr + legal[0]) / 2, legal[1]];
    }

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

    // Sounds
    if (newStatus === "checkmate")      Sounds.checkmate();
    else if (newStatus === "stalemate") Sounds.stalemate();
    else if (newStatus === "check")     Sounds.check();
    else if (isCastle)                  Sounds.castle();
    else if (isCapture)                 Sounds.capture();
    else                                Sounds.move();

    // Broadcast to peer in net mode
    if (relay && s.mode === "net" && s.netClient && s.netPeerId) {
      s.netClient.sendTo(s.netPeerId, { type: "move", from: [fr, fc], to: legal });
    }

    syncBoard();
    syncHighlights();
    syncGraveyard();
    refresh();
    return true;
  }, [syncBoard, syncHighlights, syncGraveyard, refresh, updateStatus, tickClock]);

  // AI move (random) — fake "thinking" delay between 600 ms and 2 400 ms
  const resignGame = useCallback((resigningColor = null, { relay = true } = {}) => {
    const s = sr.current;
    if (!s.mode) return;
    if (s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;

    const color =
      resigningColor === W || resigningColor === B
        ? resigningColor
        : (s.mode === "net" ? s.playerColor : s.turn);

    s.turn = color; // side that resigned
    s.status = "resigned";
    s.selected = null;
    s.legalMovesList = [];
    s.aiThinking = false;
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
    // Gaussian-ish delay: base 800 ms + up to 1 400 ms extra, feels more human
    const delay = 800 + Math.random() * 900 + Math.random() * 500;
    s.aiThinking = true;
    setUi(v => ({ ...v, aiThinking: true }));
    setTimeout(() => {
      if (
        sr.current.status === "checkmate" ||
        sr.current.status === "stalemate" ||
        sr.current.status === "resigned" ||
        sr.current.status === "timeout" ||
        sr.current.turn === sr.current.playerColor
      ) { // player moved again somehow or game ended
        sr.current.aiThinking = false;
        setUi(v => ({ ...v, aiThinking: false }));
        return;
      }
      const mv = moves[Math.floor(Math.random() * moves.length)];
      sr.current.aiThinking = false;
      setUi(v => ({ ...v, aiThinking: false }));
      doMove(mv.from, mv.to);
    }, delay);
  }, [doMove]);

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

  // Click handler — stored in ref so event listeners always call latest
  handleClickRef.current = useCallback((e) => {
    const s = sr.current;
    if (!s.mode || s.status === "checkmate" || s.status === "stalemate" || s.status === "resigned" || s.status === "timeout") return;
    if (s.mode === "pvai" && s.turn !== s.playerColor) return;
    if (s.mode === "net"  && s.turn !== s.playerColor) return;

    const rect = s.renderer.domElement.getBoundingClientRect();
    s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(s.mouse, s.camera);

    const targets = [];
    s.squareMeshes.flat().forEach(m => targets.push(m));
    s.pieceMeshes.forEach(g => g.traverse(ch => { if (ch.isMesh) targets.push(ch); }));

    const hits = s.raycaster.intersectObjects(targets, false);
    if (!hits.length) return;
    const { row, col } = hits[0].object.userData;
    if (row === undefined) return;

    if (s.selected) {
      const [sr2, sc] = s.selected;
      const legal = s.legalMovesList.find(([mr, mc]) => mr === row && mc === col);
      if (legal) {
        doMove([sr2, sc], legal);
        // Trigger AI after player move — aiMove handles its own delay
        if (s.mode === "pvai" && s.status !== "checkmate" && s.status !== "stalemate" && s.status !== "resigned" && s.status !== "timeout") {
          aiMove();
        }
      } else {
        const clicked = s.board[row][col];
        if (clicked?.color === s.turn) {
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
      if (clicked?.color === s.turn) {
        s.selected = [row, col];
        s.legalMovesList = legalMoves(s.board, row, col, s.ep);
        Sounds.select();
        syncHighlights();
      }
    }
  }, [doMove, aiMove, syncHighlights]);

  // Three.js init
  useEffect(() => {
    const s = sr.current;
    const el = mountRef.current;
    if (!el) return;

    const W3 = el.clientWidth, H3 = el.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 18, 30);
    s.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(42, W3 / H3, 0.1, 100);
    s.camera = camera;

    // Renderer
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

    // Lighting — tuned for MeshStandardMaterial PBR
    scene.add(new THREE.AmbientLight(0xfff4e0, 0.30));

    // Key light — warm overhead
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(4, 14, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 50;
    sun.shadow.camera.left   = -9;
    sun.shadow.camera.right  =  9;
    sun.shadow.camera.top    =  9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // Fill light — cool blue from opposite side
    const fill = new THREE.DirectionalLight(0x8ab4e8, 0.55);
    fill.position.set(-7, 5, -5);
    scene.add(fill);

    // Rim / back light — separates pieces from background
    const rim = new THREE.DirectionalLight(0xffeedd, 0.40);
    rim.position.set(2, 3, -10);
    scene.add(rim);

    // Warm point light low near board — adds depth to undersides
    const bounce = new THREE.PointLight(0xd4881a, 0.55, 18);
    bounce.position.set(-3, 0.4, 3);
    scene.add(bounce);

    // Subtle cool point from opposite corner
    const cool = new THREE.PointLight(0x4466cc, 0.30, 16);
    cool.position.set(5, 1.5, -4);
    scene.add(cool);

    // ── Board texture generators ──────────────────────────────────────────────

    // Marble-ish square texture: veins, cloud swirls, depth variation
    const makeSquareTex = (isLight, sz = 256) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = sz;
      const cx = cv.getContext("2d");

      // Base colour
      const base = isLight
        ? { r: 238, g: 215, b: 175 }   // warm cream/maple
        : { r: 105, g:  68, b:  38 };  // rich walnut brown

      cx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
      cx.fillRect(0, 0, sz, sz);

      // Subtle cloud/noise layer — gives organic marble feel
      for (let i = 0; i < 6; i++) {
        const grd = cx.createRadialGradient(
          Math.random()*sz, Math.random()*sz, 0,
          Math.random()*sz, Math.random()*sz, sz * (0.3 + Math.random()*0.5)
        );
        const alpha = isLight ? 0.06 + Math.random()*0.07 : 0.08 + Math.random()*0.10;
        const lighter = isLight
          ? `rgba(255,245,220,${alpha})`
          : `rgba(160,100,50,${alpha})`;
        const darker = isLight
          ? `rgba(180,140,80,${alpha})`
          : `rgba(40,18,6,${alpha})`;
        grd.addColorStop(0, lighter);
        grd.addColorStop(1, darker);
        cx.fillStyle = grd;
        cx.fillRect(0, 0, sz, sz);
      }

      // Marble veins — thin wavy diagonal lines
      const nVeins = isLight ? 7 : 5;
      for (let v = 0; v < nVeins; v++) {
        cx.globalAlpha = isLight ? 0.10 + Math.random()*0.13 : 0.12 + Math.random()*0.16;
        cx.strokeStyle = isLight
          ? `rgb(${base.r - 55},${base.g - 40},${base.b - 25})`
          : `rgb(${base.r + 50},${base.g + 30},${base.b + 14})`;
        cx.lineWidth = 0.6 + Math.random() * 1.4;
        cx.beginPath();
        const sx = Math.random()*sz, sy = Math.random()*sz;
        cx.moveTo(sx, sy);
        // Wavy bezier vein
        cx.bezierCurveTo(
          sx + Math.random()*100-50, sy + Math.random()*100-50,
          sx + Math.random()*140-70, sy + Math.random()*140-70,
          sx + Math.random()*sz*0.8 - sz*0.4 + sz/2,
          sy + Math.random()*sz*0.8 - sz*0.4 + sz/2
        );
        cx.stroke();
        // Hairline sibling beside main vein
        cx.globalAlpha *= 0.5;
        cx.lineWidth = 0.3 + Math.random()*0.6;
        cx.beginPath();
        cx.moveTo(sx + Math.random()*6-3, sy + Math.random()*6-3);
        cx.bezierCurveTo(
          sx + Math.random()*90-45,  sy + Math.random()*90-45,
          sx + Math.random()*120-60, sy + Math.random()*120-60,
          sx + Math.random()*sz*0.7 - sz*0.35 + sz/2,
          sy + Math.random()*sz*0.7 - sz*0.35 + sz/2
        );
        cx.stroke();
      }

      // Fine surface grain/texture — tiny stipple to break up flatness
      cx.globalAlpha = 1;
      for (let i = 0; i < 900; i++) {
        const v = isLight
          ? Math.floor(Math.random()*40 + (Math.random()>0.5 ? base.r-30 : base.r+20))
          : Math.floor(Math.random()*35 + (Math.random()>0.5 ? base.r-20 : base.r+25));
        cx.globalAlpha = 0.025 + Math.random()*0.04;
        cx.fillStyle = isLight ? `rgb(${v},${v-20},${v-50})` : `rgb(${v+30},${v+10},${v-5})`;
        const dot = Math.random()*1.8 + 0.3;
        cx.fillRect(Math.random()*sz, Math.random()*sz, dot, dot);
      }

      // Polished highlight sweep — directional gloss
      cx.globalAlpha = 1;
      const gloss = cx.createLinearGradient(0, 0, sz*0.7, sz*0.7);
      gloss.addColorStop(0,   `rgba(255,255,240,0)`);
      gloss.addColorStop(0.3, `rgba(255,255,240,${isLight ? 0.07 : 0.04})`);
      gloss.addColorStop(0.6, `rgba(255,255,240,${isLight ? 0.10 : 0.06})`);
      gloss.addColorStop(1,   `rgba(255,255,240,0)`);
      cx.fillStyle = gloss;
      cx.fillRect(0, 0, sz, sz);

      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    };

    // Wood texture for the border frame — rich dark walnut
    const makeBorderTex = (sz = 512) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = sz;
      const cx = cv.getContext("2d");

      // Base mahogany
      cx.fillStyle = "rgb(52,22,5)";
      cx.fillRect(0, 0, sz, sz);

      // Broad band variation — annual ring bands
      for (let i = 0; i < 16; i++) {
        const y = (i / 16) * sz;
        cx.globalAlpha = 0.08 + Math.random()*0.10;
        cx.fillStyle = Math.random()>0.5 ? "rgb(80,35,10)" : "rgb(25,8,1)";
        cx.fillRect(0, y, sz, sz/16 + Math.random()*12 - 6);
      }

      // Strong grain lines — very high contrast on dark wood
      for (let i = 0; i < 100; i++) {
        const x = Math.random()*sz;
        cx.globalAlpha = 0.18 + Math.random()*0.32;
        cx.strokeStyle = Math.random()>0.45
          ? `rgb(${8+Math.floor(Math.random()*12)},${3+Math.floor(Math.random()*5)},0)`
          : `rgb(${75+Math.floor(Math.random()*30)},${32+Math.floor(Math.random()*18)},${8+Math.floor(Math.random()*8)})`;
        cx.lineWidth = 0.5 + Math.random()*2.5;
        cx.beginPath();
        cx.moveTo(x + Math.random()*16-8, 0);
        cx.bezierCurveTo(
          x + Math.random()*22-11, sz*0.3,
          x + Math.random()*22-11, sz*0.65,
          x + Math.random()*16-8,  sz
        );
        cx.stroke();
      }

      // Varnish highlight streaks
      for (let i = 0; i < 8; i++) {
        const grd = cx.createLinearGradient(Math.random()*sz, 0, Math.random()*sz+60, sz);
        grd.addColorStop(0, "rgba(255,200,100,0)");
        grd.addColorStop(0.45, `rgba(255,200,100,${0.06+Math.random()*0.10})`);
        grd.addColorStop(1, "rgba(255,200,100,0)");
        cx.globalAlpha = 1;
        cx.fillStyle = grd;
        cx.fillRect(0, 0, sz, sz);
      }

      // Pore stipple
      for (let i = 0; i < 1200; i++) {
        cx.globalAlpha = 0.03 + Math.random()*0.06;
        cx.fillStyle = Math.random()>0.5 ? "rgb(6,2,0)" : "rgb(90,42,12)";
        const d = Math.random()*2+0.4;
        cx.fillRect(Math.random()*sz, Math.random()*sz, d, d);
      }

      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      return tex;
    };

    // Roughness map — varnish sheen variation for squares
    const makeSquareRoughTex = (isLight, sz = 128) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = sz;
      const cx = cv.getContext("2d");
      cx.fillStyle = isLight ? "#666" : "#777";
      cx.fillRect(0, 0, sz, sz);
      for (let i = 0; i < 10; i++) {
        const grd = cx.createLinearGradient(Math.random()*sz, 0, Math.random()*sz+30, sz);
        const pk = 0.12 + Math.random()*0.18;
        grd.addColorStop(0, "rgba(255,255,255,0)");
        grd.addColorStop(0.4+Math.random()*0.2, `rgba(255,255,255,${pk})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = grd; cx.fillRect(0, 0, sz, sz);
      }
      for (let i = 0; i < 500; i++) {
        const v = Math.floor(Math.random()*80+80);
        cx.fillStyle = `rgb(${v},${v},${v})`;
        const d = Math.random()*2+0.3;
        cx.fillRect(Math.random()*sz, Math.random()*sz, d, d);
      }
      return new THREE.CanvasTexture(cv);
    };

    const borderTex   = makeBorderTex();
    const borderRough = makeSquareRoughTex(false, 256);

    // Board base — rich mahogany border with wood texture
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(8.7, 0.35, 8.7),
      new THREE.MeshStandardMaterial({
        map: borderTex, roughnessMap: borderRough,
        color: 0xffffff, roughness: 0.62, metalness: 0.02,
      })
    );
    border.position.y = -0.18;
    border.receiveShadow = true;
    scene.add(border);

    // Board squares — each gets its own unique randomised texture
    s.squareMeshes = [];
    for (let r = 0; r < 8; r++) {
      s.squareMeshes[r] = [];
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.12, 1),
          new THREE.MeshStandardMaterial({
            map:          makeSquareTex(light),
            roughnessMap: makeSquareRoughTex(light),
            color:        0xffffff,
            roughness:    light ? 0.42 : 0.55,
            metalness:    0.01,
          })
        );
        mesh.position.set(c - 3.5, 0, r - 3.5);
        mesh.receiveShadow = true;
        mesh.userData = { row: r, col: c, isSquare: true };
        scene.add(mesh);
        s.squareMeshes[r][c] = mesh;
      }
    }

    // ── Coordinate labels — sprites on all 4 sides ──────────────────────────
    // THREE.Sprite always faces the camera, so labels stay readable after any orbit.
    const makeLabel = (text, sz = 96) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = sz;
      const cx = cv.getContext("2d");
      // Drop shadow for legibility over any background
      cx.shadowColor  = "rgba(0,0,0,0.9)";
      cx.shadowBlur   = 10;
      cx.shadowOffsetX = 0;
      cx.shadowOffsetY = 0;
      cx.fillStyle    = "#d4b87a";
      cx.font         = `bold ${sz * 0.68}px "Palatino Linotype", Palatino, serif`;
      cx.textAlign    = "center";
      cx.textBaseline = "middle";
      cx.fillText(text, sz / 2, sz / 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    };

    const spriteMat = (tex) => new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, sizeAttenuation: true,
    });

    const LABEL_Y    = 0.22;   // height above board surface
    const LABEL_DIST = 4.82;   // distance from board centre to label
    const LABEL_SIZE = 0.58;   // sprite world-space size

    const files  = "abcdefgh".split("");
    const ranks  = "87654321".split(""); // rank 8 = row 0 (black's back rank), rank 1 = row 7

    // a–h  along the +z edge (row 7 side, "white's side" label strip)
    // a–h  along the −z edge (row 0 side, "black's side" label strip)
    files.forEach((letter, i) => {
      const wx = i - 3.5; // world x for column i
      [LABEL_DIST, -LABEL_DIST].forEach(wz => {
        const sp = new THREE.Sprite(spriteMat(makeLabel(letter)));
        sp.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
        sp.position.set(wx, LABEL_Y, wz);
        scene.add(sp);
      });
    });

    // 1–8  along the +x edge (column 7 side)
    // 1–8  along the −x edge (column 0 side)
    ranks.forEach((rank, i) => {
      const wz = i - 3.5; // world z for row i (row 0 = rank 8)
      [LABEL_DIST, -LABEL_DIST].forEach(wx => {
        const sp = new THREE.Sprite(spriteMat(makeLabel(rank)));
        sp.scale.set(LABEL_SIZE, LABEL_SIZE, 1);
        sp.position.set(wx, LABEL_Y, wz);
        scene.add(sp);
      });
    });

    // Camera update
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

    // Mouse / orbit
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
        s.spherical.theta -= dx * 0.008;
        s.spherical.phi = Math.max(0.18, Math.min(1.45, s.spherical.phi + dy * 0.008));
        s.lastMouse = { x: e.clientX, y: e.clientY };
        updateCam();
      } else if (s.dragStart) {
        const dx = e.clientX - s.dragStart.x, dy = e.clientY - s.dragStart.y;
        if (Math.hypot(dx, dy) > 4) s.wasDrag = true;
      }
    };
    const onUp = (e) => {
      if (e.button === 2) { s.orbitActive = false; return; }
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
    renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());

    // Render loop — fade piece-symbol sprites based on camera elevation
    const animate = () => {
      s.animId = requestAnimationFrame(animate);

      // phi: 0 = directly overhead, π/2 = side-on
      // Labels fully visible below phi 0.38 (~22°), fully hidden above phi 0.72 (~41°)
      const phi     = s.spherical.phi;
      const fadeStart = 0.30;  // phi where fade begins
      const fadeEnd   = 0.62;  // phi where labels are gone
      const labelOpacity = Math.max(0, Math.min(1,
        1 - (phi - fadeStart) / (fadeEnd - fadeStart)
      ));

      if (s.labelSprites.size > 0) {
        s.labelSprites.forEach(sp => {
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
      cancelAnimationFrame(s.animId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousedown", onDown);
      renderer.domElement.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("mouseup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      renderer.dispose();
      // Close any open network connections
      try { sr.current.netClient?.close(); } catch {}
      try { sr.current.presenceClient?.close(); } catch {}
    };
  }, []);

  // startGameRef avoids circular dependency: hostGame is defined before startGame
  const startGameRef = useRef(null);
  const presenceMsgRef = useRef(null);

  // ── Network helpers ──────────────────────────────────────────────────────────

  const buildOnlinePlayers = useCallback(() => {
    const client = sr.current.presenceClient;
    if (!client) return [];

    const safeName = (v) => {
      const t = String(v ?? "").trim();
      return t || "Player";
    };

    const list = [];
    if (client.localId) {
      list.push({
        id: client.localId,
        name: safeName(client.meta?.name),
        status: normalizePresenceStatus(client.meta?.status),
        isSelf: true,
      });
    }

    for (const [id, meta] of client.peerMeta.entries()) {
      list.push({
        id,
        name: safeName(meta?.name),
        status: normalizePresenceStatus(meta?.status),
        isSelf: false,
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
    setNet((v) => ({
      ...v,
      onlinePlayers: players,
      selfId: players.find((p) => p.isSelf)?.id ?? v.selfId,
    }));
  }, [buildOnlinePlayers]);

  const disconnectNet = useCallback(() => {
    const s = sr.current;
    if (s.netClient) {
      try { s.netClient.close(); } catch {}
      s.netClient = null;
    }
    s.netPeerId = null;
    s.netRole = null;
  }, []);

  const disconnectPresence = useCallback(() => {
    const s = sr.current;
    if (s.presenceClient) {
      try { s.presenceClient.close(); } catch {}
      s.presenceClient = null;
    }
    setNet((v) => ({
      ...v,
      presenceState: "offline",
      onlinePlayers: [],
      selfId: "",
      incomingChallenge: null,
      outgoingChallenge: null,
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
        onlinePlayers: v.onlinePlayers.map((p) =>
          p.id === selfId ? { ...p, status: nextStatus } : p
        ),
      };
    });
  }, []);

  const connectPresence = useCallback(async (rawName) => {
    const desiredName = String(rawName ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24);

    if (!desiredName) {
      setNet((v) => ({ ...v, error: "Enter your name." }));
      return false;
    }

    try { window.localStorage.setItem(NAME_STORAGE_KEY, desiredName); } catch {}

    const s = sr.current;
    if (s.presenceClient) {
      try { s.presenceClient.close(); } catch {}
      s.presenceClient = null;
    }

    setNet((v) => ({
      ...v,
      presenceState: "connecting",
      statusMsg: "Connecting online lobby...",
      error: "",
      playerName: desiredName,
      nameInput: desiredName,
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
        const assigned = String(meta?.name ?? desiredName).trim() || desiredName;
        try { window.localStorage.setItem(NAME_STORAGE_KEY, assigned); } catch {}
        setNet((v) => ({ ...v, playerName: assigned, nameInput: assigned }));
        refreshOnlinePlayers();
      },
      onPeerJoin: () => refreshOnlinePlayers(),
      onPeerLeave: () => refreshOnlinePlayers(),
      onPeerMeta: () => refreshOnlinePlayers(),
      onServerMessage: (msg) => presenceMsgRef.current?.(msg),
    });

    s.presenceClient = client;

    try {
      await client.connect();
      setNet((v) => ({
        ...v,
        nameReady: true,
        playerName: String(client.meta?.name ?? desiredName).trim() || desiredName,
        nameInput: String(client.meta?.name ?? desiredName).trim() || desiredName,
        selfId: client.localId ?? "",
        presenceState: "online",
        statusMsg: "Online lobby connected",
        error: "",
      }));
      refreshOnlinePlayers();
      return true;
    } catch (e) {
      s.presenceClient = null;
      setNet((v) => ({
        ...v,
        presenceState: "offline",
        error: `Could not connect online lobby: ${e.message}`,
        statusMsg: "",
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
      outgoingChallenge: null,
    }));
    refreshOnlinePlayers();
  }, [ensurePresenceConnected, setPresenceStatus, refreshOnlinePlayers]);

  // Host: generate code, connect, wait for peer's data channel to open, then begin
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
      statusMsg: "Connecting to game server...",
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
        s.netPeerId = peerId;
        client.sendTo(peerId, { type: "start", yourColor: B, timeControlId: timeControl.id });
        setNet((v) => ({ ...v, screen: null, peerStatus: "connected", statusMsg: "", outgoingChallenge: null, incomingChallenge: null }));
        startGameRef.current?.("net", W, timeControl.id);
      },
      onPeerClose: () => setNet((v) => ({ ...v, peerStatus: "disconnected", statusMsg: "Opponent disconnected" })),
      onMessage: (msg) => netMsgRef.current?.(msg),
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

  // Join: connect with given code, wait for host's "start" message
  const joinGame = useCallback(async (code) => {
    const clean = String(code ?? "").trim().toUpperCase();
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
      statusMsg: "Connecting to game server...",
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
      onMessage: (msg) => netMsgRef.current?.(msg),
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

    sr.current.presenceClient?.sendDirect(peerId, {
      type: "challenge",
      roomCode,
      timeControlId,
      fromName: net.playerName || "Player",
    });

    setNet((v) => ({
      ...v,
      outgoingChallenge: {
        toId: peerId,
        toName: target.name,
        roomCode,
        timeControlId,
      },
      statusMsg: `Challenge sent to ${target.name}...`,
      error: "",
    }));
  }, [hostGame, ensurePresenceConnected, net.onlinePlayers, net.timeControlId, net.playerName, ui.mode]);

  const acceptChallenge = useCallback(async () => {
    const challenge = net.incomingChallenge;
    if (!challenge) return;

    setNet((v) => ({ ...v, incomingChallenge: null, error: "" }));
    sr.current.presenceClient?.sendDirect(challenge.fromId, {
      type: "challenge-accepted",
      roomCode: challenge.roomCode,
      timeControlId: challenge.timeControlId,
      byName: net.playerName || "Player",
    });

    await joinGame(challenge.roomCode);
  }, [joinGame, net.incomingChallenge, net.playerName]);

  const declineChallenge = useCallback(() => {
    const challenge = net.incomingChallenge;
    if (!challenge) return;

    sr.current.presenceClient?.sendDirect(challenge.fromId, {
      type: "challenge-declined",
      roomCode: challenge.roomCode,
      byName: net.playerName || "Player",
    });

    setNet((v) => ({ ...v, incomingChallenge: null }));
  }, [net.incomingChallenge, net.playerName]);

  // Start / restart game
  const startGame = useCallback((mode, playerColor = W, timeControlId = "casual") => {
    const s = sr.current;
    const timeControl = resolveTimeControl(timeControlId);

    if (mode !== "net") disconnectNet();

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
    s.clockMs =
      timeControl.initialMs == null
        ? { [W]: null, [B]: null }
        : { [W]: timeControl.initialMs, [B]: timeControl.initialMs };
    s.clockLastTickAt = timeControl.initialMs == null ? 0 : performance.now();
    s.aiThinking = false;
    s.captured = { [W]: [], [B]: [] };

    s.spherical.theta = playerColor === W ? 0 : Math.PI;
    s.spherical.phi = 0.85;
    s.spherical.radius = 14;
    if (s.updateCam) s.updateCam();

    syncBoard();
    syncHighlights();
    syncGraveyard();
    refresh();

    setPresenceStatus(mode === "net" ? "playing" : "lobby");

    if (mode === "pvai" && playerColor === B) {
      setTimeout(() => {
        if (sr.current.turn !== sr.current.playerColor) aiMove();
      }, 600);
    }
  }, [syncBoard, syncHighlights, syncGraveyard, refresh, aiMove, disconnectNet, setPresenceStatus]);

  // Keep ref in sync so hostGame/joinGame can call startGame without circular dep
  startGameRef.current = startGame;

  presenceMsgRef.current = async ({ from, payload }) => {
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "challenge") {
      const roomCode = String(payload.roomCode ?? "").trim().toUpperCase();
      if (!roomCode) return;
      const timeControlId = resolveTimeControl(payload.timeControlId).id;
      const fromName = String(payload.fromName ?? "Player").trim() || "Player";

      if (ui.mode === "net" || net.screen === "waiting" || net.screen === "joining") {
        sr.current.presenceClient?.sendDirect(from, {
          type: "challenge-declined",
          roomCode,
          byName: net.playerName || "Player",
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
          timeControlId,
        },
        error: "",
      }));
      return;
    }

    if (payload.type === "challenge-accepted") {
      setNet((v) => ({
        ...v,
        outgoingChallenge: null,
        statusMsg: "Challenge accepted. Waiting for game connection...",
        error: "",
      }));
      return;
    }

    if (payload.type === "challenge-declined") {
      const byName = String(payload.byName ?? "Opponent").trim() || "Opponent";
      setNet((v) => ({
        ...v,
        outgoingChallenge: null,
        screen: "lobby",
        error: `${byName} declined your challenge.`,
      }));
      disconnectNet();
      setPresenceStatus("lobby");
      return;
    }
  };

  // ── Net message handler — written to ref every render so it's always current ─
  netMsgRef.current = ({ from, data }) => {
    const s = sr.current;
    if (!data || typeof data !== "object") return;

    if (data.type === "start") {
      const myColor = data.yourColor === B ? B : W;
      const gameClock = resolveTimeControl(data.timeControlId).id;
      if (from) s.netPeerId = from;
      setNet((v) => ({ ...v, screen: null, peerStatus: "connected", statusMsg: "", timeControlId: gameClock, outgoingChallenge: null, incomingChallenge: null }));
      startGameRef.current?.("net", myColor, gameClock);
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
      const resignedColor =
        data?.color === W || data?.color === B
          ? data.color
          : (s.playerColor === W ? B : W);
      setNet((v) => ({ ...v, statusMsg: "Opponent resigned" }));
      resignGame(resignedColor, { relay: false });
      return;
    }

    if (data.type === "timeout") {
      const flaggedColor =
        data?.color === W || data?.color === B
          ? data.color
          : (s.playerColor === W ? B : W);
      setNet((v) => ({ ...v, statusMsg: "Opponent flagged on time" }));
      timeoutGame(flaggedColor, { relay: false });
      return;
    }
  };

  useEffect(() => {
    let saved = "";
    try {
      saved = window.localStorage.getItem(NAME_STORAGE_KEY) || "";
    } catch {}
    if (saved) {
      setNet((v) => ({ ...v, nameInput: v.nameInput || saved }));
    }
  }, []);

  useEffect(() => {
    if (ui.mode === "net" && (ui.status === "checkmate" || ui.status === "stalemate" || ui.status === "resigned" || ui.status === "timeout")) {
      setPresenceStatus("lobby");
    }
  }, [ui.mode, ui.status, setPresenceStatus]);

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const turnLabel = ui.turn === W ? "White" : "Black";
  const statusMsg = () => {
    if (ui.status === "checkmate") return `☠ Checkmate — ${ui.turn === W ? "Black" : "White"} wins!`;
    if (ui.status === "stalemate") return "🤝 Stalemate — Draw";
    if (ui.status === "resigned") return `🏳 ${ui.turn === W ? "White" : "Black"} resigned — ${ui.turn === W ? "Black" : "White"} wins!`;
    if (ui.status === "timeout") return `⏰ ${ui.turn === W ? "White" : "Black"} flagged — ${ui.turn === W ? "Black" : "White"} wins!`;
    if (ui.status === "check") return `⚠ ${turnLabel} is in Check!`;
    if (ui.status === "playing") {
      if (ui.mode === "net") {
        return ui.turn === ui.playerColor ? "⚔ Your turn" : "⏳ Opponent's turn";
      }
      return `${turnLabel}'s turn`;
    }
    return "";
  };

  const isOver =
    ui.status === "checkmate" ||
    ui.status === "stalemate" ||
    ui.status === "resigned" ||
    ui.status === "timeout";
  const activeTimeControl = resolveTimeControl(ui.timeControlId);
  const hasClock = activeTimeControl.initialMs != null;

  const btn = (label, onClick, color = "#8b6914", extra = {}) => (
    <button onClick={onClick} style={{
      padding: "11px 22px", background: color, color: "#fff",
      border: "none", borderRadius: "8px", fontSize: "0.95em",
      cursor: "pointer", fontFamily: "'Palatino Linotype', Palatino, serif",
      fontWeight: "bold", letterSpacing: "0.03em",
      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      transition: "filter 0.15s", ...extra,
    }}
    onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.2)"}
    onMouseLeave={e => e.currentTarget.style.filter = ""}
    >{label}</button>
  );

  const cardStyle = {
    background: "linear-gradient(145deg, #1a1200, #0d1117 60%)",
    border: "2px solid #6b4f10", borderRadius: "18px",
    padding: "44px 48px", textAlign: "center", color: "#f0d9b5",
    minWidth: "360px", maxWidth: "420px",
    boxShadow: "0 0 60px rgba(180,130,30,0.15)",
  };

  const overlayStyle = {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)", zIndex: 20,
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", fontSize: "1.3em", letterSpacing: "0.18em",
    textAlign: "center", fontFamily: "monospace", fontWeight: "bold",
    background: "#0d1117", color: "#d4a843", border: "2px solid #6b4f10",
    borderRadius: "8px", outline: "none", boxSizing: "border-box",
    textTransform: "uppercase",
  };
  const serverInputStyle = {
    width: "100%", padding: "10px 12px", fontSize: "0.9em", letterSpacing: "0.02em",
    textAlign: "left", fontFamily: "monospace", fontWeight: "bold",
    background: "#0d1117", color: "#d4a843", border: "2px solid #6b4f10",
    borderRadius: "8px", outline: "none", boxSizing: "border-box",
    textTransform: "none",
  };
  const timeSelectStyle = {
    ...serverInputStyle,
    appearance: "none",
    cursor: "pointer",
  };
  const nameInputStyle = {
    ...serverInputStyle,
    fontFamily: "'Palatino Linotype', Palatino, serif",
    fontWeight: "normal",
    textTransform: "none",
    letterSpacing: "0.01em",
  };

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: "#0d1117", display: "flex", flexDirection: "column",
      fontFamily: "'Palatino Linotype', Palatino, serif",
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Top bar */}
      <div style={{
        padding: "10px 20px", background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)", borderBottom: "1px solid #2a1f0a",
        display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", zIndex: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: "1.5em", color: "#d4a843", fontWeight: "bold", letterSpacing: "0.06em" }}>
          ♟ 3D CHESS
        </span>

        {ui.mode && (
          <div style={{
            padding: "5px 14px", borderRadius: "20px", fontSize: "0.88em",
            background: isOver ? "#5c1010" : ui.status === "check" ? "#6b3a00" : "rgba(255,255,255,0.08)",
            color: isOver ? "#ff8888" : ui.status === "check" ? "#ffcc44" : "#d4c5a9",
            border: `1px solid ${isOver ? "#aa3333" : ui.status === "check" ? "#cc8800" : "#3a2f1a"}`,
            fontWeight: "bold",
          }}>
            {statusMsg()}
          </div>
        )}

        {ui.mode === "pvai" && ui.aiThinking && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "5px 14px", borderRadius: "20px",
            background: "rgba(80,60,20,0.4)", border: "1px solid #6b4f10",
            color: "#c8a040", fontSize: "0.84em", fontStyle: "italic",
          }}>
            <span style={{ animation: "pulse 1s ease-in-out infinite" }}>●</span>
            AI is thinking…
          </div>
        )}

        {/* Net status pill */}
        {ui.mode === "net" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "5px 14px", borderRadius: "20px",
            background: net.peerStatus === "connected" ? "rgba(20,60,20,0.5)" : "rgba(80,20,20,0.5)",
            border: `1px solid ${net.peerStatus === "connected" ? "#2a6a2a" : "#6a2a2a"}`,
            color: net.peerStatus === "connected" ? "#88cc88" : "#cc8888",
            fontSize: "0.82em",
          }}>
            <span style={{ fontSize: "0.6em", animation: net.peerStatus === "connected" ? "" : "pulse 1.5s ease-in-out infinite" }}>●</span>
            {net.peerStatus === "connected" ? `Online · Playing as ${ui.playerColor === W ? "White" : "Black"}` : "Disconnected"}
          </div>
        )}

        {ui.mode && hasClock && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {[W, B].map((color) => (
              <div
                key={color}
                style={{
                  padding: "5px 10px",
                  borderRadius: "8px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.82em",
                  minWidth: "88px",
                  border: `1px solid ${ui.turn === color && !isOver ? "#b68c2c" : "#3a2f1a"}`,
                  background: ui.turn === color && !isOver ? "rgba(122,86,24,0.35)" : "rgba(255,255,255,0.06)",
                  color: color === W ? "#f5e8cc" : "#d4c5a9",
                }}
              >
                {(color === W ? "W" : "B")} {formatClock(ui.clockMs?.[color])}
              </div>
            ))}
            <div style={{ color: "#8a7a58", fontSize: "0.74em", letterSpacing: "0.03em" }}>
              {activeTimeControl.label}
            </div>
          </div>
        )}

        <span style={{ color: "#4a3f2f", fontSize: "0.78em", marginLeft: "4px" }}>
          Right-click drag = orbit &nbsp;·&nbsp; Scroll = zoom
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          {ui.mode && !isOver && btn("🏳 Resign", () => resignGame(), "#6a1f1f")}
          {ui.mode && btn("⟵ Menu", () => {
            disconnectNet();
            setPresenceStatus("lobby");
            const s = sr.current; s.mode = null; s.status = "idle";
            setNet(v => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
            setUi(v => ({ ...v, mode: null, status: "idle" }));
          }, "#2a2010")}
          {ui.mode && ui.mode !== "net" && btn("↺ Restart", () => startGame(ui.mode, ui.playerColor, ui.timeControlId), "#1a2a1a")}
        </div>
      </div>

      {/* 3D Viewport */}
      <div ref={mountRef} style={{ flex: 1, width: "100%", position: "relative" }} />

      {!net.nameReady && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 10px", color: "#d4a843", fontSize: "1.7em" }}>Choose Your Name</h2>
            <p style={{ color: "#6a5a3a", margin: "0 0 18px", fontSize: "0.86em" }}>
              This name is shown in the online lobby and challenge list.
            </p>
            {net.error && (
              <div style={{ color: "#ff8888", background: "rgba(80,0,0,0.4)", border: "1px solid #aa3333", borderRadius: "8px", padding: "8px 14px", marginBottom: "14px", fontSize: "0.85em" }}>
                {net.error}
              </div>
            )}
            <input
              style={nameInputStyle}
              placeholder="Your name"
              maxLength={24}
              value={net.nameInput}
              onChange={e => setNet(v => ({ ...v, nameInput: e.target.value, error: "" }))}
              onKeyDown={e => e.key === "Enter" && net.presenceState !== "connecting" && submitName()}
            />
            <div style={{ marginTop: "16px" }}>
              {btn(net.presenceState === "connecting" ? "Connecting..." : "Continue", () => { if (net.presenceState !== "connecting") submitName(); }, "#1a3a2a", { minWidth: "170px" })}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Menu ── */}
      {net.nameReady && !ui.mode && !net.screen && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <div style={{ fontSize: "4em", marginBottom: "4px", filter: "drop-shadow(0 0 12px #d4a84388)" }}>♟</div>
            <h1 style={{ margin: "0 0 6px", color: "#d4a843", fontSize: "2em", letterSpacing: "0.08em" }}>3D CHESS</h1>
            <p style={{ color: "#6a5a3a", margin: "0 0 28px", fontSize: "0.82em", letterSpacing: "0.04em" }}>
              RIGHT-CLICK DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM<br />LEFT-CLICK TO SELECT &amp; MOVE
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                <div style={{ color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" }}>TIME CONTROL</div>
                <select
                  style={timeSelectStyle}
                  value={net.timeControlId}
                  onChange={e => setNet(v => ({ ...v, timeControlId: e.target.value }))}
                >
                  {TIME_CONTROLS.map((tc) => (
                    <option key={tc.id} value={tc.id}>{tc.label}</option>
                  ))}
                </select>
              </div>
              {btn("♟♟  Player vs Player", () => startGame("pvp", W, net.timeControlId), "#5c3d1e")}
              {btn("⚪  Play as White vs AI", () => startGame("pvai", W, net.timeControlId), "#1a3a1a")}
              {btn("⚫  Play as Black vs AI", () => startGame("pvai", B, net.timeControlId), "#1a1a3a")}
              <div style={{ borderTop: "1px solid #2a1f0a", margin: "4px 0" }} />
              {btn("🌐  Play Online", () => openOnlineLobby(), "#1a2040")}
            </div>
            <p style={{ color: "#3a3020", margin: "22px 0 0", fontSize: "0.75em" }}>
              AI plays random legal moves — improve it yourself!
            </p>
          </div>
        </div>
      )}

      {/* ── Online Lobby ── */}
      {net.screen === "lobby" && (
        <div style={overlayStyle}>
          <div style={{ ...cardStyle, minWidth: "560px", maxWidth: "760px", width: "92vw" }}>
            <h2 style={{ margin: "0 0 6px", color: "#d4a843", fontSize: "1.6em" }}>🌐 Online Lobby</h2>
            <p style={{ color: "#6a5a3a", margin: "0 0 18px", fontSize: "0.82em" }}>
              Signed in as <strong>{net.playerName || "Player"}</strong> · {net.presenceState === "online" ? "connected" : net.presenceState}
            </p>

            {net.error && (
              <div style={{ color: "#ff8888", background: "rgba(80,0,0,0.4)", border: "1px solid #aa3333", borderRadius: "8px", padding: "8px 14px", marginBottom: "14px", fontSize: "0.85em" }}>
                {net.error}
              </div>
            )}

            {net.incomingChallenge && (
              <div style={{ border: "1px solid #6b4f10", borderRadius: "10px", padding: "12px", marginBottom: "14px", background: "rgba(60,40,10,0.35)" }}>
                <div style={{ color: "#f0d9b5", marginBottom: "8px", fontSize: "0.94em" }}>
                  Challenge from <strong>{net.incomingChallenge.fromName}</strong> ({resolveTimeControl(net.incomingChallenge.timeControlId).label})
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  {btn("Accept", () => acceptChallenge(), "#1a3a2a", { fontSize: "0.84em", padding: "8px 14px" })}
                  {btn("Decline", () => declineChallenge(), "#5a1f1f", { fontSize: "0.84em", padding: "8px 14px" })}
                </div>
              </div>
            )}

            {net.outgoingChallenge && (
              <div style={{ border: "1px solid #2a5f9f", borderRadius: "10px", padding: "10px", marginBottom: "14px", background: "rgba(25,45,75,0.35)", color: "#9bc2ff", fontSize: "0.84em" }}>
                Waiting for <strong>{net.outgoingChallenge.toName}</strong> to accept your challenge...
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", marginBottom: "10px" }}>
              <div style={{ color: "#8a7a58", fontSize: "0.72em", letterSpacing: "0.06em" }}>TIME CONTROL (for your outgoing challenge)</div>
              <select
                style={timeSelectStyle}
                value={net.timeControlId}
                onChange={e => setNet(v => ({ ...v, timeControlId: e.target.value, error: "" }))}
              >
                {TIME_CONTROLS.map((tc) => (
                  <option key={tc.id} value={tc.id}>{tc.label}</option>
                ))}
              </select>
            </div>

            <div style={{ border: "1px solid #2a1f0a", borderRadius: "10px", overflow: "hidden", background: "rgba(0,0,0,0.22)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "9px 12px", borderBottom: "1px solid #2a1f0a", color: "#8a7a58", fontSize: "0.76em", letterSpacing: "0.04em" }}>
                <div>PLAYER</div>
                <div>STATUS / ACTION</div>
              </div>
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {net.onlinePlayers.length <= 1 ? (
                  <div style={{ padding: "14px 12px", color: "#7d6e4f", fontSize: "0.84em" }}>
                    No other players online yet.
                  </div>
                ) : (
                  net.onlinePlayers.map((player) => (
                    <div key={player.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "10px", padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ color: "#f0d9b5", fontSize: "0.93em" }}>
                          {player.name}{player.isSelf ? " (You)" : ""}
                        </div>
                        <div style={{ color: "#7d6e4f", fontSize: "0.75em" }}>{player.id.slice(0, 8)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ color: normalizePresenceStatus(player.status) === "playing" ? "#f39a9a" : "#8fd39a", fontSize: "0.8em", minWidth: "72px", textAlign: "right" }}>
                          {presenceLabel(player.status)}
                        </span>
                        {!player.isSelf && btn("Challenge", () => challengePlayer(player.id), "#1a3a2a", { fontSize: "0.8em", padding: "7px 12px" })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              {btn("← Back", () => setNet(v => ({ ...v, screen: null, error: "" })), "#2a2010", { fontSize: "0.85em", padding: "8px 18px" })}
            </div>
          </div>
        </div>
      )}

      {/* ── Host: Waiting for opponent ── */}
      {net.screen === "waiting" && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <div style={{ fontSize: "2.5em", marginBottom: "12px" }}>⏳</div>
            <h2 style={{ margin: "0 0 8px", color: "#d4a843" }}>Waiting for Opponent</h2>
            <div style={{ color: "#7d6e4f", fontSize: "0.72em", margin: "0 0 10px" }}>
              Clock: {resolveTimeControl(net.timeControlId).label}
            </div>
            <p style={{ color: "#6a5a3a", margin: "0 0 22px", fontSize: "0.84em" }}>
              Waiting for opponent to join this game:
            </p>
            <div style={{
              fontSize: "2.8em", fontFamily: "monospace", fontWeight: "bold",
              letterSpacing: "0.22em", color: "#f0d9b5",
              background: "rgba(255,255,255,0.06)", border: "2px solid #6b4f10",
              borderRadius: "10px", padding: "14px 24px", marginBottom: "18px",
              userSelect: "all", cursor: "text",
            }}>
              {net.code}
            </div>
            <div style={{ color: "#888", fontSize: "0.8em", marginBottom: "22px", animation: "pulse 2s ease-in-out infinite" }}>
              {net.statusMsg || "Waiting for someone to join…"}
            </div>
            {btn("Cancel", () => { disconnectNet(); setPresenceStatus("lobby"); setNet(v => ({ ...v, screen: "lobby", outgoingChallenge: null })); }, "#3a1010", { fontSize: "0.85em", padding: "8px 18px" })}
          </div>
        </div>
      )}

      {/* ── Joiner: Connecting ── */}
      {net.screen === "joining" && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <div style={{ fontSize: "2em", marginBottom: "12px",
              display: "inline-block", animation: "spin 1.2s linear infinite" }}>⚙</div>
            <h2 style={{ margin: "0 0 16px", color: "#d4a843" }}>Joining Game…</h2>
            <div style={{ color: "#7d6e4f", fontSize: "0.72em", margin: "0 0 10px" }}>
              Clock: {resolveTimeControl(net.timeControlId).label}
            </div>
            <div style={{ color: "#a09070", fontSize: "0.88em", marginBottom: "22px" }}>
              {net.statusMsg || "Connecting…"}
            </div>
            {btn("Cancel", () => { disconnectNet(); setPresenceStatus("lobby"); setNet(v => ({ ...v, screen: "lobby", outgoingChallenge: null })); }, "#3a1010", { fontSize: "0.85em", padding: "8px 18px" })}
          </div>
        </div>
      )}

      {/* ── Opponent disconnected banner ── */}
      {ui.mode === "net" && net.peerStatus === "disconnected" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(3px)", zIndex: 20,
        }}>
          <div style={{ ...cardStyle, border: "2px solid #8b2020" }}>
            <div style={{ fontSize: "3em", marginBottom: "8px" }}>🔌</div>
            <h2 style={{ margin: "0 0 10px", color: "#d4a843" }}>Opponent Disconnected</h2>
            <p style={{ color: "#a09070", margin: "0 0 24px", fontSize: "0.88em" }}>
              The connection to your opponent was lost.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              {btn("🌐 Play Again Online", () => { setPresenceStatus("lobby"); setNet(v => ({ ...v, screen: "lobby", peerStatus: "", error: "", outgoingChallenge: null, incomingChallenge: null })); }, "#1a2040")}
              {btn("⟵ Main Menu", () => {
                disconnectNet();
                setPresenceStatus("lobby");
                const s = sr.current; s.mode = null; s.status = "idle";
                setNet(v => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
                setUi(v => ({ ...v, mode: null, status: "idle" }));
              }, "#2a2010")}
            </div>
          </div>
        </div>
      )}

      {/* ── Game Over ── */}
      {ui.mode && isOver && net.peerStatus !== "disconnected" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)", zIndex: 20, pointerEvents: "none",
        }}>
          <div style={{
            background: "linear-gradient(145deg, #1a0800, #0d1117)",
            border: "2px solid #8b2020", borderRadius: "16px",
            padding: "36px 48px", textAlign: "center", color: "#f0d9b5",
            boxShadow: "0 0 40px rgba(200,50,50,0.2)", pointerEvents: "all",
          }}>
            <div style={{ fontSize: "3.5em", marginBottom: "8px" }}>
              {ui.status === "checkmate" ? "♚" : ui.status === "resigned" ? "🏳" : ui.status === "timeout" ? "⏰" : "🤝"}
            </div>
            <h2 style={{ margin: "0 0 22px", color: "#d4a843", fontSize: "1.5em" }}>{statusMsg()}</h2>
            <div style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
              {ui.mode !== "net" && btn("↺ Play Again", () => startGame(ui.mode, ui.playerColor, ui.timeControlId), "#1a3a1a")}
              {btn("⟵ Menu", () => {
                disconnectNet();
                setPresenceStatus("lobby");
                const s = sr.current; s.mode = null; s.status = "idle";
                setNet(v => ({ ...v, screen: null, peerStatus: "", incomingChallenge: null, outgoingChallenge: null }));
                setUi(v => ({ ...v, mode: null, status: "idle" }));
              }, "#3a1a1a")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rootEl = document.getElementById("app");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<Chess3D />);
}
