-- Owners can mark an overdue borrow as "not_returned" (item never came back).
ALTER TABLE borrow_requests DROP CONSTRAINT borrow_requests_status_check;
ALTER TABLE borrow_requests ADD CONSTRAINT borrow_requests_status_check
  CHECK (status IN ('pending', 'approved', 'borrowed', 'returned', 'rejected', 'not_returned'));
