# AUR packaging scaffold for slopcheck

The AUR channel is **unavailable**. `PKGBUILD` and `.SRCINFO` in this directory are packaging scaffolds with placeholder release checksums; the slopcheck package has not been published to AUR.

For local use, review the [CLI source](../../cli/slopcheck.py) and follow the [manual setup guide](../../cli/README.md). Do not treat this packaging directory as an installation route.

## Maintainer release requirements

Before publishing installation instructions:

1. Publish a versioned source archive and verify its contents, including the license file expected by the package.
2. Replace the placeholder checksums in both package files with the archive's verified SHA-256 digest.
3. Validate the package in an isolated Arch Linux environment with its declared Python dependency.
4. Publish to AUR and verify a clean installation from the public package.
5. Record the tested release before adding user commands for an AUR helper.

These requirements describe remaining packaging work; this documentation update does not publish or install a package.
