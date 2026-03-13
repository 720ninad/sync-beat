-- Update existing external tracks to ensure they have proper preview URLs
-- This is a one-time migration to fix tracks that were added before preview URL support

-- Note: This migration would need to be run manually as we can't automatically 
-- retrieve preview URLs for existing tracks without re-searching them.

-- For now, we'll just ensure the column exists and is properly set up
-- Users will need to re-add external tracks to get preview functionality

-- Check if any external tracks exist without preview URLs
SELECT COUNT(*) as external_tracks_without_preview 
FROM tracks 
WHERE mime_type = 'external' 
AND (preview_url IS NULL OR preview_url = '');

-- Optional: Remove external tracks without preview URLs (uncomment if needed)
-- DELETE FROM tracks WHERE mime_type = 'external' AND (preview_url IS NULL OR preview_url = '');

-- Add an index for better performance on external track queries
CREATE INDEX IF NOT EXISTS idx_tracks_external_source ON tracks(external_source) WHERE mime_type = 'external';