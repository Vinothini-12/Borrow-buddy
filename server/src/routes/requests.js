import { Router } from 'express';
import { z } from 'zod';
import { BLOCKING_STATUSES } from '../constants.js';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { isoDate, todayIso } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

// Request + item + both parties' names. Never includes password_hash.
const REQUEST_SELECT = `
  SELECT r.id, r.item_id, r.borrower_id, r.start_date, r.end_date, r.status, r.returned_at, r.created_at,
         i.name AS item_name, i.category AS item_category, i.image_url AS item_image_url,
         i.owner_id, o.name AS owner_name, b.name AS borrower_name
  FROM borrow_requests r
  JOIN items i ON i.id = r.item_id
  JOIN users o ON o.id = i.owner_id
  JOIN users b ON b.id = r.borrower_id`;

const idParam = z.object({ id: z.coerce.number().int().positive() });

const createSchema = z
  .object({
    item_id: z.coerce.number().int().positive(),
    start_date: isoDate,
    end_date: isoDate,
  })
  .refine((v) => v.end_date >= v.start_date, { message: 'must be on or after start_date', path: ['end_date'] });

// action -> the only status it may start from, and the status it moves to.
const TRANSITIONS = {
  approve: { from: 'pending', to: 'approved' },
  reject: { from: 'pending', to: 'rejected' },
  borrowed: { from: 'approved', to: 'borrowed' },
  returned: { from: 'borrowed', to: 'returned' },
};

// True if another approved/borrowed request on this item overlaps [start, end] (inclusive).
async function hasOverlap(client, { itemId, start, end, excludeId = null }) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM borrow_requests
     WHERE item_id = $1 AND status = ANY($2)
       AND start_date <= $4 AND end_date >= $3
       AND ($5::int IS NULL OR id <> $5)
     LIMIT 1`,
    [itemId, BLOCKING_STATUSES, start, end, excludeId],
  );
  return rowCount > 0;
}

async function fetchRequest(id, client = { query }) {
  const { rows } = await client.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0];
}

// POST /api/requests  { item_id, start_date, end_date }
router.post('/', validate(createSchema), async (req, res) => {
  const { item_id: itemId, start_date: start, end_date: end } = req.body;
  if (start < todayIso()) throw badRequest('start_date: must be today or later');

  const id = await withTransaction(async (client) => {
    // Lock the item row so concurrent requests/approvals for it are serialized.
    const { rows } = await client.query(
      'SELECT id, owner_id, availability_status FROM items WHERE id = $1 FOR UPDATE',
      [itemId],
    );
    const item = rows[0];
    if (!item) throw notFound('Item not found');
    if (item.owner_id === req.user.id) throw forbidden('You cannot borrow your own item');
    if (item.availability_status !== 'available') {
      throw conflict('This item is not available to borrow right now', 'ITEM_UNAVAILABLE');
    }
    if (await hasOverlap(client, { itemId, start, end })) {
      throw conflict('The item is already booked for some of those dates', 'DATES_UNAVAILABLE');
    }
    const inserted = await client.query(
      `INSERT INTO borrow_requests (item_id, borrower_id, start_date, end_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [itemId, req.user.id, start, end],
    );
    return inserted.rows[0].id;
  });

  res.status(201).json({ request: await fetchRequest(id) });
});

// GET /api/requests/mine  (requests I made)
router.get('/mine', async (req, res) => {
  const { rows } = await query(`${REQUEST_SELECT} WHERE r.borrower_id = $1 ORDER BY r.created_at DESC, r.id DESC`, [
    req.user.id,
  ]);
  res.json({ requests: rows });
});

// GET /api/requests/incoming/count  (lightweight: pending requests waiting on me, for the navbar badge)
router.get('/incoming/count', async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS pending
     FROM borrow_requests r JOIN items i ON i.id = r.item_id
     WHERE i.owner_id = $1 AND r.status = 'pending'`,
    [req.user.id],
  );
  res.json({ pending: rows[0].pending });
});

// GET /api/requests/incoming  (requests for items I own)
router.get('/incoming', async (req, res) => {
  const { rows } = await query(
    `${REQUEST_SELECT} WHERE i.owner_id = $1 ORDER BY r.start_date ASC, r.created_at ASC, r.id ASC`,
    [req.user.id],
  );
  res.json({ requests: rows });
});

// GET /api/requests/:id  (borrower or owner only)
router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const request = await fetchRequest(req.params.id);
  if (!request) throw notFound('Request not found');
  if (request.borrower_id !== req.user.id && request.owner_id !== req.user.id) {
    throw forbidden('Only the borrower or the owner can view this request');
  }
  res.json({ request });
});

// PATCH /api/requests/:id/(approve|reject|borrowed|returned)  (item owner only)
for (const [action, { from, to }] of Object.entries(TRANSITIONS)) {
  router.patch(`/:id/${action}`, validate(idParam, 'params'), async (req, res) => {
    const request = await withTransaction(async (client) => {
      // Lock the item first (same order as POST), then the request row.
      const meta = await client.query('SELECT item_id FROM borrow_requests WHERE id = $1', [req.params.id]);
      if (!meta.rows[0]) throw notFound('Request not found');
      const itemRes = await client.query('SELECT owner_id FROM items WHERE id = $1 FOR UPDATE', [
        meta.rows[0].item_id,
      ]);
      const reqRes = await client.query(
        'SELECT id, item_id, start_date, end_date, status FROM borrow_requests WHERE id = $1 FOR UPDATE',
        [req.params.id],
      );
      const current = reqRes.rows[0];
      if (!current || !itemRes.rows[0]) throw notFound('Request not found');
      if (itemRes.rows[0].owner_id !== req.user.id) {
        throw forbidden('Only the item owner can update this request');
      }
      if (current.status !== from) {
        throw conflict(`Cannot ${action} a request that is ${current.status}`, 'INVALID_TRANSITION');
      }
      if (action === 'approve') {
        const overlap = await hasOverlap(client, {
          itemId: current.item_id,
          start: current.start_date,
          end: current.end_date,
          excludeId: current.id,
        });
        if (overlap) {
          throw conflict('Another approved or borrowed request overlaps these dates', 'DATES_UNAVAILABLE');
        }
      }
      await client.query(
        `UPDATE borrow_requests
         SET status = $2::text, returned_at = CASE WHEN $2::text = 'returned' THEN NOW() ELSE returned_at END
         WHERE id = $1`,
        [current.id, to],
      );
      return fetchRequest(current.id, client);
    });
    res.json({ request });
  });
}

export default router;
