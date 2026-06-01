const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

// Get user notifications
router.get("/", authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

// Mark notification as read
router.put("/:id/read", authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ msg: "Not found" });
        if (notification.user.toString() !== req.user.id) return res.status(401).json({ msg: "Not authorized" });
        
        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

module.exports = router;
