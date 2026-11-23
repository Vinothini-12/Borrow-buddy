import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES } from '../constants.js';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { isoDate, todayIso } from '../utils/dates.js';

// "Need it" board: post what you need; neighbours who own a matching item offer it.
// The actual borrowing still goes through the normal request flow on the offered item.
const router = Router();
router.use(requireAuth);

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z.object({
  category: z.union([z.enum(CATEGORIES), z.literal('')]).optional().default(''),
});

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'is required').max(120),
    description: z.string().trim().max(1000).optional().default(''),
    category: z.enum(CATEGORIES, { error: `must be one of ${CATEGORIES.join(', ')}` }),
    needed_from: isoDate,
    needed_until: isoDate,
  })
  .refine((v) => v.needed_until >= v.needed_from, { message: 'must be on or after needed_from', path: ['needed_until'] });

const offerSchema = z.object({ item_id: z.coerce.number().int().positive() });

const NEED_COLUMNS = `n.id, n.user_id, n.title, n.description, n.category, n.needed_from, n.needed_until,
  n.status, n.created_at, u.name AS user_name,
  (SELECT COUNT(*)::int FROM need_offers o WHERE o.need_id = n.id) AS offer_count`;

// A need is visible on the board while it is open and its last day has not passed.
const OPEN_NEED = `n.status = 'open' AND n.needed_until >= $2`;

// Neighbours' needs I could help with: open, not mine, I own an available item in that
// category, and I have not offered anything yet.
const MATCHES_ME = `EXISTS (SELECT 1 FROM items i WHERE i.owner_id = $1 AND i.category = n.category
                            AND i.availability_status = 'available')`;
const OFFERED_BY_ME = `EXISTS (SELECT 1 FROM need_offers o JOIN items i ON i.id = o.item_id
                               WHERE o.need_id = n.id AND i.owner_id = $1)`;

// GET /api/needs?category=  (open needs, newest first, with flags for the caller)
router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const params = [req.user.id, todayIso()];
  const where = [OPEN_NEED];
  if (req.validatedQuery.category) {
    params.push(req.validatedQuery.category);
    where.push(`n.category = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT ${NEED_COLUMNS},
       (n.user_id = $1) AS is_mine,
       ${OFFERED_BY_ME} AS offered_by_me,
       (n.user_id <> $1 AND ${MATCHES_ME}) AS matches_my_items
     FROM needs n JOIN users u ON u.id = n.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY n.created_at DESC, n.id DESC`,
    params,
  );
  res.json({ needs: rows });
});

// GET /api/needs/matching/count  (navbar badge: needs I could help with)
router.get('/matching/count', async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS matching FROM needs n
     WHERE ${OPEN_NEED} AND n.user_id <> $1 AND ${MATCHES_ME} AND NOT ${OFFERED_BY_ME}`,
    [req.user.id, todayIso()],
  );
  res.json({ matching: rows[0].matching });
});

// GET /api/needs/mine  (my needs, any status, each with the offers I received)
router.get('/mine', async (req, res) => {
  const { rows } = await query(
    `SELECT ${NEED_COLUMNS},
       (n.needed_until < $2) AS expired,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', o.id, 'item_id', i.id, 'item_name', i.name, 'item_category', i.category,
                  'item_image_url', i.image_url, 'item_availability', i.availability_status,
                  'owner_name', ow.name, 'created_at', o.created_at) ORDER BY o.created_at)
         FROM need_offers o JOIN items i ON i.id = o.item_id JOIN users ow ON ow.id = i.owner_id
         WHERE o.need_id = n.id), '[]'::json) AS offers
     FROM needs n JOIN users u ON u.id = n.user_id
     WHERE n.user_id = $1
     ORDER BY (n.status = 'open' AND n.needed_until >= $2) DESC, n.created_at DESC, n.id DESC`,
    [req.user.id, todayIso()],
  );
  res.json({ needs: rows });
});

// POST /api/needs  { title, description?, category, needed_from, needed_until }
router.post('/', validate(createSchema), async (req, res) => {
  const { title, description, category, needed_from: from, needed_until: until } = req.body;
  if (from < todayIso()) throw badRequest('needed_from: must be today or later');
  const { rows } = await query(
    `INSERT INTO needs (user_id, title, description, category, needed_from, needed_until)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, title, description, category, from, until],
  );
  const need = await query(`SELECT ${NEED_COLUMNS} FROM needs n JOIN users u ON u.id = n.user_id WHERE n.id = $1`, [
    rows[0].id,
  ]);
  res.status(201).json({ need: need.rows[0] });
});

// POST /api/needs/:id/offers  { item_id }  (offer one of my available items)
router.post('/:id/offers', validate(idParam, 'params'), validate(offerSchema), async (req, res) => {
  const needRes = await query('SELECT user_id, status, needed_until FROM needs WHERE id = $1', [req.params.id]);
  const need = needRes.rows[0];
  if (!need) throw notFound('Need not found');
  if (need.user_id === req.user.id) throw forbidden('You cannot offer to your own need');
  if (need.status !== 'open' || need.needed_until < todayIso()) {
    throw conflict('This need is closed', 'NEED_CLOSED');
  }

  const itemRes = await query('SELECT owner_id, availability_status FROM items WHERE id = $1', [req.body.item_id]);
  const item = itemRes.rows[0];
  if (!item) throw notFound('Item not found');
  if (item.owner_id !== req.user.id) throw forbidden('You can only offer your own items');
  if (item.availability_status !== 'available') {
    throw conflict('Mark the item available before offering it', 'ITEM_UNAVAILABLE');
  }

  const { rows } = await query(
    `INSERT INTO need_offers (need_id, item_id) VALUES ($1, $2)
     ON CONFLICT (need_id, item_id) DO NOTHING RETURNING id, need_id, item_id, created_at`,
    [req.params.id, req.body.item_id],
  );
  if (!rows[0]) throw conflict('You already offered this item', 'ALREADY_OFFERED');
  res.status(201).json({ offer: rows[0] });
});

// PATCH /api/needs/:id/close  (owner only: found it / no longer needed)
router.patch('/:id/close', validate(idParam, 'params'), async (req, res) => {
  const { rows } = await query('SELECT user_id, status FROM needs WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Need not found');
  if (rows[0].user_id !== req.user.id) throw forbidden('Only the person who posted this need can close it');
  if (rows[0].status !== 'open') throw conflict('This need is already closed', 'INVALID_TRANSITION');
  await query(`UPDATE needs SET status = 'closed' WHERE id = $1`, [req.params.id]);
  res.json({ need: { id: req.params.id, status: 'closed' } });
});

export default router;
