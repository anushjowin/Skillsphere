const express = require("express");
const router = express.Router();
const progressController = require("../controllers/progressController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/", authMiddleware, progressController.createProgress);
router.get("/my", authMiddleware, progressController.getMyProgressTrackers);
router.get("/gig/:gigId", authMiddleware, progressController.getProgress);
router.post("/gig/:gigId/tasks", authMiddleware, progressController.addTask);
router.patch("/gig/:gigId/tasks/:taskId/toggle", authMiddleware, progressController.toggleTask);
router.patch("/gig/:gigId/tasks/:taskId", authMiddleware, progressController.updateTask);
router.delete("/gig/:gigId/tasks/:taskId", authMiddleware, progressController.deleteTask);
router.post("/gig/:gigId/logs", authMiddleware, progressController.addLog);
router.patch("/gig/:gigId/status", authMiddleware, progressController.updateStatus);
router.get("/deadlines", authMiddleware, progressController.checkDeadlines);

module.exports = router;