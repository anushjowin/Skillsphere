const express = require("express");
const router = express.Router();
const matchingController = require("../controllers/matchingController");
const authMiddleware = require("../middleware/authMiddleware");

// All matching routes require authentication

// GET /api/matching/status — AI model status (any authenticated user)
router.get("/status", authMiddleware, matchingController.getAIStatus);

// GET /api/matching/trending-skills — Trending skills from recent gigs (any authenticated user)
router.get("/trending-skills", authMiddleware, matchingController.getTrendingSkills);

// GET /api/matching/gig/:gigId — Top freelancers matched for a specific gig (clients)
router.get("/gig/:gigId", authMiddleware, matchingController.getMatchedFreelancersForGig);

// GET /api/matching/freelancer — Personalized gig recommendations (freelancers)
router.get("/freelancer", authMiddleware, matchingController.getRecommendedGigsForFreelancer);

// GET /api/matching/client — Freelancer recommendations for clients (by hiring preferences)
router.get("/client", authMiddleware, matchingController.getRecommendedFreelancersForClient);

module.exports = router;
