// End-to-end API smoke test. Run against a live server with freshly reset data:
//   npm run db:reset && npm run dev   (in one terminal)
//   npm run smoke                     (in another)
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const BASE = process.env.SMOKE_API_URL || `http://localhost:${process.env.PORT || 5050}`;
let passed = 0;
let failed = 0;

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json, raw: text };
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}`);
    if (detail !== undefined) console.log('       ', JSON.stringify(detail));
  }
}

const expectStatus = (name, res, status) => check(`${name} -> ${status}`, res.status === status, res.body ?? res.raw);

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function login(email) {
  const res = await call('POST', '/api/auth/login', { body: { email, password: 'password123' } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.raw}`);
  return res.body.token;
}

// ---------------------------------------------------------------- auth
async function authTests() {
  console.log('\nAuth');
  const email = `smoke${Date.now()}@example.com`;
  let res = await call('POST', '/api/auth/register', {
    body: { name: 'Smoke Tester', email: email.toUpperCase(), password: 'secret123' },
  });
  expectStatus('register', res, 201);
  check('register returns token and user without hash', res.body?.token && res.body?.user?.email === email && !('password_hash' in (res.body?.user ?? {})), res.body);

  res = await call('POST', '/api/auth/register', { body: { name: 'Dup', email, password: 'secret123' } });
  expectStatus('duplicate email', res, 409);
  check('error shape { error: { code, message } }', res.body?.error?.code === 'EMAIL_TAKEN' && typeof res.body.error.message === 'string', res.body);

  res = await call('POST', '/api/auth/register', { body: { name: '', email: 'bad', password: 'x' } });
  expectStatus('invalid register', res, 400);

  res = await call('POST', '/api/auth/login', { body: { email: 'asha@example.com', password: 'wrong' } });
  expectStatus('wrong password', res, 401);

  const token = await login('asha@example.com');
  res = await call('GET', '/api/auth/me', { token });
  expectStatus('me', res, 200);
  check('me has no password_hash', res.body?.user && !res.raw.includes('password_hash'), res.body);

  expectStatus('me without token', await call('GET', '/api/auth/me'), 401);
  expectStatus('me with bad token', await call('GET', '/api/auth/me', { token: 'abc' }), 401);
}

const suites = { auth: authTests };

try {
  console.log(`Smoke testing ${BASE}`);
  for (const run of Object.values(suites)) await run();
} catch (err) {
  failed += 1;
  console.error('Aborted:', err.message);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

