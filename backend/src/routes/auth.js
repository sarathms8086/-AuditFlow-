/**
 * Auth Routes
 * 
 * Handles Google OAuth flow:
 * - GET /auth/google - Redirect to Google login
 * - GET /auth/callback - Handle OAuth callback
 * - GET /auth/user - Get current user info
 * - POST /auth/refresh - Refresh access token
 */

import { Router } from 'express';
import {
    getAuthUrl,
    getTokensFromCode,
    getUserInfo,
    refreshAccessToken,
} from '../services/google/auth.js';

const router = Router();

/**
 * GET /auth/google
 * Redirect user to Google OAuth consent screen
 */
router.get('/google', (req, res) => {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle OAuth callback from Google
 * Returns tokens to frontend via redirect with tokens in URL hash
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error)}`);
        }

        if (!code) {
            return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=No+authorization+code`);
        }

        // Exchange code for tokens
        const tokens = await getTokensFromCode(code);

        // Get user info
        const user = await getUserInfo(tokens.access_token);

        // Redirect to frontend with tokens and user info in URL fragment (more secure than query)
        const tokenData = encodeURIComponent(JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expiry_date,
            user,
        }));

        res.redirect(`${process.env.FRONTEND_URL}/auth/success#token=${tokenData}`);
    } catch (err) {
        console.error('[AUTH] Callback error:', err);
        res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(err.message)}`);
    }
});

/**
 * GET /auth/user
 * Get current user info from access token
 */
router.get('/user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No access token provided' });
        }

        const accessToken = authHeader.split(' ')[1];
        const user = await getUserInfo(accessToken);

        res.json(user);
    } catch (err) {
        console.error('[AUTH] Get user error:', err);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const newTokens = await refreshAccessToken(refresh_token);

        res.json({
            access_token: newTokens.access_token,
            expires_in: newTokens.expiry_date,
        });
    } catch (err) {
        console.error('[AUTH] Refresh error:', err);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
});

export default router;
