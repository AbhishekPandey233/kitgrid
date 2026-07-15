// Whitelist-based object picker — the "never spread req.body directly onto the document"
// pattern for user-facing update endpoints. Only own-enumerable keys explicitly named in
// allowedKeys can ever make it into the result, regardless of what else the source object
// contains.
function pick(source, allowedKeys) {
  const result = {};
  if (!source || typeof source !== 'object') {
    return result;
  }
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { pick };
