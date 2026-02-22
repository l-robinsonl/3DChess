# 3DChess

3D chess client with local, AI, and online P2P modes.

## Files

- `chess.html`: source entry page (uses Babel in browser for quick editing)
- `src/chess-logic.js`: rules and legal move generation
- `src/chess-geometry.js`: Three.js piece generation
- `src/chess-sounds.js`: sound engine + move sample playback
- `src/p2p-mesh-client.js`: signalling/WebRTC data-channel client
- `src/chess-app.jsx`: main React UI/game runtime
- `scripts/build.mjs`: local build script
- `worker-site.js`: Cloudflare Worker entry
- `dist/chess.html`: compiled build output (generated)

## Build locally

```bash
npm install
npm run build
```

This generates a precompiled build in `dist/` (no in-browser Babel transform).

## Run locally

```bash
npm run serve
```

Then open:

- `http://localhost:8080/chess.html`

## Deploy to Cloudflare

```bash
npm install
npm run cf:deploy
```

After deploy, your chess site URL is your Worker domain.

## Online mode

The signalling server URL is hardcoded in `src/p2p-mesh-client.js`:

- `wss://p2p-signalling-server.leerobinson1984.workers.dev/ws`

Players only need room code host/join; there is no server URL input in UI.
