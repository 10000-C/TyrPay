# Publishing TyrPay Workspace Packages

This document defines the release workflow for TyrPay packages that are
developed inside this pnpm workspace but published as standalone npm packages.

It applies to:

- `@tyrpay/sdk-core`
- `@tyrpay/storage-adapter`
- `@tyrpay/zktls-adapter`
- `@tyrpay/buyer-sdk`
- `@tyrpay/seller-sdk`
- `@tyrpay/buyer-skill`
- `@tyrpay/seller-skill`
- `@tyrpay/agent-kit`

## Why `workspace:*` Is Acceptable Here

Inside the monorepo, packages depend on one another using `workspace:*`.

For published artifacts, pnpm rewrites `workspace:` dependencies during
`pnpm pack` and `pnpm publish` so consumers receive ordinary semver ranges in
the final tarball, not raw workspace specs.

That means:

- local development keeps strict workspace linking
- published tarballs remain installable outside the monorepo

**Important:** Only `pnpm pack` / `pnpm publish` resolve `workspace:*`.
Using `npm publish` directly will publish the raw `workspace:*` strings,
causing `EUNSUPPORTEDPROTOCOL` for consumers.

## Release Preconditions

Before packing or publishing:

1. Bump every package version that will be released.
2. Ensure dependent package ranges still point at the intended workspace targets.
3. Build the whole workspace.
4. Run typecheck and the relevant tests.

Recommended commands:

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Release Order

Publish in dependency order so registry consumers can resolve packages
immediately after each release.

Recommended order:

1. `@tyrpay/sdk-core`
2. `@tyrpay/storage-adapter`
3. `@tyrpay/zktls-adapter`
4. `@tyrpay/buyer-sdk`
5. `@tyrpay/seller-sdk`
6. `@tyrpay/buyer-skill`
7. `@tyrpay/seller-skill`
8. `@tyrpay/agent-kit`

## Validate Before Publish

Run the automated validation script that packs each package and checks
that `workspace:*` has been resolved to real semver ranges:

```bash
pnpm release:validate
```

This script:

1. Packs every publishable package to a temp directory
2. Extracts the `package.json` from each tarball
3. Checks all dependency fields for unresolved `workspace:*` references
4. Exits with code 1 if any are found

If validation passes, proceed to publish.

## Publish Commands

**Always use `pnpm publish`, never `npm publish`.**

Single package:

```bash
pnpm --filter @tyrpay/buyer-skill publish --access public
```

Validate and publish all packages at once:

```bash
pnpm release:publish
```

This runs `release:validate` first, then publishes if all checks pass.

## Past Incidents

### seller-skill 0.1.2, 0.1.8 — `workspace:*` leaked into npm

**Root cause:** Published using `npm publish` or equivalent workflow that
skipped pnpm's workspace protocol resolution. The published `package.json`
contained raw `workspace:*` dependencies, causing `EUNSUPPORTEDPROTOCOL`
for anyone installing the package.

**Fix:** Bumped to 0.1.3 / 0.1.9. Added `scripts/validate-publish.mjs`
and `pnpm release:validate` to catch this before it reaches npm.

### seller-sdk 0.1.1, 0.1.4 — same issue

Same root cause and fix as seller-skill.

## Recommended Package Checks

For every published package, verify:

- `main` points to built JavaScript under `dist/`
- `types` points to built declarations under `dist/`
- `README.md` documents installation and usage
- no source file requires repository-only relative paths at runtime

## Current Repository Guidance

In this repository:

- `tsconfig.json` files may extend `../../tsconfig.base.json`
- that is acceptable because consumers install packed artifacts, not workspace TS sources
- runtime compatibility depends on the packed `dist/` output and rewritten dependency ranges, not on the workspace `tsconfig` layout

## Future Improvements

If versioning and publish coordination become frequent, adopt a dedicated
workspace release tool such as Changesets.
