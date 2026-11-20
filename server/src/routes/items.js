import { Router } from 'express';
import { z } from 'zod';
import { ACTIVE_STATUSES, AVAILABILITY, CATEGORIES } from '../constants.js';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { imageUrlFor, removeStoredImage, removeUploadedFile, uploadImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

const router = Router();

const ITEM_COLUMNS = `i.id, i.owner_id, i.name, i.description, i.category, i.image_url,
  i.availability_status, i.created_at, u.name AS owner_name,
  (i.latitude IS NOT NULL) AS has_location`;
// Exact coordinates are never returned; only has_location and, in nearby search, distance_km.

// Rounding to 2 decimals (~1.1 km) means we never store an owner's exact position.
const roundCoord = (n) => Math.round(n * 100) / 100;
const blankToNull = (v) => (v === '' || v === null ? null : Number(v));
const blankToUndefined = (v) => (v === '' || v === undefined ? undefined : Number(v));
const num = () => z.number({ error: 'must be a number' });
const latitude = z.preprocess(blankToNull, num().min(-90).max(90).nullable())
  .transform((v) => (v === null ? null : roundCoord(v)));
const longitude = z.preprocess(blankToNull, num().min(-180).max(180).nullable())
  .transform((v) => (v === null ? null : roundCoord(v)));
const bothOrNeither = (v) => (v.latitude == null) === (v.longitude == null);
const pairMessage = { message: 'latitude and longitude must be given together', path: ['longitude'] };

// Great-circle distance in km between item i and the given lat/lng placeholders. Plain SQL, no PostGIS.
const distanceSql = (lat, lng) => `6371 * 2 * ASIN(LEAST(1, SQRT(
    POWER(SIN(RADIANS(i.latitude - ${lat}::float8) / 2), 2)
    + COS(RADIANS(${lat}::float8)) * COS(RADIANS(i.latitude))
    * POWER(SIN(RADIANS(i.longitude - ${lng}::float8) / 2), 2))))`;

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z.object({
  search: z.string().trim().max(100).optional().default(''),
  category: z.union([z.enum(CATEGORIES), z.literal('')]).optional().default(''),
  lat: z.preprocess(blankToUndefined, num().min(-90).max(90).optional()),
  lng: z.preprocess(blankToUndefined, num().min(-180).max(180).optional()),
  radius: z.preprocess(blankToUndefined, num().positive().max(100).optional().default(5)),
}).refine((v) => (v.lat === undefined) === (v.lng === undefined), {
  message: 'lat and lng must be given together',
  path: ['lng'],
});

const itemFields = {
  name: z.string().trim().min(1, 'is required').max(120),
  description: z.string().trim().max(2000),
  category: z.enum(CATEGORIES, { error: `must be one of ${CATEGORIES.join(', ')}` }),
  availability_status: z.enum(AVAILABILITY, { error: 'must be available or unavailable' }),
};

const createSchema = z.object({
  ...itemFields,
  description: itemFields.description.optional().default(''),
  availability_status: itemFields.availability_status.optional().default('available'),
  latitude: latitude.optional().default(null),
  longitude: longitude.optional().default(null),
}).refine(bothOrNeither, pairMessage);

// To clear a location, send latitude and longitude as empty strings (or null).
const updateSchema = z.object({ ...itemFields, latitude, longitude })
  .partial()
  .refine((v) => ('latitude' in v) === ('longitude' in v) && bothOrNeither(v), pairMessage);

// If validation fails after multer saved a file, delete the orphaned upload.
const cleanupUploadOnError = (err, req, res, next) => {
  if (req.file) removeUploadedFile(req.file.path);
  next(err);
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// GET /api/items?search=&category=&lat=&lng=&radius=  (public; available items only)
// With lat/lng: only items with a location within `radius` km (default 5), nearest first.
router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { search, category, lat, lng, radius } = req.validatedQuery;
  const params = [];
  const where = [`i.availability_status = 'available'`];
  if (search) {
    params.push(`%${escapeLike(search)}%`);
    where.push(`i.name ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`i.category = $${params.length}`);
  }
  if (lat !== undefined) {
    params.push(lat, lng, radius);
    const n = params.length;
    where.push('i.latitude IS NOT NULL');
    const { rows } = await query(
      `SELECT * FROM (
         SELECT ${ITEM_COLUMNS},
                ROUND((${distanceSql(`$${n - 2}`, `$${n - 1}`)})::numeric, 1)::float8 AS distance_km
         FROM items i JOIN users u ON u.id = i.owner_id
         WHERE ${where.join(' AND ')}
       ) nearby
       WHERE distance_km <= $${n}::float8
       ORDER BY distance_km ASC, created_at DESC, id DESC`,
      params,
    );
    return res.json({ items: rows });
  }
  const { rows } = await query(
    `SELECT ${ITEM_COLUMNS} FROM items i JOIN users u ON u.id = i.owner_id
     WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id DESC`,
    params,
  );
  res.json({ items: rows });
});

// GET /api/items/mine  (must be declared before /:id)
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT ${ITEM_COLUMNS},
       (SELECT COUNT(*)::int FROM borrow_requests r WHERE r.item_id = i.id AND r.status = 'pending') AS pending_count
     FROM items i JOIN users u ON u.id = i.owner_id
     WHERE i.owner_id = $1 ORDER BY i.created_at DESC, i.id DESC`,
    [req.user.id],
  );
  res.json({ items: rows });
});

// GET /api/items/:id  (public; any availability so owners and linked pages still resolve)
router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const { rows } = await query(
    `SELECT ${ITEM_COLUMNS} FROM items i JOIN users u ON u.id = i.owner_id WHERE i.id = $1`,
    [req.params.id],
  );
  if (!rows[0]) throw notFound('Item not found');
  res.json({ item: rows[0] });
});

