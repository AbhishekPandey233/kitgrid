const path = require('path');

function safeJoin(baseDir, userSegment) {
  if (typeof userSegment !== 'string' || userSegment.includes('\0')) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, userSegment);

  const isWithinBase = resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
  return isWithinBase ? resolvedTarget : null;
}

module.exports = { safeJoin };
