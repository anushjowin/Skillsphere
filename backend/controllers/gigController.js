const Gig = require("../models/Gig");
const User = require("../models/User");
const Payment = require("../models/Payment");
const { notifyMany } = require("../services/notificationService");

function normalizeMilestones(milestones = []) {
    if (!Array.isArray(milestones)) return [];

    return milestones
        .filter((m) => m && m.title && Number(m.amount) > 0)
        .map((m) => ({
            title: String(m.title).trim(),
            amount: Number(m.amount),
            dueDate: m.dueDate || null,
            description: m.description ? String(m.description).trim() : ""
        }));
}

// Create a Gig (Clients only)
exports.createGig = async (req, res) => {
    try {
        if (req.user.role !== "client") {
            return res.status(403).json({ msg: "Only clients can post gigs" });
        }
        
        const { title, description, budget, skillsRequired, location, milestones, attachments } = req.body;

        if (!title || !description) {
            return res.status(400).json({ msg: "Title and description are required" });
        }

        if (budget?.min && budget?.max && Number(budget.min) > Number(budget.max)) {
            return res.status(400).json({ msg: "Budget min cannot be greater than budget max" });
        }

        const gig = await Gig.create({
            client: req.user.id,
            title,
            description,
            budget: {
                min: Number(budget?.min) || 0,
                max: Number(budget?.max) || 0
            },
            skillsRequired: Array.isArray(skillsRequired) ? skillsRequired : [],
            location: location || "",
            milestones: normalizeMilestones(milestones),
            attachments: Array.isArray(attachments) ? attachments : []
        });

        const freelancers = await User.find({ role: "freelancer", status: "active" }).select("_id").limit(500);
        await notifyMany(req, {
            userIds: freelancers.map((f) => f._id),
            type: "NEW_GIG",
            messageBuilder: () => `New gig posted: "${gig.title}"`,
            linkBuilder: () => `/dashboard`,
            emailSubjectBuilder: () => `New gig posted on SkillSphere`,
            emailTextBuilder: () => `A new gig has been posted: "${gig.title}".\n\nLocation: ${gig.location || "Remote"}\nBudget: $${gig.budget?.min || 0} - $${gig.budget?.max || 0}\n\nLog in to SkillSphere to view details.`
        });

        res.status(201).json(gig);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all Gigs (with search and filters)
exports.getGigs = async (req, res) => {
    try {
        const { search, minBudget, maxBudget, skills } = req.query;
        let query = { status: "open" };

        if (search) {
            query.$text = { $search: search };
        }
        
        if (minBudget || maxBudget) {
            if (minBudget) query["budget.min"] = { $gte: Number(minBudget) };
            if (maxBudget) query["budget.max"] = { $lte: Number(maxBudget) };
        }

        if (skills) {
            const skillsArray = skills.split(',').map(s => s.trim());
            query.skillsRequired = { $in: skillsArray };
        }

        const gigs = await Gig.find(query)
            .populate("client", "name")
            .sort({ createdAt: -1 });

        res.json(gigs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get single Gig
exports.getGigById = async (req, res) => {
    try {
        const gig = await Gig.findById(req.params.id)
            .populate("client", "name")
            .populate("freelancer", "name email")
            .populate("invitedFreelancers", "name email");
        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        res.json(gig);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get Gigs by Client (My Projects)
exports.getMyGigs = async (req, res) => {
    try {
        const gigs = await Gig.find({ client: req.user.id })
            .populate("freelancer", "name")
            .sort({ createdAt: -1 });
        res.json(gigs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Invite a Freelancer to a Gig
exports.inviteFreelancer = async (req, res) => {
    try {
        const { id } = req.params;
        const { freelancerId } = req.body;

        const gig = await Gig.findOne({ _id: id, client: req.user.id });
        if (!gig) {
            return res.status(404).json({ msg: "Gig not found or unauthorized" });
        }

        const freelancer = await User.findOne({ _id: freelancerId, role: "freelancer" });
        if (!freelancer) {
            return res.status(404).json({ msg: "Freelancer not found" });
        }

        if (gig.invitedFreelancers.some((f) => f.toString() === freelancerId)) {
            return res.status(400).json({ msg: "Freelancer already invited" });
        }

        gig.invitedFreelancers.push(freelancerId);
        await gig.save();

        res.json({ msg: "Freelancer invited successfully", gig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getInviteCandidates = async (req, res) => {
    try {
        const { id } = req.params;
        const search = (req.query.search || "").trim();

        const gig = await Gig.findOne({ _id: id, client: req.user.id });
        if (!gig) {
            return res.status(404).json({ msg: "Gig not found or unauthorized" });
        }

        const query = { role: "freelancer" };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        const freelancers = await User.find(query)
            .select("name email")
            .sort({ createdAt: -1 })
            .limit(20);

        const invitedSet = new Set(gig.invitedFreelancers.map((f) => f.toString()));
        const mapped = freelancers.map((f) => ({
            _id: f._id,
            name: f.name,
            email: f.email,
            invited: invitedSet.has(f._id.toString())
        }));

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.markMilestoneCompleted = async (req, res) => {
    try {
        const { id, milestoneId } = req.params;
        const gig = await Gig.findById(id);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });

        if (gig.freelancer?.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Only assigned freelancer can complete milestones" });
        }

        const milestone = gig.milestones.id(milestoneId);
        if (!milestone) return res.status(404).json({ msg: "Milestone not found" });
        if (milestone.status === "paid") return res.status(400).json({ msg: "Paid milestone cannot be changed" });
        if (milestone.status === "pending") {
            return res.status(400).json({ msg: "Client must fund escrow before marking this milestone completed" });
        }
        if (milestone.status === "refunded") {
            return res.status(400).json({ msg: "Refunded milestone cannot be completed" });
        }

        milestone.status = "completed";
        milestone.completedAt = new Date();

        const escrowPayment = await Payment.findOne({
            gig: gig._id,
            milestoneId,
            paymentType: "escrow_funding",
            status: "succeeded"
        }).sort({ createdAt: -1 });

        if (escrowPayment) {
            const existingPayout = await Payment.findOne({
                gig: gig._id,
                milestoneId,
                paymentType: "milestone_payout",
                status: { $in: ["processing", "succeeded"] }
            });

            if (!existingPayout) {
                await Payment.create({
                    gig: gig._id,
                    client: gig.client,
                    freelancer: gig.freelancer,
                    milestoneId,
                    amount: escrowPayment.amount,
                    currency: escrowPayment.currency || "usd",
                    paymentType: "milestone_payout",
                    provider: escrowPayment.provider || "stripe",
                    status: "succeeded",
                    referencePayment: escrowPayment._id,
                    metadata: { autoPayout: true }
                });
            }

            milestone.status = "paid";
        }

        await gig.save();

        res.json({ msg: "Milestone marked as completed", milestone, gig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
