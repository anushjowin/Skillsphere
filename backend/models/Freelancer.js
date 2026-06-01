const mongoose = require("mongoose");

const freelancerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // ── Basic Info ──────────────────────────────────────────────────────────
    title: { type: String, default: "" },
    bio: { type: String, default: "" },
    location: { type: String, default: "" },
    profilePhoto: { type: String, default: "" },

    // ── Skills with Proficiency ─────────────────────────────────────────────
    skills: [{
        name: { type: String, required: true },
        proficiency: {
            type: String,
            enum: ["beginner", "intermediate", "advanced", "expert"],
            default: "intermediate"
        }
    }],

    // ── Portfolio Gallery ───────────────────────────────────────────────────
    portfolio: [{
        title: { type: String, required: true },
        description: { type: String },
        imageUrl: { type: String },       // uploaded image
        projectUrl: { type: String },     // live project link
        tags: [{ type: String }],
        createdAt: { type: Date, default: Date.now }
    }],

    // ── Resume ──────────────────────────────────────────────────────────────
    resumeUrl: { type: String, default: "" },
    resumeFileName: { type: String, default: "" },

    // ── Certifications ──────────────────────────────────────────────────────
    certifications: [{
        name: { type: String, required: true },
        issuer: { type: String },
        issueDate: { type: Date },
        expiryDate: { type: Date },
        credentialId: { type: String },
        credentialUrl: { type: String }
    }],

    // ── Work Experience Timeline ────────────────────────────────────────────
    experience: [{
        company: { type: String, required: true },
        role: { type: String, required: true },
        location: { type: String },
        startDate: { type: Date },
        endDate: { type: Date },
        current: { type: Boolean, default: false },
        description: { type: String }
    }],

    // ── Availability Calendar ───────────────────────────────────────────────
    availability: {
        status: {
            type: String,
            enum: ["full-time", "part-time", "unavailable"],
            default: "full-time"
        },
        hoursPerWeek: { type: Number, default: 40 },
        weeklySchedule: {
            monday:    { available: { type: Boolean, default: true }, hours: { type: Number, default: 8 } },
            tuesday:   { available: { type: Boolean, default: true }, hours: { type: Number, default: 8 } },
            wednesday: { available: { type: Boolean, default: true }, hours: { type: Number, default: 8 } },
            thursday:  { available: { type: Boolean, default: true }, hours: { type: Number, default: 8 } },
            friday:    { available: { type: Boolean, default: true }, hours: { type: Number, default: 8 } },
            saturday:  { available: { type: Boolean, default: false }, hours: { type: Number, default: 0 } },
            sunday:    { available: { type: Boolean, default: false }, hours: { type: Number, default: 0 } }
        },
        timezone: { type: String, default: "UTC" }
    },

    availabilitySlots: [{
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: { type: String, default: "" }
    }],

    // ── Pricing ─────────────────────────────────────────────────────────────
    pricing: {
        hourlyRate: { type: Number, default: 0 },
        minProjectBudget: { type: Number, default: 0 },
        maxProjectBudget: { type: Number, default: 0 },
        currency: { type: String, default: "USD" },
        milestonePreferred: { type: Boolean, default: false }
    },

    // ── Social Links ────────────────────────────────────────────────────────
    socialLinks: {
        github: { type: String, default: "" },
        linkedin: { type: String, default: "" },
        website: { type: String, default: "" },
        twitter: { type: String, default: "" },
        dribbble: { type: String, default: "" }
    },

    // ── Verification & Ratings ──────────────────────────────────────────────
    verifiedStatus: { type: Boolean, default: false },
    verificationBadges: [{
        type: {
            type: String,
            enum: ["identity", "skills_test", "top_rated", "expert_vetted", "rising_talent"]
        },
        earnedAt: { type: Date, default: Date.now },
        description: { type: String }
    }],
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    profileViews: { type: Number, default: 0 },

    // ── Legacy field (keep for backward compat) ─────────────────────────────
    hourlyRate: { type: Number, default: 0 }

}, { timestamps: true });

module.exports = mongoose.model("Freelancer", freelancerSchema);
