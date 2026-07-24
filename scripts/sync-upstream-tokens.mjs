// Regenerates the vendored Fluxer token data used by the preview shell.
//
// Usage:
//   node scripts/sync-upstream-tokens.mjs /path/to/fluxer
//
// The upstream checkout is only needed when you want to refresh the tokens.
// Everything it produces is committed, so contributing a theme never requires it.
//
// Reads:  fluxer_app/src/features/theme/variables/ThemeVariableManifest.ts
// Writes: site/preview/vendor/tokens.css
//
// This is the update path that matters. Themes override custom properties, so
// when Fluxer adds, renames or drops a token, re-running this is what keeps the
// preview honest.

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

const css = [
	'/*',
	' * Fluxer theme tokens, generated from the upstream manifest.',
	' * Source: https://github.com/fluxerapp/fluxer (AGPL-3.0-or-later)',
	' * Regenerate with: node scripts/sync-upstream-tokens.mjs /path/to/fluxer',
	' * Do not edit by hand.',
	' */',
	'',
	'/* SPDX-License-Identifier: AGPL-3.0-or-later */',
	'',
	renderBlock(':root', dark),
	'',
	renderBlock('.theme-light', light),
	'',
].join('\n');

mkdirSync(join(repoRoot, 'site/preview/vendor'), {recursive: true});
writeFileSync(join(repoRoot, 'site/preview/vendor/tokens.css'), css);

console.log(`tokens.css: ${dark.size} dark, ${light.size} light`);

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
