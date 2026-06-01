const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
require("dotenv").config();

function readArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1 || index + 1 >= process.argv.length) {
        return null;
    }
    return process.argv[index + 1];
}

async function main() {
    const email = readArg("--email");
    const password = readArg("--password");
    const name = readArg("--name") || "Admin";

    if (!email || !password) {
        console.error("Usage: node resetAdminPassword.js --email <admin-email> --password <new-password> [--name <display-name>]");
        process.exit(1);
    }

    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is missing. Add it to backend/.env first.");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.findOneAndUpdate(
        { email },
        {
            $set: {
                name,
                password: hashedPassword,
                role: "admin",
                status: "active"
            }
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`Admin access reset for ${admin.email}`);
    console.log(`User ID: ${admin._id}`);

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error("Failed to reset admin password:", err.message);
    try {
        await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
});
