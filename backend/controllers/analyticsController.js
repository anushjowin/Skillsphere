const Analytics = require("../models/Analytics");
const Proposal = require("../models/Proposal");
const Payment = require("../models/Payment");
const Review = require("../models/Review");

exports.recordProfileView = async (req, res) => {
    try {
        const { freelancerId } = req.body;
        
        let analytics = await Analytics.findOne({ freelancer: freelancerId });
        if (!analytics) {
            analytics = await Analytics.create({ freelancer: freelancerId });
        }

        analytics.profileViews.push({
            viewer: req.user?.id || null,
            viewerRole: req.user?.role || "guest"
        });
        await analytics.save();

        res.json({ msg: "Profile view recorded" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMyAnalytics = async (req, res) => {
    try {
        let analytics = await Analytics.findOne({ freelancer: req.user.id });
        
        if (!analytics) {
            analytics = await Analytics.create({ freelancer: req.user.id });
        }

        const stats = analytics.getStats();
        res.json({ analytics, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProfileViews = async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const analytics = await Analytics.findOne({ freelancer: req.user.id });
        
        if (!analytics) return res.json({ views: [], total: 0 });

        const cutoffDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
        const recentViews = analytics.profileViews.filter(v => new Date(v.viewedAt) >= cutoffDate);

        const viewsByDay = {};
        recentViews.forEach(v => {
            const date = new Date(v.viewedAt).toISOString().split("T")[0];
            viewsByDay[date] = (viewsByDay[date] || 0) + 1;
        });

        const timeline = Object.entries(viewsByDay).map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            total: analytics.profileViews.length,
            recent: recentViews.length,
            timeline
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getGigApplications = async (req, res) => {
    try {
        const { status, days = 90 } = req.query;
        const cutoffDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        const query = { freelancer: req.user.id, createdAt: { $gte: cutoffDate } };
        if (status && status !== "all") query.status = status;

        const proposals = await Proposal.find(query)
            .populate("gig", "title budget status")
            .sort({ createdAt: -1 });

        const statusCounts = {
            pending: 0,
            submitted: 0,
            under_review: 0,
            negotiation: 0,
            accepted: 0,
            rejected: 0,
            withdrawn: 0
        };

        proposals.forEach(p => {
            if (statusCounts.hasOwnProperty(p.status)) {
                statusCounts[p.status]++;
            }
        });

        const total = proposals.length;
        const accepted = proposals.filter(p => p.status === "accepted").length;
        const successRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

        res.json({
            proposals,
            total,
            accepted,
            successRate,
            byStatus: statusCounts
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEarningsStats = async (req, res) => {
    try {
        const { months = 12 } = req.query;
        
        const payments = await Payment.find({
            freelancer: req.user.id,
            status: "succeeded",
            paymentType: { $in: ["milestone_payout", "escrow_funding"] }
        }).populate("gig", "title").sort({ createdAt: -1 });

        const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalProjects = payments.length;
        const uniqueGigs = [...new Set(payments.map(p => p.gig._id.toString()))].length;

        const monthlyMap = {};
        for (let i = 0; i < parseInt(months); i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            monthlyMap[key] = { month: d.toLocaleString("default", { month: "short" }), year: d.getFullYear(), amount: 0 };
        }

        payments.forEach(p => {
            const date = new Date(p.createdAt);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            if (monthlyMap[key]) {
                monthlyMap[key].amount += p.amount;
            }
        });

        const monthlyRevenue = Object.entries(monthlyMap)
            .map(([key, val]) => ({ period: key, ...val }))
            .sort((a, b) => a.period.localeCompare(b.period));

        const avgPerProject = totalProjects > 0 ? Math.round(totalEarnings / totalProjects) : 0;

        res.json({
            totalEarnings,
            totalProjects,
            uniqueGigs,
            avgPerProject,
            payments: payments.slice(0, 20),
            monthlyRevenue
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMonthlyRevenue = async (req, res) => {
    try {
        const { months = 6 } = req.query;
        
        const payments = await Payment.find({
            freelancer: req.user.id,
            status: "succeeded",
            paymentType: { $in: ["milestone_payout", "escrow_funding"] }
        });

        const monthlyData = {};
        for (let i = 0; i < parseInt(months); i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
            monthlyData[label] = { label, revenue: 0, projects: 0 };
        }

        payments.forEach(p => {
            const d = new Date(p.createdAt);
            const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
            if (monthlyData[label]) {
                monthlyData[label].revenue += p.amount;
                monthlyData[label].projects += 1;
            }
        });

        const chartData = Object.values(monthlyData).reverse();
        
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
        const avgMonthly = chartData.length > 0 ? Math.round(totalRevenue / chartData.filter(d => d.revenue > 0).length || 1) : 0;

        res.json({
            chartData,
            totalRevenue,
            avgMonthly,
            totalProjects: payments.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFeedbackAnalytics = async (req, res) => {
    try {
        const reviews = await Review.find({ reviewee: req.user.id })
            .populate("reviewer", "name")
            .populate("gig", "title")
            .sort({ createdAt: -1 });

        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0 
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews 
            : 0;

        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(r => {
            if (ratingDistribution[r.rating] !== undefined) {
                ratingDistribution[r.rating]++;
            }
        });

        const recentReviews = reviews.slice(0, 10).map(r => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            reviewerName: r.reviewer?.name || "Anonymous",
            gigTitle: r.gig?.title || "Unknown Gig",
            createdAt: r.createdAt
        }));

        const keywords = {};
        reviews.forEach(r => {
            if (r.comment) {
                const words = r.comment.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                words.forEach(w => {
                    keywords[w] = (keywords[w] || 0) + 1;
                });
            }
        });
        const topKeywords = Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));

        res.json({
            totalReviews,
            avgRating: Math.round(avgRating * 10) / 10,
            ratingDistribution,
            recentReviews,
            topKeywords
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.syncAnalytics = async (req, res) => {
    try {
        let analytics = await Analytics.findOne({ freelancer: req.user.id });
        if (!analytics) {
            analytics = new Analytics({ freelancer: req.user.id });
        }

        const succeededPayments = await Payment.find({
            freelancer: req.user.id,
            status: "succeeded"
        });
        analytics.totalEarnings = succeededPayments.reduce((sum, p) => sum + p.amount, 0);
        analytics.totalProjects = succeededPayments.length;

        const reviews = await Review.find({ reviewee: req.user.id });
        analytics.totalReviews = reviews.length;
        if (reviews.length > 0) {
            analytics.averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        }

        const monthlyMap = {};
        succeededPayments.forEach(p => {
            const d = new Date(p.createdAt);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            monthlyMap[key] = (monthlyMap[key] || 0) + p.amount;
        });

        analytics.monthlyEarnings = Object.entries(monthlyMap).map(([key, amount]) => {
            const [year, month] = key.split("-");
            return { month: parseInt(month), year: parseInt(year), amount };
        });

        await analytics.save();
        res.json({ msg: "Analytics synced", analytics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};