const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String },
    role: {
        type: String,
        enum: ["client", "freelancer", "admin"],
        default: "client"
    },
    status: {
        type: String,
        enum: ["active", "suspended"],
        default: "active"
    },
    flaggedForFraud: { type: Boolean, default: false },

    // Email Verification
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },

    // Password Reset
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },

    // Two-Factor Authentication
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    twoFactorBackupCodes: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);