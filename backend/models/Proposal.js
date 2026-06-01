const mongoose = require("mongoose");

const proposalSchema = new mongoose.Schema({
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coverLetter: { type: String, required: true },
    bidAmount: { type: Number, required: true },
    estimatedTime: { type: String, required: true }, // e.g. "2 weeks"
    status: {
        type: String,
        enum: ["pending", "submitted", "under_review", "negotiation", "accepted", "rejected", "withdrawn"],
        default: "submitted"
    },
    negotiatedBidAmount: { type: Number },
    negotiationMessage: { type: String, default: "" },
    statusHistory: [{
        status: {
            type: String,
            enum: ["pending", "submitted", "under_review", "negotiation", "accepted", "rejected", "withdrawn"],
            required: true
        },
        note: { type: String, default: "" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model("Proposal", proposalSchema);
