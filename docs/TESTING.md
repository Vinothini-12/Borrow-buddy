# BorrowBuddy — Testing

## Automated API smoke test

`server/scripts/smoke.js` makes real HTTP calls to a running API. It covers auth, items, uploads, the full borrowing journey, rejection, overlap protection, concurrent approvals and input validation (82 checks).

```bash
cd server
npm run db:reset      # the suite expects fresh seed data
npm run dev           # terminal 1
npm run smoke         # terminal 2 → "82 passed, 0 failed"
```

Run `npm run db:reset` again before re-running. The suite books fixed relative dates, so a second run against the same data will hit its own bookings.

## Manual test checklist

Start from a fresh reset (`npm run db:reset`). All demo accounts use the password `password123`.
**A** = Asha (asha@example.com, owns Power Drill). **B** = Ben (ben@example.com). **C** = Chen (chen@example.com).
Use separate browsers or a private window for each user.

### 1. Main journey: A lists → B requests → A approves → borrowed → returned

| # | Step | Expected |
| --- | --- | --- |
| 1.1 | Log out. Open Home | Hero "Borrow more. Buy less.", 4 item cards with photo/placeholder, name, category, Available pill and lender name |
| 1.2 | Type "dri" in search | Only Power Drill is shown; URL has `?search=dri` |
| 1.3 | Choose category "Outdoor" with an empty search | Only Camping Kit is shown |
| 1.4 | Search "zzz" | "No items match your search" with a Clear filters button |
| 1.5 | Register a new user, open My Items, and list "Garden Ladder" (Tools) with a JPG/PNG photo | Preview shows before submitting; item appears in "Items you lend"; it shows on Home and is found by searching "ladder" |
| 1.6 | As **B**, open Power Drill | Details, "Lent by Asha Kumar", date pickers, "Request to borrow" button |
| 1.7 | Pick start = today + 5, end = today + 7 and submit | Green "Request sent to Asha Kumar…" with a link to My Requests |
| 1.8 | B → My Requests | Power Drill with a yellow **Pending** badge |
| 1.9 | As **A** → My Items | Power Drill shows "1 pending" and a row for Ben with Approve / Reject |
| 1.10 | A clicks **Approve** | Badge turns blue **Approved**; button changes to "Mark borrowed" |
| 1.11 | B reloads My Requests | **Approved** badge and "Arrange the handover" hint |
| 1.12 | A clicks **Mark borrowed** | Purple **Borrowed** badge; button changes to "Mark returned" |
| 1.13 | A clicks **Mark returned** | The row moves to "Past requests"; badge is green **Returned** |
| 1.14 | B reloads My Requests | **Returned** badge with the return time |

### 2. Rejection

| # | Step | Expected |
| --- | --- | --- |
| 2.1 | B requests Calculator (owned by C) for today | Request sent |
| 2.2 | C → My Items → **Reject**, confirm | Row moves to Past requests as **Rejected** |
| 2.3 | B → My Requests | Red **Rejected** badge, "The owner declined this request" |

### 3. Overlapping dates

| # | Step | Expected |
| --- | --- | --- |
| 3.1 | B requests Power Drill for +10 … +12 | Request sent (pending) |
| 3.2 | C requests Power Drill for +11 … +14 | Allowed, because pending requests don't block |
| 3.3 | A approves B | Approved |
| 3.4 | A clicks Approve on C | Inline error "Another approved or borrowed request overlaps these dates"; C stays pending |
| 3.5 | C submits a new request for +12 … +12 (shares B's last day) | Inline error "The item is already booked for some of those dates" |
| 3.6 | C requests +13 … +15 (adjacent, no shared day) | Request sent |

### 4. Authorization and rules

| # | Check | Expected |
| --- | --- | --- |
| 4.1 | Logged out, visit `/my-items` or `/my-requests` | Redirect to Login; after logging in you return to that page |
| 4.2 | A opens own Power Drill | "This is your item" instead of the request form |
| 4.3 | Logged out, open any item | "Log in to request" button |
| 4.4 | Pick an end date before the start date | The date picker's `min` blocks it, and a client error appears if forced |
| 4.5 | API: request with a past `start_date` | 400 |
| 4.6 | API: B calls `PATCH /api/requests/:id/approve` on their own request | 403 |
| 4.7 | API: C calls `GET /api/requests/:id` on a request between A and B | 403 |
| 4.8 | API: approve an already approved request, or return a pending one | 409 `INVALID_TRANSITION` |
| 4.9 | A clicks Delete on Power Drill while a request is pending/approved/borrowed | Inline error "…cannot be deleted" |
| 4.10 | A clicks "Mark unavailable" on an item | It disappears from Home, and its detail page says it can't be requested |
| 4.11 | Upload a `.txt` renamed to `.png`, or a 3 MB image | Rejected: client-side for size/type; server returns 400 `INVALID_UPLOAD` for spoofed content |
| 4.12 | Register with an existing email | Inline "An account with that email already exists" |
| 4.13 | Log in with a wrong password | Inline "Incorrect email or password" |
| 4.14 | Any API response | Never contains `password_hash` |

### 5. UI states and layout

| # | Check | Expected |
| --- | --- | --- |
| 5.1 | Stop the API server and reload Home | "Cannot reach the server…" with a **Try again** button |
| 5.2 | New user → My Items / My Requests | Friendly empty states with a next-step action |
| 5.3 | Visit `/items/99999` and `/nope` | "This item doesn't exist…" / "Page not found" |
| 5.4 | Width ≈ 390 px (phone) | Hamburger menu; stacked search bar; single-column cards; on My Items the items/requests appear before the add form; no horizontal scroll |
| 5.5 | OS dark mode | Dark theme with readable badges |
| 5.6 | Loading | Spinner with a label while data loads |

### 6. Database safety

| # | Check | Expected |
| --- | --- | --- |
| 6.1 | `DATABASE_URL=…/postgres npm run db:reset` | Prints host + db name, then "Refusing to run db:reset…" with exit code 1 |
| 6.2 | `npm run db:migrate` twice | The second run prints `skip 001_init.sql (already applied)` |
| 6.3 | Stop Postgres and run `npm run dev` | "ERROR: could not connect to PostgreSQL…" and the process exits |
