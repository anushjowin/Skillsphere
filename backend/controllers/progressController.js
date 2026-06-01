const Progress = require("../models/Progress");
const Gig = require("../models/Gig");
const Notification = require("../models/Notification");

exports.createProgress = async (req, res) => {
    try {
        const { gigId, tasks = [], startDate, endDate } = req.body;
        
        const gig = await Gig.findById(gigId);
        if (!gig) return res.status(404).json({ msg: "Gig not found" });

        const isParticipant = 
            gig.client.toString() === req.user.id ||
            gig.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const existing = await Progress.findOne({ gig: gigId });
        if (existing) return res.status(400).json({ msg: "Progress tracker already exists for this gig" });

        const normalizedTasks = tasks.map(t => ({
            title: String(t.title).trim(),
            description: String(t.description || ""),
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            completed: false
        })).filter(t => t.title);

        const progress = await Progress.create({
            gig: gigId,
            client: gig.client,
            freelancer: gig.freelancer,
            tasks: normalizedTasks,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            status: "not_started"
        });

        res.status(201).json({ msg: "Progress tracker created", progress });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProgress = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId })
            .populate("gig", "title")
            .populate("client", "name email")
            .populate("freelancer", "name email")
            .populate("logs.user", "name email")
            .populate("logs.files.uploadedBy", "name email");

        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client._id.toString() === req.user.id ||
            progress.freelancer?._id.toString() === req.user.id ||
            req.user.role === "admin";
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const completion = progress.calculateCompletion();
        res.json({ ...progress.toObject(), completionPercentage: completion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addTask = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const { title, description, dueDate } = req.body;
        if (!title) return res.status(400).json({ msg: "Task title is required" });

        progress.tasks.push({
            title: String(title).trim(),
            description: String(description || ""),
            dueDate: dueDate ? new Date(dueDate) : null,
            completed: false
        });

        if (progress.status === "not_started") progress.status = "in_progress";
        await progress.save();

        res.json({ msg: "Task added", progress });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.toggleTask = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const task = progress.tasks.id(req.params.taskId);
        if (!task) return res.status(404).json({ msg: "Task not found" });

        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date() : null;

        const allCompleted = progress.tasks.length > 0 && progress.tasks.every(t => t.completed);
        progress.status = allCompleted ? "completed" : "in_progress";

        await progress.save();

        const completion = progress.calculateCompletion();
        res.json({ msg: task.completed ? "Task completed" : "Task reopened", progress, completionPercentage: completion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const task = progress.tasks.id(req.params.taskId);
        if (!task) return res.status(404).json({ msg: "Task not found" });

        const { title, description, dueDate } = req.body;
        if (title) task.title = String(title).trim();
        if (description !== undefined) task.description = String(description);
        if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;

        await progress.save();
        res.json({ msg: "Task updated", progress });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        progress.tasks.pull(req.params.taskId);
        await progress.save();

        res.json({ msg: "Task deleted", progress });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addLog = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const { message, files = [] } = req.body;
        if (!message) return res.status(400).json({ msg: "Message is required" });

        const normalizedFiles = (Array.isArray(files) ? files : [])
            .filter(f => f && f.url)
            .map(f => ({
                url: String(f.url),
                fileName: String(f.fileName || ""),
                fileType: String(f.fileType || ""),
                uploadedBy: req.user.id
            }));

        progress.logs.push({
            user: req.user.id,
            message: String(message).trim(),
            files: normalizedFiles
        });

        if (progress.status === "not_started") progress.status = "in_progress";
        await progress.save();

        const populated = await Progress.findById(progress._id)
            .populate("logs.user", "name email")
            .populate("logs.files.uploadedBy", "name email");

        res.json({ msg: "Log added", progress: populated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const progress = await Progress.findOne({ gig: req.params.gigId });
        if (!progress) return res.status(404).json({ msg: "Progress not found" });

        const isParticipant = 
            progress.client.toString() === req.user.id ||
            progress.freelancer?.toString() === req.user.id;
        if (!isParticipant) return res.status(403).json({ msg: "Unauthorized" });

        const { status } = req.body;
        const validStatuses = ["not_started", "in_progress", "completed", "on_hold"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ msg: "Invalid status" });
        }

        progress.status = status;
        await progress.save();

        const completion = progress.calculateCompletion();
        res.json({ msg: "Status updated", progress, completionPercentage: completion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMyProgressTrackers = async (req, res) => {
    try {
        const progress = await Progress.find({
            $or: [{ client: req.user.id }, { freelancer: req.user.id }]
        })
            .populate("gig", "title")
            .populate("client", "name email")
            .populate("freelancer", "name email")
            .sort({ updatedAt: -1 });

        const withCompletion = progress.map(p => ({
            ...p.toObject(),
            completionPercentage: p.calculateCompletion()
        }));

        res.json(withCompletion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.checkDeadlines = async (req, res) => {
    try {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const overdueProgress = await Progress.find({
            status: { $in: ["not_started", "in_progress", "on_hold"] },
            "tasks.dueDate": { $lt: now },
            "tasks.completed": false
        }).populate("gig", "title").populate("freelancer", "name email");

        const upcomingProgress = await Progress.find({
            status: { $in: ["not_started", "in_progress", "on_hold"] },
            "tasks.dueDate": { $gte: now, $lte: threeDaysFromNow },
            "tasks.completed": false
        }).populate("gig", "title").populate("freelancer", "name email");

        res.json({
            overdue: overdueProgress.map(p => ({
                gig: p.gig,
                tasks: p.tasks.filter(t => t.dueDate && t.dueDate < now && !t.completed)
            })),
            upcoming: upcomingProgress.map(p => ({
                gig: p.gig,
                tasks: p.tasks.filter(t => t.dueDate && t.dueDate >= now && t.dueDate <= threeDaysFromNow && !t.completed)
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};