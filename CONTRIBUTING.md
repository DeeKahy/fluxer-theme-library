# Contributing a theme

There are no hard rules here. If it is a theme and it works, it belongs in the
library. Unfinished palettes, single colour tweaks, recolours of somebody else's
theme with credit, all fine.

## The short version

1. Fork the repo.
2. Make a folder: `themes/your-theme/`.
3. Put your stylesheet in it: `themes/your-theme/your-theme.css`.
4. Add `themes/your-theme/theme.json` describing it.
5. Run `node scripts/validate.mjs`.
6. Open a pull request.

You do not need to install anything. There is no build step, no package.json and
no dependencies.

## theme.json

The smallest useful file:

```json
{
	"name": "Your Theme",
	"author": "your-github-handle",
	"variants": [{"name": "Dark", "file": "your-theme.css"}]
}
```

A fuller one:

```json
{
	"name": "Gruvbox",
	"description": "The retro groove palette, warm and low contrast.",
	"author": "your-github-handle",
	"homepage": "https://github.com/morhetz/gruvbox",
	"license": "MIT",
	"tags": ["retro", "warm", "low-contrast"],
	"variants": [
		{
			"name": "Dark",
			"file": "dark.css",
			"base": "dark",
			"description": "Gruvbox dark medium, the default flavour."
		},
		{
			"name": "Light",
			"file": "light.css",
			"base": "light"
		}
	]
}
```

`name`, `author` and `variants` are required. Everything else is optional.

`base` says which built in Fluxer theme your CSS is designed to sit on top of:
`dark`, `light`, `coal` or `dark_legacy`. It defaults to `dark`. The preview
loads that base first and then your stylesheet, which is what the client does,
so getting this right matters more than it looks. A light theme declared as
`dark` will preview with dark defaults showing through anywhere you did not set
a token.

Do not set `fluxerThemeId` or `fluxerThemeHash`. A workflow writes those.

The schema is in [schema/theme.schema.json](schema/theme.schema.json) if your
editor can use it.

## Variants

A variant is another `.css` file in the same folder with another entry in
`variants`. Use them for light and dark pairs, or for a warmer take on the same
idea, or for anything else that is recognisably the same theme.

The first variant in the list is the one shown when somebody clicks your theme,
and it is the one whose accent colour decides which hue filter your theme lands
under. Put your best one first.

## Writing the CSS

A Fluxer theme is a plain stylesheet that overrides custom properties on
`:root`. There is no manifest format and no JavaScript.

```css
/**
 * @name Your Theme
 * @description One line about it.
 * @author your-github-handle
 * @version 1.0.0
 * @tags dark, warm
 */

:root {
	--background-primary: #12101a;
	--background-secondary: #181524;
	--accent-primary: #7c6cff;
	--text-primary: #eae7f5;
}
```

The header comment is optional but worth writing. Fluxer reads it when somebody
imports your file into their theme library, so without it your theme shows up
there named after the filename. We parse it with the same rules the client uses.

### Which tokens to set

There are 333 of them. You do not need to set 333.

The quickest way to find the ones that matter is to open Theme Studio in Fluxer,
change things until you like it, and copy out the CSS. Failing that, start with
these and work outward until nothing looks wrong:

```
--background-primary        the message area
--background-secondary      the channel sidebar and member list
--background-secondary-alt  the user area at the bottom of the sidebar
--background-tertiary       the guild rail on the far left
--background-textarea       the message box
--text-primary              headings, usernames
--text-secondary            most body text
--text-chat                 message content
--text-tertiary             timestamps, channel names, muted labels
--text-link                 links
--accent-primary            the main accent
--brand-primary-fill        buttons and the selected guild
--text-on-brand-primary     text drawn on top of the accent
--border-color              separators
```

Set `--background-modifier-hover` and `--background-modifier-selected` too, or
hover states will keep the stock translucent white and look wrong on a light
theme.

The site shows a token coverage readout for the selected theme, which is a fast
way to spot a group you forgot.

### Colours in the defaults

Fluxer's own values look like this:

```css
--background-primary: hsl(258, calc(10% * var(--saturation-factor)), 5%);
```

That `--saturation-factor` is a user accessibility control. If you write plain
hex, which is fine and what most themes do, your theme stops responding to it.
If you want to keep it working, keep the `calc()` wrapper on your saturation
values.

## Previewing your work

```bash
node scripts/build-index.mjs
python3 -m http.server 8000
```

Open `http://localhost:8000`, find your theme in the list on the left. The big
preview on the right is live: click channels, switch between the server, DMs,
voice and settings screens, reveal the spoiler, type in the message box. Check
all four screens, it is easy to miss that the settings toggles or the voice tiles
are unreadable.

Re-run `build-index.mjs` after changing `theme.json`. Changing only CSS just
needs a refresh.

## Validation

```bash
node scripts/validate.mjs
```

Errors block the build. Warnings are advice and never fail CI. The same script
runs on every pull request.

## Publishing and the Open in Fluxer link

After your theme is merged, a workflow uploads the stylesheet to Fluxer's own
share endpoint and writes the returned id back into your `theme.json`. That is
what powers the "Open in Fluxer" button.

Two things worth knowing. Uploads are permanent: Fluxer has no delete endpoint,
so every published version stays on their CDN forever. And editing a merged theme
mints a new id, because the id points at a snapshot of the file rather than at
your theme.

If the maintainer has not configured a Fluxer account token for the repo, this
step is skipped and the site falls back to Copy CSS and Download, which work
regardless.

## Things that will not work

Themes that reference images through `fluxer-theme-asset("name")` or
`fluxer-local-file("path")` will not render in the preview, and will not travel
through a share link either. Those references resolve against files in the
viewer's own local theme library, which a shared stylesheet has no way to carry.
Inline small images as `data:` URIs if you need them.

Themes that target Fluxer's internal class names rather than custom properties
will apply in the client but do nothing in the preview. The client's class names
are content hashed at build time, so there is nothing stable for the mock to
reproduce. See [PROVENANCE.md](PROVENANCE.md).

## Licensing

Your theme stays yours. Put an SPDX identifier in `license` if you want to be
explicit. By opening a pull request you are agreeing that the theme can be
distributed from this repo and the site.
