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

`site/preview/vendor/tokens.css` and `site/data/tokens.json` are generated from
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

`https://fluxer.app/theme/<id>` comes from `Routes.theme` in
`fluxer_app/src/app/Routes.ts`. The id is sixteen hex characters, produced by
`randomBytes(8).toString('hex')` in
`fluxer_api/src/api/theme/ThemeService.ts`.

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

### data-flx attributes

The mock uses upstream's `data-flx="feature.component.element"` convention on its
elements. Some themes target these attributes, so keeping the convention makes
those themes work here. The specific values are ours, invented to match the
naming pattern, because the real ones are attached to React components we have
not reproduced.

## Reconstructed, not copied

The markup and layout of `site/preview/shell.html` and `shell.css` are written
from scratch. Upstream's client is React with CSS modules, and its class names
are content hashed at build time, so there is nothing stable to copy even if we
wanted to. What we reproduced is the arrangement a Fluxer user would recognise:
guild rail, channel sidebar, user area, channel header, message list, typing
row, composer, member list, and the voice and appearance screens.

Every visual property in `shell.css` reads from a Fluxer token. Nothing in that
file hard codes a colour, with two deliberate exceptions, both marked in the
file: the two built in theme cards on the settings screen use Fluxer's own dark
and light palette values so a contributed theme sits next to the stock ones the
way it does in the real appearance settings.

The four screens, the sample conversation and the general shape of the site are
adapted from a design mock made for this project, not from upstream.

## Consequences

Because the preview is a reconstruction, a theme that targets upstream's hashed
CSS module class names will look correct in Fluxer and have no effect here. A
theme that sets custom properties, which is what the Theme Studio produces and
what nearly every theme does, renders accurately.

If upstream renames or removes a token, rerun `sync-upstream-tokens.mjs` and the
preview picks up the change. Themes that set a removed token keep working, they
just stop having an effect, which is the same thing that happens in the client.
