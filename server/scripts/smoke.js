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

// ---------------------------------------------------------------- items
// Smallest valid PNG (1x1 transparent pixel).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function itemForm(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append('image', new Blob([file.data], { type: file.type }), file.name);
  return form;
}

async function itemTests() {
  console.log('\nItems');
  const asha = await login('asha@example.com');
  const ben = await login('ben@example.com');

  let res = await call('GET', '/api/items');
  expectStatus('public list', res, 200);
  check('seeded items are listed with owner_name', res.body?.items?.length >= 4 && res.body.items.every((i) => i.owner_name), res.body);

  res = await call('GET', '/api/items?search=dri');
  check('search "dri" finds Power Drill', res.body?.items?.some((i) => i.name === 'Power Drill') && res.body.items.every((i) => /dri/i.test(i.name)), res.body);

  res = await call('GET', '/api/items?category=Sports');
  check('category filter Sports', res.body?.items?.length >= 1 && res.body.items.every((i) => i.category === 'Sports'), res.body);

  res = await call('GET', '/api/items?search=%25');
  check('search "%" is literal, not wildcard', res.status === 200 && res.body.items.length === 0, res.body);

  expectStatus('unknown category', await call('GET', '/api/items?category=Cars'), 400);

  res = await call('POST', '/api/items', { form: itemForm({ name: 'X', category: 'Tools' }) });
  expectStatus('create without auth', res, 401);

  res = await call('POST', '/api/items', {
    token: asha,
    form: itemForm(
      { name: 'Smoke Ladder', description: 'Tall ladder', category: 'Tools' },
      { data: PNG_1PX, type: 'image/png', name: 'ladder.png' },
    ),
  });
  expectStatus('create item with photo', res, 201);
  const ladder = res.body?.item;
  check('image_url saved under /uploads', ladder?.image_url?.startsWith('/uploads/') && ladder.availability_status === 'available', ladder);

  if (ladder?.image_url) {
    const img = await fetch(BASE + ladder.image_url);
    check('uploaded image is served', img.status === 200 && img.headers.get('content-type') === 'image/png');
  }

  res = await call('GET', '/api/items?search=smoke ladder');
  check('new item found by search', res.body?.items?.some((i) => i.id === ladder?.id), res.body);

  res = await call('POST', '/api/items', {
    token: asha,
    form: itemForm({ name: 'Bad', category: 'Tools' }, { data: Buffer.from('hello'), type: 'text/plain', name: 'a.txt' }),
  });
  expectStatus('reject non-image upload', res, 400);

  res = await call('POST', '/api/items', {
    token: asha,
    form: itemForm({ name: 'Fake', category: 'Tools' }, { data: Buffer.from('not really a png'), type: 'image/png', name: 'a.png' }),
  });
  expectStatus('reject file whose bytes are not an image', res, 400);

  res = await call('POST', '/api/items', {
    token: asha,
    form: itemForm({ name: 'Huge', category: 'Tools' }, { data: Buffer.concat([PNG_1PX, Buffer.alloc(2 * 1024 * 1024)]), type: 'image/png', name: 'big.png' }),
  });
  expectStatus('reject image over 2 MB', res, 400);

  res = await call('POST', '/api/items', { token: asha, form: itemForm({ name: '', category: 'Nope' }) });
  expectStatus('reject invalid item fields', res, 400);

  res = await call('PATCH', `/api/items/${ladder?.id}`, { token: ben, body: { name: 'Stolen' } });
  expectStatus('non-owner cannot edit', res, 403);

  res = await call('PATCH', `/api/items/${ladder?.id}`, { token: asha, body: { availability_status: 'unavailable' } });
  check('owner marks item unavailable', res.status === 200 && res.body.item.availability_status === 'unavailable', res.body);

  res = await call('GET', '/api/items');
  check('unavailable item hidden from browse', !res.body.items.some((i) => i.id === ladder?.id));

  res = await call('GET', '/api/items/mine', { token: asha });
  check('mine includes unavailable item', res.body?.items?.some((i) => i.id === ladder?.id && i.pending_count === 0), res.body);

  expectStatus('get missing item', await call('GET', '/api/items/999999'), 404);
  expectStatus('get bad id', await call('GET', '/api/items/abc'), 400);

  expectStatus('non-owner cannot delete', await call('DELETE', `/api/items/${ladder?.id}`, { token: ben }), 403);
  expectStatus('owner deletes item', await call('DELETE', `/api/items/${ladder?.id}`, { token: asha }), 204);
  expectStatus('deleted item is gone', await call('GET', `/api/items/${ladder?.id}`), 404);
}

const suites = { auth: authTests, items: itemTests };

try {
  console.log(`Smoke testing ${BASE}`);
  for (const run of Object.values(suites)) await run();
} catch (err) {
  failed += 1;
  console.error('Aborted:', err.message);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

