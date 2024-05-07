// The module 'vscode' contains the VS Code extensibility API
import { env, window, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, Uri, Range, commands, TextEditor, workspace } from 'vscode';

// This method is called when the extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    let charCodeDisplay = new CharCodeDisplay();
    let controller = new CharCodeController(charCodeDisplay);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(charCodeDisplay);

    context.subscriptions.push(
        commands.registerCommand('cursorCharCode.openUnicodeInfo', async () => {
            commands.executeCommand('vscode.open',
                Uri.parse('https://www.compart.com/en/unicode/U+' + charCodeDisplay.hexCode));
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXX', async (editor, edit) => {
            charCodeDisplay.updateCharacterCode(editor);
            if (charCodeDisplay.character === undefined || !charCodeDisplay.charRange)
                return;

            // will replace an invalid string with utf8 for each character
            var utf8encoded = require('utf8').encode(charCodeDisplay.character);
            var replacement = "";
            for (var i = 0; i < utf8encoded.length; i++)
                replacement += "\\x" + pad0(utf8encoded.charCodeAt(i).toString(16), 2);
            edit.replace(charCodeDisplay.charRange, replacement);
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXXXX', async (editor, edit) => {
            charCodeDisplay.updateCharacterCode(editor);
            if (charCodeDisplay.character === undefined || !charCodeDisplay.charRange)
                return;

            // js is utf16
            var utf16 = charCodeDisplay.character;
            var replacement = "";
            for (var i = 0; i < utf16.length; i++)
                replacement += "\\u" + pad0(utf16.charCodeAt(i).toString(16), 4);
            edit.replace(charCodeDisplay.charRange, replacement);
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.convertToXXXXXXXX', async (editor, edit) => {
            charCodeDisplay.updateCharacterCode(editor);
            if (!charCodeDisplay.hexCode || !charCodeDisplay.charRange)
                return;

            // utf32 is just the code point
            var replacement = "\\U" + pad0(charCodeDisplay.hexCode, 8);
            edit.replace(charCodeDisplay.charRange, replacement);
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.hexToClipboard', async (editor, edit) => {
            charCodeDisplay.updateCharacterCode(editor);
            if (charCodeDisplay.value)
                env.clipboard.writeText(charCodeDisplay.value.toString(16));
        }));

    context.subscriptions.push(
        commands.registerTextEditorCommand('cursorCharCode.decToClipboard', async (editor, edit) => {
            charCodeDisplay.updateCharacterCode(editor);
            if (charCodeDisplay.value)
                env.clipboard.writeText(charCodeDisplay.value.toString(10));
        }));
}

function pad0(s: string, length: number) {
    return s.length >= length ? s : '0'.repeat(length - s.length) + s;
}

class UnicodeCharNames {
    private lookupTable = new Map<number, string>();
    private processedCategories = new Set();
    private uniprops = require('unicode-properties');

    public getCharName(codepoint: number) {
        let cached = this.lookupTable.get(codepoint);
        if (cached !== undefined) {
            return cached;
        }

        let category = this.uniprops.getCategory(codepoint);
        if (!(category in this.processedCategories)) {
            let categoryPath = 'unicode/category/' + category;
            let categoryData = require(categoryPath);
            if (categoryData !== undefined) {
                for (let cp in categoryData) {
                    this.lookupTable.set(Number(cp), categoryData[cp].name);
                }
            }
            this.processedCategories.add(category);
            // unicode data is no longer needed
            delete require.cache[require.resolve(categoryPath)]
        }

        return this.lookupTable.get(codepoint);
    }
}

class CharCodeDisplay {
    private _statusBarItem: StatusBarItem | undefined;
    private _charRange: Range | undefined;
    private _value: number | undefined;
    private _character: string | undefined;
    private _hexCode: string | undefined;
    private _charNames = new UnicodeCharNames();

    /**
     * Returns the range of the character in the active editor.
     */
    public get charRange() { return this._charRange; }

    /**
     * Returns the character in question.
     */
    public get character() { return this._character; }

    /**
     * Returns an at least 4 character hex code.
     */
    public get hexCode() { return this._hexCode; }

    /**
     * Returns character code as a number
     */
    public get value() { return this._value; }

    public updateCharacterCode(editor?: TextEditor) {
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 101);
        }

        // Get the current text editor
        if (!editor) {
            editor = window.activeTextEditor;
        }

        if (!editor || !editor.selection || !editor.document) {
            this._statusBarItem.hide();
            return;
        }

        let cursorPos = editor.selection.active;
        // taking 2 chars instead of one allows to handle surrogate pairs correctly
        let cursorTextRange = new Range(cursorPos, cursorPos.translate(0, 2));
        let cursorText = editor.document.getText(cursorTextRange);
        if (!cursorText) {
            this._statusBarItem.hide();
            return;
        }

        // Update the status bar
        this._value = cursorText.codePointAt(0);
        if (!this._value) {
            this._statusBarItem.hide();
            return;
        }

        this._character = String.fromCodePoint(this._value);
        this._charRange = new Range(cursorPos, cursorPos.translate(0, this._character.length));

        let hexCode = this._value.toString(16).toUpperCase();
        if (this._value <= 0xffff && hexCode.length < 4)
            hexCode = pad0(hexCode, 4);
        this._statusBarItem.text = `$(telescope) U+${hexCode}`;
        this._hexCode = `${hexCode}`;
        //let debug = vscode.window.createOutputChannel("cursorCharCode debug");
        //debug.appendLine(`Text: ${cursorText}, number: ${this._value}, hex=${hexCode}`); debug.show();

        let characterName = this._charNames.getCharName(this._value);
        if (characterName !== undefined)
            this._statusBarItem.tooltip = characterName;

        this._statusBarItem.command = 'cursorCharCode.openUnicodeInfo';
        this._statusBarItem.show();
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
        let subscriptions: Disposable[] = [];
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

