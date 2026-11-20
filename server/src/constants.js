// Fixed category list so browsing/filtering stays consistent. Keep in sync with client/src/constants.js.
export const CATEGORIES = ['Tools', 'Sports', 'Study', 'Outdoor', 'Electronics', 'Kitchen', 'Books', 'Other'];

export const AVAILABILITY = ['available', 'unavailable'];

export const REQUEST_STATUS = ['pending', 'approved', 'borrowed', 'returned', 'rejected'];

// Requests that still tie up the item.
export const ACTIVE_STATUSES = ['pending', 'approved', 'borrowed'];

// Requests that block the item's calendar for their date range.
export const BLOCKING_STATUSES = ['approved', 'borrowed'];
