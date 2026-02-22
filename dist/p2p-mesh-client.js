// ─── P2P Mesh Client (inline) ─────────────────────────────────────────────────

function safeJsonParse(v) { try { return JSON.parse(v); } catch { return v; } }

class P2PMeshClient {
  constructor({
    app,
    room,
    meta = null,
    signalUrl,
    enableRtc = true,
    rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    onStatus = () => {},
    onMessage = () => {},
    onServerMessage = () => {},
    onSelfMeta = () => {},
    onPeerMeta = () => {},
    onPeerJoin = () => {},
    onPeerLeave = () => {},
    onPeerOpen = () => {},
    onPeerClose = () => {},
  }) {
    Object.assign(this, {
      app,
      room,
      meta,
      signalUrl,
      enableRtc,
      rtcConfig,
      onStatus,
      onMessage,
      onServerMessage,
      onSelfMeta,
      onPeerMeta,
      onPeerJoin,
      onPeerLeave,
      onPeerOpen,
      onPeerClose,
    });
    this.ws = null;
    this.localId = null;
    this.peers = new Map();
    this.peerMeta = new Map();
  }

  async connect() {
    if (this.ws) throw new Error("Already connected");
    this.onStatus("connecting...");
    this.ws = new WebSocket(this.signalUrl);

    await new Promise((resolve, reject) => {
      let settled = false;
      let welcomed = false;
      const fail = (e) => {
        if (settled) return;
        settled = true;
        this.ws?.close();
        this.ws = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      };
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.ws.addEventListener("error", (ev) => {
        if (!welcomed) {
          fail(ev.error ?? new Error("socket error"));
          return;
        }
        this.onStatus("socket error");
      });

      this.ws.addEventListener("open", () => {
        this.sendSignal({ type: "join", app: this.app, room: this.room, meta: this.meta });
      });

      this.ws.addEventListener("close", () => {
        this.onStatus("socket closed");
        if (!welcomed) fail(new Error("closed before welcome"));
      });

      this.ws.addEventListener("message", async (ev) => {
        try {
          const msg = safeJsonParse(ev.data);
          if (!msg || typeof msg !== "object") return;

          if (msg.type === "welcome") {
            welcomed = true;
            this.localId = msg.id;
            if (msg.meta && typeof msg.meta === "object") {
              this.meta = msg.meta;
              this.onSelfMeta(this.meta);
            }
            this.onStatus(`joined as ${this.localId.slice(0, 8)}`);

            this.peerMeta.clear();
            for (const peer of msg.peerMeta ?? []) {
              if (!peer || typeof peer !== "object" || typeof peer.id !== "string") continue;
              this.peerMeta.set(peer.id, peer.meta ?? null);
            }

            for (const pid of msg.peers ?? []) {
              this.onPeerJoin(pid, this.peerMeta.get(pid) ?? null);
              if (this.enableRtc) {
                this.ensurePeer(pid);
                if (this.shouldInitiate(pid)) await this.makeOffer(pid);
              }
            }
            done();
            return;
          }

          if (msg.type === "peer-joined") {
            const pid = msg.id;
            this.peerMeta.set(pid, msg.meta ?? null);
            this.onPeerJoin(pid, msg.meta ?? null);
            if (this.enableRtc) {
              this.ensurePeer(pid);
              if (this.shouldInitiate(pid)) await this.makeOffer(pid);
            }
            return;
          }

          if (msg.type === "peer-left") {
            this.peerMeta.delete(msg.id);
            this.removePeer(msg.id);
            this.onPeerLeave(msg.id);
            return;
          }

          if (msg.type === "peer-meta") {
            if (typeof msg.id === "string") {
              this.peerMeta.set(msg.id, msg.meta ?? null);
              this.onPeerMeta(msg.id, msg.meta ?? null);
            }
            return;
          }

          if (msg.type === "meta-updated") {
            if (msg.meta && typeof msg.meta === "object") {
              this.meta = msg.meta;
              this.onSelfMeta(this.meta);
            }
            return;
          }

          if (msg.type === "direct") {
            this.onServerMessage({ from: msg.from, payload: msg.payload ?? null, broadcast: false });
            return;
          }

          if (msg.type === "broadcast") {
            this.onServerMessage({ from: msg.from, payload: msg.payload ?? null, broadcast: true });
            return;
          }

          if (msg.type === "signal") {
            if (this.enableRtc) await this.handleSignal(msg.from, msg.signal);
            return;
          }

          if (msg.type === "error") {
            this.onStatus(`server error: ${msg.reason}`);
            if (!welcomed) fail(new Error(msg.reason));
          }
        } catch (err) {
          fail(err);
        }
      });
    });
  }

