// Regenerates the vendored Fluxer token data used by the preview shell.
//
// Usage:
//   node scripts/sync-upstream-tokens.mjs /path/to/fluxer
//
// The upstream checkout is only needed when you want to refresh the tokens.
// Everything it produces is committed, so contributing a theme never requires it.
//
// Reads:  fluxer_app/src/features/theme/variables/ThemeVariableManifest.ts
//         fluxer_app/scripts/GenerateColorSystem.ts, by running it
// Writes: site/preview/vendor/tokens.css
//
// This is the update path that matters. Themes override custom properties, so
// when Fluxer adds, renames or drops a token, re-running this is what keeps the
// preview honest.
//
// Two upstream sources, because they answer different questions.
//
// The manifest holds the flattened defaults Theme Studio shows, dark and light
// only, every token with a resolved value. That is what :root and .theme-light
// are built from, and it is the broader of the two.
//
// coal and dark_legacy exist in ThemeTypes but appear in neither manifest
// export. Their values live in fluxer_app/scripts/GenerateColorSystem.ts, which
// emits a color-system.css with all four blocks. That file is generated rather
// than committed, so we run the generator in the upstream checkout and read
// what it writes. It imports nothing but node:fs and node:path, so plain node
// with type stripping runs it and no dependency appears on either side.
//
// coal and dark_legacy come out as override blocks over :root, which is exactly
// how the client layers them, so they are emitted after :root at equal
// specificity and win on document order the same way.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.argv[2];

if (!upstream) {
	console.error('usage: node scripts/sync-upstream-tokens.mjs /path/to/fluxer');
	process.exit(1);
}

const manifestPath = join(
	upstream,
	'fluxer_app/src/features/theme/variables/ThemeVariableManifest.ts',
);
const manifest = readFileSync(manifestPath, 'utf8');

function sliceExport(name) {
	const start = manifest.indexOf(`export const ${name}`);
	if (start === -1) throw new Error(`missing export ${name}`);
	const open = manifest.indexOf('{', manifest.indexOf('=', start));
	let depth = 0;
	for (let i = open; i < manifest.length; i++) {
		if (manifest[i] === '{') depth++;
		else if (manifest[i] === '}') {
			depth--;
			if (depth === 0) return manifest.slice(open + 1, i);
		}
	}
	throw new Error(`unterminated export ${name}`);
}

