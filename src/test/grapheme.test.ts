import * as assert from 'assert';
import {
    findGraphemeAt,
    formatCodePoint,
    formatDecimalClipboard,
    formatHexClipboard,
    formatStatusCodePoints,
    formatUtf8Escapes,
    formatUtf16Escapes,
    formatUtf32Escapes,
} from '../grapheme';
import {getUnicodeName} from '../unicode';

suite('Grapheme helpers', () => {
    test('finds ASCII and BMP graphemes', () => {
        assert.deepStrictEqual(findGraphemeAt('AЖ', 0), {text: 'A', start: 0, end: 1, codePoints: [0x41]});
        assert.deepStrictEqual(findGraphemeAt('AЖ', 1), {text: 'Ж', start: 1, end: 2, codePoints: [0x416]});
    });

    test('treats NUL and other controls as valid graphemes', () => {
        assert.deepStrictEqual(findGraphemeAt(`A\u0000\u0001B`, 1), {text: '\u0000', start: 1, end: 2, codePoints: [0]});
        assert.deepStrictEqual(findGraphemeAt(`A\u0000\u0001B`, 2), {text: '\u0001', start: 2, end: 3, codePoints: [1]});
    });

    test('maps either UTF-16 position in a surrogate pair to the same grapheme', () => {
        const expected = {text: '😀', start: 1, end: 3, codePoints: [0x1f600]};
        assert.deepStrictEqual(findGraphemeAt('A😀B', 1), expected);
        assert.deepStrictEqual(findGraphemeAt('A😀B', 2), expected);
    });

    test('keeps decomposed characters together', () => {
        const expected = {
            text: 'e\u0301', start: 0, end: 2, codePoints: [0x65, 0x301],
        };
        assert.deepStrictEqual(findGraphemeAt('e\u0301x', 0), expected);
        assert.deepStrictEqual(findGraphemeAt('e\u0301x', 1), expected);
        assert.deepStrictEqual(findGraphemeAt('e\u0301x', 2),
            {text: 'x', start: 2, end: 3, codePoints: [0x78]});
    });

    test('keeps emoji modifiers, ZWJ sequences, and flags together', () => {
        assert.deepStrictEqual(findGraphemeAt('👍🏽', 2)?.codePoints, [0x1f44d, 0x1f3fd]);

        const family = '👨‍👩‍👧‍👦';
        assert.deepStrictEqual(findGraphemeAt(family, 4), {
            text: family,
            start: 0,
            end: family.length,
            codePoints: [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466],
        });

        assert.deepStrictEqual(findGraphemeAt('🇺🇦', 3)?.codePoints, [0x1f1fa, 0x1f1e6]);
    });

    test('handles private-use characters and lone surrogates', () => {
        assert.deepStrictEqual(findGraphemeAt('\ue000', 0), {
            text: '\ue000', start: 0, end: 1, codePoints: [0xe000],
        });
        assert.deepStrictEqual(findGraphemeAt('\ud800', 0), {
            text: '\ud800', start: 0, end: 1, codePoints: [0xd800],
        });
    });

    test('returns undefined for empty lines, invalid offsets, and end-of-line', () => {
        assert.strictEqual(findGraphemeAt('', 0), undefined);
        assert.strictEqual(findGraphemeAt('A', -1), undefined);
        assert.strictEqual(findGraphemeAt('A', 1), undefined);
        assert.strictEqual(findGraphemeAt('A', 0.5), undefined);
    });
});

suite('Grapheme formatting', () => {
    test('formats compact status text', () => {
        assert.strictEqual(formatStatusCodePoints([0]), 'U+0000');
        assert.strictEqual(formatStatusCodePoints([0x65, 0x301]), 'U+0065 (+1)');
        assert.strictEqual(formatStatusCodePoints([]), '');
        assert.strictEqual(formatCodePoint(0x1f600), '1F600');
    });

    test('formats clipboard values while preserving singleton output', () => {
        assert.strictEqual(formatHexClipboard([0]), '0');
        assert.strictEqual(formatHexClipboard([0x65, 0x301]), '65, 301');
        assert.strictEqual(formatDecimalClipboard([0]), '0');
        assert.strictEqual(formatDecimalClipboard([0x65, 0x301]), '101, 769');
    });

    test('formats UTF-8, UTF-16, and UTF-32 escapes', () => {
        assert.strictEqual(formatUtf8Escapes('\u0000'), '\\x00');
        assert.strictEqual(formatUtf16Escapes('\u0000'), '\\u0000');
        assert.strictEqual(formatUtf32Escapes([0]), '\\U00000000');

        assert.strictEqual(formatUtf8Escapes('e\u0301'), '\\x65\\xcc\\x81');
        assert.strictEqual(formatUtf16Escapes('😀'), '\\ud83d\\ude00');
        assert.strictEqual(formatUtf32Escapes([0x65, 0x301]), '\\U00000065\\U00000301');
        assert.strictEqual(formatUtf8Escapes('\ud800'), '\\xef\\xbf\\xbd');
    });
});

suite('Unicode names', () => {
    test('returns names and readable aliases', () => {
        assert.strictEqual(getUnicodeName(0x41), 'LATIN CAPITAL LETTER A');
        assert.strictEqual(getUnicodeName(0), 'NULL');
    });

    test('labels private-use, reserved, noncharacter, and surrogate code points', () => {
        assert.strictEqual(getUnicodeName(0xe000), '<private-use-E000>');
        assert.strictEqual(getUnicodeName(0x0378), '<reserved-0378>');
        assert.strictEqual(getUnicodeName(0x10ffff), '<noncharacter-10FFFF>');
        assert.strictEqual(getUnicodeName(0xd800), '<surrogate-D800>');
    });

    test('returns undefined for invalid code points', () => {
        assert.strictEqual(getUnicodeName(-1), undefined);
        assert.strictEqual(getUnicodeName(0x110000), undefined);
        assert.strictEqual(getUnicodeName(1.5), undefined);
    });
});
