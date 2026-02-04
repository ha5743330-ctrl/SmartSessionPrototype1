// public/js/signaling.js
console.log("SmartSession signaling loaded");

// --------- Socket init (single socket) ----------
const signalingSocket = typeof socket !== "undefined" ? socket : io();
window.socket = signalingSocket; // expose for pages that expect `socket`

function log(...args){ console.log("[sig]", ...args); }
function safeEmitSignal(to, data) {
  signalingSocket.emit("signal", { to, from: signalingSocket.id, data });
}

// basic diagnostics
signalingSocket.on("connect", () => log("connected", signalingSocket.id));
signalingSocket.on("disconnect", (r) => log("socket disconnected", r));
signalingSocket.on("room-created", (info) => log("room-created", info));
signalingSocket.on("error-room", (d) => log("error-room", d));

// --------- Shared state ----------
let localStream = null;
let hostPCs = {};
let hostDataChannels = {};
let pendingHostCandidates = {};

let viewerPC = null;
let viewerDataChannel = null;
let pendingViewerCandidates = [];
let hostIdGlobal = null;

// --------- Helpers ----------
async function ensureLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const localVideo = document.getElementById("localVideo");
    if (localVideo) localVideo.srcObject = localStream;
    log("local display stream started");
    return localStream;
  } catch (err) {
    console.error("getDisplayMedia failed:", err);
    alert("Screen capture failed or not allowed.");
    throw err;
  }
}

// --------- SIGNAL HANDLING ----------
signalingSocket.on("signal", async ({ from, data }) => {
  log("signal received from", from, data?.type || "candidate");

  if (viewerPC) {
    if (data?.type === "offer") {
      try {
        hostIdGlobal = from;
        viewerPC.hostId = from;

        await viewerPC.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await viewerPC.createAnswer();
        await viewerPC.setLocalDescription(answer);

        safeEmitSignal(from, { type: "answer", sdp: answer });
        log("viewer: sent answer to host", from);
      } catch (err) {
        console.error("viewer: error handling offer", err);
      }
      return;
    }

    if (data?.candidate) {
      try { await viewerPC.addIceCandidate(data.candidate); } catch (err) { console.warn("viewer addIce error", err); }
      return;
    }
  }

  const pc = hostPCs[from];
  if (pc) {
    if (data?.type === "answer") {
      try { await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); log("host: set remote answer from viewer", from); } 
      catch (err) { console.warn("host remote answer error", err); }
      return;
    }

    if (data?.candidate) {
      try { await pc.addIceCandidate(data.candidate); } 
      catch (err) {
        if (!pendingHostCandidates[from]) pendingHostCandidates[from] = [];
        pendingHostCandidates[from].push(data.candidate);
        log("host: queued viewer ICE for", from);
      }
      return;
    }
  }

  log("signal: no matching PC found for", from);
});

// --------- 'joined' event ----------
signalingSocket.on("joined", (payload) => {
  log("joined room:", payload);
  if (payload && payload.hostId) {
    hostIdGlobal = payload.hostId;
    if (viewerPC) viewerPC.hostId = payload.hostId;
    log("room host:", payload.hostId);
  }
});

// --------- HOST: Create Room ----------
async function createRoom(sessionCode) {
  if (!sessionCode) return alert("Provide a session code.");
  log("createRoom", sessionCode);

  signalingSocket.emit("create-room", { sessionCode });
  try { await ensureLocalStream(); } catch(e){ }
}

