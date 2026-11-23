# BorrowBuddy — Scope (v1 prototype)

## Goal

Let people in a community **lend** things they own and **borrow** things from each other instead of buying them.

Core flow:

1. An owner lists an item.
2. A borrower searches for it and requests it for a date range.
3. The owner approves or rejects the request.
4. They arrange the handover in person, and the owner marks the item **borrowed**.
5. The borrower brings it back, and the owner marks it **returned**.

Success for v1 is a working two-day prototype that demonstrates this flow end to end, with correct authorization and no double-booking.

## In scope (v1)

1. **Auth**: register, log in, log out. Passwords are hashed with bcrypt and sessions use JWT.
2. **List an item**: name, description, category, one photo, availability (available / unavailable).
3. **Browse and search**: search by name and filter by category. Only items marked *available* appear on the browse page.
4. **Request to borrow**: pick a start and end date, then send the request to the owner.
5. **Owner decision**: the owner approves or rejects pending requests, and the borrower sees the result.
6. **Status tracking**: `pending → approved → borrowed → returned`, or `pending → rejected`.
7. **Handover and return**: the owner marks a request as borrowed (handover happened) and then returned.
8. **Near me** (added after v1): owners can attach an approximate location (browser location, rounded to ~1 km) to an item, and borrowers can filter by distance (1–25 km), nearest first.
9. **New-request badge** (added after v1): the navbar shows how many requests are waiting on My Items, refreshed every 30 s while the app is open.
10. **"Need it" board** (added after v1): post what you need (item, category, dates). Neighbours who own an available item in that category see a navbar badge and can offer one of their items. The poster then requests the offered item through the normal borrow flow, with dates prefilled. Needs close manually or expire after their last day.

## Decision: borrowing is free

Borrowing is **free in v1**. There is no lending fee field, no payment flow and no pricing UI. This keeps the prototype focused on the trust and scheduling workflow. Fees are in the backlog below.

## Out of scope (not built)

- Payments or lending fees
- In-app chat or messaging
- Ratings and reviews
- Email / SMS / push notifications
- Map view, typed addresses / geocoding, exact locations
- Admin panel or moderation tools
- Social login (Google, Facebook, …)
- Multiple photos per item
- Deposits and damage claims
- Internationalisation (i18n)

## Assumptions

- **Handover happens offline.** The two people arrange pickup themselves (for example, they already know each other or share a community group). The app does not show contact details beyond names.
- **"Today" means the server's local date.** A start date must be today or later on the server's calendar.
- **Date ranges are inclusive.** A request for Mon–Wed blocks Mon, Tue and Wed. Two ranges that share even one day overlap.
- **Only approved and borrowed requests block dates.** Several pending requests may overlap. The owner can approve only one of any overlapping set.
- **Returned frees the item immediately**, even if returned before the end date.
- **Availability is an owner switch.** Marking an item *unavailable* hides it from browse and blocks new requests. Existing approved or borrowed requests are not affected.
- **Categories are a fixed list**: Tools, Sports, Study, Outdoor, Electronics, Kitchen, Books, Other.
- **Photos are optional.** Cards show a letter placeholder when there is no photo.
- **Logout is client-side.** The token is removed from the browser. JWTs expire after 7 days, and there is no server-side revocation in v1.
- **One deployment, one community.** There is no concept of separate neighbourhoods or groups.

## Later versions (backlog)

| Idea | Notes |
| --- | --- |
| Lending fees and payments | Optional per-item fee, payment provider, payouts. Would need a pricing UI and a refunds policy. |
| Deposits and damage claims | Hold a deposit at approval, release it on return, plus a dispute flow. |
| Ratings and reviews | Rate the borrower/lender after `returned` to build trust. |
| Notifications | Email/push on new request, decision, upcoming return date and overdue items. |
| In-app chat | Per-request thread to arrange the handover without sharing phone numbers. |
| Location extras | Map view (Leaflet + OpenStreetMap), typed area/pincode via geocoding. Basic "near me" is built. |
| Availability calendar | Show booked ranges on the item page so borrowers can pick free dates up front. |
| Auto-reject overlaps | When one request is approved, auto-reject other pending requests that overlap it. |
| Multiple photos | Gallery per item. |
| Admin and moderation | Report items/users, remove content. |
| Groups / communities | Separate spaces for buildings, campuses or neighbourhoods. |
| Social login | Google / Apple sign-in. |
