ALTER TABLE mesas ADD COLUMN IF NOT EXISTS rotacao integer DEFAULT 0;
UPDATE mesas SET rotacao = 0 WHERE rotacao IS NULL;