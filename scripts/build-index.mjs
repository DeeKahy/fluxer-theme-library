// Writes themes/index.json, the file the gallery fetches at runtime.
//
//   node scripts/build-index.mjs
//
// A static page cannot list a directory, so the index is generated. It is not
// committed: the Pages workflow regenerates it on every deploy, and you only
// need to run this locally if you want to preview the site before opening a
// pull request.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadThemes} from './lib/themes.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const {themes, errors, warnings} = loadThemes(repoRoot);

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (errors.length > 0) {
	for (const error of errors) console.error(`error: ${error}`);
	console.error(`\n${errors.length} problem(s) found, index not written.`);
	process.exit(1);
}

const index = {
	generatedAt: new Date().toISOString(),
	themeCount: themes.length,
	variantCount: themes.reduce((total, theme) => total + theme.variants.length, 0),
	tags: [...new Set(themes.flatMap((theme) => theme.tags))].sort(),
	themes,
};

writeFileSync(join(repoRoot, 'themes/index.json'), `${JSON.stringify(index, null, '\t')}\n`);
console.log(`themes/index.json: ${index.themeCount} themes, ${index.variantCount} variants`);
