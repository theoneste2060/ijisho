-- Agronomists who registered on the web. Only 'approved' ones are shown to farmers.
CREATE TABLE agronomists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,              -- digits only, international, e.g. 250781234567
  role TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  districts TEXT NOT NULL,          -- JSON array of district names
  languages TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',    -- optional message to the admin
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE UNIQUE INDEX agronomists_phone ON agronomists(phone);
CREATE INDEX agronomists_status ON agronomists(status);

-- Leaf photos a farmer chose to send to an agronomist. Deleted automatically after expires_at.
CREATE TABLE cases (
  id TEXT PRIMARY KEY,              -- long random id: the photo link is the only way to see it
  photo BLOB NOT NULL,
  result TEXT NOT NULL,
  confidence REAL NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  district TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX cases_expires ON cases(expires_at);

-- Simple fixed-window rate limits.
CREATE TABLE rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
