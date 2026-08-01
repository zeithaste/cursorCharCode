import * as esbuild from 'esbuild';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDirectory = path.join(projectRoot, 'dist');
const outputDirectory = path.join(projectRoot, 'out');
const buildDirectory = path.join(projectRoot, '.build');
const argumentsSet = new Set(process.argv.slice(2));

const production = argumentsSet.has('--production');
const tests = argumentsSet.has('--tests');
const watch = argumentsSet.has('--watch');

if ([production, tests, watch].filter(Boolean).length > 1) {
    throw new Error('Use only one of --production, --tests, or --watch.');
}

if (tests) {
    await buildTests();
} else {
    await buildExtension();
}

async function buildExtension() {
    if (production) {
        await rm(distDirectory, {recursive: true, force: true});
        await rm(outputDirectory, {recursive: true, force: true});
    } else {
        await rm(path.join(distDirectory, 'extension.js'), {force: true});
        await rm(path.join(distDirectory, 'extension.js.map'), {force: true});
    }
    await mkdir(distDirectory, {recursive: true});

    const options = {
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ['src/extension.ts'],
        external: ['vscode'],
        format: 'cjs',
        logLevel: 'info',
        metafile: true,
        minify: production,
        outfile: 'dist/extension.js',
        platform: 'node',
        plugins: [createUnicodeNameReadableOnlyPlugin()],
        sourcemap: production ? false : true,
        sourcesContent: false,
        target: 'node20.14',
    };

    if (watch) {
        const context = await esbuild.context(options);
        await context.watch();
        console.log('Watching extension sources...');
        return;
    }

    const result = await esbuild.build(options);
    await mkdir(buildDirectory, {recursive: true});
    await writeFile(
        path.join(buildDirectory, 'extension-metafile.json'),
        `${JSON.stringify(result.metafile, undefined, 2)}\n`,
    );
    assertSequenceNamesWereRemoved(result.metafile);
}

async function buildTests() {
    await rm(outputDirectory, {recursive: true, force: true});
    await mkdir(path.join(outputDirectory, 'test'), {recursive: true});

    await esbuild.build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: [
            'src/test/grapheme.test.ts',
            'src/test/extension.test.ts',
        ],
        entryNames: '[name]',
        external: ['vscode'],
        format: 'cjs',
        logLevel: 'info',
        outdir: 'out/test',
        platform: 'node',
        plugins: [createUnicodeNameReadableOnlyPlugin()],
        sourcemap: true,
        sourcesContent: false,
        target: 'node20.14',
    });
}

// unicode-name 1.1.0 imports its sequence table at module evaluation time even when consumers only use unicodeReadableName.
// The dependency is pinned, and this checked transform makes its unused sequence exports tree-shakeable.
function createUnicodeNameReadableOnlyPlugin() {
    return {
        name: 'unicode-name-readable-only',
        setup(build) {
            build.onLoad({filter: /unicode-name[\\/]src[\\/]index\.js$/}, async ({path: packageEntry}) => {
                let contents = await readFile(packageEntry, 'utf8');
                const sequenceImport = 'import UNICODE_DATA_SEQUENCE_NAME from "./sequence_name.js";\n';
                const sequenceBindingsStart = contents.indexOf('const { SEQUENCES, EMOJI_NOT_QUALIFIED }');
                const commonBindingsEnd = contents.indexOf('const HANGUL_START');
                const sequenceFunctionsStart = contents.indexOf(
                    '\n/**\n * Returns the name of a character that is made of a codepoint sequence',
                );

                if (
                    !contents.includes(sequenceImport)
                    || sequenceBindingsStart === -1
                    || commonBindingsEnd === -1
                    || sequenceFunctionsStart === -1
                ) {
                    throw new Error('unicode-name changed shape; review the readable-name bundle transform.');
                }

                contents = contents.slice(0, sequenceBindingsStart) + contents.slice(commonBindingsEnd, sequenceFunctionsStart);
                contents = contents.replace(sequenceImport, '');
                return {contents, loader: 'js'};
            });
        },
    };
}

function assertSequenceNamesWereRemoved(metafile) {
    let includedBytes = 0;
    for (const output of Object.values(metafile.outputs)) {
        for (const [inputPath, contribution] of Object.entries(output.inputs ?? {})) {
            if (inputPath.endsWith('/unicode-name/src/sequence_name.js')) {
                includedBytes += contribution.bytesInOutput;
            }
        }
    }

    if (includedBytes !== 0) {
        throw new Error(`Unused Unicode sequence-name data added ${includedBytes} bytes to the extension bundle.`);
    }
    console.log('Verified: unused Unicode sequence-name data was tree-shaken.');
}
