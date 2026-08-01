import {unicodeReadableName} from 'unicode-name';

const characterNames = new Map<number, string | undefined>();

/** Returns the Unicode 17 name, alias, or generic label for a code point. */
export function getUnicodeName(codePoint: number): string | undefined {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return undefined;
    }

    if (characterNames.has(codePoint)) {
        return characterNames.get(codePoint);
    }

    const name = unicodeReadableName(codePoint);
    characterNames.set(codePoint, name);
    return name;
}
