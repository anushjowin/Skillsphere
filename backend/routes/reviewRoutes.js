const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/reviews/:userId/analytics — Review analytics (must come before /:userId in some Express versions)
router.get("/:userId/analytics", reviewController.getReviewAnalytics);

// GET /api/reviews/:userId — Get all reviews for a user
router.get("/:userId", reviewController.getUserReviews);

// POST /api/reviews — Leave a review (authenticated)
router.post("/", authMiddleware, reviewController.leaveReview);

module.exports = router;
