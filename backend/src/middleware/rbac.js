// Role-checking middleware factory. Reads req.user (attached by requireAuth from the
// verified JWT plus a fresh MongoDB lookup — see middleware/auth.js) and checks its role
// against an allow-list. Must run after requireAuth on any route that uses it.
function requireRole(...roles) {
  return function roleCheck(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = { requireRole };
