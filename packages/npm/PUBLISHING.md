# Publishing SlopCheck

`scripts/release.py` makes a release from a clean checkout of the merged `main`, and only with the owner's approval for that release:

```sh
python3 scripts/release.py --output /absolute/path/to/new-release-directory --dry-run   # the checks and the plan; changes nothing
python3 scripts/release.py --output /absolute/path/to/new-release-directory
```

It refuses unless HEAD is the tip of GitHub's `main` with CI passed for it there, so the complete fixture suite and the actual npm and Bun consumer tests have passed for the commit it releases, and GitHub has no tag or release for the version yet. It builds a fresh clone of that commit from GitHub with `scripts/build_distribution.py`: the immutable CLI archive, the generated curl installer bound to that archive's SHA-256, a checksum record, the Homebrew formula and the npm package with the vendored Python CLI. Never publish this source directory directly: it intentionally excludes generated vendor files.

The tool uploads the exact source archive, generated installer and checksum record to the matching versioned GitHub release as a draft, downloads each back and compares it byte for byte, then publishes the release as latest. Only then does it open the Homebrew tap's pull request for the generated formula, which merges when the tap's installation checks pass; the tool waits for it and reads the formula back from the tap.

npm is a separate step, a public act the owner approves each time. The tool prints these commands for the package it built and never runs them: inspect `npm pack --dry-run --json` in the generated npm directory, then publish it with public access after publication authorization. Bun consumes the same npm release. npm lifecycle scripts must remain absent: package installation must not change agent settings or contact a model provider. Verify the registry version (`npm view @synthesiswork/slopcheck@<version> version`) and a fresh installation from each public channel.

AUR publication is excluded from the current release. Existing Arch packaging source is retained for the future account-availability work.
