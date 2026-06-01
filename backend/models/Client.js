const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    companyName: { type: String },
    website: { type: String },
    description: { type: String },
    verifiedStatus: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Client", clientSchema);
