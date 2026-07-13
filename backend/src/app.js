const express = require('express');

const app = express();

// Scaffolding placeholder — security middleware, routes, and DB/Redis
// wiring are added in later phases.
app.get('/', (req, res) => {
  res.send('KitGrid API — scaffolding');
});

module.exports = app;
