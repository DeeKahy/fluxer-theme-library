// Uploads stylesheets to Fluxer's share endpoint and records the id it returns,
// which is what powers the "Open in Fluxer" button on the site.
//
//   FLUXER_TOKEN=... node scripts/publish-themes.mjs
//   node scripts/publish-themes.mjs --dry-run
//
// Endpoint details, all verified against the published OpenAPI document and the
// upstream source, see PROVENANCE.md:
//
//   POST https://api.fluxer.app/v1/users/@me/themes
//   Authorization: <token>          the sessionToken scheme, no Bearer prefix
//   body {"css": "..."}  ->  201 {"id": "<16 hex chars>"}
//
// The route is DefaultUserOnly, so this needs a real user account token. A bot
// token is rejected. Rate limit is 20 per minute.
//
// Uploads are permanent. Fluxer has no endpoint to delete a shared theme, so
// every published version stays on their CDN. We upload only when a stylesheet
// is new or its contents changed, tracked by fluxerThemeHash in theme.json.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadThemes, sha256} from './lib/themes.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const token = process.env.FLUXER_TOKEN;
const apiBase = process.env.FLUXER_API_BASE ?? 'https://api.fluxer.app/v1';

const MAX_CSS_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 20;
const GAP_MS = Math.ceil(60_000 / RATE_LIMIT_PER_MINUTE);

if (!token && !dryRun) {
	console.log('FLUXER_TOKEN is not set, nothing to publish.');
	console.log('The site falls back to Copy CSS and Download, which need no token.');
	process.exit(0);
}

const {themes, errors} = loadThemes(repoRoot);
if (errors.length > 0) {
	for (const error of errors) console.error(`error: ${error}`);
	process.exit(1);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upload(css) {
	const response = await fetch(`${apiBase}/users/@me/themes`, {
		method: 'POST',
		headers: {
			authorization: token,
			'content-type': 'application/json',
		},
		body: JSON.stringify({css}),
	});

	if (response.status === 429) {
		const retryAfter = Number(response.headers.get('retry-after') ?? '5');
		console.log(`  rate limited, waiting ${retryAfter}s`);
		await sleep((retryAfter + 1) * 1000);
		return upload(css);
	}

	if (!response.ok) {
		throw new Error(`${response.status} ${await response.text()}`);
	}

	const body = await response.json();
	if (!/^[0-9a-f]{16}$/.test(body?.id ?? '')) {
		throw new Error(`unexpected id in response: ${JSON.stringify(body)}`);
	}
	return body.id;
}

// theme.json is rewritten in place rather than regenerated, so a contributor's
// key order and formatting survive.
function recordId(slug, file, id, hash) {
	const path = join(repoRoot, 'themes', slug, 'theme.json');
	const manifest = JSON.parse(readFileSync(path, 'utf8'));
	const variant = manifest.variants.find((entry) => entry.file === file);
	if (!variant) throw new Error(`${slug}: no variant for ${file}`);

	variant.fluxerThemeId = id;
	variant.fluxerThemeHash = hash;
	writeFileSync(path, `${JSON.stringify(manifest, null, '\t')}\n`);
}

const pending = [];
for (const theme of themes) {
	for (const variant of theme.variants) {
		const manifest = JSON.parse(readFileSync(join(repoRoot, 'themes', theme.slug, 'theme.json'), 'utf8'));
		const entry = manifest.variants.find((item) => item.file === variant.file) ?? {};

		if (entry.fluxerThemeId && entry.fluxerThemeHash === variant.hash) continue;
		if (variant.bytes > MAX_CSS_BYTES) {
			console.error(`error: ${variant.path} is over Fluxer's 8 MiB share limit, skipping`);
			continue;
		}
		pending.push({theme, variant});
	}
}

if (pending.length === 0) {
	console.log('Everything is already published and unchanged.');
	process.exit(0);
}

console.log(`${pending.length} stylesheet(s) to publish:`);
for (const {theme, variant} of pending) console.log(`  ${variant.path} (${theme.name} ${variant.name})`);

if (dryRun) {
	console.log('\nDry run, nothing was uploaded.');
	process.exit(0);
}

let published = 0;
let failed = 0;

for (const [index, {theme, variant}] of pending.entries()) {
	if (index > 0) await sleep(GAP_MS);
	const css = readFileSync(join(repoRoot, variant.path), 'utf8');

	try {
		const id = await upload(css);
		recordId(theme.slug, variant.file, id, sha256(css));
		console.log(`published ${variant.path} -> https://fluxer.app/theme/${id}`);
		published += 1;
	} catch (error) {
		console.error(`failed ${variant.path}: ${error.message}`);
		failed += 1;
	}
}

console.log(`\n${published} published, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
