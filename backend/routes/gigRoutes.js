const express = require("express");
const router = express.Router();
const gigController = require("../controllers/gigController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// Public-ish / Freelancer search
router.get("/", authMiddleware, gigController.getGigs);

// Client Specific
router.post("/", authMiddleware, authorizeRoles("client"), gigController.createGig);
router.get("/my-gigs", authMiddleware, authorizeRoles("client"), gigController.getMyGigs);

// General get by ID
router.get("/:id", authMiddleware, gigController.getGigById);

// Invite freelancer
router.post("/:id/invite", authMiddleware, authorizeRoles("client"), gigController.inviteFreelancer);
router.get("/:id/invite-candidates", authMiddleware, authorizeRoles("client"), gigController.getInviteCandidates);

// Milestone progress
router.patch("/:id/milestones/:milestoneId/complete", authMiddleware, authorizeRoles("freelancer"), gigController.markMilestoneCompleted);

module.exports = router;
