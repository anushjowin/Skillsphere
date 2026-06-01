const mongoose = require("mongoose");

const profileViewSchema = new mongoose.Schema({
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    viewerRole: { type: String, enum: ["client", "freelancer", "admin"] },
    viewedAt: { type: Date, default: Date.now }
}, { _id: true });

const analyticsSchema = new mongoose.Schema({
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    profileViews: { type: [profileViewSchema], default: [] },
    totalEarnings: { type: Number, default: 0 },
    totalProjects: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    monthlyEarnings: [{
        month: { type: String, required: true },
        year: { type: Number, required: true },
        amount: { type: Number, default: 0 }
    }]
}, { timestamps: true });

analyticsSchema.methods.getStats = function() {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last30DaysViews = this.profileViews.filter(v => new Date(v.viewedAt) >= last30Days);
    const last30DaysViewsCount = last30DaysViews.length;
    
    return {
        totalProfileViews: this.profileViews.length,
        last30DaysViews: last30DaysViewsCount,
        totalEarnings: this.totalEarnings,
        totalProjects: this.totalProjects,
        averageRating: this.averageRating,
        totalReviews: this.totalReviews
    };
};

module.exports = mongoose.model("Analytics", analyticsSchema);