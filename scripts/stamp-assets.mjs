// Appends a content hash to local asset references so a deploy cannot be
// served from a stale browser cache.
//
//   node scripts/stamp-assets.mjs
//
// Pages serves site/app.js and site/site.css with a cache header. Without a
// changing URL, someone who visited yesterday keeps yesterday's JavaScript
// after a deploy, which has already caused a theme list and an apply panel to
// render with missing buttons.
//
// This runs in the Pages workflow against its own checkout, so the stamped
// files are what gets uploaded and nothing is committed back to the repo.

import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// [html file, directory its relative refs resolve against]
const PAGES = [
	['index.html', '.'],
	['site/preview/shell.html', 'site/preview'],
];

const REF = /(src|href)="([^"?:]+\.(?:css|js))"/g;

function shortHash(path) {
	return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
}

let stamped = 0;

for (const [page, base] of PAGES) {
	const pagePath = join(repoRoot, page);
	const html = readFileSync(pagePath, 'utf8');

	const next = html.replace(REF, (whole, attr, ref) => {
		const target = resolve(repoRoot, base, ref);
		if (!target.startsWith(repoRoot)) return whole;

		let hash;
		try {
			hash = shortHash(target);
		} catch {
			return whole;
		}
		stamped += 1;
		return `${attr}="${ref}?v=${hash}"`;
	});

	writeFileSync(pagePath, next);
	console.log(`stamped ${page}`);
}

console.log(`${stamped} reference(s) versioned`);
