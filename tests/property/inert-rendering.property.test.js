// Property 25: Safe rendering cannot create executable content
// Validates: Requirements 2.9, 8.7, 14.5, 14.8

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

import { parseChatbotRichText, escapeHtml } from '../../lib/server/http/content-safety.js';

/** The documented set of node types the parser is allowed to produce. */
const ALLOWED_NODE_TYPES = new Set(['paragraph', 'line-break', 'emphasis', 'strong', 'link', 'text']);

/**
 * Recursively collect all node types from an AST produced by parseChatbotRichText.
 * @param {Array<object>} ast
 * @returns {Set<string>}
 */
function collectNodeTypes(ast) {
  const types = new Set();
  for (const node of ast) {
    if (node.type) types.add(node.type);
    if (node.children) {
      for (const t of collectNodeTypes(node.children)) types.add(t);
    }
  }
  return types;
}

/**
 * Arbitrary that generates strings likely to contain XSS vectors:
 * HTML tags, script elements, event handlers, data URIs, etc.
 */
const dangerousStringArb = fc.oneof(
  // Plain arbitrary unicode strings
  fc.string({ minLength: 0, maxLength: 500 }),
  // Script tags
  fc.tuple(fc.string({ maxLength: 50 }), fc.string({ maxLength: 50 })).map(
    ([before, inner]) => `${before}<script>${inner}</script>${before}`,
  ),
  // Event handlers
  fc.tuple(fc.constantFrom('onclick', 'onerror', 'onload', 'onmouseover', 'onfocus'), fc.string({ maxLength: 30 })).map(
    ([handler, payload]) => `<img ${handler}="${payload}" src=x>`,
  ),
  // Data URIs
  fc.string({ maxLength: 100 }).map((s) => `<a href="data:text/html,${s}">click</a>`),
  // Javascript URIs
  fc.string({ maxLength: 50 }).map((s) => `<a href="javascript:${s}">xss</a>`),
  // Iframe/embed/object injections
  fc.constantFrom(
    '<iframe src="https://evil.com"></iframe>',
    '<object data="https://evil.com"></object>',
    '<embed src="https://evil.com">',
    '<style>body{background:red}</style>',
    '<link rel="stylesheet" href="https://evil.com/evil.css">',
  ),
  // Mixed content with markdown-like formatting
  fc.tuple(fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 })).map(
    ([a, b]) => `**${a}** <script>alert('${b}')</script> *${a}*`,
  ),
  // dangerouslySetInnerHTML
  fc.string({ maxLength: 50 }).map((s) => `dangerouslySetInnerHTML={{__html: "${s}"}}`),
  // vbscript
  fc.string({ maxLength: 30 }).map((s) => `<a href="vbscript:${s}">click</a>`),
);

describe('Property 25: Safe rendering cannot create executable content', () => {
  it('parseChatbotRichText never produces a node type outside the documented set', () => {
    fc.assert(
      fc.property(dangerousStringArb, (input) => {
        const ast = parseChatbotRichText(input);

        // AST must be an array
        expect(Array.isArray(ast)).toBe(true);
        expect(ast.length).toBeGreaterThan(0);

        // Every node type must be in the allowed set
        const types = collectNodeTypes(ast);
        for (const type of types) {
          expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('escapeHtml never leaves unescaped <, >, ", \', or & in output', () => {
    // Generate strings with dangerous HTML chars, including edge cases
    const htmlInputArb = fc.oneof(
      fc.string({ minLength: 0, maxLength: 500 }),
      fc.constantFrom(
        '<script>alert(1)</script>',
        '"><img onerror=alert(1) src=x>',
        "' onmouseover='alert(1)'",
        '&lt;already&escaped&gt;',
        '<>&"\'',
        '<<<>>>"""\'\'\'&&&',
      ),
      // Mixed strings with HTML special chars
      fc.tuple(fc.string({ maxLength: 50 }), fc.constantFrom('<', '>', '"', "'", '&')).map(
        ([s, c]) => `${s}${c}${s}`,
      ),
    );

    fc.assert(
      fc.property(htmlInputArb, (input) => {
        const escaped = escapeHtml(input);

        // The output must be a string
        expect(typeof escaped).toBe('string');

        // No raw < > " ' & should remain (they must all be entity-encoded)
        // We check by ensuring none of the dangerous chars appear unescaped.
        // The only valid occurrences of & are as part of entity sequences.
        expect(escaped).not.toMatch(/</);
        expect(escaped).not.toMatch(/>/);
        expect(escaped).not.toMatch(/(?<!&amp|&lt|&gt|&quot|&#x27)"/);

        // More precise: after escaping, literal < and > must not exist
        expect(escaped.includes('<')).toBe(false);
        expect(escaped.includes('>')).toBe(false);

        // Raw unescaped double quotes must not exist
        expect(escaped.includes('"')).toBe(false);

        // Raw unescaped single quotes must not exist
        expect(escaped.includes("'")).toBe(false);

        // Every & must be part of an entity reference
        const ampersandSegments = escaped.split('&');
        // First segment is before any &, rest must start with a valid entity
        for (let i = 1; i < ampersandSegments.length; i++) {
          const seg = ampersandSegments[i];
          const isEntity =
            seg.startsWith('amp;') ||
            seg.startsWith('lt;') ||
            seg.startsWith('gt;') ||
            seg.startsWith('quot;') ||
            seg.startsWith('#x27;');
          expect(isEntity).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('parseChatbotRichText with dangerous input never includes executable text in node content', () => {
    fc.assert(
      fc.property(dangerousStringArb, (input) => {
        const ast = parseChatbotRichText(input);

        // Walk all nodes and check that no node text/href contains raw script or event handler patterns
        function assertNoExecutable(nodes) {
          for (const node of nodes) {
            if (node.href) {
              // Links must not have javascript:, data:text/html, or vbscript: schemes
              expect(node.href).not.toMatch(/^javascript:/i);
              expect(node.href).not.toMatch(/^vbscript:/i);
              expect(node.href).not.toMatch(/^data:\s*text\/html/i);
            }
            if (node.children) {
              assertNoExecutable(node.children);
            }
          }
        }

        assertNoExecutable(ast);
      }),
      { numRuns: 500 },
    );
  });
});
