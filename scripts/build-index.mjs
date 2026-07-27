// Writes themes/index.json, the file the gallery fetches at runtime, and
// sitemap.xml for search engines.
//
//   node scripts/build-index.mjs
//
// A static page cannot list a directory, so both files are generated. Neither
// is committed: the Pages workflow regenerates them on every deploy, and you
// only need to run this locally if you want to preview the site before opening
// a pull request.

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

// One URL per theme, plus the landing page. These point at the static pages
// scripts/build-pages.mjs writes, not at ?theme=<slug> on the gallery. A query
// string on a single JavaScript rendered document is a bad thing to ask a
// crawler to index, and it is a worse thing to hand an unfurler, which will not
// run the JavaScript at all.
//
// Crawlers will not read a robots.txt from a project page, only from the domain
// root, so the sitemap gets submitted by hand in Search Console and Bing
// Webmaster Tools instead of being discovered.
const siteRoot = 'https://deekahy.github.io/fluxer-theme-library/';
const locations = [siteRoot, ...themes.map((theme) => `${siteRoot}t/${encodeURIComponent(theme.slug)}/`)];
const sitemap = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...locations.map((loc) => `\t<url><loc>${loc}</loc></url>`),
	'</urlset>',
	'',
].join('\n');
writeFileSync(join(repoRoot, 'sitemap.xml'), sitemap);
console.log(`sitemap.xml: ${locations.length} URLs`);
