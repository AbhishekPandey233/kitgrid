const env = require('../config/env');

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

async function verifyCaptcha(token, remoteIp) {
  if (!token) {
    return false;
  }

  const params = new URLSearchParams({ secret: env.captchaSecret, response: token });
  if (remoteIp) {
    params.append('remoteip', remoteIp);
  }

  const res = await fetch(HCAPTCHA_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  return Boolean(data.success);
}

// Applied as middleware on POST /api/auth/register and /login. Skipped only in
// NODE_ENV=test so automated tests aren't blocked on an external network call.
async function requireCaptcha(req, res, next) {
  if (env.nodeEnv === 'test') {
    return next();
  }

  try {
    const { captchaToken } = req.body || {};
    const passed = await verifyCaptcha(captchaToken, req.ip);
    if (!passed) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { verifyCaptcha, requireCaptcha };
