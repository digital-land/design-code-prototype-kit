# CLAUDE.md

## Dev server

Never start, stop or kill a dev server. The user runs it themselves.

## Versions

Each version of the prototype runs under its own path, for example `/v1`, and the start page at `/` lists them all.

To create a new version, copy the latest version folder and routes file, then add an entry to the start page:

1. Copy `app/views/vN/` to `app/views/vN+1/` and change `"vN/layouts/` to `"vN+1/layouts/` in its `extends` lines.
2. Copy `app/routes/vN.js` to `app/routes/vN+1.js`, change `BASE_URL` and `VIEWS` at the top, and add a `require` for it in `app/routes.js`.
3. Add the version to the top of the `versions` list in `app/views/index.html`, with its name, date, a one-line description and link.

Internal links are built from `baseUrl`, which each version's routes file sets, so they need no changes.