// Each entry is  "--name": "value",  where the value may span several lines.
function parseValueMap(body) {
	const out = new Map();
	const re = /"(--[^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
	let match;
	while ((match = re.exec(body)) !== null) {
		out.set(match[1], match[2].replace(/\\"/g, '"').replace(/\s+/g, ' ').trim());
	}
	return out;
}

const dark = parseValueMap(sliceExport('THEME_STUDIO_DARK_DEFAULT_VARIABLE_VALUES'));
const light = parseValueMap(sliceExport('THEME_STUDIO_LIGHT_DEFAULT_VARIABLE_VALUES'));

if (dark.size === 0 || light.size === 0) {
	throw new Error('parsed nothing, the upstream manifest format probably changed');
}

// Run upstream's colour system generator where it lives, then read the file it
// writes. Nothing is left behind that upstream does not already gitignore.
function readGeneratedColorSystem() {
	const generator = join(upstream, 'fluxer_app/scripts/GenerateColorSystem.ts');
	const generated = join(upstream, 'fluxer_app/src/features/theme/styles/generated/color-system.css');

	if (!existsSync(generator)) {
		throw new Error(`missing ${generator}, so coal and dark_legacy cannot be built`);
	}

	execFileSync(process.execPath, ['--experimental-strip-types', generator], {stdio: 'pipe'});
	return readFileSync(generated, 'utf8');
}

// Pull one selector's block out of the generated file, keeping the values
// exactly as written. Some of them are multi line color-mix() calls.
function sliceBlock(css, selector) {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) throw new Error(`${selector} is not in color-system.css`);
	const open = css.indexOf('{', start);
	const end = css.indexOf('\n}', open);
	if (end === -1) throw new Error(`${selector} is not terminated in color-system.css`);
	return css.slice(open + 1, end).replace(/^\n+|\n+$/g, '');
}

const colorSystem = readGeneratedColorSystem();
const coal = sliceBlock(colorSystem, '.theme-coal');
const darkLegacy = sliceBlock(colorSystem, '.theme-dark_legacy');

// app/globals.css re-declares a few tokens behind platform classes, and those
// selectors are more specific than :root, so a theme that sets one only on
// :root loses on the platforms they cover. Carry them across verbatim rather
// than transcribing them, so the next one that appears is picked up here
// instead of going unnoticed until somebody on macOS complains.
const PLATFORM_BLOCK = /([^{}]*\.platform-[^{}]*)\{([^{}]*)\}/g;

function readPlatformOverrides() {
	const globals = readFileSync(join(upstream, 'fluxer_app/src/app/globals.css'), 'utf8');
	const blocks = [];

	for (const [, selector, body] of globals.matchAll(PLATFORM_BLOCK)) {
		const declarations = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
		if (declarations.length === 0) continue;
		const lines = declarations.map(([, name, value]) => `\t${name}: ${value.trim()};`);
		blocks.push(`${selector.trim()} {\n${lines.join('\n')}\n}`);
	}

	return blocks;
}

const platformOverrides = readPlatformOverrides();

// Tokens that went away or turned up since the last sync. This is the whole
// drift report: a theme referencing a removed token silently stops having an
// effect, in the client as well as here, so it is worth naming them out loud.
function drift(nextNames) {
	const target = join(repoRoot, 'site/preview/vendor/tokens.css');
	if (!existsSync(target)) return null;

	const previous = new Set([...readFileSync(target, 'utf8').matchAll(/^\t(--[\w-]+):/gm)].map((match) => match[1]));
	if (previous.size === 0) return null;

	return {
		added: [...nextNames].filter((name) => !previous.has(name)).sort(),
		removed: [...previous].filter((name) => !nextNames.has(name)).sort(),
	};
}

const changes = drift(new Set(dark.keys()));

function renderBlock(selector, values) {
	const lines = [...values.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => `\t${name}: ${value};`);
	return `${selector} {\n${lines.join('\n')}\n}`;
}

function countTokens(block) {
	return [...block.matchAll(/^\t(--[\w-]+):/gm)].length;
}

const css = [
	'/*',
	' * Fluxer theme tokens, generated from upstream.',
	' * Source: https://github.com/fluxerapp/fluxer (AGPL-3.0-or-later)',
	' * Regenerate with: node scripts/sync-upstream-tokens.mjs /path/to/fluxer',
	' * Do not edit by hand.',
	' *',
	' * :root and .theme-light are the flattened Theme Studio defaults from',
	' * ThemeVariableManifest.ts. .theme-coal and .theme-dark_legacy are override',
	' * blocks from GenerateColorSystem.ts, which is where those two themes are',
	' * actually defined. Equal specificity to :root, so they win on order, which',
	' * is how the client layers them too. Keep them last.',
	' *',
	' * The platform blocks at the end are lifted from app/globals.css. They beat',
	' * :root outright, so a theme that sets one of these tokens on :root alone',
	' * loses on the platforms they cover.',
	' */',
	'',
	'/* SPDX-License-Identifier: AGPL-3.0-or-later */',
	'',
	renderBlock(':root', dark),
	'',
	renderBlock('.theme-light', light),
	'',
	`.theme-coal {\n${coal}\n}`,
	'',
	`.theme-dark_legacy {\n${darkLegacy}\n}`,
	'',
	...platformOverrides.flatMap((block) => [block, '']),
].join('\n');

mkdirSync(join(repoRoot, 'site/preview/vendor'), {recursive: true});
writeFileSync(join(repoRoot, 'site/preview/vendor/tokens.css'), css);

console.log(
	`tokens.css: ${dark.size} dark, ${light.size} light, ` +
		`${countTokens(coal)} coal overrides, ${countTokens(darkLegacy)} dark_legacy overrides, ` +
		`${platformOverrides.length} platform block(s)`,
);

if (changes) {
	if (changes.added.length === 0 && changes.removed.length === 0) {
		console.log('no token changes since the last sync');
	} else {
		if (changes.added.length > 0) console.log(`\nadded upstream (${changes.added.length}):`);
		for (const name of changes.added) console.log(`  + ${name}`);

		if (changes.removed.length > 0) console.log(`\nremoved upstream (${changes.removed.length}):`);
		for (const name of changes.removed) console.log(`  - ${name}`);

		console.log('\nA removed token stops having an effect in Fluxer too, so themes');
		console.log('setting one are not broken, just inert. Grep themes/ for the names.');
	}
}
