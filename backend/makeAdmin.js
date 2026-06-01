require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

// ── CONFIG ──────────────────────────────────────────
const ADMIN_EMAIL    = "admin@gmail.com";
const ADMIN_NAME     = "Admin";
const ADMIN_PASSWORD = "Admin@123";        // change if you want
// ────────────────────────────────────────────────────

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected ✅\n");

    // List all existing users
    const allUsers = await User.find().select("name email role status -_id").lean();
    if (allUsers.length === 0) {
        console.log("No users in DB yet.\n");
    } else {
        console.log("── Existing Users ─────────────────────────────");
        allUsers.forEach(u => {
            console.log(`  ${u.email.padEnd(30)} role: ${u.role.padEnd(12)} status: ${u.status}`);
        });
        console.log("───────────────────────────────────────────────\n");
    }

    // Try to promote existing user
    let user = await User.findOne({ email: ADMIN_EMAIL });

    if (user) {
        user.role = "admin";
        await user.save();
        console.log(`✅ Promoted existing user to admin:`);
        console.log(`   Name : ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role : ${user.role}`);
    } else {
        // Create fresh admin account
        const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
        user = await User.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            password: hashed,
            role: "admin",
            status: "active"
        });
        console.log(`🆕 Admin account created:`);
        console.log(`   Name    : ${user.name}`);
        console.log(`   Email   : ${user.email}`);
        console.log(`   Password: ${ADMIN_PASSWORD}`);
        console.log(`   Role    : ${user.role}`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});
