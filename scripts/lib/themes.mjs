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

// Pulled out for the gallery swatches. Only literal values are useful here, a
// value that still resolves through var() or color-mix() is skipped.
const SWATCH_TOKENS = [
	'--background-tertiary',
	'--background-secondary',
	'--background-primary',
	'--accent-primary',
	'--text-primary',
];

const SINGLE_VAR = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/;

function readDeclaration(css, token) {
	const match = new RegExp(`${token}\\s*:\\s*([^;\\n}]+)`).exec(css);
	return match ? match[1].trim() : null;
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

// The gallery filters by accent hue. Deriving it from the accent colour means a
// contributor never has to categorise their own theme.
export function hueBucket(color) {
	if (typeof color !== 'string') return 'other';
	const hex = color.trim().replace('#', '');
	const full = hex.length === 3 ? [...hex].map((char) => char + char).join('') : hex;
	if (!/^[0-9a-fA-F]{6}$/.test(full)) return 'other';

	const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
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
			hue: hueBucket(variants[0].swatch['--accent-primary']),
			variants,
		});
	}

	return {themes, errors, warnings};
}

function validateManifest(manifest) {
	const problems = [];
	const isString = (value) => typeof value === 'string' && value.trim().length > 0;

	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
		return ['must be a JSON object'];
	}
	if (!isString(manifest.name)) problems.push('"name" is required and must be a non empty string');
	if (!isString(manifest.author)) problems.push('"author" is required and must be a non empty string');
	if (manifest.description !== undefined && typeof manifest.description !== 'string') {
		problems.push('"description" must be a string');
	}
	if (manifest.tags !== undefined) {
		if (!Array.isArray(manifest.tags) || !manifest.tags.every(isString)) {
			problems.push('"tags" must be an array of non empty strings');
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
		if (!isString(variant.name)) problems.push(`${label}: "name" is required`);
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
