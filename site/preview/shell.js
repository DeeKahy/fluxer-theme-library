/*
 * Drives the mock client.
 *
 * Query parameters:
 *   css     path to the theme stylesheet, same origin only
 *   base    dark | light | coal | dark_legacy, defaults to dark
 *   screen  server | dm | voice | settings, defaults to server
 *   static  set to 1 to disable interaction
 *
 * The page also accepts postMessage from its opener so the site can switch
 * theme, base and screen without reloading the frame.
 */

(function () {
	'use strict';

	var params = new URLSearchParams(window.location.search);
	var styleElement = document.getElementById('fluxer-custom-theme-style');
	var root = document.documentElement;
	var app = document.getElementById('app');

	// Matches ThemeTypes in fluxer_app, minus the "system" pseudo value which
	// resolves to dark or light before it reaches the DOM.
	var BASE_THEMES = ['dark', 'light', 'coal', 'dark_legacy'];
	var SCREENS = ['server', 'dm', 'voice', 'settings'];

	var SCREEN_CHROME = {
		server: {
			sidebarTitle: 'Pixel Foundry',
			sidebarMeta: '1.2k',
			search: 'Jump to...',
			icon: '#',
			title: 'showcase',
			topic: 'post your theme, get roasted lovingly',
			pill: '41 online',
			composer: 'Message #showcase',
			typing: 'marek',
		},
		dm: {
			sidebarTitle: 'Messages',
			sidebarMeta: '6',
			search: 'Find a conversation',
			icon: '●',
			title: 'sunniva',
			topic: 'theme jam co-conspirator',
			pill: 'Call',
			composer: 'Message @sunniva',
			typing: 'sunniva',
		},
		voice: {
			sidebarTitle: 'Pixel Foundry',
			sidebarMeta: '1.2k',
			search: 'Jump to...',
			icon: '🔊',
			title: 'paint bucket',
			topic: '4 in voice, region stockholm',
			pill: '26 ms',
		},
		settings: {
			sidebarTitle: 'Settings',
			sidebarMeta: 'esc',
			search: 'Search settings',
			icon: '◆',
			title: 'Appearance',
			topic: 'themes, density and accessibility',
			pill: 'Reset',
		},
	};

	function text(id, value) {
		var node = document.getElementById(id);
		if (node && value !== undefined) node.textContent = value;
	}

	function setBaseTheme(name) {
		var next = BASE_THEMES.indexOf(name) === -1 ? 'dark' : name;
		BASE_THEMES.forEach(function (theme) {
			root.classList.remove('theme-' + theme);
		});
		root.classList.add('theme-' + next);
	}

	function setScreen(name) {
		var next = SCREENS.indexOf(name) === -1 ? 'server' : name;
		app.dataset.screen = next;

		var chrome = SCREEN_CHROME[next];
		text('sidebar-title', chrome.sidebarTitle);
		text('sidebar-meta', chrome.sidebarMeta);
		text('sidebar-search-label', chrome.search);
		text('header-icon', chrome.icon);
		text('header-title', chrome.title);
		text('header-topic', chrome.topic);
		text('header-pill', chrome.pill);

		var composer = document.getElementById('composer-input');
		if (composer && chrome.composer) composer.placeholder = chrome.composer;

		var typing = document.getElementById('typing-text');
		if (typing && chrome.typing) {
			typing.replaceChildren();
			var name_ = document.createElement('b');
			name_.textContent = chrome.typing;
			typing.appendChild(name_);
			typing.appendChild(document.createTextNode(' is typing...'));
		}
	}

	// Only same origin paths are loadable. A preview link should never be able
	// to pull a stylesheet off an arbitrary host.
	function resolveSameOrigin(value) {
		if (!value) return null;
		try {
			var url = new URL(value, window.location.href);
			if (url.origin !== window.location.origin) return null;
			return url.href;
		} catch (error) {
			return null;
		}
	}

	function applyCss(css) {
		styleElement.textContent = css || '';
		notifyParent('preview:applied');
	}

	function loadCss(value) {
		var href = resolveSameOrigin(value);
		if (!href) {
			applyCss('');
			return;
		}
		fetch(href)
			.then(function (response) {
				if (!response.ok) throw new Error('theme stylesheet returned ' + response.status);
				return response.text();
			})
			.then(applyCss)
			.catch(function (error) {
				applyCss('');
				notifyParent('preview:error', {message: String(error && error.message)});
			});
	}

	function notifyParent(type, detail) {
		if (window.parent === window) return;
		var message = {type: type};
		if (detail) Object.assign(message, detail);
		window.parent.postMessage(message, window.location.origin);
	}

	setBaseTheme(params.get('base'));
	setScreen(params.get('screen'));
	text('settings-theme-name', params.get('name') || 'This theme');
	text('settings-theme-author', params.get('author') || 'community');

	var isStatic = params.get('static') === '1';
	if (isStatic) document.body.classList.add('is-static');

	loadCss(params.get('css'));

	window.addEventListener('message', function (event) {
		if (event.origin !== window.location.origin) return;
		var data = event.data || {};
		if (data.type === 'preview:set-base') {
			setBaseTheme(data.base);
		} else if (data.type === 'preview:set-screen') {
			setScreen(data.screen);
		} else if (data.type === 'preview:set-css') {
			text('settings-theme-name', data.name || 'This theme');
			text('settings-theme-author', data.author || 'community');
			if (typeof data.css === 'string') {
				applyCss(data.css);
			} else {
				loadCss(data.href);
			}
		}
	});

	if (isStatic) {
		notifyParent('preview:ready');
		return;
	}

	/* ------------------------------------------------------- interactions */

	document.querySelectorAll('.spoiler').forEach(function (spoiler) {
		spoiler.addEventListener('click', function () {
			spoiler.classList.toggle('is-revealed');
		});
	});

	document.querySelectorAll('.toggle').forEach(function (toggle) {
		toggle.addEventListener('click', function () {
			var on = toggle.classList.toggle('is-on');
			toggle.setAttribute('aria-checked', String(on));
		});
	});

	document.querySelectorAll('.sidebar-group').forEach(function (group) {
		group.querySelectorAll('.channel').forEach(function (channel) {
			channel.addEventListener('click', function () {
				group.querySelectorAll('.channel').forEach(function (other) {
					other.classList.remove('is-active');
				});
				channel.classList.add('is-active');
				channel.classList.remove('is-unread');

				var badge = channel.querySelector('.channel-badge');
				if (badge) badge.remove();

				var name = channel.querySelector('.channel-name').textContent;
				var isVoice = channel.dataset.flx === 'channel.item.voice';
				var screen = app.dataset.screen;

				if (isVoice) {
					setScreen('voice');
					text('header-title', name);
					return;
				}
				if (screen === 'voice') setScreen('server');

				text('header-title', name);
				var composer = document.getElementById('composer-input');
				if (composer) {
					composer.placeholder = (app.dataset.screen === 'dm' ? 'Message @' : 'Message #') + name;
				}
			});
		});
	});

	var messages = document.getElementById('messages');
	var composerInput = document.getElementById('composer-input');

	// Open at the newest message, the way a chat client does.
	messages.scrollTop = messages.scrollHeight;

	function formatClock(date) {
		return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
	}

	function appendOwnMessage(body) {
		var article = document.createElement('article');
		article.className = 'message';
		article.setAttribute('data-flx', 'messaging.message');

		var avatar = document.createElement('span');
		avatar.className = 'avatar avatar-you';
		var glyph = document.createElement('span');
		glyph.className = 'avatar-glyph';
		glyph.textContent = 'RK';
		avatar.appendChild(glyph);

		var messageBody = document.createElement('div');
		messageBody.className = 'message-body';

		var heading = document.createElement('div');
		heading.className = 'message-heading';
		var username = document.createElement('span');
		username.className = 'username';
		username.textContent = 'rikke';
		var time = document.createElement('time');
		time.className = 'timestamp';
		time.textContent = formatClock(new Date());
		heading.appendChild(username);
		heading.appendChild(time);

		var markup = document.createElement('div');
		markup.className = 'markup';
		markup.textContent = body;

		messageBody.appendChild(heading);
		messageBody.appendChild(markup);
		article.appendChild(avatar);
		article.appendChild(messageBody);
		messages.appendChild(article);
		messages.scrollTop = messages.scrollHeight;
	}

	composerInput.addEventListener('keydown', function (event) {
		if (event.key !== 'Enter') return;
		var value = composerInput.value.trim();
		if (!value) return;
		event.preventDefault();
		appendOwnMessage(value);
		composerInput.value = '';
	});

	notifyParent('preview:ready');
})();
