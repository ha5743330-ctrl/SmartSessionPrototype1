// ============================
// SmartSession - Server.js (Production-Ready Version)
// ============================~

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const isAdmin = require('./middleware/isAdmin');

// Function to compare two face descriptors (Euclidean Distance)
const getFaceDistance = (desc1, desc2) => {
  if (!desc1 || !desc2) return 1.0;
  return Math.sqrt(desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0));
};
const app = express();


// ============================
// Models
// ============================
const User = require('./models/User');
const SessionModel = require('./models/Session');
const Report = require('./models/Report');
// const upload = require('./config/multer');

// ============================
// App Initialization
// ============================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
const isLoggedIn = require('./middleware/isLoggedIn'); // File name matches exactly
// ---------------------------------
app.set('trust proxy', 1);
// ============================
// Middleware
// ============================
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/models', express.static(path.join(__dirname, 'models')));

// ✅ Secure Session Handling
app.set('trust proxy', 1); // If behind proxy (like Heroku)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true in production HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
  })
);

// ============================
// Database Connection
// ============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Database Connection Error:", err.message));

// ============================
// Frontend Views
// ============================
const sendView = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, 'views', file));

// --- PUBLIC ROUTES ---
app.get('/', sendView('index.html')); 
app.get('/signin', sendView('signin.html'));

// --- PROTECTED ROUTES (isLoggedIn ab sirf Full Access check karega) ---
app.get('/create-session', isLoggedIn, sendView('create-session.html'));
app.get('/view-sessions', isLoggedIn, sendView('view-sessions.html'));
app.get('/reports', isLoggedIn, sendView('reports.html'));
app.get('/join-session', isLoggedIn, sendView('join-session.html'));
app.get('/admin', isLoggedIn, isAdmin, sendView('admin-dashboard.html'));

// --- AUTH PAGES (Yahan Middleware mat lagayein, inki apni logic hai) ---
app.get('/face-auth', (req, res) => {
    // Sirf usay dikhao jo password de chuka hai (tempUser)
    if (req.session.tempUser || req.session.user) {
        return res.sendFile(path.join(__dirname, 'views', 'face-auth.html'));
    }
    res.redirect('/signin');
});

app.get('/face-verify', (req, res) => {
    if (req.session.tempUser) {
        return res.sendFile(path.join(__dirname, 'views', 'face-verify.html'));
    }
    res.redirect('/signin');
});

// ============================
// AUTH APIs
// ============================

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validation for New Users
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // 2. Strong Password Policy (New Users ke liye)
    if (password.length < 8) {
        return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    // Naya user create karein (Hook automatically hash kar dega)
    const newUser = new User({ name, email, password });
    await newUser.save();

    // Session Logic (Wahi jo aapne di thi)
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false });
      req.session.tempUser = { id: newUser._id, email: newUser.email, role: newUser.role };
      res.json({ success: true, redirect: "/face-auth", message: "Account created securely." });
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ NEW & SECURE LOGIN API
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// 1. Sirf Login ke liye sakht limiter (Brute-force se bachne ke liye)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minutes
    max: 10, // Max 10 attempts
    message: { success: false, message: "Zyada login attempts ho gaye hain, 15 min baad try karein." },
    standardHeaders: true,
    legacyHeaders: false,
});

// 2. Login Route
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        // NoSQL Injection se bachne ke liye body ko sanitize karein
        const email = String(req.body.email); 
        const password = String(req.body.password);

        // User dhundein
        const user = await User.findOne({ email });

        // Security Tip: Generic message dein taake hacker ko pata na chale email sahi hai ya password
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: "Email ya password darust nahi hai." });
        }

        // Account Block check
        if (user.blocked) {
            return res.status(403).json({ success: false, message: "Aapka account block kar diya gaya hai." });
        }

        // Session Fixation Attack se bachne ke liye session regenerate karein
        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Session error." });
            }

            // Temp user data set karein (2FA ya Face Auth ke liye)
            req.session.tempUser = {
                id: user._id,
                email: user.email,
                role: user.role
            };
            
            req.session.user = null; // Final user session abhi khali rakhein

            // Admin Logic
            if (user.role === 'admin') {
                req.session.user = req.session.tempUser; 
                return res.json({ success: true, redirect: "/admin" });
            }

            // Face Auth Logic
            if (!user.faceDescriptor || user.faceDescriptor.length === 0) {
                return res.json({ success: true, redirect: "/face-auth" });
            }

            // Verification Flow
            return res.json({ success: true, redirect: "/face-verify" });
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "Server mein koi masla aa gaya hai." });
    }
});
// app.post('/api/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });

