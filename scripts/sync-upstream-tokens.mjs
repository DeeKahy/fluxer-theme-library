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
//         site/data/tokens.json

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
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

function parseDefinitions() {
	const start = manifest.indexOf('export const THEME_VARIABLES');
	const end = manifest.indexOf('export const THEME_VARIABLE_NAMES');
	const body = manifest.slice(start, end);
	const re =
		/\{name:\s*"(--[^"]+)",\s*kind:\s*"([^"]+)",\s*groupId:\s*"([^"]+)",\s*groupLabel:\s*"([^"]+)",\s*source:\s*"([^"]+)"\}/g;
	const out = [];
	let match;
	while ((match = re.exec(body)) !== null) {
		out.push({
			name: match[1],
			kind: match[2],
			groupId: match[3],
			groupLabel: match[4],
			source: match[5],
		});
	}
	return out;
}

const dark = parseValueMap(sliceExport('THEME_STUDIO_DARK_DEFAULT_VARIABLE_VALUES'));
const light = parseValueMap(sliceExport('THEME_STUDIO_LIGHT_DEFAULT_VARIABLE_VALUES'));
const definitions = parseDefinitions();

if (definitions.length === 0 || dark.size === 0 || light.size === 0) {
	throw new Error('parsed nothing, the upstream manifest format probably changed');
}

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
mkdirSync(join(repoRoot, 'site/data'), {recursive: true});
writeFileSync(join(repoRoot, 'site/preview/vendor/tokens.css'), css);
writeFileSync(
	join(repoRoot, 'site/data/tokens.json'),
	`${JSON.stringify({variables: definitions}, null, '\t')}\n`,
);

console.log(`tokens.css: ${dark.size} dark, ${light.size} light`);
console.log(`tokens.json: ${definitions.length} definitions`);
