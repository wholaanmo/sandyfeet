import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createSeededRandom, createTestActor, deterministicId } from '../fixtures/deterministic.js';
import { findForbiddenServerImports, findSensitiveTokens } from '../../scripts/verification/scan-source.mjs';

describe('deterministic verification fixtures', () => {
  it('replays the same random values and identifiers for the same seed', () => {
    const first = createSeededRandom(7);
    const second = createSeededRandom(7);
    expect([first(), first()]).toEqual([second(), second()]);
    expect(deterministicId('booking', 3, 7)).toBe(deterministicId('booking', 3, 7));
  });

  it('creates stable, inert test actors', () => {
    expect(createTestActor(2, 'staff')).toEqual({
      uid: deterministicId('staff', 2),
      role: 'staff',
      email: `${deterministicId('staff', 2)}@example.test`,
      status: 'active',
    });
  });
});

describe('verification source scans', () => {
  it('rejects alias, relative, and side-effect server imports from client boundaries', () => {
    const root = path.resolve('sandbox');
    const file = path.join(root, 'components', 'Client.js');
    expect(findForbiddenServerImports(file, "'use client';\nimport x from '@/lib/server/auth.js';", root)).toEqual(['@/lib/server/auth.js']);
    expect(findForbiddenServerImports(file, "import x from '../lib/server/auth.js';", root)).toEqual(['../lib/server/auth.js']);
    expect(findForbiddenServerImports(file, "import '@/lib/server/bootstrap.js';", root)).toEqual(['@/lib/server/bootstrap.js']);
  });

  it('allows server imports outside client boundaries', () => {
    const root = path.resolve('sandbox');
    const file = path.join(root, 'app', 'api', 'route.js');
    expect(findForbiddenServerImports(file, "import x from '@/lib/server/auth.js';", root)).toEqual([]);
  });

  it('detects credential literals without retaining secret values or flagging public Firebase identifiers', () => {
    const secret = 'sk-live_placeholder_value_123456';
    const findings = findSensitiveTokens(`const key = '${secret}';`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).not.toHaveProperty('value');
    expect(JSON.stringify(findings)).not.toContain(secret);
    expect(findSensitiveTokens("const firebaseApiKey = 'AIza-public-client-identifier';")).toEqual([]);
  });
});

describe('component verification environment', () => {
  it('supports user-event and automated accessibility assertions', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(React.createElement('button', { type: 'button', onClick }, 'Reserve'));

    await user.click(screen.getByRole('button', { name: 'Reserve' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });
});
