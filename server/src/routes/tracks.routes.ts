import { Router } from 'express';
import multer from 'multer';
import {
    uploadTrack,
    getMyTracks,
    getPublicTracks,
    getLikedTracks,
    likeTrack,
    unlikeTrack,
    deleteTrack,
    searchExternalTracks,
    addExternalTrack,
} from '../controllers/tracks.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.use(authMiddleware);

router.post('/', upload.single('file'), uploadTrack);
router.get('/my', getMyTracks);
router.get('/public', getPublicTracks);
router.get('/liked', getLikedTracks);
router.get('/search', searchExternalTracks);        // New: Search external tracks
router.post('/external', addExternalTrack);         // New: Add external track to library
router.post('/:id/like', likeTrack);
router.delete('/:id/like', unlikeTrack);
router.delete('/:id', deleteTrack);

export default router;