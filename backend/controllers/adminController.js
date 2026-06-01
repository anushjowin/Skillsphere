const User = require("../models/User");
const Gig = require("../models/Gig");
const Payment = require("../models/Payment");
const Freelancer = require("../models/Freelancer");
const Review = require("../models/Review");
const Dispute = require("../models/Dispute");

// ─────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
    try {
        // Platform Revenue: sum of all succeeded payments
        const revenueAgg = await Payment.aggregate([
            { $match: { status: "succeeded" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const platformRevenue = revenueAgg[0]?.total || 0;

        // Active Freelancers: freelancer users who are active
        const activeFreelancers = await User.countDocuments({ role: "freelancer", status: "active" });

        // Total Clients
        const totalClients = await User.countDocuments({ role: "client" });

        // Total Gigs
        const totalGigs = await Gig.countDocuments();

        // Job Success Rate: completed gigs / total gigs (excluding open)
        const completedGigs = await Gig.countDocuments({ status: "completed" });
        const closedGigs = await Gig.countDocuments({ status: { $in: ["completed", "cancelled"] } });
        const jobSuccessRate = closedGigs > 0 ? Math.round((completedGigs / closedGigs) * 100) : 0;

        // Top Categories (skills) from gigs
        const topCategoriesAgg = await Gig.aggregate([
            { $unwind: "$skillsRequired" },
            { $group: { _id: "$skillsRequired", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Monthly Revenue (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await Payment.aggregate([
            { $match: { status: "succeeded", createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Recent signups (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentSignups = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

        res.json({
            platformRevenue,
            activeFreelancers,
            totalClients,
            totalGigs,
            jobSuccessRate,
            topCategories: topCategoriesAgg.map(c => ({ name: c._id, count: c.count })),
            monthlyRevenue,
            recentSignups
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────

exports.getAllUsers = async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const query = {};
        if (role) query.role = role;
        if (status) query.status = status;
        if (search) query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
        ];

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.countDocuments(query)
        ]);

        res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.suspendUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        if (user.role === "admin") return res.status(403).json({ msg: "Cannot suspend an admin" });

        user.status = "suspended";
        await user.save();
        res.json({ msg: "User suspended", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.unsuspendUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        user.status = "active";
        await user.save();
        res.json({ msg: "User unsuspended", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        if (user.role === "admin") return res.status(403).json({ msg: "Cannot delete an admin" });

        await User.findByIdAndDelete(req.params.id);
        res.json({ msg: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// FREELANCER VERIFICATION
// ─────────────────────────────────────────────

exports.getUnverifiedFreelancers = async (req, res) => {
    try {
        const freelancers = await Freelancer.find({ verifiedStatus: false })
            .populate("userId", "name email createdAt status")
            .sort({ createdAt: -1 });

        const formatted = freelancers.map(f => ({
            _id: f._id,
            userId: f.userId,
            title: f.title || f.pricing?.title || "",
            skills: f.skills?.map(s => s.name) || [],
            hourlyRate: f.hourlyRate || f.pricing?.hourlyRate || 0,
            availability: f.availability?.status || "full-time",
            verifiedStatus: f.verifiedStatus,
            createdAt: f.createdAt
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Error fetching unverified freelancers:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getAllFreelancers = async (req, res) => {
    try {
        const freelancers = await Freelancer.find()
            .populate("userId", "name email createdAt status")
            .sort({ createdAt: -1 });

        const formatted = freelancers.map(f => ({
            _id: f._id,
            userId: f.userId,
            title: f.title || f.pricing?.title || "",
            skills: f.skills?.map(s => s.name) || [],
            hourlyRate: f.hourlyRate || f.pricing?.hourlyRate || 0,
            availability: f.availability?.status || "full-time",
            verifiedStatus: f.verifiedStatus,
            createdAt: f.createdAt
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Error fetching all freelancers:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.verifyFreelancer = async (req, res) => {
    try {
        const freelancer = await Freelancer.findByIdAndUpdate(
            req.params.id,
            { verifiedStatus: true },
            { new: true }
        ).populate("userId", "name email");

        if (!freelancer) return res.status(404).json({ msg: "Freelancer profile not found" });
        res.json({ msg: "Freelancer verified", freelancer });
    } catch (err) {
        console.error("Error verifying freelancer:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.unverifyFreelancer = async (req, res) => {
    try {
        const freelancer = await Freelancer.findByIdAndUpdate(
            req.params.id,
            { verifiedStatus: false },
            { new: true }
        ).populate("userId", "name email");

        if (!freelancer) return res.status(404).json({ msg: "Freelancer profile not found" });
        res.json({ msg: "Freelancer verification removed", freelancer });
    } catch (err) {
        console.error("Error unverifying freelancer:", err);
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// GIG APPROVAL
// ─────────────────────────────────────────────

exports.getAllGigsAdmin = async (req, res) => {
    try {
        const { approvalStatus, status } = req.query;
        const query = {};
        if (approvalStatus) query.approvalStatus = approvalStatus;
        if (status) query.status = status;

        const gigs = await Gig.find(query)
            .populate("client", "name email")
            .populate("freelancer", "name email")
            .sort({ createdAt: -1 });
        res.json(gigs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.approveGig = async (req, res) => {
    try {
        const gig = await Gig.findByIdAndUpdate(
            req.params.id,
            { approvalStatus: "approved" },
            { new: true }
        ).populate("client", "name email");

        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        res.json({ msg: "Gig approved", gig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.rejectGig = async (req, res) => {
    try {
        const gig = await Gig.findByIdAndUpdate(
            req.params.id,
            { approvalStatus: "rejected" },
            { new: true }
        ).populate("client", "name email");

        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        res.json({ msg: "Gig rejected", gig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// PAYMENT MONITORING
// ─────────────────────────────────────────────

exports.getAllPayments = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = {};
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [payments, total] = await Promise.all([
            Payment.find(query)
                .populate("client", "name email")
                .populate("freelancer", "name email")
                .populate("gig", "title")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payment.countDocuments(query)
        ]);

        res.json({ payments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// FRAUD DETECTION
// ─────────────────────────────────────────────

exports.getFlaggedUsers = async (req, res) => {
    try {
        const flagged = await User.find({ flaggedForFraud: true })
            .select("-password")
            .sort({ updatedAt: -1 });
        res.json(flagged);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.flagUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { flaggedForFraud: true },
            { new: true }
        ).select("-password");

        if (!user) return res.status(404).json({ msg: "User not found" });
        res.json({ msg: "User flagged for fraud review", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.unflagUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { flaggedForFraud: false },
            { new: true }
        ).select("-password");

        if (!user) return res.status(404).json({ msg: "User not found" });
        res.json({ msg: "User unflagged", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Dispute Mediation
exports.getAllDisputes = async (req, res) => {
    try {
        const { status } = req.query;
        const query = {};
        if (status) query.status = status;

        const disputes = await Dispute.find(query)
            .populate("payment", "amount paymentType status")
            .populate("gig", "title")
            .populate("client", "name email")
            .populate("freelancer", "name email")
            .populate("raisedBy", "name email")
            .populate("resolvedBy", "name email")
            .sort({ createdAt: -1 })
            .limit(300);

        res.json(disputes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resolveDispute = async (req, res) => {
    try {
        const { status, resolutionSummary, adminNotes } = req.body;
        if (!["resolved_client", "resolved_freelancer", "rejected"].includes(status)) {
            return res.status(400).json({ msg: "Invalid resolution status" });
        }

        const dispute = await Dispute.findById(req.params.id);
        if (!dispute) return res.status(404).json({ msg: "Dispute not found" });

        dispute.status = status;
        dispute.resolutionSummary = String(resolutionSummary || "");
        dispute.adminNotes = String(adminNotes || "");
        dispute.resolvedBy = req.user.id;
        dispute.resolvedAt = new Date();
        await dispute.save();

        res.json({ msg: "Dispute resolved", dispute });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
