/*
 * Loads a theme into the static mock.
 *
 * Query parameters:
 *   css       path to the theme stylesheet, same origin only
 *   base      dark | light | coal | dark_legacy, defaults to dark
 *   platform  web | macos | windows | linux, defaults to web
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

	// Exactly one, replacing whatever is on the element rather than adding to
	// it. The markup used to ship theme-dark and this used to add a second
	// class on top, which was fine only while nothing defined .theme-dark.
	var base = params.get('base');
	if (BASE_THEMES.indexOf(base) === -1) base = 'dark';
	root.className = 'theme-' + base;

	// app/globals.css re-declares some tokens behind platform classes, and those
	// selectors beat :root. --layout-guild-list-width on macOS desktop is the
	// one that has bitten: a theme that sets it only on :root gets the stock
	// rail width there and the themed one on the web. The mock had no platform
	// classes at all, which is exactly why that went unnoticed.
	var PLATFORMS = {
		web: [],
		macos: ['platform-native', 'platform-macos'],
		windows: ['platform-native', 'platform-windows'],
		linux: ['platform-native', 'platform-linux'],
	};

	var platform = params.get('platform');
	if (!Object.prototype.hasOwnProperty.call(PLATFORMS, platform)) platform = 'web';
	PLATFORMS[platform].forEach(function (name) {
		root.classList.add(name);
	});

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
