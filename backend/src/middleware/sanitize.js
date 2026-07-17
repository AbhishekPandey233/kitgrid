const mongoSanitize = require('express-mongo-sanitize');
const sanitizeHtmlLib = require('sanitize-html');

const mongoSanitizeMiddleware = mongoSanitize();

function sanitizeHtml(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return sanitizeHtmlLib(value, { allowedTags: [], allowedAttributes: {} });
}

module.exports = { mongoSanitizeMiddleware, sanitizeHtml };
