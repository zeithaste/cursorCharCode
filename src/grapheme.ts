import Graphemer from 'graphemer';

const graphemeSplitter = new Graphemer();

export interface GraphemeInfo {
    text: string;
    start: number;
    end: number;
    codePoints: number[];
}

/**
 * Finds the extended grapheme cluster at a UTF-16 offset in one line of text.
 * VS Code positions and JavaScript string offsets are both UTF-16 based, so the returned offsets can be used directly to create an editor range.
 */
export function findGraphemeAt(lineText: string, cursorOffset: number): GraphemeInfo | undefined {
    if (!Number.isInteger(cursorOffset) || cursorOffset < 0 || cursorOffset >= lineText.length) {
        return undefined;
    }

    let start = 0;
    for (const text of graphemeSplitter.iterateGraphemes(lineText)) {
        const end = start + text.length;
        if (cursorOffset >= start && cursorOffset < end) {
            return {
                text, start, end,
                codePoints: Array.from(text, character => character.codePointAt(0)!),
            };
        }
        start = end;
    }

    return undefined;
}

export function formatCodePoint(codePoint: number): string {
    const hex = codePoint.toString(16).toUpperCase();
    return codePoint <= 0xffff ? pad0(hex, 4) : hex;
}

export function formatStatusCodePoints(codePoints: readonly number[]): string {
    if (codePoints.length === 0) {
        return '';
    }

    const first = `U+${formatCodePoint(codePoints[0])}`;
    return codePoints.length === 1 ? first : `${first} (+${codePoints.length - 1})`;
}

export function formatHexClipboard(codePoints: readonly number[]): string {
    return codePoints.map(codePoint => codePoint.toString(16)).join(', ');
}

export function formatDecimalClipboard(codePoints: readonly number[]): string {
    return codePoints.map(codePoint => codePoint.toString(10)).join(', ');
}

export function formatUtf8Escapes(text: string): string {
    const encoded = require('utf8').encode(text);
    let replacement = '';
    for (let index = 0; index < encoded.length; index++) {
        replacement += `\\x${pad0(encoded.charCodeAt(index).toString(16), 2)}`;
    }
    return replacement;
}

export function formatUtf16Escapes(text: string): string {
    let replacement = '';
    for (let index = 0; index < text.length; index++) {
        replacement += `\\u${pad0(text.charCodeAt(index).toString(16), 4)}`;
    }
    return replacement;
}

export function formatUtf32Escapes(codePoints: readonly number[]): string {
    return codePoints
        .map(codePoint => `\\U${pad0(codePoint.toString(16).toUpperCase(), 8)}`)
        .join('');
}

function pad0(value: string, length: number): string {
    return value.length >= length ? value : '0'.repeat(length - value.length) + value;
}
