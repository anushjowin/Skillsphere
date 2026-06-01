const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    milestoneId: { type: mongoose.Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    paymentType: {
        type: String,
        enum: ["escrow_funding", "milestone_payout", "refund"],
        required: true
    },
    provider: { type: String, enum: ["stripe", "razorpay"], default: "stripe" },
    stripePaymentIntentId: { type: String },
    stripeRefundId: { type: String },
    referencePayment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    status: {
        type: String,
        enum: ["pending", "succeeded", "failed", "processing", "refunded"],
        default: "pending"
    },
    metadata: { type: Object, default: {} }
}, { timestamps: true });

module.exports = mongoose.model("Payment", PaymentSchema);
