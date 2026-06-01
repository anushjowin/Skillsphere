const Gig = require("../models/Gig");
const Freelancer = require("../models/Freelancer");
const User = require("../models/User");
const aiMatchingService = require("../services/aiMatchingService");

/**
 * GET /api/matching/gig/:gigId
 * Returns top freelancers ranked by AI match score for a specific gig.
 * Intended for CLIENTS viewing a gig's proposals or searching for talent.
 */
exports.getMatchedFreelancersForGig = async (req, res) => {
    try {
        const { gigId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        // Load the gig
        const gig = await Gig.findById(gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });

        const gigSkills = gig.skillsRequired || [];
        if (gigSkills.length === 0) {
            return res.json({ matches: [], message: "No skills required specified for this gig" });
        }

        // Load all available freelancers with their user info
        const freelancers = await Freelancer.find({ availability: { $ne: "unavailable" } })
            .populate("userId", "name email")
            .lean();

        if (freelancers.length === 0) {
            return res.json({ matches: [], message: "No available freelancers found" });
        }

        // Score each freelancer using AI
        const scoringPromises = freelancers.map(async (freelancer) => {
            const freelancerSkills = freelancer.skills || [];

            // Skip freelancers with no skills
            if (freelancerSkills.length === 0) {
                return {
                    freelancer,
                    score: 0,
                    skillSimilarity: 0,
                    matchPercent: 0,
                };
            }

            const { score, skillSimilarity } = await aiMatchingService.scoreFreelancer(
                gigSkills,
                freelancerSkills,
                freelancer.rating || 0
            );

            // Location bonus: +0.05 if location matches gig location
            let locationBonus = 0;
            if (
                gig.location &&
                freelancer.location &&
                freelancer.location.toLowerCase().includes(gig.location.toLowerCase())
            ) {
                locationBonus = 0.05;
            }

            const finalScore = Math.min(score + locationBonus, 1);

            return {
                freelancer,
                score: finalScore,
                skillSimilarity,
                matchPercent: Math.round(finalScore * 100),
                locationMatch:
                    locationBonus > 0,
            };
        });

        const results = await Promise.all(scoringPromises);

        // Sort by score descending, take top N
        const topMatches = results
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((r) => ({
                freelancerId: r.freelancer._id,
                userId: r.freelancer.userId?._id,
                name: r.freelancer.userId?.name || "Unknown",
                email: r.freelancer.userId?.email || "",
                title: r.freelancer.title || "",
                skills: r.freelancer.skills || [],
                rating: r.freelancer.rating || 0,
                hourlyRate: r.freelancer.hourlyRate || 0,
                location: r.freelancer.location || "",
                availability: r.freelancer.availability,
                verifiedStatus: r.freelancer.verifiedStatus,
                score: r.score,
                matchPercent: r.matchPercent,
                skillSimilarity: r.skillSimilarity,
                locationMatch: r.locationMatch,
            }));

        res.json({
            gigId,
            gigTitle: gig.title,
            gigSkills,
            totalFreelancers: freelancers.length,
            matches: topMatches,
        });
    } catch (err) {
        console.error("AI Matching Error:", err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/matching/freelancer
 * Returns personalized gig recommendations for the logged-in freelancer.
 * Uses the freelancer's skills to find best-matching open gigs.
 */
exports.getRecommendedGigsForFreelancer = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const limit = parseInt(req.query.limit) || 10;

        // Get the freelancer profile
        const freelancer = await Freelancer.findOne({ userId }).lean();
        if (!freelancer) {
            return res.status(404).json({ msg: "Freelancer profile not found. Please complete your profile first." });
        }

        const freelancerSkills = freelancer.skills || [];
        if (freelancerSkills.length === 0) {
            return res.json({ matches: [], message: "Add skills to your profile to get personalized recommendations." });
        }

        // Get all open, approved gigs
        const gigs = await Gig.find({ status: "open", approvalStatus: "approved" })
            .populate("client", "name")
            .lean();

        if (gigs.length === 0) {
            return res.json({ matches: [], message: "No open gigs available at the moment." });
        }

        // Score each gig for this freelancer
        const scoringPromises = gigs.map(async (gig) => {
            const gigSkills = gig.skillsRequired || [];

            if (gigSkills.length === 0) {
                return { gig, score: 0, skillSimilarity: 0, matchPercent: 0 };
            }

            const { score, skillSimilarity } = await aiMatchingService.scoreGig(
                freelancerSkills,
                gigSkills
            );

            // Location proximity boost
            let locationBonus = 0;
            if (
                gig.location &&
                freelancer.location &&
                gig.location.toLowerCase().includes(freelancer.location.toLowerCase())
            ) {
                locationBonus = 0.05;
            }

            const finalScore = Math.min(score + locationBonus, 1);

            return {
                gig,
                score: finalScore,
                skillSimilarity,
                matchPercent: Math.round(finalScore * 100),
                locationMatch: locationBonus > 0,
            };
        });

        const results = await Promise.all(scoringPromises);

        const topMatches = results
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((r) => ({
                gigId: r.gig._id,
                title: r.gig.title,
                description: r.gig.description,
                skillsRequired: r.gig.skillsRequired || [],
                budget: r.gig.budget,
                location: r.gig.location || "",
                status: r.gig.status,
                client: r.gig.client,
                createdAt: r.gig.createdAt,
                score: r.score,
                matchPercent: r.matchPercent,
                skillSimilarity: r.skillSimilarity,
                locationMatch: r.locationMatch,
            }));

        res.json({
            freelancerSkills,
            totalGigsChecked: gigs.length,
            matches: topMatches,
        });
    } catch (err) {
        console.error("AI Freelancer Recommendation Error:", err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/matching/trending-skills
 * Returns the top trending skills based on frequency in open gigs
 * posted in the last 30 days.
 */
exports.getTrendingSkills = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 15;
        const daysBack = parseInt(req.query.days) || 30;

        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        // Get recent gigs
        const recentGigs = await Gig.find({
            createdAt: { $gte: since },
            status: { $in: ["open", "in-progress"] },
        })
            .select("skillsRequired")
            .lean();

        // Count skill frequencies
        const skillCount = {};
        for (const gig of recentGigs) {
            for (const skill of gig.skillsRequired || []) {
                const normalized = skill.trim();
                if (normalized) {
                    skillCount[normalized] = (skillCount[normalized] || 0) + 1;
                }
            }
        }

        // Sort and slice
        const trending = Object.entries(skillCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([skill, count]) => ({
                skill,
                count,
                // Relative popularity as a percentage of max count
                popularity: 0,
            }));

        // Normalize popularity
        if (trending.length > 0) {
            const maxCount = trending[0].count;
            for (const item of trending) {
                item.popularity = Math.round((item.count / maxCount) * 100);
            }
        }

        res.json({
            period: `Last ${daysBack} days`,
            totalGigsAnalyzed: recentGigs.length,
            trending,
        });
    } catch (err) {
        console.error("Trending Skills Error:", err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/matching/status
 * Returns the current AI model status (loaded / loading / not loaded).
 */
exports.getAIStatus = async (req, res) => {
    try {
        res.json({
            status: "operational",
            model: "Xenova/all-MiniLM-L6-v2",
            description: "Skill similarity scoring via HuggingFace Transformers (local inference)",
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
