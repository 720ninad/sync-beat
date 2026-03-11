import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { registerToken } from '../controllers/notifications.controller';

const router = Router();

router.post('/register', authMiddleware, registerToken);

export default router;