// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import {window, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, Uri, Range, commands, TextEditor} from 'vscode';

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
    let charCodeDisplay = new CharCodeDisplay();
    let controller = new CharCodeController(charCodeDisplay);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(charCodeDisplay);

    commands.registerCommand('cursorCharCode.openUnicodeInfo', () => {
        commands.executeCommand('vscode.open', Uri.parse(`https://unicode-table.com/en/${charCodeDisplay._hexCode}`));
    });

    commands.registerTextEditorCommand('cursorCharCode.convertToXX', (editor, edit) => {
        charCodeDisplay.updateCharacterCode(editor);
        // will replace an invalid string with utf8 for each character
        var utf8 = unescape(encodeURIComponent(charCodeDisplay.character));
        var replacement = "";
        for( var i = 0; i < utf8.length; i++ )
            replacement += "\\x" + pad0(utf8.charCodeAt(i).toString(16), 2);
        edit.replace(charCodeDisplay.charRange, replacement);
    });

    commands.registerTextEditorCommand('cursorCharCode.convertToXXXX', (editor, edit) => {
        charCodeDisplay.updateCharacterCode(editor);
        // js is utf16
        var utf16 = charCodeDisplay.character;
        var replacement = "";
        for( var i = 0; i < utf16.length; i++ )
            replacement += "\\u" + pad0(utf16.charCodeAt(i).toString(16), 4);
        edit.replace(charCodeDisplay.charRange, replacement);
    });

    commands.registerTextEditorCommand('cursorCharCode.convertToXXXXXXXX', (editor, edit) => {
        charCodeDisplay.updateCharacterCode(editor);
        // utf32 is just the code point
        var replacement = "\\U" + pad0(charCodeDisplay.character.codePointAt(0).toString(16), 8);
        edit.replace(charCodeDisplay.charRange, replacement);
    });
}

function pad0(s: string, length: number) {
    while (s.length < length)
        s = '0' + s;
    return s;
}

class CharCodeDisplay {
    private _statusBarItem: StatusBarItem;
    private _charRange: Range;
    private _character: string;
    public _hexCode: string;

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

    public updateCharacterCode(editor?: TextEditor) {
        if( !this._statusBarItem ) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }

        // Get the current text editor
        if( !editor ) {
            editor = window.activeTextEditor;
        }

        if( !editor || !editor.selection || !editor.document ) {
            this._statusBarItem.hide();
            return;
        }

        let cursorPos = editor.selection.active;
        // taking 2 chars instead of one allows to handle surrogate pairs correctly
        let cursorTextRange = new Range(cursorPos, cursorPos.translate(0, 2));
        let cursorText = editor.document.getText( cursorTextRange );
        if( !cursorText ) {
            this._statusBarItem.hide();
            return;
        }

        // Update the status bar
        let charAsNumber = cursorText.codePointAt( 0 );
        this._character = String.fromCodePoint(charAsNumber);

        // exploit that length is number of utf16 surrogates
        if( this._character.length == 2 ) {
            this._charRange = cursorTextRange;
        } else {
            this._charRange = new Range(cursorPos, cursorPos.translate(0, 1));
        }

        if( !charAsNumber ) {
            this._statusBarItem.hide();
            return;
        }

        let hexCode = charAsNumber.toString( 16 ).toUpperCase();
        if( charAsNumber <= 0xffff && hexCode.length < 4 ) {
            let zeroesToAdd = 4 - hexCode.length;
            hexCode = '0'.repeat( zeroesToAdd ) + hexCode;
        }
        //console.log( `Text: ${cursorText}, number: ${charAsNumber}, hex=${hexCode}` );

        this._statusBarItem.text = `$(telescope) U+${hexCode}`;
        this._hexCode = `${hexCode}`;
        this._statusBarItem.command = 'cursorCharCode.openUnicodeInfo';
        this._statusBarItem.show();
    }

    dispose() {
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