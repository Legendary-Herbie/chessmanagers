import { Router } from 'express';
import { register, login, getMe, changePassword } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema, changePasswordSchema } from '../middleware/validate.js';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', validate(registerSchema), register);

// POST /api/v1/auth/login
router.post('/login', validate(loginSchema), login);

// GET /api/v1/auth/me — called by AuthProvider on mount to rehydrate session
router.get('/me', requireAuth, getMe);

// PATCH /api/v1/auth/password
router.patch('/password', requireAuth, validate(changePasswordSchema), changePassword);

export default router;