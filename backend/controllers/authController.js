const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// Emails that skip verification entirely
const SKIP_VERIFICATION_EMAILS = ["anush@gmail.com", "harsh@gmail.com"];

// Email Transporter Configuration
const getEmailTransporter = () => {
    const emailService = process.env.EMAIL_SERVICE || "gmail";

    switch (emailService) {
        case "gmail":
            return nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS?.replace(/\s/g, "")
                }
            });

        case "sendgrid":
            return nodemailer.createTransport({
                host: "smtp.sendgrid.net",
                port: 587,
                secure: false,
                auth: {
                    user: "apikey",
                    pass: process.env.SENDGRID_API_KEY
                }
            });

        case "mailgun":
            return nodemailer.createTransport({
                host: "smtp.mailgun.org",
                port: 587,
                secure: false,
                auth: {
                    user: process.env.MAILGUN_USERNAME,
                    pass: process.env.MAILGUN_PASSWORD
                }
            });

        case "smtp":
        default:
            return nodemailer.createTransport({
                host: process.env.SMTP_HOST || "smtp.gmail.com",
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: parseInt(process.env.SMTP_PORT) === 465,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
    }
};

const transporter = getEmailTransporter();

// Helper: Generate Token
const generateToken = () => crypto.randomBytes(32).toString("hex");

// Helper: Send Email
const sendEmail = async (to, subject, html) => {
    try {
        const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@skillsphere.com";
        await transporter.sendMail({
            from: fromEmail,
            to,
            subject,
            html
        });
        console.log(`Email sent to ${to}`);
        return true;
    } catch (err) {
        console.error("Email send error:", err.message);
        return false;
    }
};

