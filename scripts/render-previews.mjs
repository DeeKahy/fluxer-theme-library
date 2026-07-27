// Screenshots the preview shell, once per theme, into site/og/<slug>.png.
//
//   node scripts/render-previews.mjs                 every theme
//   node scripts/render-previews.mjs gruvbox coal    only these slugs
//   node scripts/render-previews.mjs --out tmp/shots
//
// Two jobs, one renderer.
//
// The share card. A gallery whose whole point is what things look like was
// unfurling in chat as a grey text card, because Discord, Slack and the rest do
// not run JavaScript and every theme lived at the same ?theme= URL. These images
// are what the per theme pages point og:image at.
//
// The review. A theme pull request is a diff of CSS, and the thing being changed
// is a picture. The pull request workflow runs this over the changed themes and
// posts the results, so reviewing does not mean checking the branch out.
//
// No dependencies, on purpose. Chrome's own --screenshot flag does this, the
// GitHub runners already have Chrome, and node:http can serve the repo, which
// the shell needs because it fetches its stylesheet.

import {spawn} from 'node:child_process';
import {createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadThemes} from './lib/themes.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
// resolve, not join, so --out takes an absolute path as well as a relative one.
const outDir = resolve(repoRoot, outIndex === -1 ? 'site/og' : args[outIndex + 1]);
const slugs = args.filter((arg, index) => !arg.startsWith('--') && index !== outIndex + 1);

// 1200x630 is what the unfurlers crop to. The mock lays out on a grid, so it
// takes the shorter viewport without complaint.
const WIDTH = 1200;
const HEIGHT = 630;

const CHROME_CANDIDATES = [
	process.env.CHROME_BIN,
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
];

function findChrome() {
	for (const candidate of CHROME_CANDIDATES) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	throw new Error(
		'No Chrome found. Set CHROME_BIN to a Chrome or Chromium binary.\n' +
			'The GitHub runners ship one, so this only bites locally.',
	);
}

const MIME = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
};

// Enough of a static server to satisfy the shell, which fetches its stylesheet
// and so cannot run from file://.
function serve() {
	const server = createServer((request, response) => {
		const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
		const target = join(repoRoot, normalize(path).replace(/^(\.\.[/\\])+/, ''));

		if (!target.startsWith(repoRoot) || !existsSync(target) || statSync(target).isDirectory()) {
			response.writeHead(404).end('not found');
			return;
		}

		response.writeHead(200, {'content-type': MIME[extname(target)] ?? 'application/octet-stream'});
		createReadStream(target).pipe(response);
	});

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port}));
	});
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome writes the PNG and then keeps running. Plain --headless hangs outright
// on Chrome 150, and even --headless=old sits there after the shutter, so this
// spawns it, waits for the file to appear and stop growing, and kills it. Two
// consecutive equal sizes is the "stopped growing" test, which is enough for a
// file Chrome writes in one go.
const SETTLE_MS = 250;
const TIMEOUT_MS = 30_000;

async function shoot(chrome, url, destination) {
	// In the OS temp dir, not the output dir, so a stray profile never ends up
	// next to the images or, worse, inside the repo.
	const profile = mkdtempSync(join(tmpdir(), 'ftl-preview-'));
	rmSync(destination, {force: true});

	const child = spawn(
		chrome,
		[
			'--headless=old',
			'--disable-gpu',
			'--hide-scrollbars',
			'--no-sandbox',
			'--disable-dev-shm-usage',
			`--user-data-dir=${profile}`,
			`--screenshot=${destination}`,
			`--window-size=${WIDTH},${HEIGHT}`,
			url,
		],
		{stdio: 'ignore'},
	);

	try {
		const deadline = Date.now() + TIMEOUT_MS;
		let previous = -1;

		while (Date.now() < deadline) {
			await sleep(SETTLE_MS);
			if (!existsSync(destination)) continue;
			const size = statSync(destination).size;
			if (size > 0 && size === previous) return;
			previous = size;
		}

		throw new Error(`timed out waiting for ${destination}`);
	} finally {
		child.kill('SIGKILL');
		// Chrome is still flushing its profile as it dies, so removing it
		// straight away races and throws ENOTEMPTY. Retry, and do not let a
		// temp directory failure lose us the image we just took.
		try {
			rmSync(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
		} catch {
			// A leftover directory under the OS temp dir is not worth failing for.
		}
	}
}

const {themes, errors} = loadThemes(repoRoot);
if (errors.length > 0) {
	for (const error of errors) console.error(`error: ${error}`);
	process.exit(1);
}

const wanted = slugs.length > 0 ? themes.filter((theme) => slugs.includes(theme.slug)) : themes;
if (wanted.length === 0) {
	console.log('Nothing to render.');
	process.exit(0);
}

const chrome = findChrome();
mkdirSync(outDir, {recursive: true});
const {server, port} = await serve();

let rendered = 0;
try {
	// The landing page's own card is the gallery itself, which is the honest
	// thing to show for a link to the gallery.
	if (slugs.length === 0) {
		const destination = join(outDir, '_site.png');
		await shoot(chrome, `http://127.0.0.1:${port}/index.html`, destination);
		console.log(`_site.png  ${(statSync(destination).size / 1024).toFixed(0)} KB  (the gallery)`);
		rendered += 1;
	}

	for (const theme of wanted) {
		// The first variant is the one the gallery opens on, so it is the one
		// that represents the theme.
		const variant = theme.variants[0];
		const css = `http://127.0.0.1:${port}/${variant.path}`;
		const url =
			`http://127.0.0.1:${port}/site/preview/shell.html` +
			`?css=${encodeURIComponent(css)}&base=${encodeURIComponent(variant.base)}`;
		const destination = join(outDir, `${theme.slug}.png`);

		await shoot(chrome, url, destination);
		const bytes = statSync(destination).size;
		console.log(`${theme.slug}.png  ${(bytes / 1024).toFixed(0)} KB  (${theme.name} ${variant.name})`);
		rendered += 1;
	}
} finally {
	server.close();
}

console.log(`\n${rendered} image(s) in ${outDir.replace(`${repoRoot}/`, '')}`);

// A sanity check worth having: an all one colour image means the theme never
// painted, usually because the shell errored rather than because the theme is
// minimal. Cheap to spot without decoding the PNG properly, since a flat image
// compresses to almost nothing.
for (const theme of wanted) {
	const path = join(outDir, `${theme.slug}.png`);
	if (existsSync(path) && readFileSync(path).length < 5000) {
		console.warn(`warning: ${theme.slug}.png is suspiciously small, check the preview rendered`);
	}
}
