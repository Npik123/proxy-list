-- Presence aggregates (replaces Firestore presence_daily / monthly / yearly).

CREATE TABLE IF NOT EXISTS presence_daily (
  date TEXT PRIMARY KEY NOT NULL,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  signed_in_uniques INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS presence_hour (
  date TEXT NOT NULL,
  hour TEXT NOT NULL,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  uniques INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, hour)
);

CREATE INDEX IF NOT EXISTS idx_presence_hour_date ON presence_hour (date);

CREATE TABLE IF NOT EXISTS presence_period (
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, period)
);

CREATE TABLE IF NOT EXISTS presence_user_totals (
  uid_hash TEXT PRIMARY KEY NOT NULL,
  label TEXT,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  days_active INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);
