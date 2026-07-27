// How much of Fluxer's token surface the preview actually paints.
//
//   node scripts/preview-coverage.mjs           print the report
//   node scripts/preview-coverage.mjs --list    also name every token missed
//   node scripts/preview-coverage.mjs --strict  fail if the mock invents a token
//
// A theme can set any of the 333 tokens. The mock reads some subset of them,
// and a token the mock never reads is one a contributor can set with no visible
// effect in the preview, which is the quiet way a preview lies. This turns that
// into a number, and the missed list is the to do list for the mock.
//
// --strict is the half worth running in CI: a var(--typo) in shell.css silently
// paints nothing, and nobody notices until a theme fails to change something it
// should have.

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = process.argv.includes('--list');
const strict = process.argv.includes('--strict');

const tokensCss = readFileSync(join(repoRoot, 'site/preview/vendor/tokens.css'), 'utf8');
const shellCss = readFileSync(join(repoRoot, 'site/preview/shell.css'), 'utf8');

// Everything upstream declares, across all four base themes and the platform
// blocks. A token only coal sets still counts as one a theme can override.
const declared = new Set([...tokensCss.matchAll(/^\t(--[\w-]+)\s*:/gm)].map((match) => match[1]));

// Everything the mock reads. Its own scaffolding tokens are declared in
// shell.css itself and are not part of Fluxer's surface, so they fall out
// naturally by not being in `declared`.
const referenced = new Set([...shellCss.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]));
const selfDeclared = new Set([...shellCss.matchAll(/^\t(--[\w-]+)\s*:/gm)].map((match) => match[1]));

const painted = [...referenced].filter((token) => declared.has(token)).sort();
const missed = [...declared].filter((token) => !referenced.has(token)).sort();
const invented = [...referenced].filter((token) => !declared.has(token) && !selfDeclared.has(token)).sort();

const percent = ((painted.length / declared.size) * 100).toFixed(1);
console.log(`${painted.length} of ${declared.size} upstream tokens are read by the mock (${percent}%)`);
console.log(`${missed.length} can be set by a theme with no visible effect in the preview`);

if (list) {
	console.log('\nnot painted by the preview:');
	for (const token of missed) console.log(`  ${token}`);
}

if (invented.length > 0) {
	console.log(`\n${invented.length} token(s) read by shell.css that upstream does not declare:`);
	for (const token of invented) console.log(`  ${token}`);
	console.log('\nA var() naming a token nobody declares resolves to nothing and paints');
	console.log('nothing. Either it is a typo, or tokens.css needs a resync.');
	if (strict) process.exit(1);
}
