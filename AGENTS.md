# Repository Instructions: synthesis-slopcheck

## Purpose

This public repository is slopcheck, open-source slop detection. It ships a static
web page with a hosted-tier Pages Function, a Python command-line tool and its
packages, a Chrome extension, chat and document integrations, and an email Worker.
`README.md` describes each.

## Layout

- `index.html`, `app.js`, `orchestrator.js`, `passes.js`, `providers.js`,
  `style.css` and `_headers`: the web page, served as static files from the
  repository root.
- `functions/`: the hosted tier's Pages Function; `functions/README.md` is its
  runbook.
- `cli/slopcheck.py`: the command-line tool. `packages/` holds its npm package,
  curl installer, and Homebrew and AUR recipes.
- `scripts/build_distribution.py` builds the CLI's release files from the
  checked-out bytes. `scripts/publish-site.sh` publishes the web page.
- `workers/email-in/`: the email Worker, with its own `package.json` and tests.
- `tests/`: the Python tests for the distribution, the installer and the page's
  install section.

## Rules

1. Write the test first. A change to the CLI, the installer, the distribution
   build, the page's install section or the email Worker comes with a test that
   fails without the change.
2. The CLI supports Python 3.9 and newer (`README.md`). Code and tests must run on
   3.9; CI runs them on Apple's `/usr/bin/python3`, which is 3.9.
3. Provider keys and other secrets live in the Pages project and the Worker
   (`wrangler.toml` names them), never in this public repository. Do not add
   credentials, personal paths or private names.

## Verification

CI runs exactly what you run locally, and it is the only gate. From the
repository root:

```bash
python3 -m unittest discover -s tests -v
sh -n packages/curl/install.sh
node --check packages/npm/bin/slopcheck.js
python3 -m compileall -q cli scripts
```

On a Mac, `/usr/bin/python3 -m unittest discover -s tests -v` runs the suite on the
3.9 floor. In `workers/email-in`:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npx --no-install wrangler deploy --dry-run --outdir <a new directory>
```

`.github/workflows/distribution.yml` runs these on every pull request and on every
push to `main`: the first four on Linux and macOS with Python 3.12, 3.13 and 3.14
and on Apple's Python 3.9, the email Worker's on Linux. Its `ci` job passes only
when every job before it passed. It is the one check branch protection requires
on `main`, admins included, so the jobs can change without touching the
repository's settings.

## Changes, releases and deploys

- Every change reaches `main` through a pull request whose `ci` check passed.
- A merge to `main` publishes and deploys nothing.
- A CLI release changes the version in `packages/npm/package.json` in a pull
  request. After it merges, `python3 scripts/build_distribution.py --output <a
  new directory>` builds the release files from a clean checkout of `main`, and
  `packages/npm/PUBLISHING.md` gives the publishing steps: the versioned GitHub
  release, npm and the Homebrew formula. Each publication needs the owner's
  approval.
- `bash scripts/publish-site.sh` runs the page's build check and publishes the
  repository root to the `slopcheck` Pages project's production branch. The email
  Worker deploys with `npm run deploy` in `workers/email-in`. Both are production
  deploys, run only with the owner's approval for that deploy.
