const mongoose = require("mongoose");

const disputeEvidenceSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileType: { type: String, default: "" },
    note: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { _id: true, timestamps: true });

const disputeMessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true }
}, { _id: true, timestamps: true });

const disputeSchema = new mongoose.Schema({
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ["open", "under_review", "resolved_client", "resolved_freelancer", "rejected"],
        default: "open"
    },
    evidence: { type: [disputeEvidenceSchema], default: [] },
    messages: { type: [disputeMessageSchema], default: [] },
    adminNotes: { type: String, default: "" },
    resolutionSummary: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Dispute", disputeSchema);