// POST /api/items  (multipart: name, description, category, availability_status, image)
router.post(
  '/',
  requireAuth,
  uploadImage,
  validate(createSchema),
  async (req, res) => {
    const { name, description, category, availability_status, latitude: lat, longitude: lng } = req.body;
    const imageUrl = req.file ? imageUrlFor(req.file) : null;
    const { rows } = await query(
      `INSERT INTO items (owner_id, name, description, category, image_url, availability_status, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.user.id, name, description, category, imageUrl, availability_status, lat, lng],
    );
    const item = await query(
      `SELECT ${ITEM_COLUMNS} FROM items i JOIN users u ON u.id = i.owner_id WHERE i.id = $1`,
      [rows[0].id],
    );
    res.status(201).json({ item: item.rows[0] });
  },
  cleanupUploadOnError,
);

// PATCH /api/items/:id  (owner only; JSON or multipart, any subset of fields, optional new image)
router.patch(
  '/:id',
  requireAuth,
  validate(idParam, 'params'),
  uploadImage,
  validate(updateSchema),
  async (req, res) => {
    const existing = await query('SELECT owner_id, image_url FROM items WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) throw notFound('Item not found');
    if (existing.rows[0].owner_id !== req.user.id) throw forbidden('Only the owner can edit this item');

    const updates = { ...req.body };
    if (req.file) updates.image_url = imageUrlFor(req.file);
    const columns = Object.keys(updates);
    if (columns.length === 0) throw badRequest('Nothing to update');

    // Column names come from the zod schema keys above, never from raw user input.
    const setClause = columns.map((col, idx) => `${col} = $${idx + 2}`).join(', ');
    await query(`UPDATE items SET ${setClause} WHERE id = $1`, [
      req.params.id,
      ...columns.map((c) => updates[c]),
    ]);
    if (req.file) removeStoredImage(existing.rows[0].image_url);

    const { rows } = await query(
      `SELECT ${ITEM_COLUMNS} FROM items i JOIN users u ON u.id = i.owner_id WHERE i.id = $1`,
      [req.params.id],
    );
    res.json({ item: rows[0] });
  },
  cleanupUploadOnError,
);

// DELETE /api/items/:id  (owner only; blocked while pending/approved/borrowed requests exist)
router.delete('/:id', requireAuth, validate(idParam, 'params'), async (req, res) => {
  const imageUrl = await withTransaction(async (client) => {
    // Lock the item so no new request can be created/approved while we check and delete.
    const { rows } = await client.query('SELECT owner_id, image_url FROM items WHERE id = $1 FOR UPDATE', [
      req.params.id,
    ]);
    if (!rows[0]) throw notFound('Item not found');
    if (rows[0].owner_id !== req.user.id) throw forbidden('Only the owner can delete this item');

    const active = await client.query(
      'SELECT COUNT(*)::int AS n FROM borrow_requests WHERE item_id = $1 AND status = ANY($2)',
      [req.params.id, ACTIVE_STATUSES],
    );
    if (active.rows[0].n > 0) {
      throw conflict('This item has pending, approved or borrowed requests and cannot be deleted', 'ITEM_HAS_ACTIVE_REQUESTS');
    }
    await client.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    return rows[0].image_url;
  });
  removeStoredImage(imageUrl);
  res.status(204).end();
});

export default router;
