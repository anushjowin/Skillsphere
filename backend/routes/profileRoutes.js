const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");

// ── Own Profile (authenticated) ──────────────────────────────────────────────
router.get("/", authMiddleware, profileController.getProfile);
router.put("/", authMiddleware, profileController.updateProfile);

// ── Public Profile (authenticated, any role) ─────────────────────────────────
router.get("/freelancer/:userId", authMiddleware, profileController.getPublicFreelancerProfile);
router.get("/freelancers/search", authMiddleware, profileController.searchFreelancers);
router.get("/freelancer/:userId/availability-slots", authMiddleware, profileController.getAvailabilitySlots);
router.post("/availability/slots", authMiddleware, profileController.addAvailabilitySlot);
router.delete("/availability/slots/:slotId", authMiddleware, profileController.deleteAvailabilitySlot);
router.post("/availability/book", authMiddleware, profileController.bookAvailabilitySlot);
router.get("/availability/bookings", authMiddleware, profileController.getMyAvailabilityBookings);
router.patch("/availability/bookings/:bookingId/cancel", authMiddleware, profileController.cancelAvailabilityBooking);

// ── Portfolio ────────────────────────────────────────────────────────────────
router.post("/portfolio", authMiddleware, profileController.addPortfolioItem);
router.delete("/portfolio/:itemId", authMiddleware, profileController.removePortfolioItem);

// ── Certifications ───────────────────────────────────────────────────────────
router.post("/certifications", authMiddleware, profileController.addCertification);
router.delete("/certifications/:certId", authMiddleware, profileController.removeCertification);

// ── Work Experience ──────────────────────────────────────────────────────────
router.post("/experience", authMiddleware, profileController.addExperience);
router.delete("/experience/:expId", authMiddleware, profileController.removeExperience);

module.exports = router;
