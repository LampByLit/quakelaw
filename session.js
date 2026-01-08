// Session Management
// Generates and manages unique session IDs for each browser tab/session
// Uses sessionStorage so sessions are fresh on each browser restart

let currentSessionId = null;

// Generate a unique session ID
function generateSessionId() {
    // Use crypto.randomUUID if available, otherwise fallback to timestamp + random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return 'session-' + crypto.randomUUID();
    }
    // Fallback: timestamp + random string
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
}

// Get or create session ID
function getSessionId() {
    if (currentSessionId) {
        return currentSessionId;
    }
    
    // Try to get from sessionStorage (fresh each tab)
    const stored = sessionStorage.getItem('gameSessionId');
    if (stored) {
        currentSessionId = stored;
        return currentSessionId;
    }
    
    // New session - clean up any previous session's conversations
    // This handles page refresh case where sessionStorage is cleared
    cleanupPreviousSessionOnRefresh();
    
    // Generate new session ID
    currentSessionId = generateSessionId();
    sessionStorage.setItem('gameSessionId', currentSessionId);
    return currentSessionId;
}

// Cleanup previous session on page refresh
// Since sessionStorage clears on refresh, we need to track the previous session ID
// and clean it up when a new session starts
function cleanupPreviousSessionOnRefresh() {
    // Check if there's a previous session ID stored in a way that persists refresh
    // We'll use a hidden input or localStorage with a flag to track the last session
    const lastSessionId = localStorage.getItem('lastSessionId');
    if (lastSessionId) {
        // Clean up the previous session's conversations
        fetch(`/api/npc/conversations/${encodeURIComponent(lastSessionId)}`, {
            method: 'DELETE',
            keepalive: true
        }).catch(() => {
            // Silently fail - cleanup is best effort
        });
        // Clear the stored last session ID
        localStorage.removeItem('lastSessionId');
    }
}

// Store current session ID for cleanup on next refresh
function storeSessionForCleanup() {
    const sessionId = getSessionId();
    if (sessionId) {
        localStorage.setItem('lastSessionId', sessionId);
    }
}

// Clear session (used on game reset)
function clearSession() {
    currentSessionId = null;
    sessionStorage.removeItem('gameSessionId');
}

// Cleanup session on browser close
function cleanupSessionOnClose() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    
    // Send cleanup request (use fetch with keepalive for reliability on page unload)
    try {
        const url = `/api/npc/conversations/${encodeURIComponent(sessionId)}`;
        // Use fetch with keepalive flag for better reliability during page unload
        fetch(url, { 
            method: 'DELETE', 
            keepalive: true 
        }).catch(() => {
            // Silently fail - cleanup is best effort
        });
    } catch (error) {
        // Silently fail - cleanup is best effort
        console.debug('Session cleanup failed:', error);
    }
}

// Initialize session cleanup on page unload
if (typeof window !== 'undefined') {
    // Store session ID before unload so we can clean it up on refresh
    window.addEventListener('beforeunload', () => {
        storeSessionForCleanup();
        cleanupSessionOnClose();
    });
    window.addEventListener('pagehide', () => {
        storeSessionForCleanup();
        cleanupSessionOnClose();
    });
    
    // Clean up previous session on page load (handles refresh case)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanupPreviousSessionOnRefresh);
    } else {
        cleanupPreviousSessionOnRefresh();
    }
}

