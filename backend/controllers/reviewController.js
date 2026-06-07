const Review = require("../models/Review");
const Gig = require("../models/Gig");
const { notifyOne } = require("../services/notificationService");

function normalizeText(value = "") {
    return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function calculateWeight({ verified, comment, fraudFlags }) {
    let weight = 1;
    if (verified) weight += 0.35;
    const len = String(comment || "").trim().length;
    weight += Math.min(len / 400, 0.15);
    if ((fraudFlags || []).length > 0) weight -= 0.4;
    return Math.max(0.5, Number(weight.toFixed(2)));
}

async function buildFraudFlags({ reviewerId, revieweeId, rating, comment }) {
    const flags = [];
    if (String(reviewerId) === String(revieweeId)) {
        flags.push("self_review_attempt");
    }

    const normalized = normalizeText(comment);
    if (normalized) {
        const duplicate = await Review.findOne({
            reviewer: reviewerId,
            reviewee: revieweeId,
            rating,
            createdAt: { $gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) }
        }).sort({ createdAt: -1 });

        if (duplicate && normalizeText(duplicate.comment) === normalized) {
            flags.push("duplicate_content_recent");
        }
    }

    const recentCount = await Review.countDocuments({
        reviewer: reviewerId,
        createdAt: { $gte: new Date(Date.now() - (24 * 60 * 60 * 1000)) }
    });
    if (recentCount >= 5) {
        flags.push("high_velocity_reviews");
    }

    const shortComment = String(comment || "").trim().length < 20;
    if ((rating === 1 || rating === 5) && shortComment) {
        flags.push("extreme_rating_low_context");
    }

    return flags;
}

exports.leaveReview = async (req, res) => {
    try {
        const { reviewee, gig, rating, comment } = req.body;

        const targetGig = await Gig.findById(gig);
        if (!targetGig) {
            return res.status(404).json({ msg: "Gig not found" });
        }

        const participants = [String(targetGig.client), String(targetGig.freelancer)];
        if (!participants.includes(String(req.user.id))) {
            return res.status(403).json({ msg: "Only gig participants can leave reviews" });
        }

        if (!participants.includes(String(reviewee))) {
            return res.status(403).json({ msg: "Can only review the other participant of this gig" });
        }

        if (String(req.user.id) === String(reviewee)) {
            return res.status(400).json({ msg: "You cannot review yourself" });
        }

        const existing = await Review.findOne({ reviewer: req.user.id, reviewee, gig });
        if (existing) {
            return res.status(400).json({ msg: "You already submitted a review for this user on this gig" });
        }

        const hasPaidMilestone = (targetGig.milestones || []).some((m) => m.status === "paid");
        const verified = Boolean(hasPaidMilestone || targetGig.status === "completed");
        const verificationReason = verified
            ? (hasPaidMilestone ? "Milestone payment verified" : "Gig marked completed")
            : "No paid milestone yet";

        const fraudFlags = await buildFraudFlags({
            reviewerId: req.user.id,
            revieweeId: reviewee,
            rating: Number(rating),
            comment
        });
        const ratingWeight = calculateWeight({ verified, comment, fraudFlags });
        const weightedScore = Number((Number(rating) * ratingWeight).toFixed(2));

        const newReview = await Review.create({
            reviewer: req.user.id,
            reviewee,
            gig,
            rating,
            comment,
            verified,
            verificationReason,
            ratingWeight,
            weightedScore,
            fraudFlags,
            isFlaggedFraud: fraudFlags.length > 0
        });

        await notifyOne(req, {
            userId: reviewee,
            type: "REVIEW_ADDED",
            message: `You received a new ${rating}-star review!`,
            link: `/profile/${reviewee}`,
            emailSubject: "New review received",
            emailText: `You received a new ${rating}-star review on SkillSphere.\n\nOpen your profile to view the feedback.`
        });

        res.json(newReview);
    } catch (err) {
        console.error("Review submission error:", err);
        res.status(500).json({ msg: "Failed to submit review. Please try again." });
    }
};

exports.getUserReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ reviewee: req.params.userId })
            .populate("reviewer", "name")
            .sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ msg: "Failed to fetch reviews" });
    }
};

exports.getReviewAnalytics = async (req, res) => {
    try {
        const reviews = await Review.find({ reviewee: req.params.userId }).sort({ createdAt: -1 });
        const totalReviews = reviews.length;
        const verifiedReviews = reviews.filter((r) => r.verified).length;
        const flaggedReviews = reviews.filter((r) => r.isFlaggedFraud).length;

        const weightedTotal = reviews.reduce((sum, r) => sum + (r.weightedScore || (r.rating * (r.ratingWeight || 1))), 0);
        const weightBase = reviews.reduce((sum, r) => sum + (r.ratingWeight || 1), 0);
        const weightedReputationScore = weightBase > 0 ? Number((weightedTotal / weightBase).toFixed(2)) : 0;
        const averageRating = totalReviews > 0
            ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(2))
            : 0;

        const ratingDistribution = [1, 2, 3, 4, 5].map((star) => ({
            star,
            count: reviews.filter((r) => r.rating === star).length
        }));

        const fraudBreakdown = reviews.reduce((acc, r) => {
            (r.fraudFlags || []).forEach((flag) => {
                acc[flag] = (acc[flag] || 0) + 1;
            });
            return acc;
        }, {});

        res.json({
            weightedReputationScore,
            averageRating,
            totalReviews,
            verifiedReviews,
            flaggedReviews,
            verificationRate: totalReviews ? Number(((verifiedReviews / totalReviews) * 100).toFixed(1)) : 0,
            fraudRate: totalReviews ? Number(((flaggedReviews / totalReviews) * 100).toFixed(1)) : 0,
            ratingDistribution,
            fraudBreakdown
        });
    } catch (err) {
        res.status(500).json({ msg: "Failed to fetch review analytics" });
    }
};
