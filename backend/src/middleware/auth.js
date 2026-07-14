const tokenService = require('../services/tokenService');
const User = require('../models/User');

// Verifies the access token from the httpOnly cookie and re-fetches the user's current
// role/status from MongoDB on every request rather than trusting only the JWT payload —
// so a role change or suspension takes effect immediately, not just after the (15-day)
// access token naturally expires. This is the zero-trust justification: the token proves
// *who*, MongoDB is asked fresh each time for *what they're currently allowed to do*.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let payload;
    try {
      payload = tokenService.verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = await User.findById(payload.sub);
    if (!user || user.status === 'suspended') {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
