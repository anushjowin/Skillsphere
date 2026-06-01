const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ REGISTER
router.post("/register", authController.register);

// ✅ LOGIN
router.post("/login", authController.login);

// ✅ GOOGLE AUTH
router.post("/google", authController.googleAuth);

// ✅ EMAIL VERIFICATION
router.get("/verify-email/:token", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerificationEmail);

// ✅ PASSWORD RESET
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// ✅ TWO-FACTOR AUTHENTICATION
router.get("/2fa/status", authMiddleware, authController.get2FAStatus);
router.post("/2fa/setup", authMiddleware, authController.setup2FA);
router.post("/2fa/verify", authMiddleware, authController.verifyAndEnable2FA);
router.post("/2fa/disable", authMiddleware, authController.disable2FA);

// ✅ CHANGE PASSWORD (when logged in)
router.post("/change-password", authMiddleware, authController.changePassword);

module.exports = router;