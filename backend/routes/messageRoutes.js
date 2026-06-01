const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const authMiddleware = require("../middleware/authMiddleware");

// Get messages between two users
router.get("/:userId", authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user.id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user.id }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

// Mark messages as read
router.put("/mark-read/:senderId", authMiddleware, async (req, res) => {
    try {
        await Message.updateMany(
            { sender: req.params.senderId, receiver: req.user.id, read: false },
            { $set: { read: true } }
        );
        res.json({ msg: "Messages marked as read" });
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

module.exports = router;
