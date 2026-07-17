const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporterPromise = null;

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

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  logger.info('Password reset email sent (Ethereal preview)', { to: toEmail, previewUrl });
  recordPreview(toEmail, previewUrl);

  return { previewUrl };
}

module.exports = { sendPasswordResetEmail, getRecentPreviews };
