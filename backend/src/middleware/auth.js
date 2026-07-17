const tokenService = require('../services/tokenService');
const User = require('../models/User');

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
