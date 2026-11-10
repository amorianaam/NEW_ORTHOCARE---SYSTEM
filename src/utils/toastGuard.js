// src/utils/toastGuard.js
import { toast } from 'react-toastify';

/**
 * Global Toast Guard & Deduplicator
 * ─────────────────────────────────────────────────────────────────────────────
 * Prevents identical popup toasts (especially error and warning toasts) from
 * duplicating 2x or 4x across screens caused by React StrictMode remounts,
 * concurrent effect executions, or rapid failure cascades.
 */

const COOLDOWN_MS = 2500; // 2.5 seconds throttle window for identical toasts
const recentToasts = new Map();

/**
 * Extracts a clean canonical string key from content or options.
 */
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (Array.isArray(node)) return node.map(extractText).filter(Boolean).join(' ');
  if (typeof node === 'object' && node.props) {
    if (node.props.children) return extractText(node.props.children);
  }
  return '';
}

export function getToastKey(content, options) {
  if (options && options.toastId) {
    return String(options.toastId);
  }
  if (typeof content === 'string') {
    return content.trim();
  }
  if (typeof content === 'number') {
    return String(content);
  }
  const extracted = extractText(content);
  if (extracted) {
    return extracted;
  }
  return null;
}

/**
 * Checks if a toast with this key should be suppressed (active or throttled).
 */
function shouldSuppressToast(key) {
  if (!key) return false;

  const now = Date.now();

  // 1. Check if react-toastify already has an active toast on screen with this ID
  try {
    if (typeof toast.isActive === 'function' && toast.isActive(key)) {
      return true;
    }
  } catch (_) {}

  // 2. Check cooldown throttle window
  const lastTime = recentToasts.get(key);
  if (lastTime && (now - lastTime < COOLDOWN_MS)) {
    return true;
  }

  // Record this toast event
  recentToasts.set(key, now);

  // Periodic pruning of entries older than 10 seconds
  if (recentToasts.size > 100) {
    for (const [k, time] of recentToasts.entries()) {
      if (now - time > 10000) recentToasts.delete(k);
    }
  }

  return false;
}

// Store original methods to avoid recursion
const origError = toast.error?.bind(toast);
const origWarning = (toast.warning || toast.warn)?.bind(toast);
const origInfo = toast.info?.bind(toast);
const origSuccess = toast.success?.bind(toast);
const origLoading = toast.loading?.bind(toast);
const origDark = toast.dark?.bind(toast);

function createGuardedMethod(originalMethod) {
  if (!originalMethod) return originalMethod;
  return function (content, options = {}) {
    const key = getToastKey(content, options);
    if (shouldSuppressToast(key)) {
      // Suppress duplicate: return existing key without spawning a new toast popup
      return key || null;
    }
    const finalOptions = key ? { toastId: key, ...options } : options;
    return originalMethod(content, finalOptions);
  };
}

// Apply guard once to the react-toastify singleton instance
if (!toast.__isGuarded) {
  toast.__isGuarded = true;

  if (origError) toast.error = createGuardedMethod(origError);
  if (origWarning) {
    const guardedWarn = createGuardedMethod(origWarning);
    toast.warning = guardedWarn;
    toast.warn = guardedWarn;
  }
  if (origInfo) toast.info = createGuardedMethod(origInfo);
  if (origSuccess) toast.success = createGuardedMethod(origSuccess);
  if (origLoading) toast.loading = createGuardedMethod(origLoading);
  if (origDark) toast.dark = createGuardedMethod(origDark);
}

export default toast;
