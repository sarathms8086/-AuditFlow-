/**
 * Google OAuth Configuration
 * Shared utilities for Google API authentication
 */

import { google } from 'googleapis';

// OAuth Scopes required for AuditFlow
export const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/presentations',
];

/**
 * Create OAuth2 client with credentials
 */
export function getOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

/**
 * Get OAuth2 client with access token set
 */
export function getAuthenticatedClient(accessToken) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
}

/**
 * Generate Google OAuth URL
 */
export function getAuthUrl() {
    const oauth2Client = getOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code) {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * Get user info from access token
 */
export async function getUserInfo(accessToken) {
    const oauth2Client = getAuthenticatedClient(accessToken);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data;
}
