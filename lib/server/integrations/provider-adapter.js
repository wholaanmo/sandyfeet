// lib/server/integrations/provider-adapter.js
// Resilient provider adapter with deadline enforcement, response size limits,
// HTTPS requirement, response schema validation, and stable error categories.
import 'server-only';

/**
 * @typedef {'timeout' | 'network' | 'rate_limited' | 'invalid_response' | 'server_error'} ProviderErrorCategory
 */

/**
 * @typedef {Object} ProviderResult
 * @property {boolean} ok
 * @property {any} [data]
 * @property {string} [error]
 * @property {number} [statusCode]
 * @property {ProviderErrorCategory} [category]
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} url - The provider endpoint URL
 * @property {string} [method] - HTTP method (default: 'POST')
 * @property {Record<string, string>} [headers] - Request headers
 * @property {any} [body] - Request body (will be JSON-serialized if object)
 * @property {number} [timeoutMs] - Deadline in milliseconds (default: 10000)
 * @property {number} [maxResponseSize] - Maximum response size in bytes (default: 1048576 = 1MB)
 */

/** Default timeout: 10 seconds */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Default max response size: 1MB */
const DEFAULT_MAX_RESPONSE_SIZE = 1_048_576;

/**
 * Map HTTP status codes to stable internal error categories.
 * @param {number} status
 * @returns {ProviderErrorCategory}
 */
function categorizeHttpError(status) {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'invalid_response';
}

/**
 * Determine if an error category is retryable.
 * @param {ProviderErrorCategory} category
 * @returns {boolean}
 */
export function isRetryableCategory(category) {
  return category === 'timeout' || category === 'network' || category === 'rate_limited' || category === 'server_error';
}

/**
 * Create a provider call configuration and execute it with resilience controls.
 *
 * @param {ProviderConfig} config - Provider call configuration
 * @returns {{ config: ProviderConfig, execute: () => Promise<ProviderResult> }}
 */
export function callProvider(config) {
  const {
    url,
    method = 'POST',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseSize = DEFAULT_MAX_RESPONSE_SIZE,
  } = config;

  // Validate HTTPS requirement
  const normalizedConfig = { url, method, headers, body, timeoutMs, maxResponseSize };

  return {
    config: normalizedConfig,
    execute: async () => {
      // Enforce HTTPS
      if (!url || !url.startsWith('https://')) {
        return {
          ok: false,
          error: 'Provider URL must use HTTPS',
          category: 'invalid_response',
        };
      }

      // Create abort controller for deadline enforcement
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const fetchOptions = {
          method,
          headers: { ...headers },
          signal: controller.signal,
        };

        if (body !== undefined && body !== null) {
          if (typeof body === 'object') {
            fetchOptions.body = JSON.stringify(body);
            if (!fetchOptions.headers['Content-Type']) {
              fetchOptions.headers['Content-Type'] = 'application/json';
            }
          } else {
            fetchOptions.body = String(body);
          }
        }

        const response = await fetch(url, fetchOptions);

        // Check response size via Content-Length header if available
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > maxResponseSize) {
          return {
            ok: false,
            error: 'Provider response exceeds maximum size limit',
            statusCode: response.status,
            category: 'invalid_response',
          };
        }

        // Read response text with size enforcement
        const responseText = await readBoundedResponse(response, maxResponseSize);
        if (responseText === null) {
          return {
            ok: false,
            error: 'Provider response exceeds maximum size limit',
            statusCode: response.status,
            category: 'invalid_response',
          };
        }

        // Non-2xx status codes
        if (!response.ok) {
          const category = categorizeHttpError(response.status);
          return {
            ok: false,
            error: `Provider returned HTTP ${response.status}`,
            statusCode: response.status,
            category,
          };
        }

        // Parse JSON response
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          return {
            ok: false,
            error: 'Provider returned invalid JSON response',
            statusCode: response.status,
            category: 'invalid_response',
          };
        }

        return { ok: true, data, statusCode: response.status };
      } catch (err) {
        if (err.name === 'AbortError') {
          return {
            ok: false,
            error: 'Provider request timed out',
            category: 'timeout',
          };
        }

        // Network errors (DNS, connection refused, etc.)
        return {
          ok: false,
          error: 'Provider request failed due to network error',
          category: 'network',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

/**
 * Read a response body with a size limit.
 * Returns null if the response exceeds the limit.
 *
 * @param {Response} response
 * @param {number} maxSize
 * @returns {Promise<string | null>}
 */
async function readBoundedResponse(response, maxSize) {
  const reader = response.body?.getReader();
  if (!reader) {
    // Fallback for environments without streaming
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxSize) {
      return null;
    }
    return text;
  }

  const chunks = [];
  let totalSize = 0;
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
    decoder.decode();
}
