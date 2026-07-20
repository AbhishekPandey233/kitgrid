const path = require('path');

// Resolves `userSegment` against `baseDir` and verifies the result is still contained within
// baseDir — the standard defense against path traversal (../, absolute paths, and their
// normalized equivalents) reaching outside the intended directory. path.resolve() collapses
// ".." segments before this check runs, so "../../etc/passwd" is caught here even though the
// raw string never appears in the final comparison. Returns the resolved absolute path if
// safe, or null if the input would escape baseDir.
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
