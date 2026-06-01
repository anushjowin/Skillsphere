const Notification = require("../models/Notification");
const User = require("../models/User");

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 0);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        return null;
    }

    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
    return transporter;
}

async function sendEmailIfConfigured({ to, subject, text }) {
    const activeTransporter = getTransporter();
    if (!activeTransporter || !to || !subject || !text) return false;

    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    await activeTransporter.sendMail({ from, to, subject, text });
    return true;
}

async function notifyOne(req, payload) {
    const { userId, type, message, link = "/dashboard", emailSubject, emailText } = payload;

    const notification = await Notification.create({
        user: userId,
        type,
        message,
        link
    });

    const io = req.app.get("io");
    if (io) {
        io.to(userId.toString()).emit("receiveNotification", notification);
    }

    try {
        if (emailSubject && emailText) {
            const targetUser = await User.findById(userId).select("email");
            if (targetUser?.email) {
                await sendEmailIfConfigured({
                    to: targetUser.email,
                    subject: emailSubject,
                    text: emailText
                });
            }
        }
    } catch (err) {
        console.log("Email notification skipped:", err.message);
    }

    return notification;
}

async function notifyMany(req, payload) {
    const { userIds = [], type, messageBuilder, linkBuilder, emailSubjectBuilder, emailTextBuilder } = payload;
    if (!Array.isArray(userIds) || userIds.length === 0) return [];

    const uniqueIds = [...new Set(userIds.map((id) => id.toString()))];
    const docs = uniqueIds.map((userId) => ({
        user: userId,
        type,
        message: typeof messageBuilder === "function" ? messageBuilder(userId) : String(messageBuilder || ""),
        link: typeof linkBuilder === "function" ? linkBuilder(userId) : (linkBuilder || "/dashboard")
    }));

    const notifications = await Notification.insertMany(docs);
    const io = req.app.get("io");
    if (io) {
        notifications.forEach((notification) => {
            io.to(notification.user.toString()).emit("receiveNotification", notification);
        });
    }

    try {
        const needsEmail = emailSubjectBuilder && emailTextBuilder;
        if (needsEmail) {
            const users = await User.find({ _id: { $in: uniqueIds } }).select("email");
            for (const user of users) {
                const subject = emailSubjectBuilder(user._id.toString());
                const text = emailTextBuilder(user._id.toString());
                if (subject && text && user.email) {
                    await sendEmailIfConfigured({ to: user.email, subject, text });
                }
            }
        }
    } catch (err) {
        console.log("Bulk email notifications skipped:", err.message);
    }

    return notifications;
}

module.exports = {
    notifyOne,
    notifyMany
};
