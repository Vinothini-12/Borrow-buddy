-- "Need it" board: users post what they need; neighbours offer one of their items.
CREATE TABLE needs (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(120) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     VARCHAR(50) NOT NULL,
  needed_from  DATE NOT NULL,
  needed_until DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT needs_dates_check CHECK (needed_until >= needed_from),
  CONSTRAINT needs_status_check CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_needs_status_category ON needs(status, category);
CREATE INDEX idx_needs_user ON needs(user_id);

-- One offer per (need, item). The offerer is always the item's owner.
CREATE TABLE need_offers (
  id         SERIAL PRIMARY KEY,
  need_id    INTEGER NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT need_offers_unique UNIQUE (need_id, item_id)
);

CREATE INDEX idx_need_offers_item ON need_offers(item_id);
