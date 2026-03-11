import { Router } from 'express';
import { sendOtp, verifyOtp, resetPassword } from '../controllers/forgot-password.controller';

const router = Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;