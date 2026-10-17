-- Lifetime link click counts and community ratings.
-- Document IDs stay sha256(normalized URL) to match Firestore link_clicks / linkRatings.

CREATE TABLE IF NOT EXISTS link_clicks (
  hash TEXT PRIMARY KEY NOT NULL,
  url TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_count ON link_clicks (count DESC);

CREATE TABLE IF NOT EXISTS link_ratings (
  hash TEXT PRIMARY KEY NOT NULL,
  norm TEXT,
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS link_rating_votes (
  uid TEXT NOT NULL,
  hash TEXT NOT NULL,
  vote INTEGER NOT NULL,
  norm TEXT,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, hash)
);

CREATE INDEX IF NOT EXISTS idx_link_rating_votes_hash ON link_rating_votes (hash);
