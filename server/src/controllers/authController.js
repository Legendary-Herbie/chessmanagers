import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User.js';
import env from '../config/env.js';

const { JWT_SECRET, JWT_EXPIRES_IN = '7d' } = env;

const signToken = (user) =>
    jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            playerId: user.player_id ?? null,
            linkStatus: user.link_status ?? null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

// POST /api/v1/auth/register
export async function register(req, res, next) {
    try {
        const { email,name, password } = req.body;

        if (!email || !name || !password) {
            return res.status(400).json({ error: 'Email, name, and password are required.' });
        }

        const existingemail = await UserModel.findByEmail(email);
        if (existingemail) {
            return res.status(409).json({ error: 'An account with that email already exists.' });
        }

        const existingname = await UserModel.findByName(name);
        if (existingname) {
            return res.status(409).json({ error: 'An account with that name already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await UserModel.create({ email, name, passwordHash });

        const token = signToken(user);

        res.status(201).json({
            token,
            user: {
                id:         user.id,
                email:      user.email,
                name:       user.name,
                role:       user.role,
                playerId:   null,
                linkStatus: null,
            },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/auth/login
export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await UserModel.findByEmail(email);
        // Use a constant-time compare regardless of whether user exists
        // to prevent user enumeration via timing attacks.
        const passwordHash = user?.password_hash ?? '$2b$12$invalidhashfortimingprotection';
        const valid = await bcrypt.compare(password, passwordHash);

        if (!user || !valid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = signToken(user);

        res.json({
            token,
            user: {
                id:         user.id,
                email:      user.email,
                name:       user.name,
                role:       user.role,
                playerId:   user.player_id   ?? null,
                linkStatus: user.link_status ?? null,
            },
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/auth/me
// Validates the stored JWT and returns fresh user data.
// Called by AuthProvider on mount to rehydrate session.
export async function getMe(req, res, next) {
    try {
        // req.user is attached by the auth middleware
        const user = await UserModel.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({
            user: {
                id:         user.id,
                email:      user.email,
                name:       user.name,
                role:       user.role,
                playerId:   user.player_id   ?? null,
                linkStatus: user.link_status ?? null,
            },
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/auth/password
export async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }

        const user = await UserModel.findById(req.user.id);
        const valid = await bcrypt.compare(currentPassword, user.password_hash);

        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        await UserModel.updatePassword(user.id, passwordHash);

        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        next(err);
    }
}