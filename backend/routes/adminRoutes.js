const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// All admin routes require auth + admin role
const adminOnly = [authMiddleware, authorizeRoles("admin")];

// ── Analytics ──────────────────────────────────────
router.get("/analytics", ...adminOnly, adminController.getAnalytics);

// ── User Management ───────────────────────────────
router.get("/users", ...adminOnly, adminController.getAllUsers);
router.put("/users/:id/suspend", ...adminOnly, adminController.suspendUser);
router.put("/users/:id/unsuspend", ...adminOnly, adminController.unsuspendUser);
router.delete("/users/:id", ...adminOnly, adminController.deleteUser);

// ── Freelancer Verification ───────────────────────
router.get("/freelancers", ...adminOnly, adminController.getAllFreelancers);
router.get("/freelancers/unverified", ...adminOnly, adminController.getUnverifiedFreelancers);
router.put("/freelancers/:id/verify", ...adminOnly, adminController.verifyFreelancer);
router.put("/freelancers/:id/unverify", ...adminOnly, adminController.unverifyFreelancer);

// ── Gig Approval ──────────────────────────────────
router.get("/gigs", ...adminOnly, adminController.getAllGigsAdmin);
router.put("/gigs/:id/approve", ...adminOnly, adminController.approveGig);
router.put("/gigs/:id/reject", ...adminOnly, adminController.rejectGig);

// ── Payment Monitoring ────────────────────────────
router.get("/payments", ...adminOnly, adminController.getAllPayments);

// ── Fraud Detection ───────────────────────────────
router.get("/flagged-users", ...adminOnly, adminController.getFlaggedUsers);
router.put("/users/:id/flag", ...adminOnly, adminController.flagUser);
router.put("/users/:id/unflag", ...adminOnly, adminController.unflagUser);

// Dispute Mediation
router.get("/disputes", ...adminOnly, adminController.getAllDisputes);
router.patch("/disputes/:id/resolve", ...adminOnly, adminController.resolveDispute);

module.exports = router;
