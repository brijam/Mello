# Dependency Security Audit — Triage

_Last reviewed: 2026-05-25_

## Policy

- **Never run `npm audit fix --force` on prod (or in the deploy script).** `--force`
  applies SemVer-major changes at install time, mutates `package.json` /
  `package-lock.json`, and makes the deployed tree diverge from the repo. It is also
  why audit "never finishes" — forcing pulls in new transitive packages that carry
  their own advisories, and it will happily *downgrade* a package into a still-vulnerable
  version (e.g. it proposes `drizzle-kit@0.18.1`, which is itself in the vulnerable range).
- Fix advisories in development with **non-breaking `npm audit fix`**, verify build +
  tests, commit the lockfile, then deploy.
- Deploys install the committed lockfile verbatim and must not auto-mutate it.

## Current status

`npm audit --omit=dev` → **0 vulnerabilities** (the running production server is clean).

`npm audit` (full tree) → **4 moderate**, all in the dev-only build toolchain below.

## Accepted / triaged (no action — no upstream fix exists)

**`esbuild ≤0.24.2` (GHSA-67mh-4wv8-2f99, moderate)** via
`drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`.

- **Why accepted:** The advisory only affects esbuild's *dev server* (`esbuild --serve`),
  which lets any website read responses from the local dev server. `drizzle-kit` uses
  esbuild to transpile `drizzle.config.ts`; it never starts esbuild's dev server, so the
  vulnerable code path is unreachable.
- **Not in the deployed runtime:** `drizzle-kit` is a dev/migration tool. The prod service
  runs `node server/dist/index.js`; this chain is never loaded at runtime.
- **No fix available:** `drizzle-kit` is already on the **latest** version (0.31.10) and it
  still bundles the old `@esbuild-kit` shim (the advisory range runs through
  `1.0.0-beta.1`). An npm `overrides` to force `esbuild@^0.25` was tried and rejected:
  `@esbuild-kit/core-utils` (unmaintained, pins `~0.18.20`) is not API-compatible with
  esbuild 0.25, so forcing it risks breaking config loading / migrations.

**Action:** Monitor for a `drizzle-kit` release that drops `@esbuild-kit` or bumps esbuild,
then `npm audit fix` and remove this note.
