const express = require("express");
const router = express.Router();
const proposalController = require("../controllers/proposalController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// Freelancers submit
router.post("/", authMiddleware, authorizeRoles("freelancer"), proposalController.submitProposal);

// Clients view and accept
router.get("/gig/:gigId", authMiddleware, authorizeRoles("client"), proposalController.getProposalsByGig);
router.put("/:id/accept", authMiddleware, authorizeRoles("client"), proposalController.acceptProposal);
router.patch("/:id/status", authMiddleware, authorizeRoles("client"), proposalController.updateProposalStatus);
router.patch("/:id/negotiate", authMiddleware, authorizeRoles("client"), proposalController.negotiateProposal);

// Freelancer history
router.get("/my-proposals", authMiddleware, authorizeRoles("freelancer"), proposalController.getMyProposals);
router.patch("/:id/withdraw", authMiddleware, authorizeRoles("freelancer"), proposalController.withdrawProposal);

module.exports = router;
