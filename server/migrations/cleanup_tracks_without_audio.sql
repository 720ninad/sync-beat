-- Clean up external tracks that have no audio URLs
-- These tracks cannot be played and should be removed

-- First, let's see how many tracks we have without audio
SELECT 
    COUNT(*) as total_external_tracks,
    COUNT(CASE WHEN preview_url IS NULL OR preview_url = '' THEN 1 END) as tracks_without_audio,
    COUNT(CASE WHEN preview_url IS NOT NULL AND preview_url != '' THEN 1 END) as tracks_with_audio
FROM tracks 
WHERE mime_type = 'external';

-- Remove external tracks that have no audio URL
DELETE FROM tracks 
WHERE mime_type = 'external' 
AND (preview_url IS NULL OR preview_url = '');

-- Show remaining external tracks
SELECT 
    title, 
    artist, 
    external_source, 
    CASE 
        WHEN preview_url IS NOT NULL AND preview_url != '' THEN 'Has Audio'
        ELSE 'No Audio'
    END as audio_status
FROM tracks 
WHERE mime_type = 'external'
ORDER BY created_at DESC;