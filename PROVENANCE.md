# Provenance

The preview in this repo is a reconstruction of the Fluxer client, not a copy of
it. Some parts are lifted directly from upstream anyway, because a preview that
invents its own variable names would be useless. This file records exactly what
came from where, so nobody has to guess.

Upstream: [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer), AGPL-3.0-or-later.
Pinned at commit `09a825ce5b5942e34cbc9c6d5804c808587eb30d` (2026-07-24).

This repo is AGPL-3.0 for that reason. Individual themes under `themes/` belong
to their authors and may carry their own licence in `theme.json`.

## Taken directly

### Theme tokens

`site/preview/vendor/tokens.css` is generated from
`fluxer_app/src/features/theme/variables/ThemeVariableManifest.ts`, which is
itself generated upstream by `fluxer_app/scripts/GenerateThemeVariables.ts`.

We read two exports, `THEME_STUDIO_DARK_DEFAULT_VARIABLE_VALUES` and
`THEME_STUDIO_LIGHT_DEFAULT_VARIABLE_VALUES`, and emit them as `:root` and
`.theme-light` blocks. That is 333 variables in each mode, with the same names
and the same resolved default values the real client uses.

Regenerate with:

```bash
node scripts/sync-upstream-tokens.mjs /path/to/fluxer
```

The values keep their `calc(... * var(--saturation-factor))` form, so the
`--saturation-factor` control behaves here the way it does in the app.

### The custom theme style element

`site/preview/shell.html` mounts the theme into
`<style id="fluxer-custom-theme-style">`. That id is upstream's, from
`fluxer_app/src/features/theme/hooks/useCustomThemeStyle.ts`. We also match the
ordering: the element is the last stylesheet in the document, so a theme wins
ties against the shell's own rules exactly as it wins against the client's.

### Base theme classes

`theme-dark`, `theme-light`, `theme-coal` and `theme-dark_legacy` are applied to
`<html>` by `site/preview/shell.js`. Upstream does the same in
`fluxer_app/src/features/theme/hooks/useThemeCssVariables.ts`, with the set of
names defined by `ThemeTypes` in `packages/constants/src/UserConstants.ts`. We
leave out `system`, which upstream resolves to dark or light before it ever
reaches the DOM.

### Theme metadata header

`parseThemeMetadata` in `scripts/lib/themes.mjs` is a port of the function of the
same name in `fluxer_app/src/features/theme/utils/ThemeCssUtils.ts`. The three
regular expressions, the key aliases (`title` for `name`, `desc` and `summary`
for `description`, `ver` for `version`, `tag` for `tags`) and the comma split for
tags are all upstream behaviour.

This matters: it means the `/** @name ... */` header we ask contributors to write
is read identically by this repo and by Fluxer itself when someone imports the
file into their theme library.

### The share link shape

The path `/theme/<id>` comes from `Routes.theme` in
`fluxer_app/src/app/Routes.ts`. The id is sixteen hex characters, produced by
`randomBytes(8).toString('hex')` in `fluxer_api/src/api/theme/ThemeService.ts`.

The host is `web.fluxer.app`, not `fluxer.app`. `ThemeUtils.ts` lists both, but
that list is what the client *recognises* when it finds a link in a message, not
where the app is served. `fluxer.app` is the marketing site and returns 404 for
`/theme/<id>`.

### The publish endpoint

`scripts/publish-themes.mjs` posts to `POST /users/@me/themes`, defined in
`fluxer_api/src/api/theme/ThemeController.ts`. Details we depend on:

- base URL `https://api.fluxer.app/v1`, from the published OpenAPI document
- `Authorization: <token>` with no prefix, the `sessionToken` scheme
- the route is `DefaultUserOnly`, so a bot token is rejected
- request body is `{"css": "..."}`, response is `{"id": "..."}` with status 201
- the stylesheet must be under 8 MiB, `MAX_CSS_BYTES` in `ThemeService.ts`
- rate limit is 20 per minute, bucket `theme:share:create`, from
  `fluxer_api/src/api/rate_limit_configs/MiscRateLimitConfig.ts`

### Reading a shared theme back

There is no GET route for a shared theme, and none in the OpenAPI document.
`ThemeService.createTheme` writes the stylesheet straight to the CDN bucket at
`themes/<id>.css`, and the client fetches it from there:
`buildThemeCssUrl` in `fluxer_app/src/features/theme/utils/ThemeUtils.ts` joins
`RuntimeConfig.mediaEndpoint` to that path. The media endpoint is served in the
bootstrap blob on the web app, `endpoints.media` in `window.__FLUXER_BOOTSTRAP__`,
currently `https://fluxerusercontent.com`. So a share link's CSS is at:

    https://fluxerusercontent.com/themes/<id>.css

