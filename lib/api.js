/**
 * API Client
 * 
 * Centralized API calls to the backend
 */

import { getValidAccessToken, isAuthenticated } from './tokenManager';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Get auth headers with valid token
 */
async function getAuthHeaders() {
    if (typeof window === 'undefined') return {};
    if (!isAuthenticated()) return {};
    try {
        const accessToken = await getValidAccessToken();
        return {
            'Authorization': `Bearer ${accessToken}`,
        };
    } catch {
        return {};
    }
}

/**
 * Fetch with auth and error handling
 */
async function fetchAPI(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const authHeaders = await getAuthHeaders();
    const headers = {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Get current user info
 */
export async function getCurrentUser() {
    return fetchAPI('/auth/user');
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshToken) {
    return fetchAPI('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
}

/**
 * Submit audit
 */
export async function submitAudit(auditData, checklist, photos) {
    return fetchAPI('/api/audit/submit', {
        method: 'POST',
        body: JSON.stringify({ auditData, checklist, photos }),
    });
}
