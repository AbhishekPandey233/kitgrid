const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporterPromise = null;

// Ethereal is a fake SMTP sandbox — it never delivers to a real inbox, mail can only be viewed
// via the preview URL logged/returned below. Real delivery requires SMTP_HOST/SMTP_USER/
// SMTP_PASS to be set (see backend/.env), in which case that provider is used instead.
function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (env.smtpHost) {
        return nodemailer.createTransport({
          host: env.smtpHost,
          port: env.smtpPort,
          secure: env.smtpSecure,
          auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
        });
      }

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

async function sendPasswordResetOtpEmail(toEmail, otp) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: env.emailFrom || '"KitGrid" <no-reply@kitgrid.test>',
    to: toEmail,
    subject: 'Your KitGrid password reset code',
    text: `Your password reset code is ${otp}\nThis code expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${otp}</p><p>This code expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  logger.info(previewUrl ? 'Password reset OTP email sent (Ethereal preview)' : 'Password reset OTP email sent', {
    to: toEmail,
    previewUrl,
  });
  recordPreview(toEmail, previewUrl);

  return { previewUrl };
}

module.exports = { sendPasswordResetOtpEmail, getRecentPreviews };
