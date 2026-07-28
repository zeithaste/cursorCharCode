# README
This extension shows Unicode value of the character under the cursor in the status bar.

Characters are interpreted as [extended grapheme clusters](https://www.unicode.org/reports/tr29/).
This means a visible character made from several Unicode code points, such as a decomposed accent or an emoji sequence, is treated as one character.

- A one-code-point character is displayed as `U+0041`.
- A multi-code-point character uses a compact status display such as `U+0065 (+1)`.
- Hover over the status item to see every code point and its Unicode name.
- Click a multi-code-point status item to choose which code point to open in the Unicode reference.

`Copy` commands copy every code point in a grapheme, separated by `, `.
`Replacement` commands replace the complete grapheme and emit all of its UTF-8 bytes, UTF-16 code units, or UTF-32 code points as appropriate.

Control characters embedded in a line, including `U+0000`, are supported.
Line endings are deliberately not shown: when the cursor is at the end of a line, the status item is hidden and replacement commands do nothing.

## Source
https://github.com/zeithaste/cursorCharCode
