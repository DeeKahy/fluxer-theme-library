# Fluxer Theme Library

A collection of community themes for [Fluxer](https://fluxer.app), and a site
that lets you look at one before you install it.

**[Browse the themes](https://deekahy.github.io/fluxer-theme-library/)**

## Why this exists

Fluxer ships a Theme Studio for writing themes and a share link for sending one
to a friend. What it does not have is a directory. There is no page listing what
themes exist, no way to find one you did not already have a link to, and no way
to see what a theme looks like without applying it to your own client first.

This repo is that directory.

## The preview

Every preview on the site is a mock Fluxer client with the theme's CSS injected
into it, rendered live in your browser. There are no screenshots in this repo.

That is deliberate. Screenshots have to be taken by hand, they have to be
re-taken every time the theme changes, and they drift out of date quietly. A
preview rendered from the stylesheet itself cannot lie about what the theme
looks like, and contributing a theme never involves opening a screenshot tool.

The mock uses the real Fluxer variable names, generated from the client's own
token manifest, so a theme paints this page the same way it paints the app. See
[PROVENANCE.md](PROVENANCE.md) for what was taken from upstream and what was
rebuilt.

## Installing a theme

Open a theme on the site and use one of:

- **Open in Fluxer**, when the theme has been published. This is Fluxer's own
  share link, so it opens the import dialog and applies the theme in one click.
- **Copy CSS**, then paste it into Theme Studio under Quick CSS.
- **Download .css**, then import the file into your theme library from Theme
  Studio. This is the one to use if you want to keep several themes and toggle
  between them.

Applying a shared theme replaces whatever custom CSS you currently have, so save
your own work into the theme library first if you have any.

## Contributing a theme

Add a folder under `themes/`, put a `.css` file in it and a small `theme.json`
next to it, open a pull request. There is no approval bar beyond "it is a theme
and it works". Variants are welcome, half finished palettes are welcome, a
recolour of somebody else's theme is welcome if you credit them.

Full instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

```
themes/<slug>/theme.json     what the theme is called, who made it, its variants
themes/<slug>/*.css          the stylesheets themselves
site/                        the Pages site
site/preview/                the mock client the previews render in
site/preview/vendor/         Fluxer tokens, generated from upstream
scripts/                     validation, index building, publishing
schema/theme.schema.json     the theme.json schema
```

## Running the site locally

You need Node and any static file server. There is no build step and no
dependencies to install.

```bash
node scripts/build-index.mjs
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly from disk will
not work, the page fetches JSON and CSS over HTTP.

To check your theme before opening a pull request:

```bash
node scripts/validate.mjs
```

## Licence

The site, the preview shell and the vendored Fluxer tokens are AGPL-3.0-or-later,
matching Fluxer itself. Individual themes belong to their authors; a theme can
declare its own licence in its `theme.json`.

This project is not affiliated with the Fluxer team.
