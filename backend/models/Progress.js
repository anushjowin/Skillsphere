const mongoose = require("mongoose");

const progressFileSchema = new mongoose.Schema({
    url: { type: String, required: true },
    fileName: { type: String, default: "" },
    fileType: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { _id: true, timestamps: true });

const progressLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    files: { type: [progressFileSchema], default: [] }
}, { _id: true, timestamps: true });

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    dueDate: { type: Date },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date }
}, { _id: true });

const progressSchema = new mongoose.Schema({
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tasks: { type: [taskSchema], default: [] },
    logs: { type: [progressLogSchema], default: [] },
    status: {
        type: String,
        enum: ["not_started", "in_progress", "completed", "on_hold"],
        default: "not_started"
    },
    startDate: { type: Date },
    endDate: { type: Date },
    reminderSent: { type: Boolean, default: false }
}, { timestamps: true });

progressSchema.methods.calculateCompletion = function() {
    if (this.tasks.length === 0) return 0;
    const completed = this.tasks.filter(t => t.completed).length;
    return Math.round((completed / this.tasks.length) * 100);
};

module.exports = mongoose.model("Progress", progressSchema);