const express = require("express");
const router = express.Router();
const disputeController = require("../controllers/disputeController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/", authMiddleware, disputeController.createDispute);
router.get("/my", authMiddleware, disputeController.getMyDisputes);
router.post("/:id/evidence", authMiddleware, disputeController.addDisputeEvidence);
router.post("/:id/messages", authMiddleware, disputeController.addDisputeMessage);

module.exports = router;
