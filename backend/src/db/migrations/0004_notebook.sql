CREATE TABLE notebook_entries (
  world_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (world_id, character_id, id),
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
CREATE INDEX notebook_char_idx ON notebook_entries(world_id, character_id);
