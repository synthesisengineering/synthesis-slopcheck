# Publishing SlopCheck

Build from a reviewed release checkout. The build requires a thin Synthesis acquisition package generated from its exact tagged release; that package contains an integrity-bound bootstrap, not an activated skill catalog.

```sh
python3 scripts/build_distribution.py --core-package /absolute/path/to/released-synthesis-package --output /absolute/path/to/new-release-directory
```

The output contains the immutable CLI archive, generated curl installer, checksum record, Homebrew formula and npm package with vendored Python source and the thin core launcher. Never publish this source directory directly: it intentionally excludes generated vendor files.

Run the complete fixture suite and actual npm/Bun consumer tests. Inspect `npm pack --dry-run --json` in the generated npm directory, then publish the packed artifact with public access after publication authorization. Bun consumes the same npm release. npm lifecycle scripts must remain absent: setup is explicit, and ordinary package installation must not activate agent integrations or contact a model provider.

Upload the exact source archive, generated installer and checksum record to the matching versioned GitHub release before publishing a Homebrew formula. Verify the registry version and a fresh installation from each public channel. Do not mark a website route verified until its actual consumer install passes.

AUR publication is excluded from the current release. Existing Arch packaging source is retained for the future account-availability work.
