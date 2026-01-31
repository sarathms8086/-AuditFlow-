'use client';

/**
 * Mobile Debug Panel
 * 
 * Shows debug logs directly on screen for mobile testing.
 * Tap the floating button to toggle visibility.
 */

import { useState, useEffect } from 'react';

// Global log storage
let debugLogs = [];
let logListeners = [];

// Override console.log for [DEBUG] messages
if (typeof window !== 'undefined') {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const addLog = (type, args) => {
        const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        if (message.includes('[DEBUG]') || message.includes('[UPLOAD]')) {
            const entry = {
                id: Date.now() + Math.random(),
                type,
                message: message.substring(0, 200), // Truncate for display
                time: new Date().toLocaleTimeString(),
            };
            debugLogs.push(entry);
            if (debugLogs.length > 50) debugLogs.shift(); // Keep last 50
            logListeners.forEach(cb => cb([...debugLogs]));
        }
    };

    console.log = (...args) => {
        originalLog.apply(console, args);
        addLog('log', args);
    };

    console.warn = (...args) => {
        originalWarn.apply(console, args);
        addLog('warn', args);
    };

    console.error = (...args) => {
        originalError.apply(console, args);
        addLog('error', args);
    };
}

export function MobileDebugPanel() {
    const [visible, setVisible] = useState(false);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        setLogs([...debugLogs]);
        const listener = (newLogs) => setLogs(newLogs);
        logListeners.push(listener);
        return () => {
            logListeners = logListeners.filter(l => l !== listener);
        };
    }, []);

    return (
        <>
            {/* Floating debug button */}
            <button
                onClick={() => setVisible(!visible)}
                style={{
                    position: 'fixed',
                    bottom: '80px',
                    right: '10px',
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: visible ? '#ef4444' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    fontSize: '20px',
                    zIndex: 9999,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                }}
            >
                {visible ? '✕' : '🐛'}
            </button>

            {/* Debug panel */}
            {visible && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '140px',
                        left: '10px',
                        right: '10px',
                        maxHeight: '50vh',
                        backgroundColor: '#1e1e1e',
                        color: '#00ff00',
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        padding: '10px',
                        borderRadius: '8px',
                        zIndex: 9998,
                        overflow: 'auto',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    }}
                >
                    <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                        <strong>Debug Logs ({logs.length})</strong>
                        <button
                            onClick={() => {
                                debugLogs = [];
                                setLogs([]);
                            }}
                            style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                            }}
                        >
                            Clear
                        </button>
                    </div>
                    {logs.length === 0 ? (
                        <div style={{ color: '#888' }}>No debug logs yet. Try uploading a photo...</div>
                    ) : (
                        logs.map((log) => (
                            <div
                                key={log.id}
                                style={{
                                    marginBottom: '4px',
                                    padding: '4px',
                                    backgroundColor: log.type === 'error' ? '#4a1515' : log.type === 'warn' ? '#4a4a15' : '#15251a',
                                    borderRadius: '4px',
                                    wordBreak: 'break-word',
                                }}
                            >
                                <span style={{ color: '#888' }}>[{log.time}]</span>{' '}
                                <span style={{ color: log.type === 'error' ? '#ff6b6b' : log.type === 'warn' ? '#ffeb3b' : '#00ff00' }}>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </>
    );
}
