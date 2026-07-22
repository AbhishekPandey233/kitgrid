// Seeds two known-credential accounts directly into MongoDB for manual pentest setup
// (Phase 32). Writes straight through Mongoose, never through the HTTP API — so it
// inherently bypasses CAPTCHA, rate limiting, and the registration endpoint entirely.
// Re-run anytime: it upserts, so it's safe to run repeatedly against the same database.
//
// Usage (from backend/, with DB_URI pointing at the target Mongo):
//   node scripts/seed-test-users.js
// Or inside the docker-compose backend container:
//   docker compose exec backend node scripts/seed-test-users.js

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const passwordPolicy = require('../src/services/passwordPolicy');

const TEST_USERS = [
  {
    name: 'Test Customer',
    email: 'customer@kitgrid.test',
    password: 'Pentest#Customer2026!',
    role: 'customer',
  },
  {
    name: 'Test Admin',
    email: 'admin@kitgrid.test',
    password: 'Pentest#Admin2026!',
    role: 'admin',
  },
];

async function main() {
  if (env.nodeEnv === 'production') {
    console.error('Refusing to seed known test credentials into a production environment (NODE_ENV=production).');
    process.exit(1);
  }

  await mongoose.connect(env.dbUri);
  console.log(`Connected to ${env.dbUri}`);

  for (const account of TEST_USERS) {
    const passwordHash = await passwordPolicy.hashPassword(account.password);
    await User.findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          name: account.name,
          email: account.email,
          passwordHash,
          passwordChangedAt: new Date(),
          role: account.role,
          status: 'active',
          mfaEnabled: false,
          failedLoginAttempts: 0,
        },
        $unset: { lockoutUntil: '' },
      },
      { upsert: true, new: true }
    );
    console.log(`Seeded ${account.role} account: ${account.email}`);
  }

  await mongoose.disconnect();

  console.log('\n=== Seeded test accounts ===');
  for (const account of TEST_USERS) {
    console.log(`  ${account.role.padEnd(8)} ${account.email}  /  ${account.password}`);
  }

  console.log(`
=== Point your browser at KitGrid through Burp's proxy ===
1. In Burp Suite Professional: Proxy tab > Proxy settings > confirm a listener is running
   on 127.0.0.1:8080 (this is the default; Settings > Proxy > Proxy listeners).
2. Open Burp's embedded browser (Proxy > Open Browser) — it's pre-configured to use Burp's
   proxy and trust Burp's CA cert, so no manual browser/cert setup is needed.
   - If using your own browser instead, set its HTTP/HTTPS proxy to 127.0.0.1:8080 and
     install Burp's CA cert (see the step-by-step instructions provided separately).
3. Navigate to http://localhost:5173 (the frontend, published by docker-compose).
4. Log in once as each seeded account above so both appear in Proxy > HTTP history:
     customer@kitgrid.test / ${TEST_USERS[0].password}
     admin@kitgrid.test    / ${TEST_USERS[1].password}
`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
