# Security

## Reporting something

Open a private security advisory through the Security tab, or email the address
on the maintainer's GitHub profile. Please do not open a public issue for
anything that would let somebody tamper with a published theme.

## What this repo actually is

A directory of stylesheets. Every theme under `themes/` is CSS written by
somebody else, and the site renders it in your browser. That is the whole threat
model, and it has three edges worth naming.

### A theme is untrusted CSS

`scripts/validate.mjs` rejects any stylesheet that uses `@import` or that points
`url()` at another host. Both rules exist for the same reason: a theme travels
as one CSS string through Fluxer's share link, and anything it fetches from
elsewhere is a dependency that string cannot carry.

A remote `@import` is the sharper of the two. It would let a stylesheet change
its own contents after it was reviewed and merged, both on this site and in
every client that applied it, and Fluxer has no endpoint for deleting a shared
theme. Inline what you need as a `data:` URI.

`site/preview/shell.html` sets a Content Security Policy that allows same origin
files and `data:` URIs and nothing else, so a fetch that slipped past review
fails in the browser rather than working quietly.

CSS cannot run JavaScript, and the preview frame never evaluates anything from a
theme. If you find a way to make it do either, that is a report worth sending.

### The publish token is the sensitive thing here

`FLUXER_TOKEN` is a Fluxer session token. Fluxer's share endpoint is
`DefaultUserOnly`, so it has to belong to a real user account rather than a bot,
which means the secret is worth more than the job it does. Use a throwaway
account for it, not the account you actually talk to people with.

The publish workflow runs on pushes to `main`, holds that token, and has write
access to this repository. It refuses to run if the push changed anything
outside `themes/`, because a push that edits a theme and a script at the same
time is the shape this kind of thing takes. When you genuinely need to publish
alongside a machinery change, run the workflow by hand once the change has been
reviewed.

Uploads are permanent. Fluxer has no delete endpoint, so a bad publish cannot be
withdrawn, only superseded.

### Nothing here is installed

There is no build step, no `package.json` and no dependencies, so there is no
dependency tree to compromise. The scripts are Node standard library only.
Dependabot watches the GitHub Actions the workflows use, which is the one supply
chain this repo has.

## What is not a vulnerability

- A theme that looks wrong. Open a normal issue.
- A theme that targets Fluxer's per build class names and therefore does nothing
  in the preview. That is documented in `PROVENANCE.md`.
- Reading the CSS of any theme here. It is all public by design.
