const Client = require("../models/Client");
const Freelancer = require("../models/Freelancer");
const FreelancerBooking = require("../models/FreelancerBooking");
const { notifyOne } = require("../services/notificationService");
const {
    hasTimeOverlap,
    normalizeDurationMinutes,
    pickEarliestFittingSlot
} = require("../services/schedulingService");

function toNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildFallbackRegex(value) {
    return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

// ── Get Own Profile ─────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const { role, id } = req.user;
        let profile;

        if (role === "client") {
            profile = await Client.findOne({ userId: id }).populate("userId", "name email");
        } else if (role === "freelancer") {
            profile = await Freelancer.findOne({ userId: id }).populate("userId", "name email");
        } else if (role === "admin") {
            return res.json({ msg: "Admin profile not required" });
        }

        if (!profile) {
            return res.status(404).json({ msg: "Profile not found" });
        }

        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Update Own Profile ──────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { role, id } = req.user;
        let profile;

        if (role === "client") {
            profile = await Client.findOneAndUpdate(
                { userId: id },
                { $set: req.body },
                { new: true, upsert: true }
            );
        } else if (role === "freelancer") {
            profile = await Freelancer.findOneAndUpdate(
                { userId: id },
                { $set: req.body },
                { new: true, upsert: true }
            );
        }

        res.json({ msg: "Profile updated successfully", profile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Get Public Freelancer Profile by User ID ────────────────────────────────
exports.getPublicFreelancerProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const profile = await Freelancer.findOne({ userId })
            .populate("userId", "name email createdAt");

        if (!profile) {
            return res.status(404).json({ msg: "Freelancer profile not found" });
        }

        // Increment profile views
        await Freelancer.findByIdAndUpdate(profile._id, { $inc: { profileViews: 1 } });

        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Add Portfolio Item ──────────────────────────────────────────────────────
exports.addPortfolioItem = async (req, res) => {
    try {
        const { id } = req.user;
        const { title, description, imageUrl, projectUrl, tags } = req.body;

        if (!title) return res.status(400).json({ msg: "Title is required" });

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $push: { portfolio: { title, description, imageUrl, projectUrl, tags } } },
            { new: true, upsert: true }
        );

        res.json({ msg: "Portfolio item added", portfolio: profile.portfolio });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Remove Portfolio Item ───────────────────────────────────────────────────
exports.removePortfolioItem = async (req, res) => {
    try {
        const { id } = req.user;
        const { itemId } = req.params;

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $pull: { portfolio: { _id: itemId } } },
            { new: true }
        );

        res.json({ msg: "Portfolio item removed", portfolio: profile.portfolio });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Add Certification ───────────────────────────────────────────────────────
exports.addCertification = async (req, res) => {
    try {
        const { id } = req.user;
        const { name, issuer, issueDate, expiryDate, credentialId, credentialUrl } = req.body;

        if (!name) return res.status(400).json({ msg: "Certification name is required" });

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $push: { certifications: { name, issuer, issueDate, expiryDate, credentialId, credentialUrl } } },
            { new: true, upsert: true }
        );

        res.json({ msg: "Certification added", certifications: profile.certifications });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Remove Certification ────────────────────────────────────────────────────
exports.removeCertification = async (req, res) => {
    try {
        const { id } = req.user;
        const { certId } = req.params;

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $pull: { certifications: { _id: certId } } },
            { new: true }
        );

        res.json({ msg: "Certification removed", certifications: profile.certifications });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Add Work Experience ─────────────────────────────────────────────────────
exports.addExperience = async (req, res) => {
    try {
        const { id } = req.user;
        const { company, role, location, startDate, endDate, current, description } = req.body;

        if (!company || !role) return res.status(400).json({ msg: "Company and role are required" });

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $push: { experience: { company, role, location, startDate, endDate, current, description } } },
            { new: true, upsert: true }
        );

        res.json({ msg: "Experience added", experience: profile.experience });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Remove Work Experience ──────────────────────────────────────────────────
exports.removeExperience = async (req, res) => {
    try {
        const { id } = req.user;
        const { expId } = req.params;

        const profile = await Freelancer.findOneAndUpdate(
            { userId: id },
            { $pull: { experience: { _id: expId } } },
            { new: true }
        );

        res.json({ msg: "Experience removed", experience: profile.experience });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Advanced Freelancer Search (Atlas Search + fallback) ─────────────────────
exports.searchFreelancers = async (req, res) => {
    try {
        const {
            q,
            location,
            skills,
            minPrice,
            maxPrice,
            minRating,
            maxRating,
            minExperience,
            maxExperience,
            page = 1,
            limit = 12
        } = req.query;

        const safePage = Math.max(Number(page) || 1, 1);
        const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
        const skip = (safePage - 1) * safeLimit;

        const filters = {
            minPrice: toNumber(minPrice),
            maxPrice: toNumber(maxPrice),
            minRating: toNumber(minRating),
            maxRating: toNumber(maxRating),
            minExperience: toNumber(minExperience),
            maxExperience: toNumber(maxExperience)
        };

        const skillsArray = String(skills || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        const applyComputedFilters = [
            {
                $addFields: {
                    effectiveHourlyRate: {
                        $cond: [
                            { $gt: ["$pricing.hourlyRate", 0] },
                            "$pricing.hourlyRate",
                            "$hourlyRate"
                        ]
                    },
                    firstExperienceStart: { $min: "$experience.startDate" }
                }
            },
            {
                $addFields: {
                    experienceYears: {
                        $cond: [
                            { $ifNull: ["$firstExperienceStart", false] },
                            {
                                $dateDiff: {
                                    startDate: "$firstExperienceStart",
                                    endDate: "$$NOW",
                                    unit: "year"
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ];

        const postMatch = {};
        if (filters.minPrice !== null || filters.maxPrice !== null) {
            postMatch.effectiveHourlyRate = {};
            if (filters.minPrice !== null) postMatch.effectiveHourlyRate.$gte = filters.minPrice;
            if (filters.maxPrice !== null) postMatch.effectiveHourlyRate.$lte = filters.maxPrice;
        }
        if (filters.minRating !== null || filters.maxRating !== null) {
            postMatch.rating = {};
            if (filters.minRating !== null) postMatch.rating.$gte = filters.minRating;
            if (filters.maxRating !== null) postMatch.rating.$lte = filters.maxRating;
        }
        if (filters.minExperience !== null || filters.maxExperience !== null) {
            postMatch.experienceYears = {};
            if (filters.minExperience !== null) postMatch.experienceYears.$gte = filters.minExperience;
            if (filters.maxExperience !== null) postMatch.experienceYears.$lte = filters.maxExperience;
        }

        const baseStages = [
            ...applyComputedFilters,
            ...(Object.keys(postMatch).length ? [{ $match: postMatch }] : []),
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    bio: 1,
                    location: 1,
                    skills: "$skills.name",
                    rating: 1,
                    totalReviews: 1,
                    experienceYears: 1,
                    hourlyRate: "$effectiveHourlyRate",
                    verifiedStatus: 1,
                    user: { _id: "$user._id", name: "$user.name", email: "$user.email" }
                }
            }
        ];

        const runFallbackSearch = async () => {
            const fallbackQuery = {};
            if (q) {
                const rx = buildFallbackRegex(q);
                fallbackQuery.$or = [{ title: rx }, { bio: rx }, { "skills.name": rx }];
            }
            if (location) {
                fallbackQuery.location = buildFallbackRegex(location);
            }
            if (skillsArray.length) {
                fallbackQuery["skills.name"] = { $in: skillsArray.map((s) => buildFallbackRegex(s)) };
            }

            const pipeline = [
                { $match: fallbackQuery },
                ...baseStages,
                { $sort: { rating: -1, totalReviews: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: safeLimit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const [result] = await Freelancer.aggregate(pipeline);
            const total = result?.meta?.[0]?.total || 0;

            return {
                data: result?.data || [],
                pagination: {
                    total,
                    page: safePage,
                    limit: safeLimit,
                    pages: Math.ceil(total / safeLimit)
                },
                searchEngine: "fallback"
            };
        };

        try {
            const searchCompound = { must: [], filter: [], should: [] };

            if (q) {
                searchCompound.must.push({
                    text: {
                        query: q,
                        path: ["title", "bio", "skills.name"]
                    }
                });
            }

            if (location) {
                searchCompound.must.push({
                    text: {
                        query: location,
                        path: "location"
                    }
                });
            }

            if (skillsArray.length) {
                for (const skill of skillsArray) {
                    searchCompound.should.push({
                        text: {
                            query: skill,
                            path: "skills.name"
                        }
                    });
                }
                searchCompound.minimumShouldMatch = 1;
            }

            const hasSearch = searchCompound.must.length || searchCompound.should.length || searchCompound.filter.length;
            const pipeline = [
                ...(hasSearch
                    ? [{ $search: { index: "freelancer_search", compound: searchCompound } }]
                    : []),
                ...baseStages,
                { $sort: hasSearch ? { score: { $meta: "searchScore" }, rating: -1 } : { rating: -1, totalReviews: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: safeLimit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const [result] = await Freelancer.aggregate(pipeline);
            const total = result?.meta?.[0]?.total || 0;

            const atlasResponse = {
                data: result?.data || [],
                pagination: {
                    total,
                    page: safePage,
                    limit: safeLimit,
                    pages: Math.ceil(total / safeLimit)
                },
                searchEngine: "atlas"
            };

            if (hasSearch && total === 0) {
                const fallbackResponse = await runFallbackSearch();
                return res.json(fallbackResponse);
            }

            return res.json(atlasResponse);
        } catch (_atlasError) {
            const fallbackResponse = await runFallbackSearch();
            return res.json(fallbackResponse);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addAvailabilitySlot = async (req, res) => {
    try {
        if (req.user.role !== "freelancer") {
            return res.status(403).json({ msg: "Only freelancers can create slots" });
        }

        const { start, end, note } = req.body;
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return res.status(400).json({ msg: "Valid start and end are required" });
        }
        if (startDate >= endDate) {
            return res.status(400).json({ msg: "End must be after start" });
        }

        const profile = await Freelancer.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ msg: "Freelancer profile not found" });

        const overlap = (profile.availabilitySlots || []).some((slot) => {
            return !slot.isBooked && startDate < new Date(slot.end) && endDate > new Date(slot.start);
        });
        if (overlap) return res.status(400).json({ msg: "Slot overlaps with an existing available slot" });

        profile.availabilitySlots.push({ start: startDate, end: endDate, note: String(note || "") });
        profile.availabilitySlots.sort((a, b) => new Date(a.start) - new Date(b.start));
        await profile.save();

        res.status(201).json({ msg: "Slot created", availabilitySlots: profile.availabilitySlots });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteAvailabilitySlot = async (req, res) => {
    try {
        if (req.user.role !== "freelancer") {
            return res.status(403).json({ msg: "Only freelancers can delete slots" });
        }

        const profile = await Freelancer.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ msg: "Freelancer profile not found" });

        const slot = profile.availabilitySlots.id(req.params.slotId);
        if (!slot) return res.status(404).json({ msg: "Slot not found" });
        if (slot.isBooked) return res.status(400).json({ msg: "Booked slots cannot be deleted" });

        slot.deleteOne();
        await profile.save();

        res.json({ msg: "Slot deleted", availabilitySlots: profile.availabilitySlots });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAvailabilitySlots = async (req, res) => {
    try {
        const profile = await Freelancer.findOne({ userId: req.params.userId });
        if (!profile) return res.status(404).json({ msg: "Freelancer profile not found" });

        const now = new Date();
        const slots = (profile.availabilitySlots || [])
            .filter((slot) => !slot.isBooked && new Date(slot.end) > now)
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        res.json(slots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.bookAvailabilitySlot = async (req, res) => {
    try {
        if (req.user.role !== "client") {
            return res.status(403).json({ msg: "Only clients can book" });
        }

        const { freelancerUserId, slotId, durationMinutes = 60, note } = req.body;
        if (!freelancerUserId) return res.status(400).json({ msg: "freelancerUserId is required" });

        const duration = normalizeDurationMinutes(durationMinutes);
        const profile = await Freelancer.findOne({ userId: freelancerUserId });
        if (!profile) return res.status(404).json({ msg: "Freelancer profile not found" });

        let selectedSlot = null;
        if (slotId) {
            selectedSlot = profile.availabilitySlots.id(slotId);
            if (!selectedSlot || selectedSlot.isBooked) {
                return res.status(400).json({ msg: "Selected slot is unavailable" });
            }
            if (new Date(selectedSlot.end) <= new Date()) {
                return res.status(400).json({ msg: "Selected slot is in the past" });
            }
        } else {
            selectedSlot = pickEarliestFittingSlot(profile.availabilitySlots || [], duration, new Date());
            if (!selectedSlot) {
                return res.status(400).json({ msg: "No suitable slot found for automatic scheduling" });
            }
        }

        const slotStart = new Date(selectedSlot.start);
        const slotEnd = new Date(selectedSlot.end);
        const availableMinutes = Math.floor((slotEnd - slotStart) / 60000);
        if (availableMinutes < duration) {
            return res.status(400).json({ msg: "Slot duration is shorter than requested duration" });
        }

        const bookedEnd = new Date(slotStart.getTime() + duration * 60000);

        const existingFreelancerConflict = await FreelancerBooking.findOne({
            freelancerUserId,
            status: "scheduled",
            slotStart: { $lt: bookedEnd },
            slotEnd: { $gt: slotStart }
        });
        if (existingFreelancerConflict) {
            return res.status(400).json({ msg: "Freelancer already has a booking in this time window" });
        }

        const existingClientConflict = await FreelancerBooking.findOne({
            clientUserId: req.user.id,
            status: "scheduled",
            slotStart: { $lt: bookedEnd },
            slotEnd: { $gt: slotStart }
        });
        if (existingClientConflict) {
            return res.status(400).json({ msg: "You already have a booking in this time window" });
        }

        const booking = await FreelancerBooking.create({
            freelancerUserId,
            clientUserId: req.user.id,
            slotStart,
            slotEnd: bookedEnd,
            durationMinutes: duration,
            note: String(note || "")
        });

        if (bookedEnd.getTime() === slotEnd.getTime()) {
            selectedSlot.isBooked = true;
            selectedSlot.bookedBy = req.user.id;
            selectedSlot.note = String(note || "Booked");
        } else {
            selectedSlot.start = bookedEnd;
            profile.availabilitySlots.push({
                start: slotStart,
                end: bookedEnd,
                isBooked: true,
                bookedBy: req.user.id,
                note: String(note || "Booked")
            });
        }

        profile.availabilitySlots.sort((a, b) => new Date(a.start) - new Date(b.start));
        await profile.save();

        await notifyOne(req, {
            userId: freelancerUserId,
            type: "GIG_UPDATE",
            message: "A client booked one of your availability slots.",
            link: "/dashboard",
            emailSubject: "New availability booking",
            emailText: `A client booked your slot from ${slotStart.toISOString()} to ${bookedEnd.toISOString()}.`
        });

        res.status(201).json({ msg: "Booking confirmed", booking });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMyAvailabilityBookings = async (req, res) => {
    try {
        const query = { status: { $in: ["scheduled", "completed", "cancelled"] } };
        if (req.user.role === "freelancer") {
            query.freelancerUserId = req.user.id;
        } else if (req.user.role === "client") {
            query.clientUserId = req.user.id;
        } else {
            return res.status(403).json({ msg: "Only freelancers or clients can view bookings" });
        }

        const bookings = await FreelancerBooking.find(query)
            .populate("freelancerUserId", "name email")
            .populate("clientUserId", "name email")
            .sort({ slotStart: 1 })
            .limit(100);

        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.cancelAvailabilityBooking = async (req, res) => {
    try {
        const booking = await FreelancerBooking.findById(req.params.bookingId);
        if (!booking) return res.status(404).json({ msg: "Booking not found" });

        const canManageBooking =
            booking.clientUserId.toString() === req.user.id ||
            booking.freelancerUserId.toString() === req.user.id;
        if (!canManageBooking) return res.status(403).json({ msg: "Unauthorized" });
        if (booking.status === "cancelled") return res.status(400).json({ msg: "Booking is already cancelled" });

        booking.status = "cancelled";
        await booking.save();

        const profile = await Freelancer.findOne({ userId: booking.freelancerUserId });
        if (profile) {
            const conflict = (profile.availabilitySlots || []).some((slot) => {
                return !slot.isBooked && hasTimeOverlap(
                    new Date(slot.start),
                    new Date(slot.end),
                    new Date(booking.slotStart),
                    new Date(booking.slotEnd)
                );
            });

            if (!conflict && new Date(booking.slotEnd) > new Date()) {
                profile.availabilitySlots.push({
                    start: booking.slotStart,
                    end: booking.slotEnd,
                    isBooked: false,
                    note: "Re-opened from cancelled booking"
                });
                profile.availabilitySlots.sort((a, b) => new Date(a.start) - new Date(b.start));
                await profile.save();
            }
        }

        res.json({ msg: "Booking cancelled", booking });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
