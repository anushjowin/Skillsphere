const express = require("express");
require("dotenv").config();

const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const gigRoutes = require("./routes/gigRoutes");
const proposalRoutes = require("./routes/proposalRoutes");
const messageRoutes = require("./routes/messageRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const adminRoutes = require("./routes/adminRoutes");
const matchingRoutes = require("./routes/matchingRoutes");
const disputeRoutes = require("./routes/disputeRoutes");
const progressRoutes = require("./routes/progressRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const aiMatchingService = require("./services/aiMatchingService");
const User = require("./models/User"); // ✅ ADD THIS

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
app.set("io", io);

app.use(cors());
app.use(express.json());
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/gigs", gigRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", authMiddleware, uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/matching", matchingRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/progress", authMiddleware, progressRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});

// 🔥 CONNECT DB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected ✅");
        // Warm up the AI model in the background after DB is ready
        aiMatchingService.warmUp().catch(() => {});
    })
    .catch(err => console.log(err));

// 🔥 PROTECTED TEST ROUTE
app.get("/api/protected", authMiddleware, (req, res) => {
    res.json({ msg: "This is protected data 🔒" });
});

// 🔥 FIXED USER ROUTE
app.get("/api/user", authMiddleware, async (req, res) => {
    try {
        console.log("REQ.USER:", req.user); // 🔍 debug

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        });

    } catch (err) {
        console.log("USER ROUTE ERROR:", err.message);
        res.status(500).json({ msg: "Server error" });
    }
});

// 🔥 SOCKET.IO SETUP
io.on("connection", (socket) => {
    console.log("User connected to socket:", socket.id);

    socket.on("join", (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined their room`);
    });

    socket.on("sendMessage", async (data) => {
        const { sender, receiver, content, fileUrl, fileType, gig } = data;
        const Message = require("./models/Message");
        try {
            const newMessage = new Message({ sender, receiver, content, fileUrl, fileType, gig });
            await newMessage.save();
            // Emit to receiver's room and back to sender's room
            io.to(receiver).emit("receiveMessage", newMessage);
            io.to(sender).emit("receiveMessage", newMessage);
        } catch (err) {
            console.error("Socket send message error:", err);
        }
    });

    socket.on("typing", (data) => {
        const { sender, receiver } = data;
        io.to(receiver).emit("userTyping", { sender });
    });

    socket.on("stopTyping", (data) => {
        const { sender, receiver } = data;
        io.to(receiver).emit("userStoppedTyping", { sender });
    });

    socket.on("markMessagesRead", (data) => {
        const { sender, receiver } = data;
        // The active user is the 'receiver' marking 'sender's' messages as read.
        // We notify the 'sender' that their messages were read.
        io.to(sender).emit("messagesRead", { byUserId: receiver });
    });

    socket.on("sendNotification", async (data) => {
        const { user, type, message, link } = data;
        const Notification = require("./models/Notification");
        try {
            const newNotification = new Notification({ user, type, message, link });
            await newNotification.save();
            io.to(user).emit("receiveNotification", newNotification);
        } catch (err) {
            console.error("Socket notification error:", err);
        }
    });

    // 🔥 WebRTC Video Call Signaling
    socket.on("callUser", (data) => {
        const { userToCall, signalData, from, name } = data;
        // Emit to the specific user's room
        io.to(userToCall).emit("callUser", { signal: signalData, from, name });
    });

    socket.on("answerCall", (data) => {
        io.to(data.to).emit("callAccepted", data.signal);
    });

    socket.on("iceCandidate", (data) => {
        if (data.candidate && data.to) {
            io.to(data.to).emit("iceCandidate", data.candidate);
        }
    });

    socket.on("endCall", (data) => {
        io.to(data.to).emit("callEnded");
    });

    socket.on("rejectCall", (data) => {
        io.to(data.to).emit("callRejected");
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// 🔥 START SERVER
server.listen(5000, () => {
    console.log("Server running on port 5000 🔥");
});