const sendVerificationEmail = async (user) => {
    const verifyUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email/${user.emailVerificationToken}`;

    return sendEmail(
        user.email,
        "Verify your SkillSphere account",
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">Welcome to SkillSphere!</h2>
            <p>Please click the button below to verify your email address:</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">Verify Email</a>
            <p style="color: #666; font-size: 14px;">Or copy this link: ${verifyUrl}</p>
            <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
        </div>`
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const userExist = await User.findOne({ email });
        if (userExist) {
            return res.status(400).json({ msg: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Skip email verification for admin users and whitelisted emails
        const skipVerification = role === "admin" || SKIP_VERIFICATION_EMAILS.includes(email.toLowerCase());
        const emailVerificationToken = skipVerification ? null : generateToken();

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || "client",
            emailVerificationToken: emailVerificationToken,
            isEmailVerified: skipVerification
        });

        // Send verification email only for users who need it
        let verificationEmailSent = true;
        if (!skipVerification && emailVerificationToken) {
            verificationEmailSent = await sendVerificationEmail(user);
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || "secretkey",
            { expiresIn: "7d" }
        );

        res.json({
            msg: skipVerification
                ? "Registration successful"
                : verificationEmailSent
                    ? "Registration successful. Please check your email to verify your account."
                    : "Registration successful, but the verification email could not be sent. Please use resend verification from login.",
            token,
            requiresEmailVerification: !skipVerification,
            verificationEmailSent,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, isEmailVerified: skipVerification }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
    try {
        const { email, password, twoFactorCode } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "User not found" });
        }

        // Check if user has password (not Google OAuth)
        if (user.password) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ msg: "Wrong password" });
            }
        } else {
            return res.status(400).json({ msg: "Please login with Google" });
        }

        // Check 2FA
        if (user.twoFactorEnabled) {
            if (!twoFactorCode) {
                return res.status(200).json({
                    requiresTwoFactor: true,
                    message: "Please enter your 2FA code"
                });
            }

            const verified = verifyTOTP(user.twoFactorSecret, twoFactorCode);

            if (!verified) {
                // Check backup code
                const backupIndex = user.twoFactorBackupCodes?.indexOf(twoFactorCode);
                if (backupIndex === -1) {
                    return res.status(400).json({ msg: "Invalid 2FA code" });
                }
                // Remove used backup code
                user.twoFactorBackupCodes.splice(backupIndex, 1);
                await user.save();
            }
        }

        // Check if email is verified (skip for admin users and whitelisted emails)
        if (!user.isEmailVerified && user.role !== "admin" && !SKIP_VERIFICATION_EMAILS.includes(email.toLowerCase())) {
            user.emailVerificationToken = generateToken();
            await user.save();
            const verificationEmailSent = await sendVerificationEmail(user);

            return res.status(403).json({
                msg: verificationEmailSent
                    ? "Please verify your email first. We sent a new verification email."
                    : "Please verify your email first. We could not send a new verification email right now.",
                requiresEmailVerification: true,
                verificationEmailSent,
                email: user.email
            });
        }

        // Check if user is suspended
        if (user.status === "suspended") {
            return res.status(403).json({ msg: "Your account has been suspended" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || "secretkey",
            { expiresIn: "7d" }
        );

        res.json({
            msg: "Login success",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                twoFactorEnabled: user.twoFactorEnabled,
                googleId: user.googleId || null
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ msg: "Server error" });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE OAuth
// ═══════════════════════════════════════════════════════════════════════════════
exports.googleAuth = async (req, res) => {
    try {
        const { googleId, name, email, avatar } = req.body;

        let user = await User.findOne({ googleId });

        if (!user) {
            // Check if email already exists (registered with password)
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                // Link Google account to existing user
                existingUser.googleId = googleId;
                existingUser.isEmailVerified = true;
                await existingUser.save();
                user = existingUser;
            } else {
                // Create new user
                user = await User.create({
                    name,
                    email,
                    googleId,
                    isEmailVerified: true,
                    role: "client"
                });
            }
        }

        // Check if suspended
        if (user.status === "suspended") {
            return res.status(403).json({ msg: "Your account has been suspended" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET || "secretkey",
            { expiresIn: "7d" }
        );

        res.json({
            msg: "Google login success",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isEmailVerified: true,
                twoFactorEnabled: user.twoFactorEnabled,
                googleId: user.googleId || null
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({ emailVerificationToken: token });
        if (!user) {
            return res.status(400).json({ msg: "Invalid or expired verification token" });
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        await user.save();

        res.json({ msg: "Email verified successfully! You can now login." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ msg: "Email already verified" });
        }

        const emailVerificationToken = generateToken();
        user.emailVerificationToken = emailVerificationToken;
        await user.save();

        const emailSent = await sendVerificationEmail(user);
        if (!emailSent) {
            return res.status(500).json({ msg: "Could not send verification email. Please try again later." });
        }

        res.json({ msg: "Verification email sent" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════════════════
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        // If user is Google OAuth only
        if (!user.password) {
            return res.status(400).json({ msg: "This account uses Google login. Please use Google to sign in." });
        }

        const resetToken = generateToken();
        user.passwordResetToken = resetToken;
        user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;
        await sendEmail(
            email,
            "Reset your SkillSphere password",
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #4f46e5;">Reset your password</h2>
                <p>Click the button below to reset your password:</p>
                <a href="${resetUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">Reset Password</a>
                <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
                <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
            </div>`
        );

        res.json({ msg: "Password reset email sent" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ msg: "Invalid or expired reset token" });
        }

        user.password = await bcrypt.hash(password, 10);
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save();

        // Send confirmation email
        await sendEmail(
            user.email,
            "Your password has been changed",
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #22c55e;">Password Changed</h2>
                <p>Your password has been successfully changed.</p>
                <p style="color: #999; font-size: 12px;">If you didn't change your password, please contact us immediately.</p>
            </div>`
        );

        res.json({ msg: "Password reset successful" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── TOTP Verification Helper ────────────────────────────────────────────────
// This speakeasy version only generates codes (no built-in verify/window support)
function verifyTOTP(secret, token, window = 1) {
    if (!token) return false;
    const step = 30;
    const now = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(now / step);

    for (let i = -window; i <= window; i++) {
        const generated = speakeasy.totp({
            key: secret,
            encoding: "base32",
            time: (currentCounter + i) * step
        });
        if (generated === token) return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TWO-FACTOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════
exports.setup2FA = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        if (user.twoFactorEnabled) {
            return res.status(400).json({ msg: "2FA is already enabled. Disable it first to reconfigure." });
        }

        // Generate secret (speakeasy v1.0.5 uses generate_key, not generateSecret)
        const key = speakeasy.generate_key({ length: 20 });
        if (!key || !key.base32) {
            console.error("2FA setup: speakeasy returned invalid key");
            return res.status(500).json({ msg: "Failed to generate 2FA secret" });
        }

        // Build otpauth URL manually (this speakeasy version doesn't provide one)
        const encodedEmail = encodeURIComponent(user.email);
        const otpauthUrl = `otpauth://totp/SkillSphere:${encodedEmail}?secret=${key.base32}&issuer=SkillSphere`;

        // Generate QR code with error handling
        let qrCodeDataUrl = "";
        try {
            qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
        } catch (qrErr) {
            console.error("QR code generation error (non-fatal):", qrErr.message);
        }

        user.twoFactorSecret = key.base32;
        await user.save();

        res.json({
            secret: key.base32,
            qrCode: qrCodeDataUrl
        });
    } catch (err) {
        console.error("2FA setup error:", err);
        res.status(500).json({ msg: "Failed to setup 2FA. Please try again." });
    }
};

exports.verifyAndEnable2FA = async (req, res) => {
    try {
        const { code } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        if (user.twoFactorEnabled) {
            return res.status(400).json({ msg: "2FA is already enabled" });
        }

        if (!user.twoFactorSecret) {
            return res.status(400).json({ msg: "No 2FA setup in progress. Start setup first." });
        }

        if (!code || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ msg: "Invalid code format. Enter a 6-digit code." });
        }

        if (!verifyTOTP(user.twoFactorSecret, code)) {
            return res.status(400).json({ msg: "Invalid code" });
        }

        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () => uuidv4().slice(0, 8).toUpperCase());

        user.twoFactorEnabled = true;
        user.twoFactorBackupCodes = backupCodes;
        await user.save();

        res.json({
            msg: "2FA enabled successfully",
            backupCodes
        });
    } catch (err) {
        console.error("2FA verify error:", err);
        res.status(500).json({ msg: "Failed to verify 2FA code" });
    }
};

exports.disable2FA = async (req, res) => {
    try {
        const { password, code } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        if (!user.twoFactorEnabled) {
            return res.status(400).json({ msg: "2FA is not enabled" });
        }

        // Verify password (only if user has a password, i.e., not Google OAuth)
        if (user.password) {
            if (!password) {
                return res.status(400).json({ msg: "Password is required" });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ msg: "Wrong password" });
            }
        }

        // Verify 2FA code or backup code
        let codeValid = false;

        // Try TOTP first
        if (code) {
            if (verifyTOTP(user.twoFactorSecret, code)) {
                codeValid = true;
            } else {
                // Try backup codes
                const backupIndex = user.twoFactorBackupCodes?.indexOf(code);
                if (backupIndex !== -1) {
                    user.twoFactorBackupCodes.splice(backupIndex, 1);
                    codeValid = true;
                }
            }
        }

        if (!codeValid) {
            return res.status(400).json({ msg: "Invalid 2FA code or backup code" });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        user.twoFactorBackupCodes = [];
        await user.save();

        res.json({ msg: "2FA disabled successfully" });
    } catch (err) {
        console.error("2FA disable error:", err);
        res.status(500).json({ msg: "Failed to disable 2FA" });
    }
};

exports.get2FAStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: "User not found" });
        }

        res.json({
            twoFactorEnabled: user.twoFactorEnabled
        });
    } catch (err) {
        console.error("2FA status error:", err);
        res.status(500).json({ msg: "Failed to get 2FA status" });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD (when logged in)
// ═══════════════════════════════════════════════════════════════════════════════
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        if (!user || !user.password) {
            return res.status(400).json({ msg: "Cannot change password for Google OAuth users" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        // Send confirmation email
        await sendEmail(
            user.email,
            "Your password has been changed",
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #22c55e;">Password Changed</h2>
                <p>Your password has been changed successfully.</p>
                <p style="color: #999; font-size: 12px;">If you didn't make this change, please contact us immediately.</p>
            </div>`
        );

        res.json({ msg: "Password changed successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
