// Checks every theme folder. Run before opening a pull request:
//
//   node scripts/validate.mjs
//
// Errors block the build. Warnings are advice and never fail CI.

import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadThemes} from './lib/themes.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const {themes, errors, warnings} = loadThemes(repoRoot);

for (const warning of warnings) console.warn(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);

if (errors.length > 0) {
	console.error(`\n${errors.length} error(s).`);
	process.exit(1);
}

const variantCount = themes.reduce((total, theme) => total + theme.variants.length, 0);
console.log(`ok: ${themes.length} themes, ${variantCount} variants, ${warnings.length} warning(s)`);

for (const theme of themes) {
	for (const variant of theme.variants) {
		console.log(`  ${theme.slug}/${variant.file}  ${variant.tokenCount} tokens  ${variant.bytes} bytes`);
	}
}
