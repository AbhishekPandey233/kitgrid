const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporterPromise = null;

// Ethereal is a free, disposable test SMTP service — nothing sent through it reaches a
// real inbox, which is fine for a coursework project with no need for real email delivery.
// If ETHEREAL_EMAIL/ETHEREAL_PASSWORD aren't set, a fresh disposable test account is
// created on the fly via Nodemailer's own helper (Ethereal's account-creation API), so this
// works with zero manual signup.
function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      let auth;
      if (env.etherealEmail && env.etherealPassword) {
        auth = { user: env.etherealEmail, pass: env.etherealPassword };
      } else {
        const testAccount = await nodemailer.createTestAccount();
        auth = { user: testAccount.user, pass: testAccount.pass };
        logger.info('Created a disposable Ethereal test SMTP account', { user: auth.user });
      }

      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth,
      });
    })();
  }
  return transporterPromise;
}

// Kept in memory only, capped, and never exposed via the actual user-facing endpoint that
// triggers a send (that would defeat the point of emailing a reset link in the first place —
// see the debug route this backs, which is gated to non-production).
const MAX_RECENT_PREVIEWS = 20;
const recentPreviews = [];

function recordPreview(toEmail, previewUrl) {
  if (!previewUrl) return;
  recentPreviews.unshift({ to: toEmail, previewUrl, at: new Date().toISOString() });
  recentPreviews.length = Math.min(recentPreviews.length, MAX_RECENT_PREVIEWS);
}

function getRecentPreviews() {
  return recentPreviews;
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: '"KitGrid" <no-reply@kitgrid.test>',
    to: toEmail,
    subject: 'Reset your KitGrid password',
    text: `Reset your password: ${resetUrl}\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore this email.</p>`,
  });

  // Ethereal doesn't deliver anywhere real — this preview URL is the only way to actually
  // see and click the email during development/demo.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  logger.info('Password reset email sent (Ethereal preview)', { to: toEmail, previewUrl });
  recordPreview(toEmail, previewUrl);

  return { previewUrl };
}

module.exports = { sendPasswordResetEmail, getRecentPreviews };
