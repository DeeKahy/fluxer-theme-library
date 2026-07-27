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

`coal` in particular is not a darker `dark`. It flattens the app onto one near
black surface, so a theme that relies on the rail, the sidebar and the member
list being different shades will look like one slab there. The preview has a
base switch under the title, so check yours on every base you tell people to
use, and a platform switch next to it, because macOS desktop overrides the guild
rail width.

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
--background-secondary          almost everything: the guild rail, the channel
                                sidebar, the header and the message area
--background-secondary-lighter  the member list and the message box
--background-secondary-alt      the user area at the bottom of the sidebar
--background-primary            raised things on top: embeds, reactions, pickers
--text-primary                  headings, usernames
--text-secondary                most body text
--text-chat                     message content
--text-tertiary                 timestamps, muted labels
--text-tertiary-muted           channel names in the sidebar
--text-link                     links
--accent-primary                the main accent
--brand-primary-fill            buttons and the selected guild
--text-on-brand-primary         text drawn on top of the accent
--border-color                  separators
--user-area-divider-color       the line under the two headers
```

That first one surprises people. Fluxer is not built as a light to dark ramp
across the columns: the rail, the sidebar and the chat area are all the same
surface, and the member list and composer sit one step lighter. If you set
`--background-primary` expecting the message area to change, nothing much will
happen.

Set `--background-modifier-hover` and `--background-modifier-selected` too, or
the selected channel and hover states keep the stock translucent white, which
looks wrong on a light theme.

The preview puts a channel list, a message list, an embed, a code block, a
mention, a member list and a composer on one screen, so a group you forgot
usually shows up as something that stays the stock colour.

### Colours in the defaults

Fluxer's own values look like this:

```css
--background-primary: hsl(258, calc(10% * var(--saturation-factor)), 5%);
```

That `--saturation-factor` is a user accessibility control. If you write plain
hex, which is fine and what most themes do, your theme stops responding to it.
If you want to keep it working, keep the `calc()` wrapper on your saturation
values.

### Images and fonts

Everything your theme needs has to be inside the file. Validation rejects
`@import`, and rejects any `url()` pointing at another host.

That is not us being strict for the sake of it. A Fluxer share link stores one
CSS string and nothing else, so a hotlinked image is not part of your theme, it
is a request your theme makes and hopes somebody else keeps answering. One of
the wallpapers in this repo was already a 404 by the time anybody checked.

Inline what you need as a `data:` URI:

```bash
# macOS has sips and nothing else, which is enough
sips -Z 1600 -s format jpeg -s formatOptions 35 wallpaper.png --out small.jpg
printf 'url("data:image/jpeg;base64,%s")' "$(base64 -i small.jpg)"
```

Shrink it first. A 1920px wallpaper at 1600px and quality 35 goes from about
320 KB to about 138 KB, and base64 adds a third on top of whatever you end up
with. The hard ceiling is Fluxer's 8 MiB limit on a shared stylesheet.

For fonts, prefer a font stack over embedding a face. If you want a specific
one, embed it the same way, and put the one line `@import` in a comment in your
header for people who would rather fetch it themselves.

## Porting a theme from BetterDiscord or Vencord

Palettes always port. Set the Fluxer tokens to the same colours and most of a
theme comes across.

Class selectors port too, which is not obvious. Fluxer's build keeps the source
module and element name in every emitted class, so elements carry
`Component.module__element_<hash>`. Only the hash changes between builds, so
`[class*="Component.module__element_"]` is the selector that survives updates.
That is what the community writes, and
[carlfully/fluxer-snippets](https://github.com/carlfully/fluxer-snippets) is
built on it. Take a proven snippet from there with credit rather than
hand rolling the same effect.

The preview carries those same prefixes with an invented `_flxmock` suffix, so a
class hook theme previews here. It does not carry every element the client has,
so some rules will do nothing in the preview and still work in the app. Say in
your header comment what you dropped rather than faking it.

Two things that bite:

- Substring selectors over match. `[class*="fluxerButtonIcon"]` also catches the
  favourites icon in the live client, which the preview does not show. When the
  element has an `aria-label`, key on that instead.
- Check what a fetched asset actually is before you name it. Files served as
  `.svg` or `.gif` are routinely WebP underneath.

If the theme you are porting has a licence, put it in `theme.json`. If it has
none, credit the author in `@author`, in a header comment and in `homepage`,
leave `license` unset, and say so in the pull request rather than guessing.
Wallpaper art is usually not the theme author's work either, so flag that too.

## Previewing your work

```bash
node scripts/build-index.mjs
python3 -m http.server 8000
```

Open `http://localhost:8000`, find your theme in the list on the left. The big
preview on the right is a static render of a server channel. It updates as soon
as you pick a different theme or variant.

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
Inline them as `data:` URIs instead, see above.

Themes that fetch anything over the network. `@import` and remote `url()` are
rejected by validation, for the reasons in that same section.

Themes that target Fluxer's internal class names rather than custom properties
will apply in the client but do nothing in the preview. The client's class names
are content hashed at build time, so there is nothing stable for the mock to
reproduce. See [PROVENANCE.md](PROVENANCE.md).

## Licensing

Your theme stays yours. Put an SPDX identifier in `license` if you want to be
explicit. By opening a pull request you are agreeing that the theme can be
distributed from this repo and the site.
