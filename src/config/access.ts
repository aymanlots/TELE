/**
 * Application Access Security Configuration
 *
 * The 6-digit PIN is defined by the owner at first launch and stored exclusively
 * as a PBKDF2-SHA256 hash with a random 16-byte salt (120,000 iterations >= 100,000)
 * in both IndexedDB (settings) and localStorage.
 * No default PIN or hardcoded hash exists in the source code.
 */

/**
 * Remember device duration (30 days in milliseconds)
 */
export const REMEMBER_DEVICE_DAYS = 30;
export const REMEMBER_DEVICE_MS = REMEMBER_DEVICE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Maximum failed attempts before temporary lockout
 */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Lockout duration after 5 failed attempts (5 minutes in milliseconds)
 */
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

/**
 * Default auto-lock inactivity duration in minutes
 */
export const DEFAULT_AUTO_LOCK_MINUTES = 10;
