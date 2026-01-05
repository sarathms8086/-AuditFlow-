/**
 * Auth API Route - Redirect to Google OAuth
 * GET /api/auth/google
 */

import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google/auth';

export async function GET() {
    try {
        const authUrl = getAuthUrl();
        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('Auth error:', error);
        return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
    }
}
