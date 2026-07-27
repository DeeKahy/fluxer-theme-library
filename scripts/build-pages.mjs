// Writes one static page per theme, at t/<slug>/index.html.
//
//   node scripts/build-pages.mjs
//
// The gallery is one document and every theme lives at ?theme=<slug> on it,
// with the title, the description and the canonical link all set by JavaScript
// after the page loads. Search engines are slow and unreliable about that, and
// the unfurlers behind Discord, Slack, Reddit and the rest do not run
// JavaScript at all. So every link anyone posted to a gallery of pictures
// arrived as the same grey text card with the same generic description.
//
// These pages fix that without touching the gallery: real markup, a real title
// and description per theme, and an og:image that is the theme's own preview,
// rendered by scripts/render-previews.mjs. The live preview is still an iframe
// pointed at the same shell, so nothing here can go stale against the theme.

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadThemes} from './lib/themes.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://deekahy.github.io/fluxer-theme-library';
const REPO = 'https://github.com/DeeKahy/fluxer-theme-library';

const {themes, errors} = loadThemes(repoRoot);
if (errors.length > 0) {
	for (const error of errors) console.error(`error: ${error}`);
	process.exit(1);
}

function escape(text) {
	return String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

// One or two sentences that say something specific, because this is what shows
// up under the link in a search result and in a chat unfurl.
function describe(theme) {
	const variant = theme.variants[0];
	const shape =
		theme.variants.length === 1
			? `${variant.tokenCount} tokens`
			: `${theme.variants.length} variants, ${variant.tokenCount} tokens`;
	const blurb = theme.description || variant.description || '';
	return `${blurb ? `${blurb} ` : ''}A Fluxer theme by ${theme.author}. ${shape}, previewed live from the stylesheet itself.`;
}

function page(theme) {
	const variant = theme.variants[0];
	const title = `${theme.name} - Fluxer theme`;
	const description = describe(theme);
	const card = `${SITE}/site/og/${theme.slug}.png`;
	const canonical = `${SITE}/t/${theme.slug}/`;
	const preview = `../../site/preview/shell.html?css=${encodeURIComponent(`../../themes/${theme.slug}/${variant.file}`)}&base=${variant.base}`;

	const variantRows = theme.variants
		.map((entry) => {
			const href = `../../?theme=${encodeURIComponent(theme.slug)}&variant=${encodeURIComponent(entry.id)}`;
			const note = entry.description ? ` <span class="dim">${escape(entry.description)}</span>` : '';
			return `\t\t\t<li><a href="${href}">${escape(entry.name)}</a> <span class="dim">${entry.base}, ${entry.tokenCount} tokens</span>${note}</li>`;
		})
		.join('\n');

	const openIn = variant.fluxerThemeId
		? `\t\t\t<a class="btn primary" href="https://web.fluxer.app/theme/${variant.fluxerThemeId}">Open in Fluxer</a>\n`
		: '';

	// One line per person, with what they did and where to find them. A theme
	// is usually more than one person's work and MIT does not make crediting
	// them optional.
	const creditRows = theme.credits
		.map((credit) => {
			const who = credit.url
				? `<a href="${escape(credit.url)}">${escape(credit.name)}</a>`
				: escape(credit.name);
			const role = credit.role ? ` <span class="dim">${escape(credit.role)}</span>` : '';
			return `\t\t\t\t<li>${who}${role}</li>`;
		})
		.join('\n');

	const linkRows = theme.links
		.map((link) => `\t\t\t\t<li><a href="${escape(link.url)}">${escape(link.label)}</a></li>`)
		.join('\n');

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${escape(title)}</title>
		<meta name="description" content="${escape(description)}" />
		<link rel="canonical" href="${canonical}" />
		<meta property="og:type" content="article" />
		<meta property="og:site_name" content="Fluxer Theme Library" />
		<meta property="og:title" content="${escape(title)}" />
		<meta property="og:description" content="${escape(description)}" />
		<meta property="og:url" content="${canonical}" />
		<meta property="og:image" content="${card}" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content="${card}" />
		<link rel="stylesheet" href="../../site/theme-page.css" />
	</head>
	<body>
		<main class="wrap">
			<p class="back"><a href="../../">All themes</a></p>
			<h1>${escape(theme.name)}</h1>
			<p class="by">by ${escape(theme.author)}</p>
			${theme.description ? `<p class="blurb">${escape(theme.description)}</p>` : ''}

			<iframe class="preview" src="${preview}" title="${escape(theme.name)} preview" loading="lazy" scrolling="no"></iframe>

			<h2>Apply it</h2>
			<div class="buttons">
${openIn}\t\t\t<a class="btn" href="../../themes/${theme.slug}/${variant.file}" download="${theme.slug}-${variant.id}.css">Download .css</a>
			<a class="btn" href="${REPO}/blob/main/themes/${theme.slug}/${variant.file}">View source</a>
			</div>
			<p class="dim">Paste it into Theme Studio under Quick CSS, or import the file into your theme library.</p>

			<h2>Variants</h2>
			<ul class="variants">
${variantRows}
			</ul>

			<h2>Credits</h2>
			<ul class="credits">
${creditRows}
			</ul>
			${theme.license ? `<p class="dim">Licensed ${escape(theme.license)}.</p>` : '<p class="dim">No licence stated. Credit rather than a grant.</p>'}

			${linkRows ? `<h2>Links</h2>\n\t\t\t<ul class="credits">\n${linkRows}\n\t\t\t</ul>` : ''}

			<p class="foot">
				<a href="${REPO}">Fluxer Theme Library</a>
			</p>
		</main>
	</body>
</html>
`;
}

for (const theme of themes) {
	const dir = join(repoRoot, 't', theme.slug);
	mkdirSync(dir, {recursive: true});
	writeFileSync(join(dir, 'index.html'), page(theme));
}

console.log(`t/: ${themes.length} theme page(s)`);
