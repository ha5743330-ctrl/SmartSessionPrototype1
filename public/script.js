console.log("Smart Session Management Prototype Loaded");

// =============================
// SOCKET INITIALIZATION
// =============================
const socket = io();
let peerConnection;
let dataChannel;
let localStream;

// HTML elements
const createBtn = document.getElementById("createSessionBtn");
const joinBtn = document.getElementById("joinSessionBtn");
const sessionCodeInput = document.getElementById("sessionCode");
const videoEl = document.getElementById("videoElement");

// =============================
// CREATE SESSION (Host)
// =============================
if (createBtn) {
  createBtn.addEventListener("click", async () => {
    // Generate 6-digit session code
    const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("🔵 Creating session:", sessionCode);

    // Notify server
    socket.emit("create-room", { sessionCode });
    alert("Session Created: " + sessionCode);

    // Start host stream & connection
    startHost(sessionCode);
  });
}

// =============================
// JOIN SESSION (Viewer)
// =============================
if (joinBtn) {
  joinBtn.addEventListener("click", () => {
    const sessionCode = sessionCodeInput.value.trim();
    if (!sessionCode) return alert("Enter session code!");
    console.log("🟢 Joining session:", sessionCode);

    // Notify server
    socket.emit("join-room", { sessionCode });

    // Start viewer connection
    startViewer(sessionCode);
  });
}

// =============================
// SOCKET EVENTS
// =============================
socket.on("room-created", ({ sessionCode }) => {
  console.log("✅ Room created:", sessionCode);
});

socket.on("viewer-joined", ({ viewerId }) => {
  console.log("👥 Viewer joined:", viewerId);
});

socket.on("signal", async ({ from, data }) => {
  if (!peerConnection) return;

  // Handle SDP (offer/answer)
  if (data.sdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

    if (data.sdp.type === "offer") {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", { to: from, from: socket.id, data: { sdp: answer } });
    }
  }
  // Handle ICE candidates
  else if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("❌ ICE error:", err);
    }
  }
});

// Host left session
socket.on("host-left", () => {
  alert("Host left the session.");
  location.reload();
});

// =============================
// HOST SIDE (share screen + control)
// =============================
async function startHost(sessionCode) {
  try {
    // Get screen stream
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    videoEl.srcObject = localStream;

    peerConnection = new RTCPeerConnection();

    // Add local tracks to connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { to: null, from: socket.id, data: { candidate: event.candidate } });
      }
    };

    // Viewer joined -> send offer
    socket.on("viewer-joined", async ({ viewerId }) => {
      console.log("🎥 Sending offer to viewer:", viewerId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", { to: viewerId, from: socket.id, data: { sdp: offer } });
    });

    // Create data channel for control messages
    dataChannel = peerConnection.createDataChannel("control");
    setupControlChannel(dataChannel);

  } catch (err) {
    console.error("Error starting host:", err);
  }
}

// =============================
// VIEWER SIDE (receive stream + send control)
// =============================
async function startViewer(sessionCode) {
  peerConnection = new RTCPeerConnection();

  // Receive remote stream
  peerConnection.ontrack = (event) => {
    console.log("📺 Remote stream received");
    videoEl.srcObject = event.streams[0];
  };

  // Data channel from host
  peerConnection.ondatachannel = (event) => {
    console.log("📡 Data channel connected (viewer)");
    dataChannel = event.channel;
    dataChannel.onmessage = (e) => console.log("Host says:", e.data);
  };

  // ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: null, from: socket.id, data: { candidate: event.candidate } });
    }
  };
}

// =============================
// REMOTE CONTROL HANDLING
// =============================
function setupControlChannel(channel) {
  channel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("🖱️ Control:", data);

    // TODO: integrate mouse/keyboard simulation here
    // For demo, just log control events
  };
}
