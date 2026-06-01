const mongoose = require("mongoose");

const freelancerBookingSchema = new mongoose.Schema({
    freelancerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    clientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    status: {
        type: String,
        enum: ["scheduled", "completed", "cancelled"],
        default: "scheduled"
    },
    note: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("FreelancerBooking", freelancerBookingSchema);
