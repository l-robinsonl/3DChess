// ─── 3D Piece Geometry ────────────────────────────────────────────────────────

function makePiece(type, color) {
  const g = new THREE.Group();
  const isW = color === W;

  // ── Procedural wood-grain texture ─────────────────────────────────────────
  // Key: material color must be 0xffffff so the canvas texture isn't darkened.
  // All colour lives in the canvas. High contrast grain so it reads on curved surfaces.
  const makeWoodTex = (sz = 512) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = sz;
    const cx = cv.getContext("2d");

    // Base wood colour
    const baseR = isW ? 210 : 28;
    const baseG = isW ? 165 : 12;
    const baseB = isW ? 90  : 4;
    cx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    cx.fillRect(0, 0, sz, sz);

    // Broad annual ring bands — subtle alternating lighter/darker bands
    for (let i = 0; i < 12; i++) {
      const y = (i / 12) * sz;
      const bandH = sz / 12 + Math.random() * 20 - 10;
      const light = i % 2 === 0;
      cx.globalAlpha = 0.10 + Math.random() * 0.08;
      cx.fillStyle = light
        ? `rgb(${baseR+30},${baseG+18},${baseB+8})`
        : `rgb(${baseR-30},${baseG-18},${baseB-8})`;
      cx.fillRect(0, y, sz, bandH);
    }

    // Main grain lines — HIGH contrast, wavy verticals
    cx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      const x   = Math.random() * sz;
      const dark = Math.random() > 0.45;
      const alpha = 0.25 + Math.random() * 0.40; // punchy
      cx.globalAlpha = alpha;

      let gr, gg, gb;
      if (isW) {
        gr = dark ? baseR - 70  : baseR + 45;
        gg = dark ? baseG - 50  : baseG + 30;
        gb = dark ? baseB - 30  : baseB + 15;
      } else {
        gr = dark ? 8           : 60;
        gg = dark ? 3           : 25;
        gb = dark ? 1           : 8;
      }
      cx.strokeStyle = `rgb(${Math.max(0,gr)},${Math.max(0,gg)},${Math.max(0,gb)})`;
      cx.lineWidth = Math.random() * 3.5 + 0.6;
      cx.beginPath();
      cx.moveTo(x + Math.random() * 14 - 7, 0);
      // waviness via bezier
      cx.bezierCurveTo(
        x + Math.random() * 20 - 10, sz * 0.25,
        x + Math.random() * 20 - 10, sz * 0.65,
        x + Math.random() * 14 - 7,  sz
      );
      cx.stroke();
    }

    // Fine hair-lines on top
    for (let i = 0; i < 80; i++) {
      cx.globalAlpha = 0.10 + Math.random() * 0.14;
      cx.strokeStyle = isW
        ? `rgb(${baseR-55},${baseG-38},${baseB-20})`
        : `rgb(12,5,1)`;
      cx.lineWidth = 0.4 + Math.random() * 0.9;
      const x = Math.random() * sz;
      cx.beginPath();
      cx.moveTo(x, 0);
      cx.lineTo(x + Math.random() * 8 - 4, sz);
      cx.stroke();
    }

    // Knot — one per piece, positioned randomly in lower third
    cx.globalAlpha = 0.18;
    const kx = sz * (0.2 + Math.random() * 0.6);
    const ky = sz * (0.55 + Math.random() * 0.35);
    for (let r = 22; r > 0; r -= 3) {
      cx.strokeStyle = isW
        ? `rgb(${baseR-60},${baseG-42},${baseB-22})`
        : `rgb(5,2,0)`;
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.ellipse(kx, ky, r * 1.3, r, 0, 0, Math.PI * 2);
      cx.stroke();
    }

    // Pore stipple
    for (let i = 0; i < 1200; i++) {
      cx.globalAlpha = 0.04 + Math.random() * 0.07;
      cx.fillStyle = Math.random() > 0.5
        ? (isW ? `rgb(140,95,40)` : `rgb(6,2,0)`)
        : (isW ? `rgb(240,200,140)` : `rgb(50,20,5)`);
      const s2 = Math.random() * 2 + 0.4;
      cx.fillRect(Math.random()*sz, Math.random()*sz, s2, s2);
    }

    cx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.0, 2.0);
    return tex;
  };

  // ── Roughness/gloss map — varnish swipes give sheen variation ──────────────
  const makeRoughTex = (sz = 256) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = sz;
    const cx = cv.getContext("2d");
    // Start mid-grey
    cx.fillStyle = "#777";
    cx.fillRect(0, 0, sz, sz);
    // Diagonal varnish streaks (bright = smooth/shiny, dark = rough)
    for (let i = 0; i < 14; i++) {
      const grd = cx.createLinearGradient(Math.random()*sz, 0, Math.random()*sz + 40, sz);
      const peak = 0.18 + Math.random() * 0.22;
      grd.addColorStop(0,   "rgba(255,255,255,0)");
      grd.addColorStop(0.35 + Math.random() * 0.3, `rgba(255,255,255,${peak})`);
      grd.addColorStop(1,   "rgba(255,255,255,0)");
      cx.fillStyle = grd;
      cx.fillRect(0, 0, sz, sz);
    }
    // Fine grain noise
    for (let i = 0; i < 1000; i++) {
      const v = Math.floor(Math.random() * 100 + 80);
      cx.fillStyle = `rgb(${v},${v},${v})`;
      const s2 = Math.random() * 2 + 0.3;
      cx.fillRect(Math.random()*sz, Math.random()*sz, s2, s2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  };

  const woodMap  = makeWoodTex();
  const roughMap = makeRoughTex();

  // CRITICAL: color must be 0xffffff — any tint multiplies against the map and kills contrast
  const mat = (extraProps = {}) => new THREE.MeshStandardMaterial({
    map:          woodMap,
    roughnessMap: roughMap,
    color:        0xffffff,
    roughness:    isW ? 0.48 : 0.62,
    metalness:    0.02,
    ...extraProps,
  });

  const m = mat();

  const add = (geo, y = 0, mx, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mx || m);
    mesh.position.y = y;
    if (rx) mesh.rotation.x = rx;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  const addAt = (geo, x, y, z, mx, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mx || m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  // Shared base disc — wider rim + bevelled feel via stacked cylinders
  add(new THREE.CylinderGeometry(0.26, 0.30, 0.045, 32), 0.022);
  add(new THREE.CylinderGeometry(0.24, 0.26, 0.030, 32), 0.058);

  // ── PAWN ──────────────────────────────────────────────────────────────────
  if (type === P.PAWN) {
    add(new THREE.CylinderGeometry(0.085, 0.185, 0.08,  28), 0.125); // foot taper
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.22,  28), 0.26);  // shaft
    add(new THREE.CylinderGeometry(0.095, 0.075, 0.04,  28), 0.385); // collar
    add(new THREE.SphereGeometry  (0.135, 28, 22),              0.50); // head

  // ── ROOK ──────────────────────────────────────────────────────────────────
  } else if (type === P.ROOK) {
    add(new THREE.CylinderGeometry(0.095, 0.19,  0.08, 28), 0.125);
    add(new THREE.CylinderGeometry(0.090, 0.095, 0.28, 28), 0.30);
    add(new THREE.CylinderGeometry(0.175, 0.090, 0.05, 28), 0.465);
    add(new THREE.CylinderGeometry(0.175, 0.175, 0.10, 28), 0.535); // tower wall
    // Battlements — 4 merlons
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      addAt(new THREE.BoxGeometry(0.085, 0.115, 0.085), Math.cos(angle)*0.13, 0.635, Math.sin(angle)*0.13);
    }
    // Embrasure gaps implied by the merlons above; add a cap disc
    add(new THREE.CylinderGeometry(0.10, 0.175, 0.014, 28), 0.588);

  // ── KNIGHT ────────────────────────────────────────────────────────────────
  } else if (type === P.KNIGHT) {
    // Pedestal
    add(new THREE.CylinderGeometry(0.085, 0.185, 0.08,  28), 0.125);
    add(new THREE.CylinderGeometry(0.082, 0.085, 0.14,  28), 0.245);
    add(new THREE.CylinderGeometry(0.095, 0.082, 0.03,  28), 0.345); // collar flare

    // Neck — tapers and tilts forward
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.20, 20), m);
    neck.position.set(0.025, 0.475, 0);
    neck.rotation.z = -0.32; // lean forward
    neck.castShadow = true;
    g.add(neck);

    // Cranium — elongated sphere for horse skull
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), m);
    cranium.scale.set(0.82, 1.0, 0.72);
    cranium.position.set(0.075, 0.645, 0);
    cranium.castShadow = true;
    g.add(cranium);

    // Muzzle — flattened ellipsoid protruding forward
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 14), m);
    muzzle.scale.set(1.0, 0.58, 0.68);
    muzzle.position.set(0.175, 0.585, 0);
    muzzle.castShadow = true;
    g.add(muzzle);

    // Nose bump — tiny sphere at tip of muzzle
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), m);
    nose.position.set(0.252, 0.580, 0);
    nose.castShadow = true;
    g.add(nose);

    // Cheek / jaw — flattened sphere below cranium
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), m);
    jaw.scale.set(1.1, 0.55, 0.70);
    jaw.position.set(0.155, 0.545, 0);
    jaw.castShadow = true;
    g.add(jaw);

    // Ears — two small cones
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 10), m);
      ear.position.set(0.055, 0.756, side * 0.060);
      ear.rotation.z = 0.18 * side;
      ear.castShadow = true;
      g.add(ear);
    }

    // Forelock nub
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), m);
    lock.scale.set(0.6, 1.2, 0.6);
    lock.position.set(0.082, 0.755, 0);
    lock.castShadow = true;
    g.add(lock);

  // ── BISHOP ────────────────────────────────────────────────────────────────
  } else if (type === P.BISHOP) {
    add(new THREE.CylinderGeometry(0.080, 0.185, 0.08,  28), 0.125);
    add(new THREE.CylinderGeometry(0.065, 0.080, 0.36,  28), 0.345);
    add(new THREE.SphereGeometry  (0.098, 24, 18),             0.585); // orb
    // Mitre point
    add(new THREE.CylinderGeometry(0.000, 0.048, 0.19,  16), 0.765);
    // Small cross notch on orb — tiny torus slice
    add(new THREE.TorusGeometry(0.044, 0.012, 8, 20),         0.588, undefined, Math.PI/2, 0);

  // ── QUEEN ─────────────────────────────────────────────────────────────────
  } else if (type === P.QUEEN) {
    add(new THREE.CylinderGeometry(0.085, 0.195, 0.08,  32), 0.125);
    add(new THREE.CylinderGeometry(0.072, 0.085, 0.33,  32), 0.31);
    add(new THREE.CylinderGeometry(0.110, 0.072, 0.05,  32), 0.50);  // waist flare
    add(new THREE.SphereGeometry  (0.135, 30, 22),             0.615); // orb
    // Crown band
    add(new THREE.CylinderGeometry(0.128, 0.128, 0.030, 32), 0.700);
    // 5 pointed finials
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addAt(new THREE.SphereGeometry(0.030, 12, 10), Math.cos(a)*0.105, 0.735, Math.sin(a)*0.105);
      // spike above each ball
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.000, 0.020, 0.085, 8), m);
      spike.position.set(Math.cos(a)*0.105, 0.790, Math.sin(a)*0.105);
      spike.castShadow = true;
      g.add(spike);
    }

  // ── KING ──────────────────────────────────────────────────────────────────
  } else if (type === P.KING) {
    add(new THREE.CylinderGeometry(0.088, 0.200, 0.08,  32), 0.125);
    add(new THREE.CylinderGeometry(0.075, 0.088, 0.34,  32), 0.315);
    add(new THREE.CylinderGeometry(0.115, 0.075, 0.05,  32), 0.510);
    add(new THREE.CylinderGeometry(0.120, 0.115, 0.065, 32), 0.568);
    add(new THREE.CylinderGeometry(0.115, 0.120, 0.020, 32), 0.620); // band top
    // Cross — proper box geometry so it looks like an actual cross
    addAt(new THREE.BoxGeometry(0.042, 0.230, 0.042), 0, 0.760, 0); // vertical bar
    addAt(new THREE.BoxGeometry(0.170, 0.042, 0.042), 0, 0.832, 0); // horizontal bar
  }

  return g;
}

