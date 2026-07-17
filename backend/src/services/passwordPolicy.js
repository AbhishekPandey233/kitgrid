const bcrypt = require('bcryptjs');
const zxcvbn = require('zxcvbn');

const MIN_LENGTH = 12;
const SALT_ROUNDS = 12;
const HISTORY_LIMIT = 5;
const MIN_STRENGTH_SCORE = 2;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '123456789', 'qwerty',
  'letmein', 'welcome', 'welcome1', 'admin123', 'iloveyou', 'monkey',
  'dragon', 'football', 'baseball', 'sunshine', 'princess', 'trustno1',
  'superman', 'qwertyuiop', 'abc123', '1234567890', 'passw0rd', 'p@ssw0rd',
  'changeme', 'letmein123', 'qwerty123', 'password!',
]);

function validate(password, { name = '', email = '' } = {}) {
  const errors = [];

  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long`);
  } else {
    if (!/[a-z]/.test(password)) errors.push('Password must include a lowercase letter');
    if (!/[A-Z]/.test(password)) errors.push('Password must include an uppercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must include a number');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must include a symbol');
  }

  const lowerPassword = (password || '').toLowerCase();
  const nameWords = name.trim().toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const lowerEmail = email.trim().toLowerCase();
  const emailLocalPart = lowerEmail.split('@')[0] || '';

  if (nameWords.some((word) => lowerPassword.includes(word))) {
    errors.push('Password must not contain your name');
  }
  if (
    (emailLocalPart.length >= 3 && lowerPassword.includes(emailLocalPart)) ||
    (lowerEmail.length >= 3 && lowerPassword.includes(lowerEmail))
  ) {
    errors.push('Password must not contain your email');
  }
  if (COMMON_PASSWORDS.has(lowerPassword)) {
    errors.push('Password is too common');
  }

  const strength = getStrength(password, [name, email].filter(Boolean));
  if (errors.length === 0 && strength.score < MIN_STRENGTH_SCORE) {
    errors.push(strength.warning || 'Password is too weak or guessable');
  }

  return { valid: errors.length === 0, errors, strength };
}

async function checkReuse(password, passwordHistory = []) {
  for (const oldHash of passwordHistory.slice(0, HISTORY_LIMIT)) {
    if (await bcrypt.compare(password, oldHash)) return true;
  }
  return false;
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function addToHistory(passwordHistory = [], newHash) {
  return [newHash, ...passwordHistory].slice(0, HISTORY_LIMIT);
}

function getStrength(password, userInputs = []) {
  const result = zxcvbn(password || '', userInputs);
  return {
    score: result.score,
    warning: result.feedback.warning,
    suggestions: result.feedback.suggestions,
  };
}

module.exports = {
  MIN_LENGTH,
  HISTORY_LIMIT,
  validate,
  checkReuse,
  hashPassword,
  comparePassword,
  addToHistory,
  getStrength,
};
