const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimit');
const { mongoSanitizeMiddleware } = require('./middleware/sanitize');
const { requireCsrfToken } = require('./middleware/csrf');
const { passport } = require('./services/oauthService');
const { serveEquipmentImage } = require('./middleware/upload');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitizeMiddleware);
app.use(globalLimiter);
app.use(passport.initialize());
app.use(requireCsrfToken);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Publicly readable, same as GET /api/equipment itself — uploaded equipment photos aren't
// sensitive, and gating them behind auth would mean every <img> tag needs credentials.
// Not a blanket express.static() mount — see serveEquipmentImage's own comment for why
// :filename gets explicit, independent validation before it ever reaches the filesystem.
app.get('/equipmentImages/:filename', serveEquipmentImage);

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/equipment', require('./routes/equipment.routes'));

app.use(errorHandler);

module.exports = app;
