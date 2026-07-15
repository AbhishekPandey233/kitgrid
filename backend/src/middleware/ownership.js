// Generic resource-ownership check (IDOR prevention). Fetches `resourceModel` by the ID in
// req.params[resourceIdParam], then requires req.user.id to match resource[ownerField] (or
// req.user.role === 'admin'). Attaches the resource to req.resource for downstream handlers
// so they don't have to re-fetch it. Must run after requireAuth.
//
// Returns 404 — not 403 — when the requester isn't the owner and isn't admin, so a customer
// probing another customer's resource ID can't tell "doesn't exist" apart from "exists but
// isn't yours".
function requireOwnership(resourceModel, resourceIdParam, ownerField) {
  return async function ownershipCheck(req, res, next) {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ error: 'Not found' });
      }

      const isOwner = resource[ownerField]?.toString() === req.user?.id;
      const isAdmin = req.user?.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(404).json({ error: 'Not found' });
      }

      req.resource = resource;
      next();
    } catch (err) {
      // A malformed ID (not a valid ObjectId) means "doesn't exist" too — not a 500.
      if (err.name === 'CastError') {
        return res.status(404).json({ error: 'Not found' });
      }
      next(err);
    }
  };
}

module.exports = { requireOwnership };
