import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

const staticScriptFiles = [
  "chess-config.js",
  "chess-logic.js",
  "chess-geometry.js",
  "chess-sounds.js",
  "p2p-mesh-client.js",
];

const stockfishFiles = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
];

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3D Chess</title>
    <style>
      html,
      body,
      #app {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0d1117;
      }

      body {
        font-family: "Palatino Linotype", Palatino, serif;
      }

      .boot {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #d4a843;
        background: #0d1117;
        letter-spacing: 0.08em;
        z-index: 9999;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div class="boot">Loading 3D Chess...</div>
    </div>

    <noscript>This page requires JavaScript enabled.</noscript>

    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/three@0.160.1/build/three.min.js"></script>

    <script src="./chess-config.js"></script>
    <script src="./chess-logic.js"></script>
    <script src="./chess-geometry.js"></script>
    <script src="./chess-sounds.js"></script>
    <script src="./p2p-mesh-client.js"></script>
    <script src="./chess-app.js"></script>
  </body>
</html>
`;

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

for (const scriptFile of staticScriptFiles) {
  await fs.copyFile(path.join(srcDir, scriptFile), path.join(distDir, scriptFile));
}

await build({
  entryPoints: [path.join(srcDir, "chess-app.jsx")],
  outfile: path.join(distDir, "chess-app.js"),
  bundle: false,
  format: "iife",
  target: ["es2018"],
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  logLevel: "info",
});

const stockfishBinDir = path.join(rootDir, "node_modules", "stockfish", "bin");
for (const file of stockfishFiles) {
  await fs.copyFile(path.join(stockfishBinDir, file), path.join(distDir, file));
}

await fs.copyFile(path.join(rootDir, "chesspiecemove.mp3"), path.join(distDir, "chesspiecemove.mp3"));
await fs.writeFile(path.join(distDir, "chess.html"), html, "utf8");

console.log("Built dist/chess.html");
