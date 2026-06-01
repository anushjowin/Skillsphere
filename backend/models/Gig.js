const mongoose = require("mongoose");

const gigSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    budget: {
        min: { type: Number },
        max: { type: Number }
    },
    skillsRequired: [{ type: String }],
    status: { type: String, enum: ["open", "in-progress", "completed", "cancelled"], default: "open" },
    approvalStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    location: { type: String }, // Can be upgraded to GeoJSON later if needed
    milestones: [{
        title: { type: String, required: true },
        amount: { type: Number, required: true },
        dueDate: { type: Date },
        description: { type: String, default: "" },
        completedAt: { type: Date },
        status: {
            type: String,
            enum: ["pending", "escrow_funded", "completed", "paid", "refunded"],
            default: "pending"
        }
    }],
    attachments: [{
        filename: String,
        url: String
    }],
    invitedFreelancers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User" } // Assigned freelancer
}, { timestamps: true });

// Create text index for search
gigSchema.index({ title: "text", description: "text", skillsRequired: "text" });

module.exports = mongoose.model("Gig", gigSchema);
