import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    changePassword,
    completePasswordReset,
    forgotPassword,
    getMe,
    googleCallback,
    googleStart,
    login,
    logout,
    logoutAll,
    refresh,
    register,
    resendEmailVerification,
    softDeleteAccount,
    verifyEmail,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import {
    changePasswordSchema,
    deleteAccountSchema,
    emptyBodySchema,
    loginSchema,
    oauthCallbackQuerySchema,
    oauthStartQuerySchema,
    passwordResetCompleteSchema,
    passwordResetRequestSchema,
    registerSchema,
    resendVerificationSchema,
    validate,
    validateRequest,
    verificationTokenSchema,
} from '../middleware/validate.js';
import { requireCsrf } from '../services/SessionService.js';

const limiter = (windowMs, max) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

export const loginLimiter = limiter(15 * 60 * 1000, 10);
export const registrationLimiter = limiter(60 * 60 * 1000, 5);
export const recoveryLimiter = limiter(60 * 60 * 1000, 5);
export const tokenLimiter = limiter(15 * 60 * 1000, 30);

const router = Router();

router.post('/register', registrationLimiter, validate(registerSchema), register);
router.post('/verify-email', tokenLimiter, validate(verificationTokenSchema), verifyEmail);
router.post('/resend-verification', recoveryLimiter, validate(resendVerificationSchema), resendEmailVerification);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', tokenLimiter, requireCsrf, validate(emptyBodySchema), refresh);
router.post('/logout', requireCsrf, validate(emptyBodySchema), logout);
router.post('/logout-all', requireAuth, requireCsrf, validate(emptyBodySchema), logoutAll);
router.get('/me', requireAuth, getMe);
router.patch('/password', requireAuth, requireCsrf, validate(changePasswordSchema), changePassword);
router.post('/forgot-password', recoveryLimiter, validate(passwordResetRequestSchema), forgotPassword);
router.post('/reset-password', recoveryLimiter, validate(passwordResetCompleteSchema), completePasswordReset);
router.delete('/account', requireAuth, requireCsrf, validate(deleteAccountSchema), softDeleteAccount);
router.get('/google/start', tokenLimiter, validateRequest({ query: oauthStartQuerySchema }), googleStart);
router.get('/google/callback', tokenLimiter, validateRequest({ query: oauthCallbackQuerySchema }), googleCallback);

export default router;
