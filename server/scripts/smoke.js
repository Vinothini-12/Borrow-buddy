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

  // Location: seeds put Drill (13.04,80.23), Bicycle (13.05,80.24), Calculator (13.01,80.22), Camping Kit (13.08,80.27).
  res = await call('GET', '/api/items?lat=13.04&lng=80.23&radius=2');
  const near = res.body?.items?.map((i) => i.name) ?? [];
  check('near me 2 km: drill + bicycle only', res.status === 200 && near.includes('Power Drill') && near.includes('Bicycle') && !near.includes('Camping Kit') && !near.includes('Calculator'), res.body);
  check('near me sorted nearest first with distance_km', res.body?.items?.[0]?.name === 'Power Drill' && res.body.items[0].distance_km === 0 && res.body.items[1].distance_km > 0, res.body);
  check('exact coordinates never returned', res.body?.items?.every((i) => !('latitude' in i) && !('longitude' in i) && i.has_location === true), res.body);
  res = await call('GET', '/api/items?lat=13.04&lng=80.23&radius=10');
  check('near me 10 km includes all four', ['Power Drill', 'Bicycle', 'Calculator', 'Camping Kit'].every((n) => res.body?.items?.some((i) => i.name === n)), res.body);
  expectStatus('lat without lng', await call('GET', '/api/items?lat=13.04'), 400);
  expectStatus('latitude out of range', await call('GET', '/api/items?lat=95&lng=80'), 400);
  expectStatus('radius over 100 km', await call('GET', '/api/items?lat=13&lng=80&radius=500'), 400);

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

  check('item without location has has_location=false', ladder?.has_location === false, ladder);

  res = await call('POST', '/api/items', {
    token: asha,
    form: itemForm({ name: 'Smoke Located', category: 'Tools', latitude: '13.04123', longitude: '80.23456' }),
  });
  expectStatus('create item with location', res, 201);
  const located = res.body?.item;
  res = await call('GET', '/api/items?lat=13.04&lng=80.23&radius=1&search=smoke located');
  check('located item found nearby, rounded to ~1 km', res.body?.items?.[0]?.id === located?.id && res.body.items[0].distance_km === 0, res.body);
  expectStatus('latitude without longitude', await call('POST', '/api/items', { token: asha, form: itemForm({ name: 'Bad', category: 'Tools', latitude: '13' }) }), 400);
  expectStatus('longitude not a number', await call('PATCH', `/api/items/${located?.id}`, { token: asha, body: { latitude: 13, longitude: 'abc' } }), 400);
  res = await call('PATCH', `/api/items/${located?.id}`, { token: asha, body: { latitude: null, longitude: null } });
  check('owner can clear location', res.status === 200 && res.body.item.has_location === false, res.body);
  res = await call('PATCH', `/api/items/${located?.id}`, { token: asha, body: { latitude: 13.08, longitude: 80.27 } });
  check('owner can set location later', res.status === 200 && res.body.item.has_location === true, res.body);
  await call('DELETE', `/api/items/${located?.id}`, { token: asha });

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

// ---------------------------------------------------------------- requests
async function findItem(name) {
  const res = await call('GET', `/api/items?search=${encodeURIComponent(name)}`);
  const item = res.body?.items?.find((i) => i.name === name);
  if (!item) throw new Error(`seed item "${name}" not found (run npm run db:reset first)`);
  return item;
}

