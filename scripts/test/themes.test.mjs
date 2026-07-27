// Run with:
//
//   node --test
//
// node:test is standard library, so this stays true to the no dependencies
// rule. What is worth pinning here is the code that is a port of somebody
// else's behaviour, parseThemeMetadata above all, plus the parsing that decides
// how a theme is filed in the gallery.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	extractSwatch,
	findRemoteReferences,
	hueBucket,
	parseColor,
	parseThemeMetadata,
	themeHue,
} from '../lib/themes.mjs';

/* ------------------------------------------------------ header metadata */

test('reads the header Fluxer itself reads', () => {
	const metadata = parseThemeMetadata(`/**
 * @name Gruvbox
 * @description Retro groove.
 * @author morhetz
 * @version 1.2.0
 * @tags dark, warm, low-contrast
 */
:root { --accent-primary: #fe8019; }`);

	assert.equal(metadata.name, 'Gruvbox');
	assert.equal(metadata.description, 'Retro groove.');
	assert.equal(metadata.author, 'morhetz');
	assert.equal(metadata.version, '1.2.0');
	assert.deepEqual(metadata.tags, ['dark', 'warm', 'low-contrast']);
});

test('honours upstream key aliases', () => {
	const metadata = parseThemeMetadata(`/*
 * title: Aliased
 * summary: via summary
 * authors: two people
 * ver: 3
 * tag: one, two
 */`);

	assert.equal(metadata.name, 'Aliased');
	assert.equal(metadata.description, 'via summary');
	assert.equal(metadata.author, 'two people');
	assert.equal(metadata.version, '3');
	assert.deepEqual(metadata.tags, ['one', 'two']);
});

test('a file with no header parses to empty rather than throwing', () => {
	assert.deepEqual(parseThemeMetadata(':root { --accent-primary: #fff; }'), {
		name: '',
		description: '',
		author: '',
		version: '',
		tags: [],
	});
});

/* -------------------------------------------------------- colour reading */

test('parses the colour syntaxes themes actually use', () => {
	assert.deepEqual(parseColor('#fff'), [1, 1, 1]);
	assert.deepEqual(parseColor('#ffffff'), [1, 1, 1]);
	assert.deepEqual(parseColor('#ffffffff'), [1, 1, 1]);
	assert.deepEqual(parseColor('rgb(255, 0, 0)'), [1, 0, 0]);
	assert.deepEqual(parseColor('rgb(255 0 0 / 50%)'), [1, 0, 0]);
	assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), [1, 0, 0]);
	assert.deepEqual(parseColor('hsl(0 100% 50%)'), [1, 0, 0]);
});

test('gives up on values it cannot resolve', () => {
	assert.equal(parseColor('var(--something)'), null);
	assert.equal(parseColor('color-mix(in srgb, red, blue)'), null);
	assert.equal(parseColor('transparent'), null);
	assert.equal(parseColor(undefined), null);
});

test('buckets hues at the boundaries the comment claims', () => {
	// #7c6cff sits at 246, and nobody calls that blue.
	assert.equal(hueBucket('#7c6cff'), 'purple');
	assert.equal(hueBucket('#fe8019'), 'warm');
	assert.equal(hueBucket('#43b581'), 'green');
	assert.equal(hueBucket('#2780e6'), 'blue');
	// Space separated hsl used to fall through to "other".
	assert.equal(hueBucket('hsl(320 60% 31%)'), 'purple');
	// Near greyscale has no hue worth filtering on.
	assert.equal(hueBucket('#807f80'), 'other');
});

test('falls back to --brand-primary when a theme sets no accent', () => {
	assert.equal(themeHue({swatch: {'--accent-primary': '#fe8019'}}), 'warm');
	assert.equal(themeHue({swatch: {'--brand-primary': '#00ff00'}}), 'green');
	assert.equal(themeHue({swatch: {}}), 'other');
});

/* -------------------------------------------------------------- swatches */

test('follows var() indirection to a literal', () => {
	const swatch = extractSwatch(`:root {
		--ThemeAccent: #7c6cff;
		--accent-primary: var(--ThemeAccent);
	}`);
	assert.equal(swatch['--accent-primary'], '#7c6cff');
});

test('takes the last declaration, not the first', () => {
	const swatch = extractSwatch(`:root { --accent-primary: #111111; }
	:root { --accent-primary: #222222; }`);
	assert.equal(swatch['--accent-primary'], '#222222');
});

test('skips a value that never reaches a literal', () => {
	const swatch = extractSwatch(':root { --accent-primary: color-mix(in srgb, red, blue); }');
	assert.equal(swatch['--accent-primary'], undefined);
});

/* ------------------------------------------------------ remote references */

test('rejects fetches a share link cannot carry', () => {
	assert.equal(findRemoteReferences('@import url("https://fonts.googleapis.com/css2");').length, 2);
	assert.equal(findRemoteReferences(':root{--a:url("https://host/x.png");}').length, 1);
	assert.equal(findRemoteReferences(':root{--a:url(//host/x.png);}').length, 1);
});

test('leaves alone what a theme is allowed to do', () => {
	// A documented import in a header comment is advice, not a fetch.
	assert.deepEqual(findRemoteReferences('/* @import url("https://fonts.googleapis.com/css2"); */'), []);
	// base64 contains / and + freely, and must not read as protocol relative.
	assert.deepEqual(findRemoteReferences(':root{--a:url("data:image/webp;base64,AA//BB+/==");}'), []);
	assert.deepEqual(findRemoteReferences(':root{--a:url("./local.png");}'), []);
});
