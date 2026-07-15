const mongoSanitize = require('express-mongo-sanitize');
// package.json pins sanitize-html to ~2.16.0 deliberately: 2.17+ pulls in htmlparser2@12,
// which is ESM-only and breaks under Jest's CommonJS transform (Node's own require() can
// load it fine via newer require(esm) interop, but Jest's module system can't). 2.16.x is
// the last release on the CJS-compatible htmlparser2@8 line.
const sanitizeHtmlLib = require('sanitize-html');

// Strips `$`/`.`-prefixed keys from req.body/query/params globally — the standard defense
// against NoSQL operator injection (e.g. neutralizes a login field like {"$gt": ""} that
// would otherwise get passed straight into a Mongo query).
const mongoSanitizeMiddleware = mongoSanitize();

// Applied to user-generated free-text fields (Equipment.description, Booking.customerNote,
// Booking.adminNote) via Mongoose schema setters — see models/Equipment.js and
// models/Booking.js. Runs on write, not just on render, so stored data is clean regardless
// of which client (or future code path) wrote it. Strips all HTML — these are plain-text
// fields, not rich text — so both tags and any script/style content inside them are removed.
function sanitizeHtml(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return sanitizeHtmlLib(value, { allowedTags: [], allowedAttributes: {} });
}

module.exports = { mongoSanitizeMiddleware, sanitizeHtml };
