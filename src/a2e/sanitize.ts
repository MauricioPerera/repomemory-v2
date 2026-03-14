/**
 * A2E secret sanitization utilities.
 *
 * Prevents credentials from being persisted in memory when saving
 * A2E workflow patterns. Four layers of protection:
 *
 * 1. Known secrets (from config) — exact value replacement with {{VAR}} placeholders
 * 2. Heuristic URL — common auth query param names redacted automatically
 * 3. Heuristic JSON — sensitive keys in body/headers objects redacted
 * 4. Heuristic patterns — values that look like tokens (sk-, Bearer, high entropy)
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

/** JSON field names that typically contain credentials */
const SENSITIVE_JSON_KEYS = new Set([
  'authorization', 'api_key', 'apikey', 'api-key', 'x-api-key',
  'token', 'access_token', 'secret', 'password', 'client_secret',
  'auth_token', 'bearer', 'secret_key', 'private_key', 'signing_key',
]);

/** Value prefixes that indicate a credential */
const CREDENTIAL_PREFIXES = [
  'Bearer ', 'Basic ', 'Token ',
  'sk-', 'pk-', 'rk-',       // OpenAI, Stripe, etc.
  'ghp_', 'gho_', 'ghs_',    // GitHub
  'xoxb-', 'xoxp-',          // Slack
  'sk-ant-',                  // Anthropic
  'eyJ',                      // JWT (base64 JSON)
];

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

  // Pass 3: Heuristic — redact sensitive JSON keys in body/headers
  // Matches "key": "value" patterns where key is a known credential field
  result = result.replace(/"([^"]+)"\s*:\s*"([^"]{4,})"/g, (match, key, val) => {
    if (val.startsWith('{{')) return match; // already a placeholder
    if (val.startsWith('/workflow/')) return match; // data path, not a secret
    if (SENSITIVE_JSON_KEYS.has(key.toLowerCase())) {
      return `"${key}":"{{${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}}}"`;
    }
    return match;
  });

  // Pass 4: Heuristic — redact values that look like credentials by prefix
  for (const prefix of CREDENTIAL_PREFIXES) {
    // Match the prefix followed by at least 8 non-whitespace/non-quote chars
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`"(${escaped}[^"\\s]{8,})"`, 'g');
    result = result.replace(re, (_, val) => {
      if (val.startsWith('{{')) return `"${val}"`;
      return `"{{REDACTED_${prefix.replace(/[^A-Za-z]/g, '').toUpperCase()}}}"`;
    });
  }

  return result;
}

/** Exported for testing */
export { SENSITIVE_PARAMS, SENSITIVE_JSON_KEYS, CREDENTIAL_PREFIXES };
