/**
 * tokens.js
 *
 * JWT tokens are now stored as httpOnly cookies set by the server.
 * JavaScript cannot read or write them — that's the whole point.
 *
 * These stubs exist so that any remaining import sites don't break during the
 * transition, but they are intentional no-ops.  All real token management
 * happens server-side via Set-Cookie response headers.
 */

export function getTokens()      { return null }
export function setTokens()      { /* server sets cookies */ }
export function clearTokens()    { /* server clears cookies via /auth/logout/ */ }
