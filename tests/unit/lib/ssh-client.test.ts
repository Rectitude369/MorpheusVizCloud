/**
 * Tests for the safe-by-construction shellQuote helper. The whole point of
 * SshClient is that we never let user input become shell metacharacters,
 * so this is the single most important assertion to verify.
 */

import { describe, expect, it } from 'vitest';

import { shellQuote } from '../../../src/main/lib/ssh-client';

describe('shellQuote', () => {
    it('returns safe ascii literally', () => {
        expect(shellQuote('hello')).toBe('hello');
        expect(shellQuote('host-01.local')).toBe('host-01.local');
        expect(shellQuote('user@host:22')).toBe('user@host:22');
    });
    it('quotes spaces', () => {
        expect(shellQuote('hello world')).toBe(`'hello world'`);
    });
    it('escapes single quotes safely', () => {
        // The classic injection vector — must be neutralized.
        expect(shellQuote(`it's a trap`)).toBe(`'it'\\''s a trap'`);
    });
    it('neutralizes shell metacharacters', () => {
        // Wrapping in single quotes makes shell metacharacters literal.
        // The chars themselves are *expected* to appear in the output string
        // — the safety guarantee is that they live inside single quotes,
        // not that they're absent from the literal output.
        const dangerous = `; rm -rf / #`;
        const quoted = shellQuote(dangerous);
        expect(quoted).toBe(`'; rm -rf / #'`);
        expect(quoted.startsWith("'")).toBe(true);
        expect(quoted.endsWith("'")).toBe(true);
    });
    it('handles empty string', () => {
        expect(shellQuote('')).toBe(`''`);
    });
});
