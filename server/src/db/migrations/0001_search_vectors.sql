-- Add search_vector columns
ALTER TABLE cards ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN indexes
CREATE INDEX IF NOT EXISTS cards_search_idx ON cards USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS comments_search_idx ON comments USING GIN (search_vector);

-- Cards trigger function
CREATE OR REPLACE FUNCTION cards_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cards_search_vector_trigger ON cards;
CREATE TRIGGER cards_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description ON cards
  FOR EACH ROW EXECUTE FUNCTION cards_search_vector_update();

-- Comments trigger function
CREATE OR REPLACE FUNCTION comments_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comments_search_vector_trigger ON comments;
CREATE TRIGGER comments_search_vector_trigger
  BEFORE INSERT OR UPDATE OF body ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_search_vector_update();

-- Backfill existing rows
UPDATE cards SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');

UPDATE comments SET search_vector = to_tsvector('english', coalesce(body, ''));
