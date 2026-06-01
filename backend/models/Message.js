const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String }, // Made optional for file-only messages
    fileUrl: { type: String },
    fileType: { type: String },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig" },
    read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);
