-- Add external track support fields to tracks table
ALTER TABLE tracks 
ADD COLUMN external_id TEXT,
ADD COLUMN external_source TEXT,
ADD COLUMN album_name TEXT,
ADD COLUMN image_url TEXT,
ADD COLUMN preview_url TEXT;

-- Allow fileUrl to be empty for external tracks
ALTER TABLE tracks ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE tracks ALTER COLUMN file_size DROP NOT NULL;

-- Set default values for existing records
UPDATE tracks SET file_size = COALESCE(file_size, 0) WHERE file_size IS NULL;