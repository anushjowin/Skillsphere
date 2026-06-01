const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    verified: { type: Boolean, default: false },
    verificationReason: { type: String, default: "" },
    ratingWeight: { type: Number, default: 1 },
    weightedScore: { type: Number, default: 0 },
    fraudFlags: [{ type: String }],
    isFlaggedFraud: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Review", ReviewSchema);