//     if (!user || !(await user.comparePassword(password))) {
//       return res.status(401).json({ success: false, message: "Invalid credentials." });
//     }

//     if (user.blocked) {
//       return res.status(403).json({ success: false, message: "Your account is blocked." });
//     }

//     req.session.regenerate((err) => {
//       if (err) return res.status(500).json({ success: false });

//       // ✅ STEP 1: Session data taiyar karein
//       const sessionData = {
//         id: user._id,
//         email: user.email,
//         role: user.role
//       };

//       // ✅ STEP 2: BYPASS LOGIC (Yahan change hai)
//       // Hum tempUser ke bajaye direct req.session.user set kar rahe hain
//       req.session.user = sessionData; 
//       req.session.tempUser = null; // tempUser ki ab zaroorat nahi

//       // ✅ STEP 3: Redirection Logic
//       if (user.role === 'admin') {
//         return res.json({ success: true, redirect: "/admin" });
//       }

//       // User ko direct dashboard ya session create karne wale page par bhej dein
//       // Pehle ye "/face-verify" par ja raha tha, ab bypass ho gaya
//       console.log(`⚠️ Bypass: ${user.email} logged in without Face Auth`);
//       return res.json({ success: true, redirect: "/create-session" }); 
//     });

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });
// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: "Logged out successfully!" }));
});

// ============================
// FACE AUTH - Upload / Verify
// ============================

