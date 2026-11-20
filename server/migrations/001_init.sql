-- BorrowBuddy initial schema

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE items (
  id                  SERIAL PRIMARY KEY,
  owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(120) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            VARCHAR(50) NOT NULL,
  image_url           TEXT,
  availability_status VARCHAR(20) NOT NULL DEFAULT 'available'
                      CHECK (availability_status IN ('available', 'unavailable')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE borrow_requests (
  id          SERIAL PRIMARY KEY,
  -- Cascade is safe: the API blocks deleting an item that has active requests.
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  borrower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  returned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT borrow_requests_dates_check CHECK (end_date >= start_date),
  CONSTRAINT borrow_requests_status_check
    CHECK (status IN ('pending', 'approved', 'borrowed', 'returned', 'rejected'))
);

CREATE INDEX idx_items_category ON items (category);
CREATE INDEX idx_items_name ON items (name);
CREATE INDEX idx_borrow_requests_item_status ON borrow_requests (item_id, status);
CREATE INDEX idx_borrow_requests_borrower ON borrow_requests (borrower_id);
