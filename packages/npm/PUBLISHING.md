# Publishing @synthesisengineering/slopcheck

One-time setup, then a release script you can re-run on every bump.

## One-time setup

1. **npm account.** Sign in to https://www.npmjs.com with Rajiv's account.
2. **Organization.** Create the `synthesisengineering` org on npm (free for public packages).
3. **2FA.** Enable 2FA on the npm account.
4. **CLI auth.** Locally: `npm login --scope=@synthesisengineering --auth-type=web`.

## Vendor the Python CLI before publishing

The package vendors the CLI script. Refresh it on every release:

```sh
cd packages/npm
mkdir -p vendor
cp ../../cli/slopcheck.py vendor/slopcheck.py
chmod 0644 vendor/slopcheck.py
```

(The `vendor/` directory is gitignored in the npm package source; the file is created at publish time and packed by npm.)

## Publish

```sh
cd packages/npm
npm version patch    # or minor / major
npm publish --access public
```

For bun users specifically, no separate publish step. Bun pulls from the npm registry: `bun add -g @synthesisengineering/slopcheck` works once the npm publish lands.

## Verify

```sh
npm view @synthesisengineering/slopcheck
npx @synthesisengineering/slopcheck --list-models
```

## Versioning

Track the same version as the slopcheck web app where reasonable. Breaking changes bump major. Per-provider behavior changes bump minor. Bug fixes bump patch.

## Deprecation

If a version has a security or correctness issue, deprecate it on the registry:

```sh
npm deprecate @synthesisengineering/slopcheck@<bad-version> "Use <good-version> instead"
```