// Upload Face
app.post('/api/face/upload', async (req, res) => {
  try {
    // ✅ FIX: Ab ye 'user' OR 'tempUser' dono ko allow karega
    const sessionUser = req.session.user || req.session.tempUser;
    
    if (!sessionUser) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }

    const { descriptor } = req.body;

    if (!descriptor || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: "Invalid face data." });
    }

    // Database mein descriptor save karein
    await User.findByIdAndUpdate(sessionUser.id, { 
      faceDescriptor: descriptor,
      faceImage: 'registered' 
    });

    // ✅ Registration ke baad session saaf kar dein taake user dobara login karke verify ho
    req.session.destroy();

    res.json({ 
      success: true, 
      message: "Face registered! Please login to verify.", 
      redirect: "/signin" 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ UPDATED SECURE VERIFY API
app.post('/api/face/verify', async (req, res) => {
  try {
    // 1. Check karein ke user ne Login (Password) step kiya hai
    if (!req.session.tempUser) {
      return res.status(401).json({ success: false, message: 'Please login with password first' });
    }

    const { liveDescriptor } = req.body;
    const user = await User.findById(req.session.tempUser.id);

    if (!user || !user.faceDescriptor || user.faceDescriptor.length === 0) {
      return res.status(400).json({ success: false, message: 'No face registered for this account' });
    }

    // 2. Compare descriptors
    const distance = getFaceDistance(user.faceDescriptor, liveDescriptor);

    // 0.50 - 0.55 balance threshold hai (Glasses ke liye behtar hai)
    if (distance < 0.55) {
      // 🏆 SUCCESS: Ab user ko permanent session mein convert karein
      req.session.user = req.session.tempUser;
      delete req.session.tempUser; // Temp data delete kar dein

      res.json({ success: true, message: 'Face matched successfully! ✔' });
    } else {
      res.json({ success: false, message: 'Face did not match. ❌' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error during verification" });
  }
});
// Delete single or multiple sessions
app.post('/api/delete-session', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ message: "Login required" });

    // Support both single and multiple deletes
    const { sessionId, sessionIds } = req.body;

    if (!sessionId && (!sessionIds || sessionIds.length === 0)) {
      return res.status(400).json({ message: "Session ID(s) required" });
    }

    if (sessionId) {
      // Single delete
      const deleted = await SessionModel.findOneAndDelete({ _id: sessionId, user: req.session.user.id });
      if (!deleted) return res.status(404).json({ message: "Session not found" });
      return res.json({ success: true, message: "Session deleted" });
    }

    if (sessionIds && sessionIds.length > 0) {
      // Multiple delete
      const deleted = await SessionModel.deleteMany({ _id: { $in: sessionIds }, user: req.session.user.id });
      return res.json({ success: true, message: `${deleted.deletedCount} session(s) deleted` });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete session(s)" });
  }
});
// ============================
// Delete single or multiple reports
app.post('/api/delete-report', async (req, res) => {
  try {
    // Login check
    if (!req.session.user) return res.status(401).json({ message: "Login required" });

    // Extract IDs (single or multiple)
    let { reportId, reportIds } = req.body;

    // Agar sirf single ID aayi ho
    if (reportId) reportIds = [reportId];

    // Validation
    if (!reportIds || !reportIds.length) return res.status(400).json({ message: "Report ID(s) required" });

    // Delete all requested reports
    const result = await Report.deleteMany({ _id: { $in: reportIds } });

    res.json({ success: true, message: `${result.deletedCount} report(s) deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete report(s)" });
  }
});

// ============================



// Get Face Info
app.get('/api/face/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false });

  try {
    const user = await User.findById(req.session.user.id);
    if (!user || !user.faceImage) return res.json({ success: false, message: 'No face registered' });
    res.json({ success: true, faceImage: `/uploads/faces/${user.faceImage}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================
// ADMIN APIs
// ============================
// Get users
app.get('/api/admin/users', isAdmin, async (req,res)=>{
  const users = await User.find({}, 'name email role blocked updatedAt');
  res.json(users);
});

// Block user
app.put('/api/admin/block-user/:id', isAdmin, async (req,res)=>{
  try {
    const user = await User.findById(req.params.id);

    if(!user) return res.status(404).json({success:false, message:"User not found."});

    if(user.role === 'admin') return res.status(403).json({success:false, message:"Cannot block admin!"});

    user.blocked = true;
    await user.save();

    res.json({success:true, message:`User ${user.name} blocked successfully.`});
  } catch(err){
    res.status(500).json({success:false, message:err.message});
  }
});

// Unblock user
app.put('/api/admin/unblock-user/:id', isAdmin, async (req,res)=>{
  try {
    const user = await User.findById(req.params.id);

    if(!user) return res.status(404).json({success:false, message:"User not found."});

    if(user.role === 'admin') return res.status(403).json({success:false, message:"Cannot unblock admin!"});

    user.blocked = false;
    await user.save();

    res.json({success:true, message:`User ${user.name} unblocked successfully.`});
  } catch(err){
    res.status(500).json({success:false, message:err.message});
  }
});
// TEMP: Force unblock admin (remove after fixing)
app.put('/api/admin/force-unblock-admin', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if(!admin) return res.status(404).json({ success:false, message:"Admin not found." });

    admin.blocked = false;
    await admin.save();

    res.json({ success:true, message:"Admin unblocked successfully!" });
  } catch(err) {
    res.status(500).json({ success:false, message: err.message });
  }
});
  


// Delete user
app.delete('/api/admin/delete-user/:id', isAdmin, async (req,res)=>{
  await User.findByIdAndDelete(req.params.id);
  res.json({ success:true, message:'Deleted' });
});



// ============================
// SESSION APIs
// ============================
app.post('/api/create-session', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: "Login required." });
  if (!req.body.sessionName) return res.status(400).json({ success:false, message:"Session name required" });

  try {
    const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newSession = new SessionModel({ user: req.session.user.id, sessionName: req.body.sessionName, sessionCode });
    await newSession.save();

    await new Report({ user: req.session.user.id, action: `Session Created: ${req.body.sessionName}` }).save();

    res.json({ success: true, message: "Session created successfully!", sessionCode });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/join-session', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: "Login required to join session." });

  try {
    const { sessionCode } = req.body;
    const sessionDoc = await SessionModel.findOne({ sessionCode, active: true });
    if (!sessionDoc) return res.status(404).json({ success: false, message: "Invalid or expired session code." });

    await new Report({ user: req.session.user.id, action: `Session Joined: ${sessionCode}` }).save();
    res.json({ success: true, message: "Session joined successfully!", session: sessionDoc });

  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/view-sessions', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: "Login required" });

  try {
    const sessions = req.session.user.role === 'admin'
      ? await SessionModel.find().populate('user', 'name email')
      : await SessionModel.find({ user: req.session.user.id }).populate('user', 'name email');

    res.json(sessions);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/reports', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ message: "Login required" });

  try {
    const reports = req.session.user.role === 'admin'
      ? await Report.find().populate('user', 'name email')
      : await Report.find({ user: req.session.user.id }).populate('user', 'name email');

    res.json(reports);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

const rooms = {}; 
const socketToRoom = new Map();

io.on("connection", (socket) => {
    console.log("⚡ New socket connected:", socket.id);

    // --- Room Logic ---
    socket.on("create-room", ({ sessionCode }) => {
        rooms[sessionCode] = { hostId: socket.id, viewers: [] };
        socketToRoom.set(socket.id, sessionCode);
        socket.join(sessionCode);
        socket.emit("room-created", { sessionCode });
        console.log(`🟢 Room created: ${sessionCode}`);
    });

  socket.on("join-room", (payload) => {
    // Check karein ke payload object hai ya direct string
    const sessionCode = typeof payload === 'object' ? payload.sessionCode : payload;
    
    const room = rooms[sessionCode];
    if (!room) {
        console.log(`❌ Room not found for code: ${sessionCode}`);
        return socket.emit("error-room", { message: "Room not found." });
    }

    // Room join karwana (Zaroori hai signals receive karne ke liye)
    socket.join(sessionCode);
    socketToRoom.set(socket.id, sessionCode);

    // Agar ye Viewer hai (Python Agent nahi), toh viewers list mein daalein
    if (socket.id !== room.hostId) {
        room.viewers.push(socket.id);
        io.to(room.hostId).emit("viewer-joined", { viewerId: socket.id });
    }

    socket.emit("joined", { sessionCode, hostId: room.hostId });
    console.log(`🔹 Socket ${socket.id} successfully joined room: ${sessionCode}`);
});

    // --- SIGNALING (WebRTC) ---
    socket.on("signal", ({ to, from, data }) => io.to(to).emit("signal", { from, data }));

    // --- REMOTE CONTROL BRIDGE (The Proper Way) ---
// server.js mein viewer-control wala part sirf ye rakhein:
socket.on("viewer-control", ({ roomId, type, data }) => {
    if (!roomId) return;
    // Direct Host Agent ko bhejain
    io.to(roomId).emit("python-control", { type, data });
    console.log(`Forwarding ${type} to Agent in Room ${roomId}`);
});

    // --- DISCONNECT & END SESSION ---
    socket.on("endSession", ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            io.to(roomId).emit("sessionEnded", { roomId });
            delete rooms[roomId];
        }
    });

    socket.on("disconnect", () => {
        const sessionCode = socketToRoom.get(socket.id);
        if (sessionCode && rooms[sessionCode]) {
            if (rooms[sessionCode].hostId === socket.id) {
                io.to(sessionCode).emit("host-left", { sessionCode });
                delete rooms[sessionCode];
            }
        }
        socketToRoom.delete(socket.id);
    });
});
// ----------------------------------
// ==================================


// 1. Imports aur Worker Setup (Hamesha top par)
// const { spawn } = require('child_process');
// const pythonWorker = spawn('python', ['controller.py']);

// // Error logging for Python (Bahar rakhein)
// pythonWorker.stderr.on('data', (data) => {
//     console.error(`Python Error: ${data}`);
// });

// const rooms = {}; 
// const socketToRoom = new Map();

// // 2. Main Socket Block (Sirf aik baar)
// io.on("connection", (socket) => {
//     console.log("⚡ New socket connected:", socket.id);

//     // --- Room Logic ---
//     socket.on("create-room", ({ sessionCode }) => {
//         rooms[sessionCode] = { hostId: socket.id, viewers: [] };
//         socketToRoom.set(socket.id, sessionCode);
//         socket.join(sessionCode);
//         socket.emit("room-created", { sessionCode });
//         console.log(`🟢 Room created: ${sessionCode}`);
//     });

//     socket.on("join-room", ({ sessionCode }) => {
//         const room = rooms[sessionCode];
//         if (!room || !room.hostId) return socket.emit("error-room", { message: "Room not found." });

//         room.viewers.push(socket.id);
//         socketToRoom.set(socket.id, sessionCode);
//         socket.join(sessionCode);
//         io.to(room.hostId).emit("viewer-joined", { viewerId: socket.id });
//         socket.emit("joined", { sessionCode, hostId: room.hostId });
//     });

//     // --- SIGNALING (WebRTC) ---
//     socket.on("signal", ({ to, from, data }) => io.to(to).emit("signal", { from, data }));

//     // --- REMOTE CONTROL BRIDGE (The Critical Part) ---
//     socket.on("viewer-control", ({ roomId, type, data }) => {
//         if (!roomId) return;

//         // A. Host ko visual signal bhejna (Laser/Pointer ke liye)
//         socket.to(roomId).emit("host-receive-control", { type, data });

//         // B. Python ko OS control bhejna (Mouse/Click ke liye)
//         if (pythonWorker.stdin.writable && (type === 'mouse-move' || type === 'mouse-click')) {
//             const command = {
//                 type: type,
//                 x: data.x,
//                 y: data.y,
//                 action: data.action || 'left-click'
//             };
//             pythonWorker.stdin.write(JSON.stringify(command) + "\n");
//         }
//     });

//     // --- DISCONNECT & END SESSION ---
//     socket.on("endSession", ({ roomId }) => {
//         const room = rooms[roomId];
//         if (room && room.hostId === socket.id) {
//             io.to(roomId).emit("sessionEnded", { roomId });
//             delete rooms[roomId];
//         }
//     });

//     socket.on("disconnect", () => {
//         const sessionCode = socketToRoom.get(socket.id);
//         if (sessionCode && rooms[sessionCode]) {
//             if (rooms[sessionCode].hostId === socket.id) {
//                 io.to(sessionCode).emit("host-left", { sessionCode });
//                 delete rooms[sessionCode];
//             }
//         }
//         socketToRoom.delete(socket.id);
//         console.log("User disconnected:", socket.id);
//     });
// });
// ========================================
// ========================================
// TEMPORARY: Database clean karne ke liye
app.get('/api/admin/db-reset', async (req, res) => {
  try {
    // Sab users se faceDescriptor aur faceImage hata dega
    const result = await User.updateMany({}, { 
      $unset: { faceDescriptor: "", faceImage: "" } 
    });
    res.send(`<h1>Success!</h1><p>${result.modifiedCount} users ka data reset ho gaya.</p>`);
  } catch (err) {
    res.status(500).send("Error: " + err.message);

  }

});
// ============================
// SETTINGS & PROFILE APIS
// ============================

// 1. Get Settings Page (View Route)
app.get('/settings', isLoggedIn, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// 2. Update Profile Name
app.put('/api/user/update-profile', isLoggedIn, async (req, res) => {
    const { username } = req.body;
    const userId = req.session.user.id; // Session se user ID uthali

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Name must be at least 3 characters." });
    }

    try {
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { name: username }, 
            { new: true } // updated data wapas laane ke liye
        );

        // Session mein bhi name update karein taake UI refresh na karni paray
        req.session.user.name = updatedUser.name;

        res.json({ success: true, message: "Profile updated successfully!", newName: updatedUser.name });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error: " + err.message });
    }
});

// 3. Change Password
app.post('/api/user/change-password', isLoggedIn, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user.id;

    try {
        const user = await User.findById(userId);
        
        // Current password match karein
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Current password is wrong" });
        }

        // Naya password set karein (User model automatically isay hash kar dega)
        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: "Password updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating password." });
    }
});

// 4. Delete Account (Danger Zone)
app.delete('/api/user/delete-account', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Database se user aur uska data remove karein
        await User.findByIdAndDelete(userId);
        await SessionModel.deleteMany({ user: userId });
        await Report.deleteMany({ user: userId });

        // Session khatam karein
        req.session.destroy();
        res.json({ success: true, message: "Account deleted permanently." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Account deletion failed." });
    }
});
// Get Current User Data
app.get('/api/user/me', isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ success: false });
        
        res.json({ 
            success: true, 
            name: user.name, 
            email: user.email 
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ============================
// START SERVER
// ============================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 SmartSession running on http://localhost:${PORT}`));
