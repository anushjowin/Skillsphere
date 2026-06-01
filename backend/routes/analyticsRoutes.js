const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/view", analyticsController.recordProfileView);
router.get("/me", authMiddleware, analyticsController.getMyAnalytics);
router.get("/profile-views", authMiddleware, analyticsController.getProfileViews);
router.get("/applications", authMiddleware, analyticsController.getGigApplications);
router.get("/earnings", authMiddleware, analyticsController.getEarningsStats);
router.get("/revenue", authMiddleware, analyticsController.getMonthlyRevenue);
router.get("/feedback", authMiddleware, analyticsController.getFeedbackAnalytics);
router.post("/sync", authMiddleware, analyticsController.syncAnalytics);

module.exports = router;