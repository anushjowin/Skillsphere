const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Personal info (always relevant)
    title: { type: String, default: "" },
    bio: { type: String, default: "" },
    profilePhoto: { type: String, default: "" },
    location: { type: String, default: "" },

    // Company info (optional — for orgs hiring freelancers)
    isCompany: { type: Boolean, default: false },
    companyName: { type: String, default: "" },
    website: { type: String, default: "" },
    industry: {
        type: String,
        enum: ["", "Technology", "Healthcare", "Finance", "Education", "E-commerce", "Media", "Real Estate", "Travel", "Manufacturing", "Other"],
        default: ""
    },
    companySize: {
        type: String,
        enum: ["", "1-10", "11-50", "51-200", "201-500", "500+"],
        default: ""
    },

    hiringPreferences: {
        projectTypes: { type: [String], default: [] },
        preferredSkills: { type: [String], default: [] },
        budgetRange: {
            min: { type: Number, default: 0 },
            max: { type: Number, default: 0 }
        },
        remoteOnly: { type: Boolean, default: false },
        experienceLevel: {
            type: String,
            enum: ["entry", "intermediate", "senior", "lead", "any"],
            default: "any"
        }
    },

    verifiedStatus: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 },
    totalProjects: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

clientSchema.virtual("profileCompleted").get(function () {
    if (this.isCompany) {
        return !!(this.companyName && this.bio && this.industry && this.location);
    }
    return !!(this.title && this.bio && this.location);
});

module.exports = mongoose.model("Client", clientSchema);
