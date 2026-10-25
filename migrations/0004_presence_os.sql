-- Coarse OS / OS-version rollups from presence heartbeats (not Sentry).

CREATE TABLE IF NOT EXISTS presence_os_daily (
  date TEXT NOT NULL,
  os TEXT NOT NULL,
  os_version TEXT NOT NULL,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  heartbeats INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, os, os_version)
);

CREATE INDEX IF NOT EXISTS idx_presence_os_daily_date ON presence_os_daily (date);
