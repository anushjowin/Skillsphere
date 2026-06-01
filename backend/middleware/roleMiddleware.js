const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ msg: "No role specified for user" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ msg: `Role (${req.user.role}) is not allowed to access this resource` });
        }
        next();
    };
};

module.exports = authorizeRoles;
