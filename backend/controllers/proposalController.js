const Proposal = require("../models/Proposal");
const Gig = require("../models/Gig");
const { notifyOne } = require("../services/notificationService");

// Submit a Proposal (Freelancers only)
exports.submitProposal = async (req, res) => {
    try {
        if (req.user.role !== "freelancer") {
            return res.status(403).json({ msg: "Only freelancers can submit proposals" });
        }

        const { gigId, proposalDescription, coverLetter, bidAmount, estimatedTime } = req.body;
        const normalizedDescription = String(proposalDescription || coverLetter || "").trim();
        const normalizedAmount = Number(bidAmount);
        const normalizedEstimatedTime = String(estimatedTime || "").trim();

        if (!normalizedDescription) {
            return res.status(400).json({ msg: "Proposal description is required" });
        }

        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            return res.status(400).json({ msg: "Bid amount must be greater than 0" });
        }

        if (!normalizedEstimatedTime) {
            return res.status(400).json({ msg: "Estimated completion time is required" });
        }

        // Check if gig exists and is open
        const gig = await Gig.findById(gigId);
        if (!gig || gig.status !== "open") {
            return res.status(400).json({ msg: "Gig is not open for proposals" });
        }

        // Check if already applied
        const existing = await Proposal.findOne({ gig: gigId, freelancer: req.user.id });
        if (existing) {
            return res.status(400).json({ msg: "You have already submitted a proposal for this gig" });
        }

        const proposal = await Proposal.create({
            gig: gigId,
            freelancer: req.user.id,
            coverLetter: normalizedDescription,
            bidAmount: normalizedAmount,
            estimatedTime: normalizedEstimatedTime,
            status: "submitted",
            statusHistory: [{
                status: "submitted",
                note: "Proposal submitted",
                updatedBy: req.user.id
            }]
        });

        res.status(201).json(proposal);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get Proposals for a specific Gig (Clients only)
exports.getProposalsByGig = async (req, res) => {
    try {
        const gig = await Gig.findById(req.params.gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });

        if (gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        const proposals = await Proposal.find({ gig: req.params.gigId })
            .populate("freelancer", "name email")
            .sort({ createdAt: -1 });

        res.json(proposals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get proposals submitted by current freelancer
exports.getMyProposals = async (req, res) => {
    try {
        const proposals = await Proposal.find({ freelancer: req.user.id })
            .populate({
                path: "gig",
                select: "title status budget client",
                populate: {
                    path: "client",
                    select: "name"
                }
            })
            .sort({ createdAt: -1 });

        res.json(proposals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Accept a Proposal (Clients only)
exports.acceptProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findById(req.params.id).populate("gig");
        if (!proposal) return res.status(404).json({ msg: "Proposal not found" });

        if (proposal.gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        if (proposal.status === "withdrawn") {
            return res.status(400).json({ msg: "Withdrawn proposal cannot be accepted" });
        }

        // Update proposal status
        proposal.status = "accepted";
        proposal.statusHistory.push({
            status: "accepted",
            note: "Proposal accepted by client",
            updatedBy: req.user.id
        });
        await proposal.save();

        await Proposal.updateMany(
            {
                gig: proposal.gig._id,
                _id: { $ne: proposal._id },
                status: { $in: ["pending", "submitted", "under_review", "negotiation"] }
            },
            {
                $set: { status: "rejected" },
                $push: {
                    statusHistory: {
                        status: "rejected",
                        note: "Another proposal was accepted",
                        updatedBy: req.user.id
                    }
                }
            }
        );

        // Update gig status and assign freelancer
        const gig = await Gig.findById(proposal.gig._id);
        gig.status = "in-progress";
        gig.freelancer = proposal.freelancer;
        await gig.save();

        await notifyOne(req, {
            userId: proposal.freelancer,
            type: "PROPOSAL_ACCEPTED",
            message: `Your proposal for "${gig.title}" has been accepted!`,
            link: "/dashboard",
            emailSubject: "Your proposal was accepted",
            emailText: `Good news! Your proposal for "${gig.title}" has been accepted by the client.\n\nLog in to SkillSphere to continue with the project.`
        });

        res.json({ msg: "Proposal accepted successfully", proposal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProposalStatus = async (req, res) => {
    try {
        const { status, note } = req.body;
        if (!["under_review", "rejected"].includes(status)) {
            return res.status(400).json({ msg: "Invalid status update" });
        }

        const proposal = await Proposal.findById(req.params.id).populate("gig");
        if (!proposal) return res.status(404).json({ msg: "Proposal not found" });

        if (proposal.gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        if (["accepted", "withdrawn"].includes(proposal.status)) {
            return res.status(400).json({ msg: "This proposal can no longer be updated" });
        }

        proposal.status = status;
        proposal.statusHistory.push({
            status,
            note: note || (status === "under_review" ? "Proposal moved to review" : "Proposal rejected by client"),
            updatedBy: req.user.id
        });
        await proposal.save();

        res.json({ msg: "Proposal status updated", proposal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.withdrawProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findById(req.params.id);
        if (!proposal) return res.status(404).json({ msg: "Proposal not found" });

        if (proposal.freelancer.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        if (["accepted", "rejected", "withdrawn"].includes(proposal.status)) {
            return res.status(400).json({ msg: "This proposal cannot be withdrawn" });
        }

        proposal.status = "withdrawn";
        proposal.statusHistory.push({
            status: "withdrawn",
            note: "Proposal withdrawn by freelancer",
            updatedBy: req.user.id
        });
        await proposal.save();

        res.json({ msg: "Proposal withdrawn", proposal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.negotiateProposal = async (req, res) => {
    try {
        const { proposedBidAmount, message } = req.body;
        const normalizedAmount = Number(proposedBidAmount);
        const normalizedMessage = String(message || "").trim();

        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            return res.status(400).json({ msg: "Proposed bid amount must be greater than 0" });
        }

        const proposal = await Proposal.findById(req.params.id).populate("gig");
        if (!proposal) return res.status(404).json({ msg: "Proposal not found" });

        if (proposal.gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        if (["accepted", "rejected", "withdrawn"].includes(proposal.status)) {
            return res.status(400).json({ msg: "This proposal can no longer be negotiated" });
        }

        proposal.status = "negotiation";
        proposal.negotiatedBidAmount = normalizedAmount;
        proposal.negotiationMessage = normalizedMessage;
        proposal.statusHistory.push({
            status: "negotiation",
            note: normalizedMessage || `Client requested price negotiation: $${normalizedAmount}`,
            updatedBy: req.user.id
        });
        await proposal.save();

        res.json({ msg: "Negotiation sent successfully", proposal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
