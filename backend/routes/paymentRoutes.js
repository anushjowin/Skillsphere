const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
const Payment = require("../models/Payment");
const Gig = require("../models/Gig");
const authMiddleware = require("../middleware/authMiddleware");
const { notifyOne } = require("../services/notificationService");

function getMilestone(gig, milestoneId) {
    return gig.milestones.id(milestoneId);
}

router.post("/create-intent", authMiddleware, async (req, res) => {
    try {
        const { gigId, milestoneId } = req.body;
        const gig = await Gig.findById(gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        if (gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Only the client can fund escrow" });
        }

        const milestone = getMilestone(gig, milestoneId);
        if (!milestone) return res.status(404).json({ msg: "Milestone not found" });
        if (["escrow_funded", "paid"].includes(milestone.status)) {
            return res.status(400).json({ msg: "Escrow already funded for this milestone" });
        }

        // Mock Stripe Intent Creation
        const mockIntentId = "pi_mock_" + Math.random().toString(36).substring(2, 15);
        const mockClientSecret = "secret_mock_" + Math.random().toString(36).substring(2, 15);

        const payment = await Payment.create({
            gig: gigId,
            client: gig.client,
            freelancer: gig.freelancer,
            milestoneId,
            amount: milestone.amount,
            currency: "usd",
            paymentType: "escrow_funding",
            provider: "stripe",
            stripePaymentIntentId: mockIntentId,
            status: "pending"
        });

        res.json({ clientSecret: mockClientSecret, paymentId: payment._id });
    } catch (err) {
        console.error("create-intent error", err);
        res.status(500).json({ msg: "Server error" });
    }
});

router.post("/confirm", authMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ msg: "Payment record not found" });

        const gig = await Gig.findById(payment.gig);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        if (gig.client.toString() !== req.user.id) {
            return res.status(403).json({ msg: "Unauthorized" });
        }

        // Mock Stripe Confirmation Check
        // Assume successful if using mock logic

        payment.status = "succeeded";
        await payment.save();

        const milestone = getMilestone(gig, payment.milestoneId);
        if (milestone && milestone.status === "pending") {
            milestone.status = "escrow_funded";
            await gig.save();
        }

        if (gig.freelancer) {
            await notifyOne(req, {
                userId: gig.freelancer,
                type: "PAYMENT_RECEIVED",
                message: `Escrow funded: $${payment.amount} for milestone payment.`,
                link: "/dashboard",
                emailSubject: "Payment update on your project",
                emailText: `Escrow was funded for your milestone on SkillSphere. Amount: $${payment.amount}.`
            });
        }

        res.json({ msg: "Escrow funding successful" });
    } catch (err) {
        console.error("confirm error", err);
        res.status(500).json({ msg: "Server error" });
    }
});

router.post("/milestone/:gigId/:milestoneId/payout", authMiddleware, async (req, res) => {
    try {
        const { gigId, milestoneId } = req.params;
        const gig = await Gig.findById(gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        if (gig.client.toString() !== req.user.id) return res.status(403).json({ msg: "Unauthorized" });
        if (!gig.freelancer) return res.status(400).json({ msg: "No freelancer assigned" });

        const milestone = getMilestone(gig, milestoneId);
        if (!milestone) return res.status(404).json({ msg: "Milestone not found" });
        if (milestone.status !== "completed") {
            return res.status(400).json({ msg: "Milestone must be completed before payout" });
        }

        const escrowPayment = await Payment.findOne({
            gig: gigId,
            milestoneId,
            paymentType: "escrow_funding",
            status: "succeeded"
        }).sort({ createdAt: -1 });

        if (!escrowPayment) return res.status(400).json({ msg: "Escrow payment not funded" });

        const existingPayout = await Payment.findOne({
            gig: gigId,
            milestoneId,
            paymentType: "milestone_payout",
            status: { $in: ["processing", "succeeded"] }
        });
        if (existingPayout) return res.status(400).json({ msg: "Payout already initiated" });

        const payout = await Payment.create({
            gig: gigId,
            client: gig.client,
            freelancer: gig.freelancer,
            milestoneId,
            amount: escrowPayment.amount,
            currency: escrowPayment.currency,
            paymentType: "milestone_payout",
            provider: "stripe",
            status: "processing",
            referencePayment: escrowPayment._id,
            metadata: { autoPayout: true }
        });

        payout.status = "succeeded";
        await payout.save();

        milestone.status = "paid";
        await gig.save();

        await notifyOne(req, {
            userId: gig.freelancer,
            type: "PAYMENT_RECEIVED",
            message: `Automatic payout released: $${payout.amount}.`,
            link: "/dashboard",
            emailSubject: "Payout received",
            emailText: `A payout of $${payout.amount} has been released to you on SkillSphere.`
        });

        res.json({ msg: "Automatic freelancer payout completed", payout });
    } catch (err) {
        console.error("payout error", err);
        res.status(500).json({ msg: "Server error" });
    }
});

router.post("/milestone/:gigId/:milestoneId/refund", authMiddleware, async (req, res) => {
    try {
        const { gigId, milestoneId } = req.params;
        const gig = await Gig.findById(gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });
        if (gig.client.toString() !== req.user.id) return res.status(403).json({ msg: "Unauthorized" });

        const milestone = getMilestone(gig, milestoneId);
        if (!milestone) return res.status(404).json({ msg: "Milestone not found" });
        if (milestone.status === "paid") {
            return res.status(400).json({ msg: "Paid milestone cannot be refunded from escrow" });
        }

        const escrowPayment = await Payment.findOne({
            gig: gigId,
            milestoneId,
            paymentType: "escrow_funding",
            status: "succeeded"
        }).sort({ createdAt: -1 });
        if (!escrowPayment) return res.status(400).json({ msg: "No funded escrow found" });

        const existingRefund = await Payment.findOne({ referencePayment: escrowPayment._id, paymentType: "refund" });
        if (existingRefund) return res.status(400).json({ msg: "Refund already requested" });

        // Mock Stripe Refund Creation
        const mockRefundId = "re_mock_" + Math.random().toString(36).substring(2, 15);

        await Payment.create({
            gig: gigId,
            client: gig.client,
            freelancer: gig.freelancer,
            milestoneId,
            amount: escrowPayment.amount,
            currency: escrowPayment.currency,
            paymentType: "refund",
            provider: "stripe",
            status: "succeeded",
            stripeRefundId: mockRefundId,
            referencePayment: escrowPayment._id,
            metadata: { reason: "client_requested" }
        });

        escrowPayment.status = "refunded";
        await escrowPayment.save();

        milestone.status = "refunded";
        await gig.save();

        if (gig.freelancer) {
            await notifyOne(req, {
                userId: gig.freelancer,
                type: "PAYMENT",
                message: "Escrow for a milestone was refunded to client.",
                link: "/dashboard",
                emailSubject: "Escrow refund update",
                emailText: "Escrow for one milestone was refunded to the client on SkillSphere."
            });
        }

        res.json({ msg: "Refund processed successfully" });
    } catch (err) {
        console.error("refund error", err);
        res.status(500).json({ msg: "Server error" });
    }
});

router.get("/history", authMiddleware, async (req, res) => {
    try {
        const query = req.user.role === "client"
            ? { client: req.user.id }
            : { freelancer: req.user.id };

        const payments = await Payment.find(query)
            .populate("gig", "title")
            .sort({ createdAt: -1 })
            .limit(200);

        res.json(payments);
    } catch (err) {
        res.status(500).json({ msg: "Server error" });
    }
});

module.exports = router;
