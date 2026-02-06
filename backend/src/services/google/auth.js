/**
 * Google OAuth Authentication Service
 * 
 * Handles OAuth 2.0 flow for Google APIs.
 * Tokens are returned to frontend for storage (no server-side sessions in DB-less design).
 */

import { google } from 'googleapis';

// OAuth2 scopes needed for Drive, Sheets, and Slides
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.file',           // Create/edit files
    'https://www.googleapis.com/auth/spreadsheets',          // Full Sheets access
    'https://www.googleapis.com/auth/presentations',         // Full Slides access
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
 * Generate Google OAuth authorization URL
 */
export function getAuthUrl() {
    const oauth2Client = getOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Force consent to always get refresh token
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
 * Get authenticated OAuth2 client using access token
 */
export function getAuthenticatedClient(accessToken, refreshToken = null) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
    return oauth2Client;
}

/**
 * Get user info from Google
 */
export async function getUserInfo(accessToken) {
    const oauth2Client = getAuthenticatedClient(accessToken);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return {
        id: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture,
    };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken) {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
}
