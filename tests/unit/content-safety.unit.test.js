import { describe, it, expect, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

import {
  escapeHtml,
  escapeAttribute,
  escapeJsString,
  parseChatbotRichText,
  validateExternalUrl,
  EXTERNAL_ALLOWLISTS,
} from '../../lib/server/http/content-safety.js';

describe('lib/server/http/content-safety.js', () => {
  // ---------------------------------------------------------------------------
  // escapeHtml
  // ---------------------------------------------------------------------------
  describe('escapeHtml', () => {
    it('encodes < > " \' & characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('encodes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('passes through safe text unchanged', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    it('returns empty string for non-string input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(123)).toBe('');
    });

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('encodes all ampersands', () => {
      expect(escapeHtml('a&b&c')).toBe('a&amp;b&amp;c');
    });
  });

  // ---------------------------------------------------------------------------
  // escapeAttribute
  // ---------------------------------------------------------------------------
  describe('escapeAttribute', () => {
    it('encodes characters dangerous in attributes', () => {
      expect(escapeAttribute('" onmouseover="alert(1)')).toBe(
        '&quot; onmouseover=&quot;alert(1)'
      );
    });

    it('encodes < and > in attribute values', () => {
      expect(escapeAttribute('<img>')).toBe('&lt;img&gt;');
    });

    it('returns empty string for non-string input', () => {
      expect(escapeAttribute(42)).toBe('');
      expect(escapeAttribute(null)).toBe('');
    });

    it('passes through safe attribute values', () => {
      expect(escapeAttribute('hello-world_123')).toBe('hello-world_123');
    });
  });

  // ---------------------------------------------------------------------------
  // escapeJsString
  // ---------------------------------------------------------------------------
  describe('escapeJsString', () => {
    it('escapes backslashes', () => {
      expect(escapeJsString('a\\b')).toBe('a\\\\b');
    });

    it('escapes single and double quotes', () => {
      expect(escapeJsString("it's \"great\"")).toBe("it\\'s \\\"great\\\"");
    });

    it('escapes newlines, carriage returns, and tabs', () => {
      expect(escapeJsString('a\nb\rc\td')).toBe('a\\nb\\rc\\td');
    });

    it('escapes line/paragraph separators', () => {
      expect(escapeJsString('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
    });

    it('escapes < and > to prevent script injection in inline JS', () => {
      expect(escapeJsString('</script>')).toBe('\\u003C/script\\u003E');
    });

    it('returns empty string for non-string input', () => {
      expect(escapeJsString(undefined)).toBe('');
      expect(escapeJsString(123)).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // parseChatbotRichText
  // ---------------------------------------------------------------------------
  describe('parseChatbotRichText', () => {
    it('parses plain text into a paragraph with text node', () => {
      const result = parseChatbotRichText('Hello world');
      expect(result).toEqual([
        { type: 'paragraph', children: [{ type: 'text', text: 'Hello world' }] },
      ]);
    });

    it('parses **bold** into strong nodes', () => {
      const result = parseChatbotRichText('This is **important**');
      expect(result).toEqual([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'This is ' },
            { type: 'strong', text: 'important' },
          ],
        },
      ]);
    });

    it('parses *italic* into emphasis nodes', () => {
      const result = parseChatbotRichText('This is *emphasized* text');
      expect(result).toEqual([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'This is ' },
            { type: 'emphasis', text: 'emphasized' },
            { type: 'text', text: ' text' },
          ],
        },
      ]);
    });

    it('parses safe markdown links', () => {
      const result = parseChatbotRichText('Visit [our rooms](/rooms)');
      expect(result).toEqual([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Visit ' },
            { type: 'link', text: 'our rooms', href: '/rooms' },
          ],
        },
      ]);
    });

    it('allows approved HTTPS links to sandyfeet.com', () => {
      const result = parseChatbotRichText('See [info](https://sandyfeet.com/about)');
      expect(result[0].children[1]).toEqual({
        type: 'link',
        text: 'info',
        href: 'https://sandyfeet.com/about',
      });
    });

    it('rejects unsafe external links and renders as plain text', () => {
      const result = parseChatbotRichText('Click [here](https://evil.com/phish)');
      expect(result[0].children).toEqual([
        { type: 'text', text: 'Click ' },
        { type: 'text', text: 'here' },
      ]);
    });

    it('rejects javascript: protocol links', () => {
      // javascript: triggers the dangerous content detector — becomes plain text
      const result = parseChatbotRichText('Click [me](javascript:alert(1))');
      // The dangerous pattern strips HTML tags and returns plain text
      expect(result[0].type).toBe('paragraph');
      // Should not contain a link node
      const hasLink = result[0].children.some((c) => c.type === 'link');
      expect(hasLink).toBe(false);
    });

    it('splits double newlines into separate paragraphs', () => {
      const result = parseChatbotRichText('First paragraph\n\nSecond paragraph');
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('paragraph');
      expect(result[1].type).toBe('paragraph');
      expect(result[0].children[0].text).toBe('First paragraph');
      expect(result[1].children[0].text).toBe('Second paragraph');
    });

    it('inserts line-break nodes for single newlines within a paragraph', () => {
      const result = parseChatbotRichText('Line one\nLine two');
      expect(result).toHaveLength(1);
      expect(result[0].children).toEqual([
        { type: 'text', text: 'Line one' },
        { type: 'line-break' },
        { type: 'text', text: 'Line two' },
      ]);
    });

    it('strips and rejects raw HTML tags (script)', () => {
      const result = parseChatbotRichText('Hello <script>alert("x")</script> world');
      expect(result).toHaveLength(1);
      // Should not contain any script content as-is
      const text = result[0].children.map((c) => c.text).join('');
      expect(text).not.toContain('<script>');
      expect(text).not.toContain('</script>');
    });

    it('strips raw HTML iframe tags', () => {
      const result = parseChatbotRichText('Check <iframe src="evil.com"></iframe> this');
      const fullText = result[0].children.map((c) => c.text || '').join('');
      expect(fullText).not.toContain('<iframe');
    });

    it('rejects content with event handlers', () => {
      const result = parseChatbotRichText('Hello <div onmouseover="steal()">hover</div>');
      const fullText = result[0].children.map((c) => c.text || '').join('');
      expect(fullText).not.toContain('onmouseover');
    });

    it('rejects dangerouslySetInnerHTML references', () => {
      const result = parseChatbotRichText('Use dangerouslySetInnerHTML for custom content');
      // Should be treated as dangerous and stripped to plain text
      expect(result[0].children[0].type).toBe('text');
      const hasLink = result[0].children.some((c) => c.type === 'link');
      expect(hasLink).toBe(false);
    });

    it('returns empty paragraph for null/undefined/empty input', () => {
      expect(parseChatbotRichText(null)).toEqual([
        { type: 'paragraph', children: [{ type: 'text', text: '' }] },
      ]);
      expect(parseChatbotRichText(undefined)).toEqual([
        { type: 'paragraph', children: [{ type: 'text', text: '' }] },
      ]);
      expect(parseChatbotRichText('')).toEqual([
        { type: 'paragraph', children: [{ type: 'text', text: '' }] },
      ]);
    });

    it('only produces documented node types', () => {
      const result = parseChatbotRichText(
        '**Bold** and *italic* and [link](/page)\n\nParagraph two'
      );
      const allowedTypes = new Set(['paragraph', 'line-break', 'emphasis', 'strong', 'link', 'text']);
      for (const node of result) {
        expect(allowedTypes.has(node.type)).toBe(true);
        if (node.children) {
          for (const child of node.children) {
            expect(allowedTypes.has(child.type)).toBe(true);
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // validateExternalUrl
  // ---------------------------------------------------------------------------
  describe('validateExternalUrl', () => {
    it('accepts approved image hosts over HTTPS', () => {
      const result = validateExternalUrl('https://res.cloudinary.com/demo/image.jpg', 'images');
      expect(result.valid).toBe(true);
      expect(result.parsed).toBeInstanceOf(URL);
    });

    it('accepts Google user content for images', () => {
      const result = validateExternalUrl(
        'https://lh3.googleusercontent.com/photo.jpg',
        'images'
      );
      expect(result.valid).toBe(true);
    });

    it('accepts sandyfeet.com for links purpose', () => {
      const result = validateExternalUrl('https://sandyfeet.com/rooms', 'links');
      expect(result.valid).toBe(true);
    });

    it('rejects non-HTTPS URLs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = validateExternalUrl('http://res.cloudinary.com/img.jpg', 'images');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('HTTPS');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('rejects unapproved hosts', () => {
      const result = validateExternalUrl('https://evil.com/payload', 'images');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not approved');
    });

    it('rejects credentials in URL', () => {
      const result = validateExternalUrl(
        'https://user:pass@res.cloudinary.com/img.jpg',
        'images'
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('credentials');
    });

    it('normalizes hostname case for comparison', () => {
      const result = validateExternalUrl(
        'https://RES.CLOUDINARY.COM/demo/image.jpg',
        'images'
      );
      expect(result.valid).toBe(true);
    });

    it('rejects unknown purpose', () => {
      const result = validateExternalUrl('https://sandyfeet.com', 'unknown');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unknown purpose');
    });

    it('rejects invalid URL format', () => {
      const result = validateExternalUrl('not-a-url', 'images');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid URL');
    });

    it('rejects null/undefined/empty URL', () => {
      expect(validateExternalUrl(null, 'images').valid).toBe(false);
      expect(validateExternalUrl(undefined, 'images').valid).toBe(false);
      expect(validateExternalUrl('', 'images').valid).toBe(false);
    });

    it('rejects null/undefined purpose', () => {
      expect(validateExternalUrl('https://sandyfeet.com', null).valid).toBe(false);
      expect(validateExternalUrl('https://sandyfeet.com', undefined).valid).toBe(false);
    });

    it('allows HTTP localhost in dev/test environment', () => {
      // NODE_ENV is 'test' in test environment
      const result = validateExternalUrl('http://localhost:3000/image.jpg', 'images');
      expect(result.valid).toBe(true);
    });

    it('allows HTTP 127.0.0.1 in dev/test environment', () => {
      const result = validateExternalUrl('http://127.0.0.1:8080/img.jpg', 'images');
      expect(result.valid).toBe(true);
    });

    it('rejects HTTP non-localhost even in dev', () => {
      const result = validateExternalUrl('http://example.com/img.jpg', 'images');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('HTTPS');
    });

    it('rejects images host for links purpose', () => {
      const result = validateExternalUrl('https://res.cloudinary.com/demo/img.jpg', 'links');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not approved');
    });

    it('trims whitespace from URL before parsing', () => {
      const result = validateExternalUrl(
        '  https://res.cloudinary.com/demo/image.jpg  ',
        'images'
      );
      expect(result.valid).toBe(true);
    });

    it('exposes allowlists for external use', () => {
      expect(EXTERNAL_ALLOWLISTS.images).toContain('res.cloudinary.com');
      expect(EXTERNAL_ALLOWLISTS.images).toContain('lh3.googleusercontent.com');
      expect(EXTERNAL_ALLOWLISTS.links).toContain('sandyfeet.com');
    });
  });
});
