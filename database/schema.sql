-- Run only in a controlled PostgreSQL database before enabling paid entries.
CREATE SEQUENCE IF NOT EXISTS entry_number_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS raffle_orders (
  id UUID PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','confirmed','void')),
  payment_reference TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS raffle_tickets (
  number BIGINT PRIMARY KEY DEFAULT nextval('entry_number_seq'),
  order_id UUID NOT NULL REFERENCES raffle_orders(id),
  verification_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tickets_order_id_idx ON raffle_tickets(order_id);
