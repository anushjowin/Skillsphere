const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
        type: String,
        enum: [
            "MESSAGE",
            "REVIEW",
            "PROPOSAL",
            "GIG_UPDATE",
            "PAYMENT",
            "NEW_GIG",
            "PROPOSAL_ACCEPTED",
            "PAYMENT_RECEIVED",
            "REVIEW_ADDED"
        ],
        required: true
    },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    link: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Notification", NotificationSchema);
