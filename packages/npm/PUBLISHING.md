# Publishing SlopCheck

Build from a reviewed release checkout:

```sh
python3 scripts/build_distribution.py --output /absolute/path/to/new-release-directory
```

The output contains the immutable CLI archive, the generated curl installer bound to that archive's SHA-256, a checksum record, the Homebrew formula and the npm package with the vendored Python CLI. Never publish this source directory directly: it intentionally excludes generated vendor files.

Run the complete fixture suite and the actual npm and Bun consumer tests. Inspect `npm pack --dry-run --json` in the generated npm directory, then publish the packed artifact with public access after publication authorization. Bun consumes the same npm release. npm lifecycle scripts must remain absent: package installation must not change agent settings or contact a model provider.

Upload the exact source archive, generated installer and checksum record to the matching versioned GitHub release before publishing a Homebrew formula. Verify the registry version and a fresh installation from each public channel.

AUR publication is excluded from the current release. Existing Arch packaging source is retained for the future account-availability work.
