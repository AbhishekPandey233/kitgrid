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
