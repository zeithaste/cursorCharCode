import {defineConfig} from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/extension.test.js',
    version: '1.92.0',
    launchArgs: ['--no-sandbox', '--disable-gpu'],
    mocha: {
        timeout: 30_000,
        ui: 'tdd',
    },
});