async function requestTests() {
  console.log('\nRequests: happy path (A lists drill -> B requests -> approve -> borrowed -> returned)');
  const asha = await login('asha@example.com'); // owns Power Drill
  const ben = await login('ben@example.com');
  const chen = await login('chen@example.com');
  const drill = await findItem('Power Drill');

  let res = await call('POST', '/api/requests', {
    token: ben,
    body: { item_id: drill.id, start_date: isoDate(10), end_date: isoDate(12) },
  });
  expectStatus('B requests drill', res, 201);
  const r1 = res.body?.request;
  check('new request is pending with names', r1?.status === 'pending' && r1.item_name === 'Power Drill' && r1.borrower_name === 'Ben Carter' && r1.owner_name === 'Asha Kumar', r1);
  check('request dates are plain YYYY-MM-DD', r1?.start_date === isoDate(10) && r1?.end_date === isoDate(12), r1);

  res = await call('GET', '/api/requests/mine', { token: ben });
  check('B sees it in /mine', res.body?.requests?.some((r) => r.id === r1?.id), res.body);
  res = await call('GET', '/api/requests/incoming', { token: asha });
  check('A sees it in /incoming', res.body?.requests?.some((r) => r.id === r1?.id), res.body);
  res = await call('GET', '/api/requests/incoming', { token: ben });
  check('B does not see it in their /incoming', !res.body?.requests?.some((r) => r.id === r1?.id), res.body);
  res = await call('GET', '/api/requests/incoming/count', { token: asha });
  check('A pending count is 1', res.status === 200 && res.body?.pending === 1, res.body);
  res = await call('GET', '/api/requests/incoming/count', { token: ben });
  check('B pending count is 0', res.status === 200 && res.body?.pending === 0, res.body);
  expectStatus('pending count needs login', await call('GET', '/api/requests/incoming/count'), 401);
  res = await call('GET', '/api/items/mine', { token: asha });
  check('pending_count shows on owner item', res.body?.items?.find((i) => i.id === drill.id)?.pending_count === 1, res.body);

  expectStatus('owner views request', await call('GET', `/api/requests/${r1?.id}`, { token: asha }), 200);
  expectStatus('borrower views request', await call('GET', `/api/requests/${r1?.id}`, { token: ben }), 200);
  expectStatus('stranger cannot view request', await call('GET', `/api/requests/${r1?.id}`, { token: chen }), 403);
  expectStatus('missing request', await call('GET', '/api/requests/999999', { token: asha }), 404);
  expectStatus('requests need auth', await call('GET', '/api/requests/mine'), 401);

  expectStatus('borrower cannot approve', await call('PATCH', `/api/requests/${r1?.id}/approve`, { token: ben }), 403);
  expectStatus('stranger cannot approve', await call('PATCH', `/api/requests/${r1?.id}/approve`, { token: chen }), 403);
  expectStatus('cannot mark borrowed while pending', await call('PATCH', `/api/requests/${r1?.id}/borrowed`, { token: asha }), 409);
  expectStatus('cannot mark returned while pending', await call('PATCH', `/api/requests/${r1?.id}/returned`, { token: asha }), 409);

  res = await call('PATCH', `/api/requests/${r1?.id}/approve`, { token: asha });
  check('A approves -> approved', res.status === 200 && res.body.request.status === 'approved', res.body);
  expectStatus('cannot approve twice', await call('PATCH', `/api/requests/${r1?.id}/approve`, { token: asha }), 409);
  expectStatus('cannot reject once approved', await call('PATCH', `/api/requests/${r1?.id}/reject`, { token: asha }), 409);
  expectStatus('delete blocked while request is active', await call('DELETE', `/api/items/${drill.id}`, { token: asha }), 409);

  res = await call('GET', `/api/requests/${r1?.id}`, { token: ben });
  check('B sees the approval', res.body?.request?.status === 'approved', res.body);

  console.log('\nRequests: overlap protection');
  res = await call('POST', '/api/requests', { token: chen, body: { item_id: drill.id, start_date: isoDate(12), end_date: isoDate(14) } });
  check('overlapping request (shares end day) -> 409 DATES_UNAVAILABLE', res.status === 409 && res.body?.error?.code === 'DATES_UNAVAILABLE', res.body);
  res = await call('POST', '/api/requests', { token: chen, body: { item_id: drill.id, start_date: isoDate(8), end_date: isoDate(20) } });
  check('request enclosing approved range -> 409', res.status === 409, res.body);
  res = await call('POST', '/api/requests', { token: chen, body: { item_id: drill.id, start_date: isoDate(13), end_date: isoDate(15) } });
  expectStatus('adjacent non-overlapping request', res, 201);
  const adjacent = res.body?.request;

  res = await call('PATCH', `/api/requests/${r1?.id}/borrowed`, { token: asha });
  check('A marks borrowed', res.status === 200 && res.body.request.status === 'borrowed', res.body);
  res = await call('POST', '/api/requests', { token: chen, body: { item_id: drill.id, start_date: isoDate(11), end_date: isoDate(11) } });
  check('overlap with a borrowed request -> 409', res.status === 409, res.body);
  expectStatus('cannot mark borrowed twice', await call('PATCH', `/api/requests/${r1?.id}/borrowed`, { token: asha }), 409);

  res = await call('PATCH', `/api/requests/${r1?.id}/returned`, { token: asha });
  check('A marks returned with returned_at', res.status === 200 && res.body.request.status === 'returned' && res.body.request.returned_at, res.body);
  expectStatus('cannot return twice', await call('PATCH', `/api/requests/${r1?.id}/returned`, { token: asha }), 409);
  expectStatus('cannot approve a returned request', await call('PATCH', `/api/requests/${r1?.id}/approve`, { token: asha }), 409);

  console.log('\nRequests: approval-time overlap and concurrency');
  // Two pending requests that overlap each other. Only one may be approved.
  const ladder = await findItem('Bicycle'); // owned by Ben
  const p1 = (await call('POST', '/api/requests', { token: chen, body: { item_id: ladder.id, start_date: isoDate(30), end_date: isoDate(33) } })).body?.request;
  const p2 = (await call('POST', '/api/requests', { token: asha, body: { item_id: ladder.id, start_date: isoDate(32), end_date: isoDate(35) } })).body?.request;
  check('two overlapping pending requests are allowed', p1?.id && p2?.id, { p1, p2 });
  const [a1, a2] = await Promise.all([
    call('PATCH', `/api/requests/${p1?.id}/approve`, { token: ben }),
    call('PATCH', `/api/requests/${p2?.id}/approve`, { token: ben }),
  ]);
  const statuses = [a1.status, a2.status].sort();
  check('concurrent approvals: exactly one 200 and one 409', statuses[0] === 200 && statuses[1] === 409, { a1: a1.body, a2: a2.body });
  const loser = a1.status === 409 ? p1 : p2;
  res = await call('PATCH', `/api/requests/${loser?.id}/reject`, { token: ben });
  check('owner can still reject the conflicting one', res.status === 200 && res.body.request.status === 'rejected', res.body);

  console.log('\nRequests: rejection flow');
  const calc = await findItem('Calculator'); // owned by Chen
  res = await call('POST', '/api/requests', { token: ben, body: { item_id: calc.id, start_date: isoDate(0), end_date: isoDate(0) } });
  expectStatus('request starting today', res, 201);
  const r2 = res.body?.request;
  expectStatus('non-owner cannot reject', await call('PATCH', `/api/requests/${r2?.id}/reject`, { token: ben }), 403);
  res = await call('PATCH', `/api/requests/${r2?.id}/reject`, { token: chen });
  check('owner rejects -> rejected', res.status === 200 && res.body.request.status === 'rejected', res.body);
  res = await call('GET', '/api/requests/mine', { token: ben });
  check('borrower sees rejection', res.body?.requests?.find((r) => r.id === r2?.id)?.status === 'rejected', res.body);
  expectStatus('cannot approve a rejected request', await call('PATCH', `/api/requests/${r2?.id}/approve`, { token: chen }), 409);
  expectStatus('cannot mark rejected as borrowed', await call('PATCH', `/api/requests/${r2?.id}/borrowed`, { token: chen }), 409);

  console.log('\nRequests: validation');
  res = await call('POST', '/api/requests', { token: asha, body: { item_id: drill.id, start_date: isoDate(40), end_date: isoDate(41) } });
  check('cannot borrow own item -> 403', res.status === 403, res.body);
  expectStatus('start date in the past', await call('POST', '/api/requests', { token: ben, body: { item_id: drill.id, start_date: isoDate(-1), end_date: isoDate(2) } }), 400);
  expectStatus('end before start', await call('POST', '/api/requests', { token: ben, body: { item_id: drill.id, start_date: isoDate(5), end_date: isoDate(4) } }), 400);
  expectStatus('impossible date', await call('POST', '/api/requests', { token: ben, body: { item_id: drill.id, start_date: '2030-02-30', end_date: '2030-03-01' } }), 400);
  expectStatus('bad date format', await call('POST', '/api/requests', { token: ben, body: { item_id: drill.id, start_date: '10/12/2030', end_date: '2030-12-11' } }), 400);
  expectStatus('missing fields', await call('POST', '/api/requests', { token: ben, body: {} }), 400);
  expectStatus('unknown item', await call('POST', '/api/requests', { token: ben, body: { item_id: 999999, start_date: isoDate(1), end_date: isoDate(2) } }), 404);

  await call('PATCH', `/api/items/${calc.id}`, { token: chen, body: { availability_status: 'unavailable' } });
  res = await call('POST', '/api/requests', { token: ben, body: { item_id: calc.id, start_date: isoDate(3), end_date: isoDate(4) } });
  check('unavailable item -> 409 ITEM_UNAVAILABLE', res.status === 409 && res.body?.error?.code === 'ITEM_UNAVAILABLE', res.body);
  await call('PATCH', `/api/items/${calc.id}`, { token: chen, body: { availability_status: 'available' } });

  // Clean up the adjacent pending request so the drill is deletable again.
  await call('PATCH', `/api/requests/${adjacent?.id}/reject`, { token: asha });
  res = await call('GET', '/api/requests/mine', { token: ben });
  check('no response leaks password_hash', !res.raw.includes('password_hash'));
}

