// The module 'vscode' contains the VS Code extensibility API
import { env, window, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, Uri, Range, commands, TextEditor, workspace, QuickPickItem } from 'vscode';
import {
    findGraphemeAt,
    formatCodePoint,
    formatDecimalClipboard,
    formatHexClipboard,
    formatStatusCodePoints,
    formatUtf8Escapes,
    formatUtf16Escapes,
    formatUtf32Escapes,
    GraphemeInfo,
} from './grapheme';

// This method is called when the extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    const charCodeDisplay = new CharCodeDisplay();
    const controller = new CharCodeController(charCodeDisplay);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(charCodeDisplay);

    context.subscriptions.push(
        commands.registerCommand('cursorCharCode.openUnicodeInfo', async () => {
            const current = charCodeDisplay.current;
            if (!current) {
                return;
            }

            let codePoint = current.grapheme.codePoints[0];
            if (current.grapheme.codePoints.length > 1) {
                const choices: UnicodeInfoPick[] = current.grapheme.codePoints.map(value => ({
                    label: `U+${formatCodePoint(value)}`,
                    description: charCodeDisplay.getCharName(value),
                    codePoint: value,
                }));
                const selected = await window.showQuickPick(choices, {
                    placeHolder: 'Choose a code point to open',
                });
                if (!selected) {
                    return;
                }
                codePoint = selected.codePoint;
            }

            await commands.executeCommand(
                'vscode.open',
                Uri.parse(`https://www.compart.com/en/unicode/U+${formatCodePoint(codePoint)}`),
            );
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXX', async (editor, edit) => {
            const current = charCodeDisplay.updateCharacterCode(editor);
            if (current) {
                edit.replace(current.range, formatUtf8Escapes(current.grapheme.text));
            }
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXXXX', async (editor, edit) => {
            const current = charCodeDisplay.updateCharacterCode(editor);
            if (current) {
                edit.replace(current.range, formatUtf16Escapes(current.grapheme.text));
            }
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXXXXXXXX', async (editor, edit) => {
            const current = charCodeDisplay.updateCharacterCode(editor);
            if (current) {
                edit.replace(current.range, formatUtf32Escapes(current.grapheme.codePoints));
            }
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.hexToClipboard', async editor => {
            const current = charCodeDisplay.updateCharacterCode(editor);
            if (current) {
                await env.clipboard.writeText(formatHexClipboard(current.grapheme.codePoints));
            }
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.decToClipboard', async editor => {
            const current = charCodeDisplay.updateCharacterCode(editor);
            if (current) {
                await env.clipboard.writeText(formatDecimalClipboard(current.grapheme.codePoints));
            }
        }));
}

interface UnicodeInfoPick extends QuickPickItem {
    codePoint: number;
}

interface DisplayedGrapheme {
    grapheme: GraphemeInfo;
    range: Range;
}

class UnicodeCharNames {
    private lookupTable = new Map<number, string>();
    private processedCategories = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    private uniprops = require('unicode-properties');

    public getCharName(codepoint: number) {
        const cached = this.lookupTable.get(codepoint);
        if (cached !== undefined) {
            return cached;
        }

        const category = this.uniprops.getCategory(codepoint);
        if (!this.processedCategories.has(category)) {
            const categoryPath = 'unicode/category/' + category;
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const categoryData = require(categoryPath);
            if (categoryData !== undefined) {
                for (const cp in categoryData) {
                    const entry = categoryData[cp];
                    const name = entry.name === '<control>' && entry.unicode_name
                        ? entry.unicode_name
                        : entry.name;
                    this.lookupTable.set(Number(cp), name);
                }
            }
            this.processedCategories.add(category);
            // unicode data is no longer needed
            delete require.cache[require.resolve(categoryPath)];
        }

        return this.lookupTable.get(codepoint);
    }
}

class CharCodeDisplay {
    private _statusBarItem: StatusBarItem | undefined;
    private _current: DisplayedGrapheme | undefined;
    private _charNames = new UnicodeCharNames();

    public get current() { return this._current; }

    public getCharName(codePoint: number) {
        return this._charNames.getCharName(codePoint);
    }

    public updateCharacterCode(editor?: TextEditor): DisplayedGrapheme | undefined {
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 101);
        }

        // Get the current text editor
        if (!editor) {
            editor = window.activeTextEditor;
        }

        if (!editor || !editor.selection || !editor.document) {
            return this.clear();
        }

        const cursorPos = editor.selection.active;
        const lineText = editor.document.lineAt(cursorPos.line).text;
        const grapheme = findGraphemeAt(lineText, cursorPos.character);
        if (!grapheme) {
            return this.clear();
        }

        const range = new Range(cursorPos.line, grapheme.start, cursorPos.line, grapheme.end);
        this._current = { grapheme, range };

        this._statusBarItem.text = `$(telescope) ${formatStatusCodePoints(grapheme.codePoints)}`;
        this._statusBarItem.tooltip = grapheme.codePoints
            .map(codePoint => {
                const code = `U+${formatCodePoint(codePoint)}`;
                const name = this._charNames.getCharName(codePoint);
                return name ? `${code} — ${name}` : code;
            })
            .join('\n');

        this._statusBarItem.command = 'cursorCharCode.openUnicodeInfo';
        this._statusBarItem.show();
        return this._current;
    }

    private clear(): undefined {
        this._current = undefined;
        if (this._statusBarItem) {
            this._statusBarItem.tooltip = undefined;
            this._statusBarItem.hide();
        }
        return undefined;
    }

    dispose() {
        if (this._statusBarItem)
            this._statusBarItem.dispose();
    }
}

class CharCodeController {
    private _display: CharCodeDisplay;
    private _disposable: Disposable;

    constructor(display: CharCodeDisplay) {
        this._display = display;

        // subscribe to selection change and editor activation events
        const subscriptions: Disposable[] = [];
        window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);
        workspace.onDidChangeTextDocument(this._onEvent, this, subscriptions);

        this._display.updateCharacterCode();
        this._disposable = Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._display.updateCharacterCode();
    }
}

