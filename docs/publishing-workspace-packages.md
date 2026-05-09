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

## Validate The Tarballs Before Publish

Run a dry pack for each package first:

```bash
pnpm --filter @tyrpay/buyer-skill pack --dry-run
pnpm --filter @tyrpay/seller-skill pack --dry-run
```

If you want actual tarballs for inspection:

```bash
pnpm --filter @tyrpay/buyer-skill pack --pack-destination ./.release-tarballs
pnpm --filter @tyrpay/seller-skill pack --pack-destination ./.release-tarballs
```

Check that each tarball contains:

- `dist/`
- package-level `README.md`
- the expected `package.json`

Check that the packed `package.json` no longer contains raw `workspace:*`
runtime dependency specs.

## Publish Commands

Single package:

```bash
pnpm --filter @tyrpay/buyer-skill publish --access public
```

Multiple packages from the workspace:

```bash
pnpm -r publish --access public
```

If you need a tarball-first workflow:

```bash
pnpm --filter @tyrpay/buyer-skill pack --pack-destination ./.release-tarballs
npm publish ./.release-tarballs/tyrpay-buyer-skill-<version>.tgz --access public
```

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