// --------- HOST: Viewer joined ----------
signalingSocket.on("viewer-joined", async ({ viewerId }) => {
  log("viewer-joined:", viewerId);
  alert(`Viewer joined: ${viewerId}`);

  try { await ensureLocalStream(); } catch(e){ log("host: can't get display stream"); return; }

  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  hostPCs[viewerId] = pc;

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const dc = pc.createDataChannel("control");
  hostDataChannels[viewerId] = dc;
  setupHostDataChannel(dc, viewerId);

  pc.onicecandidate = (e) => { if (e.candidate) safeEmitSignal(viewerId, { type: "candidate", candidate: e.candidate }); };

  pc.onconnectionstatechange = () => {
    log("host pc state for", viewerId, pc.connectionState);
    if (["failed","closed","disconnected"].includes(pc.connectionState)) {
      delete hostPCs[viewerId];
      delete hostDataChannels[viewerId];
      alert(`Viewer left: ${viewerId}`);
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    safeEmitSignal(viewerId, { type: "offer", sdp: offer });

    if (pendingHostCandidates[viewerId]) {
      for (const c of pendingHostCandidates[viewerId]) { try { await pc.addIceCandidate(c); } catch(e){ console.warn(e); } }
      delete pendingHostCandidates[viewerId];
    }
  } catch (err) { console.error("host createOffer error:", err); }
});

// --------- HOST Data Channel ----------
function setupHostDataChannel(dc, viewerId) {
  dc.onopen = () => log("host data channel open to", viewerId);
  dc.onclose = () => log("host data channel closed", viewerId);
  dc.onerror = (e) => console.warn("host data channel error", e);
  dc.onmessage = (ev) => {
    try { applyRemoteControlOnHost(JSON.parse(ev.data)); }
    catch (ex) { log("host dc parse error", ex, ev.data); }
  };
}

// Apply remote control actions
function applyRemoteControlOnHost(msg) {
  const video = document.getElementById("localVideo");
  if (!video) return;

  let cursor = document.getElementById("remoteCursorOverlay");
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "remoteCursorOverlay";
    cursor.style.cssText = "position:absolute;width:12px;height:12px;background:rgba(255,0,0,0.9);border-radius:50%;pointer-events:none;z-index:99999";
    document.body.appendChild(cursor);
  }

  const rect = video.getBoundingClientRect();
  const px = rect.left + (msg.x || 0) * rect.width;
  const py = rect.top + (msg.y || 0) * rect.height;

  if (msg.type === "mousemove") cursor.style.transform = `translate(${px-6}px, ${py-6}px)`;
  else if (msg.type === "click") {
    const el = document.elementFromPoint(px, py);
    if (el) el.dispatchEvent(new MouseEvent("click", { clientX: px, clientY: py, bubbles: true, cancelable: true }));
  }
  else if (msg.type === "keydown" || msg.type === "keyup") document.dispatchEvent(new KeyboardEvent(msg.type, { key: msg.key, code: msg.code, bubbles: true, cancelable: true }));
}

// --------- VIEWER: Join Room ----------
// --------- VIEWER: Join Room ----------
// Viewer-side join
function joinRoomAsViewer(sessionCode) {
  if (!sessionCode) return alert("Enter session code");

  const connecting = document.getElementById("connectingText");
  connecting.style.display = "block";
  connecting.textContent = "🔗 Connecting to host...";

  startViewerPC();
  signalingSocket.emit("join-room", { sessionCode });
}

// ✅ Host ready / session active
signalingSocket.on("joined", (payload) => {
  log("joined room:", payload);
  hostIdGlobal = payload.hostId;
  if (viewerPC) viewerPC.hostId = payload.hostId;

  const connecting = document.getElementById("connectingText");
  connecting.textContent = "✅ Connected successfully!";
});

// ❌ Session invalid or expired
signalingSocket.on("error-room", (payload) => {
  log("error-room", payload);
  const connecting = document.getElementById("connectingText");
  connecting.textContent = payload.message; // show proper message
});

function startViewerPC() {
  if (viewerPC) return;

  viewerPC = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  viewerPC.ontrack = (ev) => {
    const v = document.getElementById("remoteVideo") || document.getElementById("localVideo");
    if (v) v.srcObject = ev.streams[0];
    log("viewer: remote track arrived");
  };

  viewerPC.ondatachannel = (ev) => {
    viewerDataChannel = ev.channel;
    setupViewerDataChannel(viewerDataChannel);
  };

  viewerPC.onicecandidate = (e) => {
    if (!e.candidate) return;
    const toHost = viewerPC.hostId || hostIdGlobal;
    if (toHost) safeEmitSignal(toHost, { type: "candidate", candidate: e.candidate });
    else pendingViewerCandidates.push(e.candidate);
  };

  viewerPC.onconnectionstatechange = () => log("viewer pc state:", viewerPC.connectionState);
}

function setupViewerDataChannel(dc) {
  dc.onopen = () => {
    log("viewer data channel open");
    const toHost = viewerPC.hostId || hostIdGlobal;
    if (toHost && pendingViewerCandidates.length) {
      pendingViewerCandidates.forEach(c => safeEmitSignal(toHost, { type: "candidate", candidate: c }));
      pendingViewerCandidates = [];
    }
  };
  dc.onclose = () => log("viewer data channel closed");
  dc.onerror = (e) => console.warn("viewer data channel error", e);
  dc.onmessage = (e) => log("viewer dc message:", e.data);
}

// --------- VIEWER: helper to send control
function viewerSendControl(msg) {
  if (viewerDataChannel && viewerDataChannel.readyState === "open") {
    viewerDataChannel.send(JSON.stringify(msg));
  } else log("viewerSendControl: data channel not open yet");
}
window.viewerSendControl = viewerSendControl;

// --------- ALERT: Viewer sees host left
signalingSocket.on("host-left", ({ sessionCode }) => {
  alert("Host has left the session. Session ended.");
  try { viewerPC?.close(); } catch(e){ }
  window.location.href = "/join-session";
});

// --------- Cleanup ----------
window.addEventListener("beforeunload", () => {
  try { viewerPC?.close(); } catch(e){}
  Object.values(hostPCs).forEach(pc => { try { pc.close(); } catch(_){} });
});

// Export top-level functions
window.createRoom = createRoom;
window.joinRoomAsViewer = joinRoomAsViewer;
console.log("SmartSession signaling initialized");