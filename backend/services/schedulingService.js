function toDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function hasTimeOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
}

function normalizeDurationMinutes(durationMinutes) {
    const parsed = Number(durationMinutes);
    if (!Number.isFinite(parsed)) return 60;
    const rounded = Math.ceil(parsed / 15) * 15;
    return Math.max(15, Math.min(rounded, 480));
}

function pickEarliestFittingSlot(slots, durationMinutes, now = new Date()) {
    const durationMs = durationMinutes * 60000;

    return (slots || [])
        .filter((slot) => !slot.isBooked)
        .filter((slot) => {
            const start = toDate(slot.start);
            const end = toDate(slot.end);
            if (!start || !end) return false;
            if (end <= now) return false;
            return end.getTime() - start.getTime() >= durationMs;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null;
}

module.exports = {
    hasTimeOverlap,
    normalizeDurationMinutes,
    pickEarliestFittingSlot,
    toDate
};
