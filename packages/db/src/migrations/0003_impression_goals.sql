ALTER TABLE characters ADD COLUMN impression_book_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN short_term_goal_json TEXT;
ALTER TABLE characters ADD COLUMN long_term_goal_json TEXT;
ALTER TABLE characters ADD COLUMN liked TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN disliked TEXT NOT NULL DEFAULT '';
