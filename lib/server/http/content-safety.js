// lib/server/http/content-safety.js
// Content encoding, safe chatbot rich-text parsing, and external URL validation.
// Encodes user content by context, parses chatbot output into an inert AST,
// prohibits raw HTML, and enforces HTTPS/exact-host/provider/purpose allowlists.
import 'server-only';

/**
 * Per-purpose allowlists of approved external hostnames.
 * Hostnames are normalized to lowercase; comparison is exact.
 */
export const EXTERNAL_ALLOWLISTS = {
  images: ['res.cloudinary.com', 'lh3.googleusercontent.com'],
  links: ['sandyfeet.com'],
};

// ---------------------------------------------------------------------------
// Context-sensitive encoding
// ---------------------------------------------------------------------------

/**
 * HTML-entity encode characters dangerous in HTML text content.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Encode a value for safe use inside an HTML attribute (double-quoted).
 * @param {string} value
 * @returns {string}
 */
export function escapeAttribute(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Encode a value for safe embedding inside a JavaScript string literal (single-quoted).
 * @param {string} value
 * @returns {string}
 */
export function escapeJsString(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E');
}

// ---------------------------------------------------------------------------
// Chatbot rich-text parser → inert AST
// ---------------------------------------------------------------------------

/**
 * Determines whether a URL is safe for inclusion in the chatbot AST.
 * Only same-origin relative paths or approved HTTPS hosts are allowed.
 * @param {string} href
 * @returns {boolean}
 */
function isSafeLinkHref(href) {
  if (!href || typeof href !== 'string') return false;
  const trimmed = href.trim();

  // Allow relative same-origin paths (start with /)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    // Allow same app domain or approved link hosts
    return host === 'sandyfeet.com' || host === 'www.sandyfeet.com';
  } catch {
    return false;
  }
}

/**
 * Detect dangerous patterns: raw HTML tags, event handlers, script content,
 * dangerouslySetInnerHTML, or data/javascript URLs.
 */
const DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<style[\s>]/i,
  /<link[\s>]/i,
  /on\w+\s*=/i,
  /dangerouslysetinnerhtml/i,
  /javascript:/i,
  /data:\s*text\/html/i,
  /vbscript:/i,
];

/**
 * Checks if raw text contains dangerous HTML/scripting patterns.
 * @param {string} text
 * @returns {boolean}
 */
function containsDangerousContent(text) {
  return DANGEROUS_PATTERNS.some((re) => re.test(text));
}

/**
 * Parse inline formatting (emphasis, strong, links) from a single line segment.
 * Returns an array of inline AST nodes.
 * @param {string} text
 * @returns {Array<object>}
 */
function parseInlineFormatting(text) {
  const nodes = [];
  // Pattern: **bold**, *italic*, [text](url)
  const inlineRegex = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add any preceding plain text
    if (match.index > lastIndex) {
      const preceding = text.slice(lastIndex, match.index);
      if (preceding) nodes.push({ type: 'text', text: preceding });
    }

    if (match[1] !== undefined) {
      // **strong**
      nodes.push({ type: 'strong', text: match[1] });
    } else if (match[2] !== undefined) {
      // *emphasis*
      nodes.push({ type: 'emphasis', text: match[2] });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      // [text](url)
      const linkText = match[3];
      const href = match[4];
      if (isSafeLinkHref(href)) {
        nodes.push({ type: 'link', text: linkText, href: href.trim() });
      } else {
        // Unsafe link — render as plain text
        nodes.push({ type: 'text', text: linkText });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  // If nothing matched, return the whole text as a text node
  if (nodes.length === 0 && text.length > 0) {
    nodes.push({ type: 'text', text });
  }

  return nodes;
}

/**
 * Parse chatbot rich text into a documented inert AST.
 *
 * Only allows: paragraphs, line breaks, emphasis, strong, and safe links
 * (same-origin or approved HTTPS). Rejects raw HTML, dangerouslySetInnerHTML,
 * script tags, and event handlers by stripping to plain text.
 *
 * @param {string} rawText - The raw chatbot response text
 * @returns {Array<object>} Inert AST: array of paragraph/line-break nodes with children
 */
export function parseChatbotRichText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }];
  }

  // If the text contains dangerous patterns, strip all formatting and return plain text
  if (containsDangerousContent(rawText)) {
    // Remove any HTML tags entirely and return as plain text
    const stripped = rawText.replace(/<[^>]*>/g, '').trim();
    if (!stripped) {
      return [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }];
    }
    return [{ type: 'paragraph', children: [{ type: 'text', text: stripped }] }];
  }

  // Split by double newline into paragraphs
  const paragraphs = rawText.split(/\n{2,}/);
  const ast = [];

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    // Split by single newline into lines within the paragraph
    const lines = trimmedParagraph.split(/\n/);
    const children = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inlineNodes = parseInlineFormatting(line);
      children.push(...inlineNodes);

      // Add line-break between lines within a paragraph (not after last line)
      if (i < lines.length - 1) {
        children.push({ type: 'line-break' });
      }
    }

    if (children.length > 0) {
      ast.push({ type: 'paragraph', children });
    }
  }

  // Always return at least one paragraph
  if (ast.length === 0) {
    return [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }];
  }

  return ast;
}

// ---------------------------------------------------------------------------
// External URL validation
// ---------------------------------------------------------------------------

/**
 * Validate an external URL against per-purpose allowlists.
 *
 * Requirements:
 * - HTTPS required (except localhost in dev/test)
 * - Exact normalized hostname match against the purpose allowlist
 * - Rejects credentials (userinfo) in URL
 * - Normalizes hostname to lowercase for comparison
 *
 * @param {string} url - The URL to validate
 * @param {string} purpose - The allowlist purpose key ('images' | 'links')
 * @returns {{ valid: boolean, reason?: string, parsed?: URL }}
 */
export function validateExternalUrl(url, purpose) {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is required' };
  }

  if (!purpose || typeof purpose !== 'string') {
    return { valid: false, reason: 'Purpose is required' };
  }

  const allowlist = EXTERNAL_ALLOWLISTS[purpose];
  if (!allowlist) {
    return { valid: false, reason: `Unknown purpose: ${purpose}` };
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URL must not contain credentials' };
  }

  // Protocol check: HTTPS required in production; allow HTTP for localhost in dev/test
  const isDev = process.env.NODE_ENV !== 'production';
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (parsed.protocol !== 'https:') {
    if (!(isDev && isLocalhost && parsed.protocol === 'http:')) {
      return { valid: false, reason: 'URL must use HTTPS' };
    }
  }

  // Skip hostname allowlist check for localhost in dev
  if (isDev && isLocalhost) {
    return { valid: true, parsed };
  }

  // Normalize hostname for comparison (URL constructor already lowercases)
  const normalizedHost = parsed.hostname.toLowerCase();

  // Exact match against the purpose allowlist
  if (!allowlist.includes(normalizedHost)) {
    return { valid: false, reason: `Host '${normalizedHost}' is not approved for purpose '${purpose}'` };
  }

  return { valid: true, parsed };
}
