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
      if (err.name === 'CastError') {
        return res.status(404).json({ error: 'Not found' });
      }
      next(err);
    }
  };
}

module.exports = { requireOwnership };