No auth, no proxy needed. That is how the DIALOGUE.386 files got here. Nothing in
this repo depends on it, it is written down so the next person does not have to
go hunting.

### Selector hooks: class names and data-flx

Upstream's build keeps the source module and element name in every emitted
class, so elements carry `Component.module__element_<hash>`. The hash changes
between builds, the prefix does not, and
`[class*="Component.module__element_"]` is the selector that survives
updates. This is how themes in the wild restyle the client; the community
snippet collection at
[carlfully/fluxer-snippets](https://github.com/carlfully/fluxer-snippets)
is built on it and its CONTRIBUTING.md documents the convention.

The mock exposes the same hooks. Its main regions carry the client's class
name prefixes with an invented `_flxmock` suffix standing in for the hash:
the app container, the guild rail and its sections, the channel sidebar, the
user area, the chat header, the message area, the composer and the member
list. The composer is one element standing in for the client's textarea area
and the input box inside it, so it carries both prefixes. Prefixes on the
guild rail come from `GuildsLayout.tsx` at the pinned commit; the rest are
the ones the snippet collection targets in the live client.

Inside those regions the mock also carries the hooks themes reach for most
often, read from upstream the same way:

- `GuildsLayout.module__guildIcon_` on each server icon, from
  `GuildsLayout.module.css`
- `ChannelItem.module__channelItem_`, plus `channelItemSelected`,
  `channelItemVoice`, `channelItemCategory`, `channelItemIcon` and
  `unreadIndicator`, from `ChannelItem.tsx`
- `ChannelItemSurface.module__channelItemSurface_` and
  `channelItemSurfaceSelected`, from `ChannelItemSurface.module.css`
- `ChannelItemContent.module__channelName_` and `categoryName`, from
  `ChannelItemContent.tsx`
- `Message.module__messageContent_`, from `features/theme/styles/Message.module.css`
- `ChannelMembers.module__virtualMemberRow_` on each member row, from
  `ChannelMembers.module.css`

A channel row in the mock is one element where the client nests a surface
inside an item, so it carries both prefixes, the same compromise the composer
makes. The category row is flat for the same reason and carries the category
and the label prefix together. Rules the client writes as
`[class*="channelItemCategory"] [class*="channelItemSurface"]` therefore do
not reach it, in the preview or here.

The mock also keeps upstream's `data-flx="feature.component.element"`
convention. Upstream generates those values with
`fluxer_app/scripts/add-data-flx-attributes.mjs`, deriving them from file and
component names, so they are stable across builds too, and some themes
target them. The guild rail carries the client's actual values, read from
`GuildsLayout.tsx` at the pinned commit:

- `app.guilds-layout.guild-list.guild-list-scroller-wrapper` on the rail
- `app.guilds-layout.guild-list.guild-list-top-section` around the home and
  favourites buttons
- `app.guilds-layout.guild-list.guild-list-guilds-section` around everything below
  it, whose loose children are the Explore, Add, Download and Help buttons
- `app.guilds-layout.guild-list.guild-list-items` around the guild icons
- `app.guilds-layout.guild-list.add-guild-button` on the add button
- `app.guilds-layout.guild-list.guild-divider` on the divider

The two section wrappers render as `display: contents` so the default rail is
unchanged, but a theme can grid them into a multi column server list and the
preview will show it, same as the client. The mock's remaining values are
still invented to match the naming pattern, because the elements they sit on
are simplifications with no one-to-one upstream component.

### Surfaces and measurements

The markup is ours, but which token paints which surface is not invented. It was
read off the canary source, which is the same `main` branch pinned above:

| Surface | Token | Source |
| --- | --- | --- |
| Document root | `--background-secondary` | `app/globals.css` |
| App container | `--background-primary` | `app/App.module.css` |
| Guild rail | `--background-secondary` | `GuildsLayout.module.css` |
| Channel sidebar | `--background-secondary` | `GuildNavbar.module.css` |
| Guild header | `--background-secondary` | `GuildHeader.module.css` |
| Chat column | `--background-secondary` | `GuildLayout.module.css` |
| Member list | `--background-secondary-lighter` | `MemberListContainer.module.css` |
| Composer | `--background-secondary-lighter` | `InputWrapper.module.css` |
| Embeds | `--background-primary` | `ChannelEmbed.module.css` |
| Primary button fill | `--brand-primary` | `ui/button/Button.module.css` |
| Primary button text | `--brand-primary-fill` | `ui/button/Button.module.css` |
| Secondary button fill | `--form-surface-background` | `ui/button/Button.module.css` |

`--brand-primary-fill` is the worst named token in the manifest. It is not a
fill. It is the text colour drawn on top of `--brand-primary`, and its default
is plain white. A theme that sets it to a shade of its accent, which is what
the name invites, gets primary buttons whose labels are invisible in the
client. The secondary button is the same lesson milder: its fill is the form
surface token, not `--button-secondary-fill`.

`--background-primary` doing double duty is the one to watch. It is the embed
surface *and* the surface the entire app sits on, so a theme that picks a value
for its embeds has also picked a sheet covering the whole window.

### Platform overrides

`app/globals.css` re-declares some tokens behind platform classes, and those
selectors are more specific than `:root`, so a theme that only sets `:root`
loses on the platforms they cover. The one found so far:

```css
html.platform-native.platform-macos {
	--layout-guild-list-width: 4.75rem;
}
```

A theme that changes the rail width has to match that selector too, or macOS
desktop users get the stock width while the web app shows the themed one. The
mock has no platform classes, so this difference never shows in a preview,
which is exactly how it went unnoticed.

### Stacking

Upstream paints the same token on several nested elements. Counting from the
document root down, the guild rail is under four `--background-secondary`
layers and the chat column is under five, with `--background-primary` above all
of them:

```
html                        --background-secondary
  appContainer              --background-primary
    guildsLayoutContainer   --background-secondary
      guildListScroller     --background-secondary   rail
      guildListScrollCont.  --background-secondary   rail
      contentContainer      --background-secondary   everything else
        guildLayoutContainer   --background-secondary
          guildMainContent     --background-secondary
```

The mock paints one layer per region instead of reproducing that nesting.

For an opaque theme this makes no difference, and that is nearly every theme.
For a theme with translucent chrome it makes a large one: five stacked layers at
20% composite to 67%, and the rail and the chat column end up different shades.
A translucent theme that reads correctly here can be much darker in the client,
and banded across panels. There are two ways out. The old one is to keep
`--background-secondary` fully transparent and put the tint somewhere that is
painted once. The one the themes in this repo now use is deeruwu's transparent
theme template from carlfully/fluxer-snippets: clear each container by class
and repaint the panels the theme wants painted, which sidesteps the
compositing entirely and gives per panel control the token route never had.
Keep `--background-secondary: transparent` alongside it: the template's lists
only cover the containers they name, and any surface they miss, the DM page
was the one that bit, paints opaque over the wallpaper without the fallback.

Header dividers use `--user-area-divider-color` at `0.0625rem`, the member list
is `16.5rem` wide, channel rows carry a `0.375rem` radius with `0.5rem` outer
margin, and the message row is the same four column grid upstream uses: leading
padding, avatar, gutter, content. Getting the surface map wrong is what makes a
mock look almost-but-not-quite right, so it is worth rechecking after a UI
change upstream.

## Reconstructed, not copied

The markup of `site/preview/shell.html` is written from scratch. Upstream's
client is React with CSS modules whose class names are content hashed at build
time, so there is nothing stable to copy even if we wanted to. What we
reproduced is the arrangement a Fluxer user would recognise: guild rail, channel
sidebar, user area, channel header, message list, typing row, composer and
member list, as one static server channel.

Every visual property in `shell.css` reads from a Fluxer token. Nothing in that
file hard codes a colour.

The sample conversation and the general shape of the site are adapted from a
design mock made for this project, not from upstream.

## Not from Fluxer

`site/cat.js` is a cat that chases the cursor on the library page. The idea is
oneko by Adryd, which most people meet through the Vencord or BetterDiscord
ports. The behaviour is a well known one: walk toward the pointer at a fixed
speed, sit when close, doze off when left alone. Our implementation and our
drawing are our own, so there is no third party sprite sheet vendored here or
hotlinked from another repo.

It runs on the site and not in any theme, because it cannot be a theme. Fluxer
has no plugin system, the Theme Studio exposes tokens, Quick CSS, assets and a
library but no script tab, and the share endpoint stores a single `css` string.
oneko works in BetterDiscord because BetterDiscord runs plugins. Keeping the cat
out of the preview iframe also keeps the previews honest about what a theme can
actually do.

## Consequences

Because the preview is a reconstruction, a theme that targets upstream's hashed
CSS module class names will look correct in Fluxer and have no effect here. A
theme that sets custom properties, which is what the Theme Studio produces and
what nearly every theme does, renders accurately.

If upstream renames or removes a token, rerun `sync-upstream-tokens.mjs` and the
preview picks up the change. Themes that set a removed token keep working, they
just stop having an effect, which is the same thing that happens in the client.
