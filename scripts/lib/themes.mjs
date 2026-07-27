// Shared loader for the themes directory. No dependencies on purpose: cloning
// the repo and running node is the whole toolchain.

import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

export const BASE_THEMES = ['dark', 'light', 'coal', 'dark_legacy'];

// Kept in sync with parseThemeMetadata in the Fluxer client, so the header we
// ask contributors to write is the same header the app itself reads.
const HEADER_COMMENT = /^\s*\/\*([\s\S]*?)\*\//;
const METADATA_LINE = /^\s*(?:\*\s*)?(?:@?([a-zA-Z][a-zA-Z0-9_-]*)|([a-zA-Z][a-zA-Z0-9 _-]*))\s*[:=]\s*(.*?)\s*$/;
const AT_RULE_METADATA = /^\s*(?:\*\s*)?@([a-zA-Z][a-zA-Z0-9_-]*)\s+(.*?)\s*$/;

const METADATA_KEYS = {
	name: 'name',
	title: 'name',
	description: 'description',
	desc: 'description',
	summary: 'description',
	author: 'author',
	authors: 'author',
	version: 'version',
	ver: 'version',
	tags: 'tags',
	tag: 'tags',
};

export function parseThemeMetadata(css) {
	const metadata = {name: '', description: '', author: '', version: '', tags: []};
	const header = HEADER_COMMENT.exec(css);
	if (!header) return metadata;

	for (const rawLine of (header[1] ?? '').split(/\r?\n/)) {
		const line = rawLine.replace(/^\s*\*\s?/, '').trim();
		if (!line) continue;

		const keyValue = METADATA_LINE.exec(line);
		const atRule = keyValue ? null : AT_RULE_METADATA.exec(line);
		const rawKey = keyValue?.[1] ?? keyValue?.[2] ?? atRule?.[1];
		const rawValue = keyValue?.[3] ?? atRule?.[2];
		if (!rawKey || rawValue === undefined) continue;

		const key = METADATA_KEYS[rawKey.trim().toLowerCase().replace(/[\s_-]+/g, '')];
		if (!key) continue;

		if (key === 'tags') {
			metadata.tags = rawValue
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean);
		} else {
			metadata[key] = rawValue.trim();
		}
	}
	return metadata;
}

