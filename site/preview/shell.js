/*
 * Loads a theme into the static mock.
 *
 * Query parameters:
 *   css   path to the theme stylesheet, same origin only
 *   base  dark | light | coal | dark_legacy, defaults to dark
 *
 * That is the whole job. The preview does not respond to input.
 */

(function () {
	'use strict';

	var params = new URLSearchParams(window.location.search);
	var styleElement = document.getElementById('fluxer-custom-theme-style');
	var root = document.documentElement;

	// Matches ThemeTypes upstream, minus "system", which resolves to dark or
	// light before it reaches the DOM.
	var BASE_THEMES = ['dark', 'light', 'coal', 'dark_legacy'];

	var base = params.get('base');
	if (BASE_THEMES.indexOf(base) === -1) base = 'dark';
	root.classList.add('theme-' + base);

	function notifyParent(type, detail) {
		if (window.parent === window) return;
		window.parent.postMessage(Object.assign({type: type}, detail || {}), window.location.origin);
	}

	// Same origin only. A preview link should never be able to pull a stylesheet
	// off an arbitrary host.
	var href = null;
	try {
		var url = new URL(params.get('css') || '', window.location.href);
		if (url.origin === window.location.origin) href = url.href;
	} catch (error) {
		href = null;
	}

	if (!href) {
		notifyParent('preview:ready');
		return;
	}

	fetch(href)
		.then(function (response) {
			if (!response.ok) throw new Error('theme stylesheet returned ' + response.status);
			return response.text();
		})
		.then(function (css) {
			styleElement.textContent = css;
			notifyParent('preview:ready');
		})
		.catch(function (error) {
			notifyParent('preview:error', {message: String(error && error.message)});
		});
})();
