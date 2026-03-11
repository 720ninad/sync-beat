import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getHistory, getStats } from '../controllers/history.controller';

const router = Router();

router.get('/', authMiddleware, getHistory);
router.get('/stats', authMiddleware, getStats);

export default router;