// ---------------------------------------------------------------- needs
async function needTests() {
  console.log('\nNeeds ("Need it" board)');
  const [asha, ben, chen] = await Promise.all(['asha', 'ben', 'chen'].map((n) => login(`${n}@example.com`)));
  const drill = await findItem('Power Drill');
  const calc = await findItem('Calculator');
  const body = { title: 'Need a drill', description: 'Putting up shelves', category: 'Tools', needed_from: isoDate(3), needed_until: isoDate(4) };

  expectStatus('post need without auth', await call('POST', '/api/needs', { body }), 401);
  expectStatus('need missing title', await call('POST', '/api/needs', { token: ben, body: { ...body, title: '' } }), 400);
  expectStatus('need in the past', await call('POST', '/api/needs', { token: ben, body: { ...body, needed_from: isoDate(-1) } }), 400);
  expectStatus('need until before from', await call('POST', '/api/needs', { token: ben, body: { ...body, needed_until: isoDate(1) } }), 400);
  expectStatus('need bad category', await call('POST', '/api/needs', { token: ben, body: { ...body, category: 'Cars' } }), 400);

  let res = await call('POST', '/api/needs', { token: ben, body });
  expectStatus('B posts a need', res, 201);
  const need = res.body?.need;
  check('need has poster name and dates', need?.user_name === 'Ben Carter' && need.needed_from === isoDate(3) && need.status === 'open', need);

  res = await call('GET', '/api/needs/matching/count', { token: asha });
  check('A (owns a Tools item) sees 1 matching need', res.body?.matching === 1, res.body);
  res = await call('GET', '/api/needs/matching/count', { token: chen });
  check('C (no Tools item) sees 0 matching', res.body?.matching === 0, res.body);
  res = await call('GET', '/api/needs', { token: asha });
  const seenByA = res.body?.needs?.find((n) => n.id === need?.id);
  check('board flags match for A', seenByA?.matches_my_items === true && seenByA.is_mine === false && seenByA.offered_by_me === false, seenByA);
  res = await call('GET', '/api/needs?category=Study', { token: asha });
  check('board category filter', res.status === 200 && !res.body.needs.some((n) => n.id === need?.id), res.body);

  const offer = (token, itemId, needId = need?.id) => call('POST', `/api/needs/${needId}/offers`, { token, body: { item_id: itemId } });
  expectStatus('cannot offer to own need', await offer(ben, drill.id), 403);
  expectStatus("cannot offer someone else's item", await offer(asha, calc.id), 403);
  expectStatus('offer to unknown need', await offer(asha, drill.id, 999999), 404);
  expectStatus('A offers the drill', await offer(asha, drill.id), 201);
  res = await offer(asha, drill.id);
  check('duplicate offer -> 409 ALREADY_OFFERED', res.status === 409 && res.body?.error?.code === 'ALREADY_OFFERED', res.body);

  res = await call('GET', '/api/needs/matching/count', { token: asha });
  check('badge clears once A has offered', res.body?.matching === 0, res.body);
  res = await call('GET', '/api/needs/mine', { token: ben });
  const mine = res.body?.needs?.find((n) => n.id === need?.id);
  check('B sees the offer with item details', mine?.offers?.length === 1 && mine.offers[0].item_id === drill.id && mine.offers[0].owner_name === 'Asha Kumar', mine);

  expectStatus('non-poster cannot close', await call('PATCH', `/api/needs/${need?.id}/close`, { token: chen }), 403);
  expectStatus('B closes the need', await call('PATCH', `/api/needs/${need?.id}/close`, { token: ben }), 200);
  expectStatus('close twice', await call('PATCH', `/api/needs/${need?.id}/close`, { token: ben }), 409);
  res = await offer(chen, calc.id);
  check('offer on closed need -> 409 NEED_CLOSED', res.status === 409 && res.body?.error?.code === 'NEED_CLOSED', res.body);
  res = await call('GET', '/api/needs', { token: asha });
  check('closed need leaves the board', !res.body?.needs?.some((n) => n.id === need?.id), res.body);
}

const suites = { auth: authTests, items: itemTests, requests: requestTests, needs: needTests };

try {
  console.log(`Smoke testing ${BASE}`);
  for (const run of Object.values(suites)) await run();
} catch (err) {
  failed += 1;
  console.error('Aborted:', err.message);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

