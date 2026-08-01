import * as assert from 'node:assert/strict';
import {
    commands,
    env,
    extensions,
    Position,
    Selection,
    window,
    workspace,
} from 'vscode';

const extensionId = 'zeithaste.cursorCharCode';

suite('cursorCharCode extension', () => {
    suiteSetup(async () => {
        const extension = extensions.getExtension(extensionId);
        assert.ok(extension, `Expected ${extensionId} to be installed in the extension host.`);
        await extension.activate();
    });

    teardown(async () => {
        await commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });

    test('activates and registers all public commands', async () => {
        const registeredCommands = await commands.getCommands(true);
        for (const command of [
            'cursorCharCode.convertToXX',
            'cursorCharCode.convertToXXXX',
            'cursorCharCode.convertToXXXXXXXX',
            'cursorCharCode.hexToClipboard',
            'cursorCharCode.decToClipboard',
        ]) {
            assert.ok(registeredCommands.includes(command), `${command} was not registered.`);
        }
    });

    test('replaces the complete grapheme when the cursor is on a combining mark', async () => {
        const editor = await openDocument('xe\u0301y', 2);
        await commands.executeCommand('cursorCharCode.convertToXXXXXXXX');
        assert.strictEqual(editor.document.getText(), 'x\\U00000065\\U00000301y');
    });

    test('uses the updated cursor position and copies every emoji code point', async () => {
        const editor = await openDocument('A🇺🇦B', 0);
        editor.selection = new Selection(new Position(0, 3), new Position(0, 3));
        await waitForEditorEvent();

        await commands.executeCommand('cursorCharCode.hexToClipboard');
        assert.strictEqual(await waitForClipboard('1f1fa, 1f1e6'), '1f1fa, 1f1e6');
    });

    test('keeps singleton decimal clipboard output unchanged', async () => {
        await openDocument('A', 0);
        await commands.executeCommand('cursorCharCode.decToClipboard');
        assert.strictEqual(await waitForClipboard('65'), '65');
    });
});

async function openDocument(content: string, character: number) {
    const document = await workspace.openTextDocument({content, language: 'plaintext'});
    const editor = await window.showTextDocument(document);
    const position = new Position(0, character);
    editor.selection = new Selection(position, position);
    await waitForEditorEvent();
    return editor;
}

async function waitForEditorEvent() {
    await new Promise(resolve => setTimeout(resolve, 50));
}

async function waitForClipboard(expected: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const current = await env.clipboard.readText();
        if (current === expected) {
            return current;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return env.clipboard.readText();
}
