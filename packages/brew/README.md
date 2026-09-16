# Homebrew packaging scaffold for slopcheck

The Homebrew channel is **unavailable**. The tap repository exists but has no published formula. `Formula/slopcheck.rb` in this directory is a scaffold with a placeholder release checksum.

For local use, review the [CLI source](../../cli/slopcheck.py) and follow the [manual setup guide](../../cli/README.md). Do not treat this packaging directory as an installation route.

## Maintainer release requirements

Before publishing installation instructions:

1. Publish a versioned source archive and verify its contents and license files.
2. Replace the formula's placeholder checksum with the archive's verified SHA-256 digest.
3. Publish the formula in the synthesisengineering Homebrew tap.
4. Test installation and the CLI on the supported macOS and Linux environments.
5. Verify the public tap and record the tested release.

The formula declares Python 3.12 as a dependency. Its packaging and test behavior require release validation; no installer changes are included in this documentation update.
