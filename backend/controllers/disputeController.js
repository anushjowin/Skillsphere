const Dispute = require("../models/Dispute");
const Payment = require("../models/Payment");

exports.createDispute = async (req, res) => {
    try {
        const { paymentId, reason, description, evidence = [] } = req.body;
        if (!paymentId || !reason || !description) {
            return res.status(400).json({ msg: "paymentId, reason and description are required" });
        }

        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ msg: "Payment not found" });

        const isParticipant =
            payment.client.toString() === req.user.id ||
            payment.freelancer.toString() === req.user.id;
        if (!isParticipant) {
            return res.status(403).json({ msg: "Only payment participants can raise a dispute" });
        }

        const existingOpenDispute = await Dispute.findOne({
            payment: paymentId,
            status: { $in: ["open", "under_review"] }
        });
        if (existingOpenDispute) {
            return res.status(400).json({ msg: "An active dispute already exists for this payment" });
        }

        const normalizedEvidence = (Array.isArray(evidence) ? evidence : [])
            .filter((item) => item && item.url)
            .map((item) => ({
                url: String(item.url),
                fileType: String(item.fileType || ""),
                note: String(item.note || ""),
                uploadedBy: req.user.id
            }));

        const dispute = await Dispute.create({
            payment: payment._id,
            gig: payment.gig,
            client: payment.client,
            freelancer: payment.freelancer,
            raisedBy: req.user.id,
            reason: String(reason).trim(),
            description: String(description).trim(),
            evidence: normalizedEvidence
        });

        res.status(201).json({ msg: "Dispute created", dispute });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMyDisputes = async (req, res) => {
    try {
        const disputes = await Dispute.find({
            $or: [{ client: req.user.id }, { freelancer: req.user.id }]
        })
            .populate("payment", "amount paymentType status")
            .populate("gig", "title")
            .populate("client", "name email")
            .populate("freelancer", "name email")
            .populate("raisedBy", "name email")
            .sort({ createdAt: -1 });

        res.json(disputes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addDisputeEvidence = async (req, res) => {
    try {
        const dispute = await Dispute.findById(req.params.id);
        if (!dispute) return res.status(404).json({ msg: "Dispute not found" });

        const isParticipant =
            dispute.client.toString() === req.user.id ||
            dispute.freelancer.toString() === req.user.id ||
            req.user.role === "admin";
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const { url, fileType, note } = req.body;
        if (!url) return res.status(400).json({ msg: "url is required" });

        dispute.evidence.push({
            url: String(url),
            fileType: String(fileType || ""),
            note: String(note || ""),
            uploadedBy: req.user.id
        });
        await dispute.save();

        res.json({ msg: "Evidence added", dispute });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addDisputeMessage = async (req, res) => {
    try {
        const dispute = await Dispute.findById(req.params.id);
        if (!dispute) return res.status(404).json({ msg: "Dispute not found" });

        const isParticipant =
            dispute.client.toString() === req.user.id ||
            dispute.freelancer.toString() === req.user.id ||
            req.user.role === "admin";
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const { message } = req.body;
        if (!message || !String(message).trim()) {
            return res.status(400).json({ msg: "message is required" });
        }

        dispute.messages.push({ sender: req.user.id, message: String(message).trim() });
        if (dispute.status === "open") dispute.status = "under_review";
        await dispute.save();

        res.json({ msg: "Message added", dispute });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
