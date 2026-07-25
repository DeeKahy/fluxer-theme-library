/*
 * A cat that chases the cursor, sits down when it catches up, and falls asleep
 * if you leave it alone for twenty seconds.
 *
 * The idea is oneko, by Adryd, which most people meet through the Vencord or
 * BetterDiscord ports. This is our own implementation and our own drawing, so
 * there is no third party sprite sheet to hotlink or redistribute.
 *
 * It is an easter egg: click the Fluxer Theme Library heading five times in a
 * row to summon it. Nothing on the page advertises this.
 *
 * It lives on this page and not in any theme. A Fluxer theme is a stylesheet,
 * the share endpoint stores nothing but CSS, and the client has no plugin
 * system, so cursor chasing is not something a theme can do. Putting it here
 * keeps the theme previews honest about what a theme actually does.
 */

(function () {
	'use strict';

	// No cursor to chase on a touch screen, and nothing should move for someone
	// who asked the system for less motion.
	if (!window.matchMedia('(pointer: fine)').matches) return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	var SPEED = 10; // pixels per tick
	var TICK_MS = 100;
	var CATCH_UP = 48; // close enough to stop chasing
	var TIRED_AFTER = 180; // ticks, so 18 seconds
	var SLEEP_AFTER = 200; // ticks, so 20 seconds

	var INK = '%23ff8cc4';
	var FILL = '%232a1524';

	function sprite(inner) {
		return (
			"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
			inner +
			'%3C/svg%3E")'
		);
	}

	function g(inner) {
		return (
			"%3Cg fill='" +
			FILL +
			"' stroke='" +
			INK +
			"' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E" +
			inner +
			'%3C/g%3E'
		);
	}

	// Facing right in every pose. Direction is handled by flipping the element.
	var POSES = {
		run: [
			sprite(
				g(
					"%3Cellipse cx='15' cy='18' rx='9' ry='5.5'/%3E%3Ccircle cx='24' cy='13' r='5'/%3E" +
						"%3Cpath d='M21 9l-1-4 4 2M27 9l1-4-4 2'/%3E" +
						"%3Cpath d='M9 22l-3 4M14 23l-2 4M18 23l2 4M22 22l3 4'/%3E" +
						"%3Cpath d='M6 16C2 13 3 9 6 8'/%3E" +
						"%3Ccircle cx='25' cy='12' r='.9' fill='" + INK + "' stroke='none'/%3E",
				),
			),
			sprite(
				g(
					"%3Cellipse cx='15' cy='18' rx='9' ry='5.5'/%3E%3Ccircle cx='24' cy='13' r='5'/%3E" +
						"%3Cpath d='M21 9l-1-4 4 2M27 9l1-4-4 2'/%3E" +
						"%3Cpath d='M9 22l2 4M14 23l3 3M18 23l-3 4M22 22l-2 4'/%3E" +
						"%3Cpath d='M6 16C3 12 5 9 8 9'/%3E" +
						"%3Ccircle cx='25' cy='12' r='.9' fill='" + INK + "' stroke='none'/%3E",
				),
			),
		],
		sit: sprite(
			g(
				"%3Cpath d='M12 27c-3 0-5-3-5-7 0-5 3-8 7-8s7 3 7 8c0 4-2 7-5 7z'/%3E" +
					"%3Ccircle cx='19' cy='10' r='5.5'/%3E" +
					"%3Cpath d='M15 6l-1-4 4 2M23 6l1-4-4 2'/%3E" +
					"%3Cpath d='M7 26c-4 0-5-4-2-6'/%3E" +
					"%3Ccircle cx='17.5' cy='9.5' r='.9' fill='" + INK + "' stroke='none'/%3E" +
					"%3Ccircle cx='21.5' cy='9.5' r='.9' fill='" + INK + "' stroke='none'/%3E",
			),
		),
		tired: sprite(
			g(
				"%3Cpath d='M12 27c-3 0-5-3-5-7 0-5 3-8 7-8s7 3 7 8c0 4-2 7-5 7z'/%3E" +
					"%3Ccircle cx='19' cy='10' r='5.5'/%3E" +
					"%3Cpath d='M15 6l-1-4 4 2M23 6l1-4-4 2'/%3E" +
					"%3Cpath d='M7 26c-4 0-5-4-2-6'/%3E" +
					"%3Cpath d='M16 10c1 1 2 1 3 0M20.5 10c1 1 2 1 3 0'/%3E",
			),
		),
		sleep: [
			sprite(
				g(
					"%3Cpath d='M10 24c-4 0-7-3-7-6 0-5 5-8 11-8 4 0 7 1 9 3'/%3E" +
						"%3Cpath d='M23 13c0-4 3-6 6-6'/%3E" +
						"%3Cpath d='M14 18c1 1 2 1 3 0'/%3E",
				) +
					"%3Ctext x='22' y='9' font-size='7' font-family='system-ui' font-weight='700' fill='" +
					INK +
					"'%3Ez%3C/text%3E",
			),
			sprite(
				g(
					"%3Cpath d='M10 24c-4 0-7-3-7-6 0-5 5-8 11-8 4 0 7 1 9 3'/%3E" +
						"%3Cpath d='M23 13c0-4 3-6 6-6'/%3E" +
						"%3Cpath d='M14 18c1 1 2 1 3 0'/%3E",
				) +
					"%3Ctext x='24' y='6' font-size='9' font-family='system-ui' font-weight='700' fill='" +
					INK +
					"'%3Ez%3C/text%3E",
			),
		],
	};

	function summon() {
		var cat = document.createElement('div');
		cat.id = 'library-cat';
		cat.setAttribute('aria-hidden', 'true');
		document.body.appendChild(cat);

		var catX = window.innerWidth - 120;
		var catY = window.innerHeight - 120;
		var mouseX = catX;
		var mouseY = catY;
		var idleTicks = 0;
		var frame = 0;
		var facingLeft = false;

		document.addEventListener(
			'mousemove',
			function (event) {
				mouseX = event.clientX;
				mouseY = event.clientY;
			},
			{passive: true},
		);

		// Keeps the cat on screen. Called every tick rather than only while it is
		// running, because the viewport can be zero width at load and can change
		// size underneath a sleeping cat.
		function clamp() {
			var w = Math.max(window.innerWidth, 64);
			var h = Math.max(window.innerHeight, 64);
			catX = Math.min(Math.max(16, catX), w - 16);
			catY = Math.min(Math.max(16, catY), h - 16);
	}

	function place() {
		clamp();
		cat.style.transform = 'translate(' + (catX - 16) + 'px,' + (catY - 16) + 'px) scaleX(' + (facingLeft ? -1 : 1) + ')';
	}

	function tick() {
		frame += 1;

		var dx = mouseX - catX;
		var dy = mouseY - catY;
		var distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > CATCH_UP) {
			idleTicks = 0;
			facingLeft = dx < 0;

			var step = Math.min(SPEED, distance - CATCH_UP + SPEED);
			catX += (dx / distance) * step;
			catY += (dy / distance) * step;

			cat.style.backgroundImage = POSES.run[Math.floor(frame / 2) % POSES.run.length];
			place();
			return;
		}

		// Caught up. Sit next to the cursor, then get sleepy.
		idleTicks += 1;
		if (idleTicks > SLEEP_AFTER) {
			cat.style.backgroundImage = POSES.sleep[Math.floor(frame / 6) % POSES.sleep.length];
		} else if (idleTicks > TIRED_AFTER) {
			cat.style.backgroundImage = POSES.tired;
		} else {
			cat.style.backgroundImage = POSES.sit;
		}
		place();
	}

	// requestAnimationFrame with a timestamp gate rather than setInterval: it
	// stays smooth when the tab is visible and stops cleanly when it is not,
	// instead of drifting against a throttled timer.
	var lastTick = 0;

	function loop(timestamp) {
		if (timestamp - lastTick >= TICK_MS) {
			lastTick = timestamp;
			tick();
		}
		window.requestAnimationFrame(loop);
	}

	cat.style.backgroundImage = POSES.sit;
	place();
	window.requestAnimationFrame(loop);
	}

	/* ------------------------------------------------------------ the egg */

	var title = document.querySelector('.masthead h1');
	if (!title) return;

	var CLICKS_NEEDED = 5;
	var RESET_AFTER_MS = 1200; // a pause breaks the streak, so it has to be five in a row

	var clicks = 0;
	var lastClick = 0;
	var summoned = false;

	title.addEventListener('click', function () {
		if (summoned) return;

		var now = Date.now();
		clicks = now - lastClick > RESET_AFTER_MS ? 1 : clicks + 1;
		lastClick = now;

		if (clicks < CLICKS_NEEDED) return;

		summoned = true;
		title.classList.add('is-summoned');
		summon();
	});
})();
