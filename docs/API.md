# BorrowBuddy — API reference

Base URL (local): `http://localhost:5050`

- Request and response bodies are JSON, except item create/update, which also accept `multipart/form-data`.
- **Auth:** send `Authorization: Bearer <token>`, using the token from register or login. Tokens expire after 7 days.
- Dates are `YYYY-MM-DD` strings. Timestamps are ISO-8601 UTC.
- `password_hash` is never included in any response.

## Error shape

Every error uses the same shape:

```json
{ "error": { "code": "DATES_UNAVAILABLE", "message": "The item is already booked for some of those dates" } }
```

| Status | Codes | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_UPLOAD` | Bad or missing input, malformed JSON, wrong file type, or file over 2 MB |
| 401 | `UNAUTHORIZED` | Missing, invalid or expired token; wrong email/password |
| 403 | `FORBIDDEN` | Not the owner (or not a party to the request); trying to borrow your own item |
| 404 | `NOT_FOUND` | Item, request or route does not exist |
| 409 | `EMAIL_TAKEN`, `CONFLICT`, `ITEM_UNAVAILABLE`, `DATES_UNAVAILABLE`, `INVALID_TRANSITION`, `ITEM_HAS_ACTIVE_REQUESTS`, `BORROWER_HAS_OVERDUE`, `NOT_OVERDUE`, `NEED_CLOSED`, `ALREADY_OFFERED` | Business-rule conflicts (see each endpoint) |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details are logged on the server only) |

## Objects

**User**
```json
{ "id": 1, "name": "Asha Kumar", "email": "asha@example.com", "created_at": "2026-11-20T09:36:34.628Z" }
```

**Item**
```json
{
  "id": 1, "owner_id": 1, "owner_name": "Asha Kumar",
  "name": "Power Drill", "description": "Cordless 18V drill…", "category": "Tools",
  "image_url": "/uploads/3f9c…a1.png", "availability_status": "available",
  "created_at": "2026-11-20T09:36:34.628Z", "has_location": true
}
```
`image_url` is relative to the API base URL, or `null`. `GET /api/items/mine` also adds `pending_count`. Exact coordinates are never returned: only `has_location`, plus `distance_km` in a near-me search.

**Request**
```json
{
  "id": 7, "item_id": 1, "borrower_id": 2,
  "start_date": "2026-11-25", "end_date": "2026-11-27",
  "status": "pending", "returned_at": null, "created_at": "2026-11-20T09:40:00.000Z",
  "item_name": "Power Drill", "item_category": "Tools", "item_image_url": null,
  "owner_id": 1, "owner_name": "Asha Kumar", "borrower_name": "Ben Carter"
}
```

---

## Auth

### `POST /api/auth/register`
- **Auth:** none
- **Body:** `{ "name": string (1–100), "email": valid email, "password": string (8–72) }`. Email is trimmed and lower-cased.
- **201:** `{ "token": string, "user": User }`
- **Errors:** 400 validation · 409 `EMAIL_TAKEN`

### `POST /api/auth/login`
- **Auth:** none
- **Body:** `{ "email": string, "password": string }`
- **200:** `{ "token": string, "user": User }`
- **Errors:** 400 validation · 401 `Incorrect email or password` (the same message whether the email or the password is wrong)

### `GET /api/auth/me`
- **Auth:** required
- **200:** `{ "user": User }`
- **Errors:** 401 missing/invalid token · 404 user no longer exists

### Logout
Logout is client-side: the client discards its token. There is no endpoint.

---

## Items

### `GET /api/items?search=&category=&lat=&lng=&radius=`
- **Auth:** none
- **Query:** `search` (optional, ≤100 chars) is a case-insensitive *contains* match on name, with `%` and `_` treated literally. `category` is optional and must be one of the fixed categories.
- **Near me (optional):** `lat` + `lng` (the searcher's position, both required together) and `radius` in km (default 5, max 100). Only items with a location within the radius are returned, **nearest first**, each with `distance_km` (1 decimal; approximate because stored locations are rounded to ~1 km).
- Returns **only items with `availability_status = 'available'`**, newest first.
- **200:** `{ "items": Item[] }`
- **Errors:** 400 unknown category · bad / unpaired `lat`/`lng` · radius out of range

### `GET /api/items/mine`
- **Auth:** required
- All of the caller's items (available and unavailable), each with `pending_count`.
- **200:** `{ "items": (Item & { pending_count: number })[] }`

### `GET /api/items/:id`
- **Auth:** none
- Returns the item whatever its availability, so links and owner views still work.
- **200:** `{ "item": Item }`
- **Errors:** 400 non-numeric id · 404 not found

### `POST /api/items`
- **Auth:** required
- **Body:** `multipart/form-data`, or JSON if there's no photo
  - `name` (required, 1–120)
  - `description` (optional, ≤2000)
  - `category` (required, one of the fixed categories)
  - `availability_status` (optional, `available` (default) | `unavailable`)
  - `image` (optional file: jpg/png/webp, ≤2 MB; the content is checked as well as the declared type)
  - `latitude` + `longitude` (optional, together). Rounded to 2 decimals (~1 km) before saving
- **201:** `{ "item": Item }`
- **Errors:** 400 validation / `INVALID_UPLOAD` · 401

### `PATCH /api/items/:id`
- **Auth:** required, **owner only**
- **Body:** any subset of `name`, `description`, `category`, `availability_status`, `latitude` + `longitude` (together; `null` or `""` clears the location), plus optional `image` (multipart). A new image replaces and deletes the old file.
- **200:** `{ "item": Item }`
- **Errors:** 400 validation / nothing to update · 401 · 403 not owner · 404

### `DELETE /api/items/:id`
- **Auth:** required, **owner only**
- Blocked while the item has any `pending`, `approved` or `borrowed` request. Finished requests are deleted with the item.
- **204:** no body
- **Errors:** 401 · 403 not owner · 404 · 409 `ITEM_HAS_ACTIVE_REQUESTS`

---

## Requests

All request endpoints require auth.

### `POST /api/requests`
- **Body:** `{ "item_id": number, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`
- **Rules:**
  - `start_date` is today or later (server date)
  - `end_date >= start_date`
  - the date must be a real calendar date
  - the item exists and is `available`
  - the caller is not the owner
  - no **approved or borrowed** request on the item overlaps the range (inclusive). Pending requests don't block.
  - The check and the insert run in one transaction with the item row locked.
- **201:** `{ "request": Request }` (status `pending`)
- **Errors:** 400 validation/past date · 403 own item · 404 item not found · 409 `BORROWER_HAS_OVERDUE` (caller holds an overdue or not-returned item) · 409 `ITEM_UNAVAILABLE` · 409 `DATES_UNAVAILABLE`

### `GET /api/requests/mine`
- Requests the caller made, newest first.
- **200:** `{ "requests": Request[] }`

### `GET /api/requests/incoming`
- Requests for items the caller owns, ordered by start date. Each also has `borrower_unreturned`: how many items that borrower currently holds overdue or not returned (across all owners).
- **200:** `{ "requests": Request[] }`

### `GET /api/requests/incoming/count`
- Number of **pending** requests on items the caller owns. Polled by the navbar badge.
- **200:** `{ "pending": 2 }`

### `GET /api/requests/:id`
- Only the **borrower** or the **item owner** may view.
- **200:** `{ "request": Request }`
- **Errors:** 400 bad id · 403 not a party · 404

### Status changes (owner only)

| Endpoint | Allowed from → to | Extra |
| --- | --- | --- |
| `PATCH /api/requests/:id/approve` | `pending → approved` | Re-checks overlap against other approved/borrowed requests in a locked transaction. Returns 409 `DATES_UNAVAILABLE` on conflict, 409 `BORROWER_HAS_OVERDUE` if the borrower holds an overdue/unreturned item |
| `PATCH /api/requests/:id/reject` | `pending → rejected` | |
| `PATCH /api/requests/:id/borrowed` | `approved → borrowed` | The handover happened |
| `PATCH /api/requests/:id/returned` | `borrowed` or `not_returned` → `returned` | Sets `returned_at = NOW()` |
| `PATCH /api/requests/:id/not-returned` | `borrowed → not_returned` | Only after `end_date` has passed (else 409 `NOT_OVERDUE`). Also sets the item `unavailable` |

- **Body:** none
- **200:** `{ "request": Request }` with the new status
- **Errors:** 400 bad id · 401 · 403 not the item owner (including the borrower) · 404 · 409 `INVALID_TRANSITION` (for example approving twice, or marking a pending request returned) · 409 `DATES_UNAVAILABLE` (approve only)

---

## Needs ("Need it" board)

All endpoints require auth. A need is **open** while `status = 'open'` and `needed_until` is today or later.

**Need**
```json
{
  "id": 3, "user_id": 2, "user_name": "Ben Carter", "title": "Ladder", "description": "",
  "category": "Tools", "needed_from": "2026-11-28", "needed_until": "2026-11-29",
  "status": "open", "created_at": "2026-11-23T10:00:00.000Z", "offer_count": 1
}
```

### `GET /api/needs?category=`
- Open needs, newest first. Each also has `is_mine`, `offered_by_me`, and `matches_my_items` (someone else's need and the caller owns an available item in that category).
- **200:** `{ "needs": Need[] }`

### `GET /api/needs/matching/count`
- Navbar badge: open needs from others that match the caller's available items and that the caller hasn't offered to yet.
- **200:** `{ "matching": 2 }`

### `GET /api/needs/mine`
- The caller's needs (any status), each with `expired` and `offers: [{ id, item_id, item_name, item_category, item_image_url, item_availability, owner_name, created_at }]`.
- **200:** `{ "needs": Need[] }`

### `POST /api/needs`
- **Body:** `title` (1–120), `description` (optional, ≤1000), `category`, `needed_from` (today or later), `needed_until` (≥ `needed_from`)
- **201:** `{ "need": Need }`
- **Errors:** 400 validation / past date · 401

### `POST /api/needs/:id/offers`
- **Body:** `{ "item_id": 5 }`. Must be the caller's own **available** item.
- **201:** `{ "offer": { id, need_id, item_id, created_at } }`
- **Errors:** 403 own need / not your item · 404 need or item · 409 `NEED_CLOSED` · 409 `ITEM_UNAVAILABLE` · 409 `ALREADY_OFFERED`

### `PATCH /api/needs/:id/close`
- Poster only. `open → closed`.
- **200:** `{ "need": { id, status: "closed" } }`
- **Errors:** 403 not the poster · 404 · 409 `INVALID_TRANSITION` (already closed)

## Other

- `GET /api/health` → `{ "ok": true }`
- `GET /uploads/<file>` serves uploaded item photos.
