/**
 * A2E secret sanitization utilities.
 *
 * Prevents credentials from being persisted in memory when saving
 * A2E workflow patterns. Two layers of protection:
 *
 * 1. Known secrets (from config) — exact value replacement with {{VAR}} placeholders
 * 2. Heuristic — common auth query param names redacted automatically
 *
 * Reference: A2E Protocol Specification v1.0.0
 * https://github.com/MauricioPerera/a2e
 */

/** Query param names that typically contain credentials */
const SENSITIVE_PARAMS = new Set([
  'apikey', 'api_key', 'key', 'token', 'access_token', 'secret',
  'password', 'appid', 'app_key', 'client_secret', 'auth',
  'api-key', 'x-api-key', 'client_id', 'app_id',
]);

/**
 * Resolve {{VAR}} placeholders in text using a secrets map.
 * Used before executing an A2E workflow so the server receives real values.
 *
 * @param text - Text potentially containing {{VAR}} placeholders
 * @param secrets - Map of variable names to secret values
 * @returns Text with placeholders replaced by actual values
 */
export function resolveSecrets(text: string, secrets: Record<string, string>): string {
  if (!text || Object.keys(secrets).length === 0) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(secrets, name) ? secrets[name] : match;
  });
}

/**
 * Sanitize secrets from text before saving to memory.
 *
 * Two-pass approach:
 * 1. Replace known secret values (from config) back to {{VAR}} placeholders.
 *    Sorted by length descending to avoid partial matches.
 * 2. Heuristically redact common auth query params in URLs.
 *    Only redacts values that are not already placeholders.
 *
 * @param text - Text potentially containing secret values (workflow tags, URLs, bodies)
 * @param secrets - Map of variable names to secret values
 * @returns Sanitized text safe for memory persistence
 */
export function sanitizeSecrets(text: string, secrets: Record<string, string>): string {
  let result = text;

  // Pass 1: Replace known secret values with their placeholder names
  const entries = Object.entries(secrets)
    .filter(([, v]) => v && v.length >= 4)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [name, value] of entries) {
    result = result.replaceAll(value, `{{${name}}}`);
  }

  // Pass 2: Heuristic — redact sensitive query params in URLs
  // Uses string manipulation instead of URL API to avoid encoding {{VAR}} as %7B%7B
  result = result.replace(/https?:\/\/[^\s\]"]+/g, (url) => {
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return url;

    const base = url.slice(0, qIdx);
    const queryStr = url.slice(qIdx + 1);
    const params = queryStr.split('&');
    let changed = false;

    const newParams = params.map(param => {
      const eqIdx = param.indexOf('=');
      if (eqIdx === -1) return param;
      const paramKey = param.slice(0, eqIdx);
      const val = param.slice(eqIdx + 1);
      if (SENSITIVE_PARAMS.has(paramKey.toLowerCase()) && !val.startsWith('{{')) {
        changed = true;
        return `${paramKey}={{${paramKey.toUpperCase()}}}`;
      }
      return param;
    });

    return changed ? `${base}?${newParams.join('&')}` : url;
  });

  return result;
}

/** Exported for testing */
export { SENSITIVE_PARAMS };
