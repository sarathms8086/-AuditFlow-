/**
 * Auth Callback API Route
 * GET /api/auth/callback
 * 
 * Handles Google OAuth callback, exchanges code for tokens
 */

import { NextResponse } from 'next/server';
import { getTokensFromCode, getUserInfo } from '@/lib/google/auth';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent(error)}`);
        }

        if (!code) {
            return NextResponse.json({ error: 'No authorization code received' }, { status: 400 });
        }

        // Exchange code for tokens
        const tokens = await getTokensFromCode(code);

        // Get user info
        const userInfo = await getUserInfo(tokens.access_token);

        // Prepare auth data for frontend
        const authData = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + (tokens.expiry_date || 3600000),
            user: {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
            },
        };

        // Redirect to frontend with token in hash
        const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || '';
        const tokenParam = encodeURIComponent(JSON.stringify(authData));

        return NextResponse.redirect(`${frontendUrl}/auth/success#token=${tokenParam}`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || '';
        return NextResponse.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
}
