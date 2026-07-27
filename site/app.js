/*
 * Browse on the left, one static preview on the right. Selecting a theme
 * reloads the preview frame with a new stylesheet.
 */

(function () {
	'use strict';

	// "other" is not a decoration. A theme that sets no accent at all, or sets a
	// greyscale one, buckets there, and without a dot for it those themes were
	// reachable from All and from nowhere else.
	var HUES = [
		{key: 'all', label: 'All hues', color: 'linear-gradient(135deg,#8fc6ea,#3dff8b,#e86a3f,#7c5cff)'},
		{key: 'blue', label: 'Blue', color: '#8fc6ea'},
		{key: 'green', label: 'Green', color: '#3dff8b'},
		{key: 'warm', label: 'Warm', color: '#e86a3f'},
		{key: 'purple', label: 'Purple', color: '#7c5cff'},
		{key: 'other', label: 'No accent set', color: 'repeating-linear-gradient(135deg,#6b6b76 0 4px,#4a4a54 4px 8px)'},
	];

	var SORT_NOTES = {az: 'by name', tokens: 'most tokens set', variants: 'most variants'};
	var REPO = 'https://github.com/DeeKahy/fluxer-theme-library';

	var el = {
		brandCount: document.getElementById('brand-count'),
		search: document.getElementById('search'),
		modeTabs: document.getElementById('mode-tabs'),
		hueDots: document.getElementById('hue-dots'),
		clear: document.getElementById('clear'),
		sortTabs: document.getElementById('sort-tabs'),
		resultCount: document.getElementById('result-count'),
		sortNote: document.getElementById('sort-note'),
		list: document.getElementById('theme-list'),
		detail: document.getElementById('detail'),
		title: document.getElementById('detail-title'),
		mode: document.getElementById('detail-mode'),
		sub: document.getElementById('detail-sub'),
		scaler: document.getElementById('stage-scaler'),
		frame: document.getElementById('stage-frame'),
		stageError: document.getElementById('stage-error'),
		variantChips: document.getElementById('variant-chips'),
		installSource: document.getElementById('install-source'),
		copy: document.getElementById('copy-css'),
		download: document.getElementById('download-css'),
		viewSource: document.getElementById('view-source'),
		openRow: document.getElementById('open-row'),
		openInFluxer: document.getElementById('open-in-fluxer'),
		openInDesktop: document.getElementById('open-in-desktop'),
		openInCanary: document.getElementById('open-in-canary'),
		note: document.getElementById('install-note'),
	};

	var state = {
		index: null,
		query: '',
		mode: 'all',
		hue: 'all',
		sort: 'az',
		theme: null,
		variant: null,
	};

	/* ------------------------------------------------------------- helpers */

	function cssPath(theme, variant) {
		return 'themes/' + theme.slug + '/' + variant.file;
	}

	function isLight(variant) {
		return variant.base === 'light';
	}

	// The mode filter is about variants, not themes. Filtering to Light used to
	// keep the whole theme and then draw all of its variants, so Gruvbox Dark
	// turned up under Light. Work out the visible set once and render that.
	function visibleVariants(theme) {
		if (state.mode === 'all') return theme.variants;
		var wanted = state.mode === 'light' ? 'light' : 'dark';
		return theme.variants.filter(function (variant) {
			return (isLight(variant) ? 'light' : 'dark') === wanted;
		});
	}

	function matches(theme) {
		if (state.hue !== 'all' && theme.hue !== state.hue) return false;
		if (visibleVariants(theme).length === 0) return false;
		if (!state.query) return true;

		var haystack = [theme.name, theme.author, theme.description, theme.tags.join(' ')]
			.concat(
				theme.variants.map(function (variant) {
					return variant.name + ' ' + variant.description;
				}),
			)
			.join(' ')
			.toLowerCase();
		return haystack.indexOf(state.query) !== -1;
	}

	// The most tokens any one variant sets. Reading variants[0] meant a theme
	// whose second variant did most of the work sorted as though it had not.
	function tokenScore(theme) {
		return theme.variants.reduce(function (best, variant) {
			return Math.max(best, variant.tokenCount);
		}, 0);
	}

	function sorted(themes) {
		var list = themes.slice();
		if (state.sort === 'tokens') {
			list.sort(function (a, b) {
				return tokenScore(b) - tokenScore(a) || a.name.localeCompare(b.name);
			});
		} else if (state.sort === 'variants') {
			list.sort(function (a, b) {
				return b.variants.length - a.variants.length || a.name.localeCompare(b.name);
			});
		} else {
			list.sort(function (a, b) {
				return a.name.localeCompare(b.name);
			});
		}
		return list;
	}

	/* ---------------------------------------------------------- list rows */

	// A theme with a wallpaper leaves the stacked chrome tokens transparent and
	// tints from the app container instead, so secondary can be nothing to look
	// at. Fall through to the next surface down rather than draw a hole.
	function surface(variant, tokens, fallback) {
		for (var i = 0; i < tokens.length; i++) {
			var value = variant.swatch[tokens[i]];
			if (value && value !== 'transparent') return value;
		}
		return fallback;
	}

	function swatch(variant) {
		// Secondary is the dominant surface in the real client, so the swatch
		// leads with it rather than with primary.
		var wrap = document.createElement('span');
		wrap.className = 'row-swatch';
		wrap.style.background = surface(variant, ['--background-secondary', '--background-primary'], '#141418');

		var rail = document.createElement('i');
		rail.style.background = surface(variant, ['--background-tertiary', '--background-primary'], 'rgba(0,0,0,.35)');

		var body = document.createElement('b');
		var bar = document.createElement('span');
		bar.style.background = variant.swatch['--accent-primary'] || '#8a8a92';
		body.appendChild(bar);

		wrap.appendChild(rail);
		wrap.appendChild(body);
		return wrap;
	}

	function buildRow(theme, variant, index) {
		// The lead row of a theme carries the theme's name, but only when it is
		// really the first variant. Under a mode filter the lead row can be some
		// other variant, and calling that one "Gruvbox" would be a lie.
		var isLead = index === 0;
		var isBase = isLead && variant === theme.variants[0];

		var item = document.createElement('li');
		var row = document.createElement('button');
		row.type = 'button';
		row.className = 'row' + (isLead ? '' : ' is-variant');
		row.setAttribute('aria-current', String(state.theme === theme && state.variant === variant));

		var copy = document.createElement('span');
		copy.className = 'row-copy';

		var name = document.createElement('span');
		name.className = 'row-name';
		name.textContent = isBase ? theme.name : variant.name;

		var meta = document.createElement('span');
		meta.className = 'row-meta';
		meta.textContent = isLead ? 'by ' + theme.author : 'variant of ' + theme.name;

		copy.appendChild(name);
		copy.appendChild(meta);

		var chip = document.createElement('span');
		chip.className = 'mode-chip' + (isLight(variant) ? ' is-light' : '');
		chip.textContent = isLight(variant) ? 'light' : 'dark';

		row.appendChild(swatch(variant));
		row.appendChild(copy);
		row.appendChild(chip);
		row.addEventListener('click', function () {
			select(theme, variant);
		});

		item.appendChild(row);
		return item;
	}

	function renderList() {
		var visible = sorted(state.index.themes.filter(matches));
		var rows = [];
		visible.forEach(function (theme) {
			visibleVariants(theme).forEach(function (variant, index) {
				rows.push(buildRow(theme, variant, index));
			});
		});

		el.list.replaceChildren.apply(el.list, rows);

		var variantTotal = visible.reduce(function (total, theme) {
			return total + visibleVariants(theme).length;
		}, 0);
		el.resultCount.textContent =
			visible.length + (visible.length === 1 ? ' theme' : ' themes') + ' · ' + variantTotal + ' variants';
		el.sortNote.textContent = SORT_NOTES[state.sort];
		el.clear.classList.toggle('is-dirty', Boolean(state.query) || state.mode !== 'all' || state.hue !== 'all');

		if (rows.length === 0) {
			var empty = document.createElement('li');
			empty.className = 'state-message';
			empty.textContent = 'Nothing matches that filter.';
			el.list.appendChild(empty);
		}
	}

	/* ------------------------------------------------------------- detail */

	function renderVariantChips() {
		var chips = state.theme.variants.map(function (variant) {
			var chip = document.createElement('button');
			chip.type = 'button';
			chip.className = 'variant-chip';
			chip.setAttribute('aria-pressed', String(variant === state.variant));

			var dot = document.createElement('i');
			dot.style.background = variant.swatch['--accent-primary'] || '#8a8a92';
			chip.appendChild(dot);
			chip.appendChild(document.createTextNode(variant.name));
			chip.addEventListener('click', function () {
				select(state.theme, variant);
			});
			return chip;
		});

		var add = document.createElement('a');
		add.className = 'variant-add';
		add.href = REPO + '/blob/main/CONTRIBUTING.md#variants';
		add.textContent = '+ add a variant';
		chips.push(add);

		el.variantChips.replaceChildren.apply(el.variantChips, chips);
	}

	function renderApply() {
		var path = cssPath(state.theme, state.variant);

		el.installSource.textContent = state.variant.fluxerThemeId
			? 'web.fluxer.app/theme/' + state.variant.fluxerThemeId
			: path;

		el.download.href = path;
		el.download.setAttribute('download', state.theme.slug + '-' + state.variant.id + '.css');
		el.viewSource.href = REPO + '/blob/main/' + path;

		// One uploaded stylesheet, three ways in. Stable and canary are separate
		// front ends over the same CDN object, so the id resolves on both.
		// fluxer:// is the desktop protocol handler, which turns the URL into the
		// same /theme/<id> route inside the app.
		if (state.variant.fluxerThemeId) {
			var id = state.variant.fluxerThemeId;
			el.openRow.hidden = false;
			el.openInFluxer.href = 'https://web.fluxer.app/theme/' + id;
			el.openInCanary.href = 'https://web.canary.fluxer.app/theme/' + id;
			el.openInDesktop.href = 'fluxer://theme/' + id;
			el.note.textContent = 'one click in the app, or paste the CSS into Quick CSS yourself';
		} else {
			el.openRow.hidden = true;
			el.note.textContent = 'paste into Theme Studio, Quick CSS, or import the file into your theme library';
		}
	}

	function loadFrame() {
		// Absolute so it does not depend on how deep the shell lives. The shell
		// reads css and base and nothing else, so nothing else is sent.
		var query = new URLSearchParams({
			css: new URL(cssPath(state.theme, state.variant), window.location.href).href,
			base: state.variant.base,
		});
		el.stageError.hidden = true;
		el.frame.src = 'site/preview/shell.html?' + query.toString();
	}

	// The shell has always reported back when a stylesheet fails to load, and
	// nobody was listening, so a broken theme showed an empty frame and no
	// explanation.
	window.addEventListener('message', function (event) {
		if (event.origin !== window.location.origin) return;
		var message = event.data;
		if (!message || typeof message !== 'object') return;
		if (message.type === 'preview:ready') {
			el.stageError.hidden = true;
		} else if (message.type === 'preview:error') {
			el.stageError.textContent = 'This theme did not load: ' + (message.message || 'unknown error');
			el.stageError.hidden = false;
		}
	});

	function select(theme, variant) {
		var sameFrame = state.theme === theme && state.variant === variant;
		state.theme = theme;
		state.variant = variant;

		document.title = theme.name + ' ' + variant.name + ' - Fluxer Theme Library';
		el.title.textContent = theme.variants.length > 1 ? theme.name + ' ' + variant.name : theme.name;
		el.mode.textContent = isLight(variant) ? 'light' : 'dark';
		el.mode.className = 'mode-chip' + (isLight(variant) ? ' is-light' : '');

		var blurb = variant.description || theme.description || '';
		el.sub.textContent =
			(blurb ? blurb + ' ' : '') +
			'By ' +
			theme.author +
			'. ' +
			variant.tokenCount +
			' tokens, ' +
			(variant.bytes / 1024).toFixed(1) +
			' KB.';

		var url = new URL(window.location.href);
		url.searchParams.set('theme', theme.slug);
		url.searchParams.set('variant', variant.id);
		window.history.replaceState({}, '', url);

		// Canonical stays at theme level, matching the sitemap. Variants of a
		// theme are the same page.
		var canonical = document.querySelector('link[rel="canonical"]');
		if (canonical) canonical.href = url.origin + url.pathname + '?theme=' + encodeURIComponent(theme.slug);

		renderList();
		renderVariantChips();
		renderApply();
		if (!sameFrame) loadFrame();
	}

	/* -------------------------------------------------------------- stage */

	// The frame is a fixed 1100x700 desktop window scaled to fit the column.
	function fitStage() {
		var available = el.scaler.parentElement.clientWidth - 36;
		var scale = Math.min(0.62, Math.max(0.3, available / 1100));
		el.scaler.style.setProperty('--stage-scale', String(scale));
		el.frame.style.setProperty('--stage-scale', String(scale));
	}

	/* ------------------------------------------------------------ filters */

	function buildHueDots() {
		HUES.forEach(function (hue) {
			var dot = document.createElement('button');
			dot.type = 'button';
			dot.className = 'hue';
			dot.style.background = hue.color;
			dot.title = hue.label;
			dot.setAttribute('aria-label', hue.label);
			dot.setAttribute('aria-pressed', String(state.hue === hue.key));
			dot.addEventListener('click', function () {
				state.hue = hue.key;
				el.hueDots.querySelectorAll('.hue').forEach(function (other, index) {
					other.setAttribute('aria-pressed', String(HUES[index].key === state.hue));
				});
				renderList();
			});
			el.hueDots.appendChild(dot);
		});
	}

	function wireSegmented(container, key, onChange) {
		container.querySelectorAll('button').forEach(function (button) {
			button.addEventListener('click', function () {
				state[key] = button.dataset[key];
				container.querySelectorAll('button').forEach(function (other) {
					other.setAttribute('aria-pressed', String(other === button));
				});
				onChange();
			});
		});
	}

	wireSegmented(el.modeTabs, 'mode', renderList);
	wireSegmented(el.sortTabs, 'sort', renderList);
	el.search.addEventListener('input', function () {
		state.query = el.search.value.trim().toLowerCase();
		renderList();
	});

	el.clear.addEventListener('click', function () {
		state.query = '';
		state.mode = 'all';
		state.hue = 'all';
		el.search.value = '';
		el.modeTabs.querySelectorAll('button').forEach(function (button) {
			button.setAttribute('aria-pressed', String(button.dataset.mode === 'all'));
		});
		el.hueDots.querySelectorAll('.hue').forEach(function (dot, index) {
			dot.setAttribute('aria-pressed', String(HUES[index].key === 'all'));
		});
		renderList();
	});

	el.copy.addEventListener('click', function () {
		fetch(cssPath(state.theme, state.variant))
			.then(function (response) {
				return response.ok ? response.text() : Promise.reject(new Error('could not read the stylesheet'));
			})
			.then(function (css) {
				return navigator.clipboard.writeText(css);
			})
			.then(function () {
				el.copy.textContent = 'Copied';
				setTimeout(function () {
					el.copy.textContent = 'Copy CSS';
				}, 1600);
			})
			.catch(function () {
				el.copy.textContent = 'Copy failed';
				setTimeout(function () {
					el.copy.textContent = 'Copy CSS';
				}, 1600);
			});
	});

	window.addEventListener('resize', fitStage);

	/* --------------------------------------------------------------- boot */

	buildHueDots();
	fitStage();

	// no-cache forces a revalidation rather than a blind hit on the browser copy.
	// The index changes whenever a theme is added or published, and Pages serves
	// it with a cache header, so without this a returning visitor keeps seeing an
	// old theme list and missing Open in Fluxer buttons.
	fetch('themes/index.json', {cache: 'no-cache'})
		.then(function (response) {
			if (!response.ok) throw new Error('index returned ' + response.status);
			return response.json();
		})
		.then(function (index) {
			state.index = index;
			el.brandCount.textContent = String(index.themeCount);

			var params = new URLSearchParams(window.location.search);
			var theme =
				index.themes.find(function (item) {
					return item.slug === params.get('theme');
				}) || index.themes[0];
			if (!theme) {
				el.sub.textContent = 'No themes in the index yet.';
				return;
			}
			var variant =
				theme.variants.find(function (item) {
					return item.id === params.get('variant');
				}) || theme.variants[0];

			select(theme, variant);
			fitStage();
		})
		.catch(function (error) {
			el.title.textContent = 'Could not load the index';
			el.sub.textContent = 'Run "node scripts/build-index.mjs" if you are viewing this locally.';
			console.error(error);
		});
})();
