-- Existing schema, retained as source-of-truth for future migrations.
-- Do not enable ticket sales until local gaming authorization, official rules,
-- payment-provider eligibility, and prize documentation are independently verified.
CREATE SEQUENCE IF NOT EXISTS entry_number_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS raffle_orders (
  id UUID PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','confirmed','void')),
  payment_reference TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  receipt_token TEXT UNIQUE,
  request_key TEXT UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS raffle_orders_receipt_token_idx ON raffle_orders(receipt_token) WHERE receipt_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS raffle_orders_request_key_idx ON raffle_orders(request_key) WHERE request_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS raffle_tickets (
  number BIGINT PRIMARY KEY DEFAULT nextval('entry_number_seq'),
  order_id UUID NOT NULL REFERENCES raffle_orders(id),
  verification_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tickets_order_id_idx ON raffle_tickets(order_id);
CREATE TABLE IF NOT EXISTS raffle_audit_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES raffle_orders(id),
  event_type TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS raffle_audit_order_idx ON raffle_audit_events(order_id,created_at DESC);
CREATE TABLE IF NOT EXISTS raffle_email_deliveries (
  order_id UUID PRIMARY KEY REFERENCES raffle_orders(id),
  status TEXT NOT NULL DEFAULT 'not_sent' CHECK(status IN ('not_sent','sent','failed')),
  provider_email_id TEXT,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_code TEXT
);

-- One-time auditable official drawing: cryptographic selection and no redraw.
CREATE TABLE IF NOT EXISTS raffle_draws (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
  winner_ticket BIGINT NOT NULL REFERENCES raffle_tickets(number),
  pool_size INTEGER NOT NULL CHECK (pool_size>0),
  selection_method TEXT NOT NULL DEFAULT 'node_crypto_randomInt',
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Isolated no-payment rehearsal system; no test tickets ever enter the real drawing.
CREATE TABLE IF NOT EXISTS raffle_demo_orders (
  id UUID PRIMARY KEY,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 2 AND 60),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);
CREATE SEQUENCE IF NOT EXISTS demo_ticket_number_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS raffle_demo_tickets (
  number BIGINT PRIMARY KEY DEFAULT nextval('demo_ticket_number_seq'),
  order_id UUID NOT NULL REFERENCES raffle_demo_orders(id),
  verification_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS demo_tickets_order_idx ON raffle_demo_tickets(order_id);

-- Track private organizer email deliveries independently for each recipient and event.
CREATE TABLE IF NOT EXISTS raffle_notification_deliveries (
 order_id UUID NOT NULL REFERENCES raffle_orders(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('reserved','verified')),
 recipient TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
 last_attempt_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 error_code TEXT,
 PRIMARY KEY(order_id,event_type,recipient)
);


-- Customer private receipt delivery: reserved number and verified ticket messages.
-- Never assume email sending means payment was received.
CREATE TABLE IF NOT EXISTS raffle_customer_mail (
 order_id UUID NOT NULL REFERENCES raffle_orders(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('reserved','verified')),
 status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
 last_attempt_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 error_code TEXT,
 PRIMARY KEY(order_id,event_type)
);
