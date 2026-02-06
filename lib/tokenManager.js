/**
 * Token Manager
 * 
 * Centralized token management with automatic refresh.
 * Ensures valid access tokens are always available for API calls.
 * 
 * Features:
 * - Proactive token refresh (before expiry)
 * - Background auto-refresh timer
 * - Automatic retry on refresh failure
 */

// Refresh token 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Auto-refresh interval (50 minutes)
const AUTO_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

// API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Auto-refresh timer ID
let autoRefreshTimer = null;

// Refresh in progress flag (prevent concurrent refreshes)
let isRefreshing = false;
let refreshPromise = null;

/**
 * Get auth data from localStorage
 */
function getAuthData() {
    if (typeof window === 'undefined') return null;
    const tokenData = localStorage.getItem('auditflow_auth');
    if (!tokenData) return null;
    try {
        return JSON.parse(tokenData);
    } catch {
        return null;
    }
}

/**
 * Save auth data to localStorage
 */
function saveAuthData(data) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('auditflow_auth', JSON.stringify(data));
}

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpired(bufferMs = REFRESH_BUFFER_MS) {
    const authData = getAuthData();
    if (!authData) return true;

    const expiresAt = authData.expires_at || authData.expiresAt;
    if (!expiresAt) {
        // No expiry info, assume valid but refresh soon
        return false;
    }

    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();

    return now >= (expiryTime - bufferMs);
}

/**
 * Refresh the access token using refresh_token
 */
async function refreshAccessToken() {
    const authData = getAuthData();
    if (!authData) {
        throw new Error('No auth data found');
    }

    const refreshToken = authData.refresh_token || authData.refreshToken;
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    console.log('[TokenManager] Refreshing access token...');

    const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Token refresh failed');
    }

    const newTokens = await response.json();

    // Update stored auth data with new tokens
    const updatedAuthData = {
        ...authData,
        access_token: newTokens.access_token,
        accessToken: newTokens.access_token,
        expires_at: newTokens.expires_at || (Date.now() + 3600000), // 1 hour default
        expiresAt: newTokens.expires_at || (Date.now() + 3600000),
    };

    saveAuthData(updatedAuthData);
    console.log('[TokenManager] Token refreshed successfully');

    return newTokens.access_token;
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function to use for all API calls
 */
export async function getValidAccessToken() {
    const authData = getAuthData();
    if (!authData) {
        throw new Error('Not authenticated');
    }

    // Check if token needs refresh
    if (isTokenExpired()) {
        // If already refreshing, wait for that to complete
        if (isRefreshing && refreshPromise) {
            console.log('[TokenManager] Waiting for ongoing refresh...');
            return refreshPromise;
        }

        // Start refresh
        isRefreshing = true;
        refreshPromise = refreshAccessToken()
            .finally(() => {
                isRefreshing = false;
                refreshPromise = null;
            });

        try {
            return await refreshPromise;
        } catch (err) {
            console.error('[TokenManager] Refresh failed:', err);
            throw err;
        }
    }

    // Token is still valid
    return authData.access_token || authData.accessToken;
}

/**
 * Start automatic background token refresh
 * Call this after successful login
 */
export function startAutoRefresh() {
    if (typeof window === 'undefined') return;

    // Clear any existing timer
    stopAutoRefresh();

    console.log('[TokenManager] Starting auto-refresh timer (every 50 minutes)');

    // Do initial check
    if (isTokenExpired()) {
        getValidAccessToken().catch(err => {
            console.error('[TokenManager] Initial refresh failed:', err);
        });
    }

    // Set up periodic refresh
    autoRefreshTimer = setInterval(async () => {
        try {
            console.log('[TokenManager] Auto-refresh triggered');
            await getValidAccessToken();
        } catch (err) {
            console.error('[TokenManager] Auto-refresh failed:', err);
        }
    }, AUTO_REFRESH_INTERVAL_MS);

    // Also refresh on page visibility change (when user returns to tab)
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Stop automatic background token refresh
 * Call this on logout
 */
export function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
        console.log('[TokenManager] Auto-refresh timer stopped');
    }

    if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
}

/**
 * Handle page visibility change - refresh token when user returns
 */
async function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('[TokenManager] Tab became visible, checking token...');
        try {
            await getValidAccessToken();
        } catch (err) {
            console.error('[TokenManager] Visibility refresh failed:', err);
        }
    }
}

/**
 * Force immediate token refresh
 */
export async function forceRefresh() {
    return refreshAccessToken();
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    const authData = getAuthData();
    return !!authData && !!(authData.access_token || authData.accessToken);
}

/**
 * Clear auth data (for logout)
 */
export function clearAuth() {
    stopAutoRefresh();
    if (typeof window !== 'undefined') {
        localStorage.removeItem('auditflow_auth');
    }
}