// A theme travels as one CSS string. The share endpoint stores that string and
// nothing else, so anything the stylesheet fetches from another host is a
// dependency the string cannot carry. Two ways that bites:
//
//   - The asset dies when its host does, and the theme rots quietly. One of
//     dialogue-386's wallpaper presets was a 404 before anyone noticed.
//   - A remote @import lets a stylesheet change its own contents after it was
//     reviewed and merged, on the site and in every client that applied it.
//     Uploads to Fluxer are permanent, so there is no taking that back.
//
// Comments are stripped first: a couple of themes document the one line Google
// Fonts import in their header for people who want the exact face, and that is
// advice, not a fetch.
const COMMENT = /\/\*[\s\S]*?\*\//g;
const ANY_IMPORT = /@import\b/i;
// url( optionally quoted, then either an explicit http(s) scheme or a protocol
// relative //. A data: URI starts with "d" and never matches.
const REMOTE_URL = /url\(\s*['"]?\s*(?:https?:)?\/\//gi;

export function findRemoteReferences(css) {
	const code = css.replace(COMMENT, ' ');
	const problems = [];

	if (ANY_IMPORT.test(code)) {
		problems.push('uses @import, which a share link cannot carry. Paste the rules in, or embed the font as a data: URI');
	}

	const remote = [...code.matchAll(REMOTE_URL)];
	if (remote.length > 0) {
		const plural = remote.length === 1 ? 'reference' : 'references';
		problems.push(`has ${remote.length} url() ${plural} to another host. Inline the asset as a data: URI`);
	}

	return problems;
}

// Pulled out for the gallery swatches. Only literal values are useful here, a
// value that still resolves through var() or color-mix() is skipped.
const SWATCH_TOKENS = [
	'--background-tertiary',
	'--background-secondary',
	'--background-primary',
	'--accent-primary',
	'--brand-primary',
	'--text-primary',
];

const SINGLE_VAR = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/;

// Later declarations win, so take the last one rather than the first. Themes
// routinely name a palette at the top and then override a token further down,
// and reading the top of the file gets you the value the theme discarded.
// The leading (?:^|[^\w-]) keeps --accent-primary from matching inside a longer
// name that happens to end with it.
function readDeclaration(css, token) {
	const pattern = new RegExp(`(?:^|[^\\w-])${token}\\s*:\\s*([^;\\n}]+)`, 'gm');
	let value = null;
	for (const match of css.matchAll(pattern)) value = match[1].trim();
	return value;
}

// Plenty of themes name their palette once at the top and point the Fluxer
// tokens at those names, so a swatch token often reads var(--ThemeSomething).
// Follow the chain until it lands on a literal.
function resolveValue(css, value, depth) {
	const indirection = SINGLE_VAR.exec(value);
	if (!indirection || depth > 4) return value;
	const next = readDeclaration(css, indirection[1]);
	return next === null ? value : resolveValue(css, next, depth + 1);
}

export function extractSwatch(css) {
	const swatch = {};
	for (const token of SWATCH_TOKENS) {
		const declared = readDeclaration(css, token);
		if (declared === null) continue;
		const value = resolveValue(css, declared, 0);
		if (/var\(|color-mix\(/.test(value)) continue;
		swatch[token] = value;
	}
	return swatch;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^(rgb|rgba|hsl|hsla)\(([^)]*)\)$/i;

function hslToRgb(hue, saturation, lightness) {
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const match = lightness - chroma / 2;
	const sector = Math.floor(hue / 60) % 6;
	const table = [
		[chroma, second, 0],
		[second, chroma, 0],
		[0, chroma, second],
		[0, second, chroma],
		[second, 0, chroma],
		[chroma, 0, second],
	];
	return table[sector].map((channel) => channel + match);
}

// Hex, rgb() and hsl(), in both the comma syntax and the space separated one.
// Returns channels in 0..1, or null when the value is something we cannot read.
// Alpha is parsed off and thrown away: the hue is all the gallery wants.
export function parseColor(color) {
	if (typeof color !== 'string') return null;
	const value = color.trim();

	const hex = HEX.exec(value);
	if (hex) {
		const digits = hex[1].length <= 4 ? [...hex[1]].map((char) => char + char).join('') : hex[1];
		if (digits.length !== 6 && digits.length !== 8) return null;
		return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255);
	}

	const functional = FUNCTIONAL.exec(value);
	if (!functional) return null;
	const parts = functional[2].split('/')[0].split(/[\s,]+/).filter(Boolean);
	if (parts.length < 3) return null;

	const numbers = parts.slice(0, 3).map((part) => Number.parseFloat(part));
	if (!numbers.every(Number.isFinite)) return null;

	if (functional[1].toLowerCase().startsWith('rgb')) {
		const channels = parts
			.slice(0, 3)
			.map((part, index) => (part.trim().endsWith('%') ? (numbers[index] / 100) * 255 : numbers[index]) / 255);
		return channels;
	}

	// Saturation and lightness are percentages whether or not the % is written.
	return hslToRgb(((numbers[0] % 360) + 360) % 360, numbers[1] / 100, numbers[2] / 100);
}

// The gallery filters by accent hue. Deriving it from the accent colour means a
// contributor never has to categorise their own theme.
export function hueBucket(color) {
	const parsed = parseColor(color);
	if (!parsed) return 'other';

	const [r, g, b] = parsed;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	if (delta < 0.04) return 'other';

	let hue;
	if (max === r) hue = ((g - b) / delta) % 6;
	else if (max === g) hue = (b - r) / delta + 2;
	else hue = (r - g) / delta + 4;
	hue = (hue * 60 + 360) % 360;

	if (hue < 75 || hue >= 330) return 'warm';
	if (hue < 175) return 'green';
	// Violet starts well before 260 perceptually: #7c6cff sits at 246 and nobody
	// calls that blue.
	if (hue < 240) return 'blue';
	return 'purple';
}

// --accent-primary is the theme's own accent when it declares one. Plenty of
// themes leave that to the base theme and colour the app through
// --brand-primary instead, DIALOGUE.386 among them, so fall through rather than
// filing those under "other" where no filter can reach them.
export function themeHue(variant) {
	for (const token of ['--accent-primary', '--brand-primary']) {
		const bucket = hueBucket(variant.swatch[token]);
		if (bucket !== 'other') return bucket;
	}
	return 'other';
}

export function countTokenOverrides(css) {
	const names = new Set();
	const re = /(--[a-zA-Z0-9-]+)\s*:/g;
	let match;
	while ((match = re.exec(css)) !== null) names.add(match[1]);
	return names.size;
}

export function sha256(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

function listThemeDirectories(themesDir) {
	return readdirSync(themesDir)
		.filter((entry) => !entry.startsWith('.'))
		.filter((entry) => statSync(join(themesDir, entry)).isDirectory())
		.sort();
}

/**
 * Reads every theme folder. Structural problems are collected as errors rather
 * than thrown, so validate.mjs can report all of them in one pass.
 */
export function loadThemes(repoRoot) {
	const themesDir = join(repoRoot, 'themes');
	const themes = [];
	const errors = [];
	const warnings = [];

	for (const slug of listThemeDirectories(themesDir)) {
		const dir = join(themesDir, slug);
		const manifestPath = `themes/${slug}/theme.json`;

		let manifest;
		try {
			manifest = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8'));
		} catch (error) {
			errors.push(`${manifestPath}: ${error.code === 'ENOENT' ? 'missing theme.json' : error.message}`);
			continue;
		}

		if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
			errors.push(`themes/${slug}: folder name must be lowercase letters, digits and dashes`);
		}

		const problems = validateManifest(manifest);
		if (problems.length > 0) {
			for (const problem of problems) errors.push(`${manifestPath}: ${problem}`);
			continue;
		}

		const variants = [];
		for (const variant of manifest.variants) {
			const cssPath = `themes/${slug}/${variant.file}`;
			let css;
			try {
				css = readFileSync(join(dir, variant.file), 'utf8');
			} catch {
				errors.push(`${manifestPath}: variant "${variant.name}" points at ${variant.file}, which does not exist`);
				continue;
			}

			if (css.trim().length === 0) {
				errors.push(`${cssPath}: file is empty`);
				continue;
			}

			const metadata = parseThemeMetadata(css);
			if (!metadata.name) {
				warnings.push(`${cssPath}: no /** @name ... */ header, Fluxer will fall back to the filename`);
			}

			const remote = findRemoteReferences(css);
			if (remote.length > 0) {
				for (const problem of remote) errors.push(`${cssPath}: ${problem}`);
				continue;
			}

			variants.push({
				id: variant.file.replace(/\.css$/i, ''),
				name: variant.name,
				description: variant.description ?? '',
				file: variant.file,
				path: cssPath,
				base: variant.base ?? 'dark',
				bytes: Buffer.byteLength(css, 'utf8'),
				hash: sha256(css),
				tokenCount: countTokenOverrides(css),
				swatch: extractSwatch(css),
				metadata,
				fluxerThemeId: variant.fluxerThemeId ?? null,
			});
		}

		if (variants.length === 0) {
			errors.push(`${manifestPath}: no usable variants`);
			continue;
		}

		themes.push({
			slug,
			name: manifest.name,
			description: manifest.description ?? '',
			author: manifest.author,
			homepage: manifest.homepage ?? null,
			license: manifest.license ?? null,
			tags: manifest.tags ?? [],
			hue: themeHue(variants[0]),
			variants,
		});
	}

	return {themes, errors, warnings};
}

// Kept in step with schema/theme.schema.json by hand, because adding a JSON
// schema validator would mean adding the first dependency this repo has. The
// limits below are the schema's limits. If you change one, change both.
const MANIFEST_KEYS = ['name', 'description', 'author', 'homepage', 'license', 'tags', 'variants'];
const VARIANT_KEYS = ['name', 'file', 'description', 'base', 'fluxerThemeId', 'fluxerThemeHash'];

function unknownKeys(object, allowed) {
	return Object.keys(object).filter((key) => !allowed.includes(key));
}

function validateManifest(manifest) {
	const problems = [];
	const isString = (value) => typeof value === 'string' && value.trim().length > 0;
	const tooLong = (value, limit) => typeof value === 'string' && value.length > limit;

	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
		return ['must be a JSON object'];
	}

	const strays = unknownKeys(manifest, MANIFEST_KEYS);
	if (strays.length > 0) {
		problems.push(`unknown key(s) ${strays.join(', ')}. A typo here is silently ignored, so it is an error`);
	}

	if (!isString(manifest.name)) problems.push('"name" is required and must be a non empty string');
	if (tooLong(manifest.name, 60)) problems.push('"name" is longer than 60 characters');
	if (!isString(manifest.author)) problems.push('"author" is required and must be a non empty string');
	if (tooLong(manifest.author, 80)) problems.push('"author" is longer than 80 characters');
	if (manifest.description !== undefined && typeof manifest.description !== 'string') {
		problems.push('"description" must be a string');
	}
	if (tooLong(manifest.description, 300)) problems.push('"description" is longer than 300 characters');
	if (manifest.homepage !== undefined && !isString(manifest.homepage)) {
		problems.push('"homepage" must be a non empty string');
	}
	if (tooLong(manifest.license, 60)) problems.push('"license" is longer than 60 characters');
	if (manifest.tags !== undefined) {
		if (!Array.isArray(manifest.tags) || !manifest.tags.every(isString)) {
			problems.push('"tags" must be an array of non empty strings');
		} else {
			if (manifest.tags.length > 12) problems.push('"tags" has more than 12 entries');
			if (manifest.tags.some((tag) => tag.length > 24)) problems.push('a tag is longer than 24 characters');
		}
	}
	if (!Array.isArray(manifest.variants) || manifest.variants.length === 0) {
		problems.push('"variants" is required and must contain at least one entry');
		return problems;
	}

	const seenFiles = new Set();
	manifest.variants.forEach((variant, index) => {
		const label = `variant ${index + 1}`;
		if (!variant || typeof variant !== 'object') {
			problems.push(`${label} must be an object`);
			return;
		}
		const variantStrays = unknownKeys(variant, VARIANT_KEYS);
		if (variantStrays.length > 0) problems.push(`${label}: unknown key(s) ${variantStrays.join(', ')}`);
		if (!isString(variant.name)) problems.push(`${label}: "name" is required`);
		if (tooLong(variant.name, 60)) problems.push(`${label}: "name" is longer than 60 characters`);
		if (tooLong(variant.description, 300)) problems.push(`${label}: "description" is longer than 300 characters`);
		if (!isString(variant.file)) {
			problems.push(`${label}: "file" is required`);
		} else {
			if (!/^[A-Za-z0-9._-]+\.css$/.test(variant.file)) {
				problems.push(`${label}: "file" must be a plain .css filename in this folder`);
			}
			if (seenFiles.has(variant.file)) problems.push(`${label}: duplicate file ${variant.file}`);
			seenFiles.add(variant.file);
		}
		if (variant.base !== undefined && !BASE_THEMES.includes(variant.base)) {
			problems.push(`${label}: "base" must be one of ${BASE_THEMES.join(', ')}`);
		}
		if (variant.fluxerThemeId !== undefined && !/^[0-9a-f]{16}$/.test(variant.fluxerThemeId)) {
			problems.push(`${label}: "fluxerThemeId" is written by the publish workflow, leave it out`);
		}
	});

	return problems;
}
