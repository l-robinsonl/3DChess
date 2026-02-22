# 3DChess

3D chess client with local, AI, and online P2P modes.

## Files

- `chess.html`: app entry page
- `src/chess-logic.js`: rules and legal move generation
- `src/chess-geometry.js`: Three.js piece generation
- `src/chess-sounds.js`: sound engine + move sample playback
- `src/p2p-mesh-client.js`: signalling/WebRTC data-channel client
- `src/chess-app.jsx`: main React UI/game runtime

## Run locally

Serve the folder with any static web server and open `chess.html`.

Example:

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/chess.html`

## Online mode

Set your signalling server in the in-game "SIGNALING SERVER" field.