  sendSignal(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendDirect(pid, payload) {
    if (typeof pid !== "string" || !pid) return false;
    this.sendSignal({ type: "direct", to: pid, payload: payload ?? null });
    return true;
  }

  updateMeta(patch) {
    if (!patch || typeof patch !== "object") return false;
    this.sendSignal({ type: "set-meta", patch });
    return true;
  }

  getPeerMeta(pid) {
    return this.peerMeta.get(pid) ?? null;
  }

  shouldInitiate(pid) {
    return String(this.localId).localeCompare(String(pid)) < 0;
  }

  ensurePeer(pid) {
    if (!this.enableRtc) return null;
    let p = this.peers.get(pid);
    if (p) return p;
    const pc = new RTCPeerConnection(this.rtcConfig);
    p = { id: pid, pc, dc: null, pendingIce: [] };
    this.peers.set(pid, p);

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.sendSignal({ type: "signal", to: pid, signal: { ice: ev.candidate } });
    };
    pc.ondatachannel = (ev) => this.attachDataChannel(pid, ev.channel);
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") this.onPeerOpen(pid);
      if (["closed", "failed", "disconnected"].includes(st)) this.onPeerClose(pid);
    };
    return p;
  }

  attachDataChannel(pid, ch) {
    const p = this.ensurePeer(pid);
    if (!p) return;
    p.dc = ch;
    ch.onopen = () => {
      this.onStatus(`channel open: ${pid.slice(0, 8)}`);
      this.onPeerOpen(pid);
    };
    ch.onclose = () => {
      this.onStatus("channel closed");
      this.onPeerClose(pid);
    };
    ch.onmessage = (ev) => this.onMessage({ from: pid, data: safeJsonParse(ev.data) });
  }

  async makeOffer(pid) {
    if (!this.enableRtc) return;
    const p = this.ensurePeer(pid);
    if (!p) return;
    if (!p.dc) {
      const dc = p.pc.createDataChannel("game");
      this.attachDataChannel(pid, dc);
    }
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.sendSignal({ type: "signal", to: pid, signal: { sdp: p.pc.localDescription } });
  }

  async flushPendingIce(pid) {
    const p = this.peers.get(pid);
    if (!p || !p.pendingIce.length) return;
    const pending = [...p.pendingIce];
    p.pendingIce = [];
    for (const ice of pending) {
      try {
        await p.pc.addIceCandidate(ice);
      } catch {
        // ignore stale ICE
      }
    }
  }

  async handleSignal(fromPid, signal) {
    if (!this.enableRtc) return;
    const p = this.ensurePeer(fromPid);
    if (!p) return;
    if (!signal || typeof signal !== "object") return;
    if (signal.sdp) {
      await p.pc.setRemoteDescription(signal.sdp);
      if (signal.sdp.type === "offer") {
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        this.sendSignal({ type: "signal", to: fromPid, signal: { sdp: p.pc.localDescription } });
      }
      await this.flushPendingIce(fromPid);
    }
    if (signal.ice) {
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(signal.ice);
      else p.pendingIce.push(signal.ice);
    }
  }

  sendTo(pid, payload) {
    if (!this.enableRtc) return false;
    const p = this.peers.get(pid);
    if (!p || !p.dc || p.dc.readyState !== "open") return false;
    p.dc.send(JSON.stringify(payload));
    return true;
  }

  broadcast(payload) {
    if (!this.enableRtc) return 0;
    let n = 0;
    for (const [, p] of this.peers) {
      if (!p.dc || p.dc.readyState !== "open") continue;
      p.dc.send(JSON.stringify(payload));
      n++;
    }
    return n;
  }

  removePeer(pid) {
    const p = this.peers.get(pid);
    if (!p) return;
    try { p.dc?.close(); } catch {}
    try { p.pc?.close(); } catch {}
    this.peers.delete(pid);
  }

  close() {
    for (const pid of this.peers.keys()) this.removePeer(pid);
    this.peers.clear();
    this.peerMeta.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.localId = null;
  }
}

function genRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const HARDCODED_SIGNAL_URL = "wss://p2p-signalling-server.leerobinson1984.workers.dev/ws";

function getSignalUrl() {
  return HARDCODED_SIGNAL_URL;
}
