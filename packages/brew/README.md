# Homebrew tap for slopcheck

The formula at `Formula/slopcheck.rb` belongs in a separate repo: `github.com/synthesisengineering/homebrew-tap`.

## One-time setup

1. **Create the tap repo.** On GitHub, create `synthesisengineering/homebrew-tap`. Must start with `homebrew-`.
2. **Copy this formula** to that repo as `Formula/slopcheck.rb`.
3. **Tag a release** in `synthesis-slopcheck`: `v0.1.0`. The formula's `url` points at the tarball GitHub auto-generates for that tag.
4. **Compute the tarball SHA256** and replace `REPLACE_WITH_RELEASE_TARBALL_SHA256` in the formula:

   ```sh
   curl -sL https://github.com/synthesisengineering/synthesis-slopcheck/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
   ```

5. **Commit and push** the tap repo. The formula is now installable.

## Users install via

```sh
brew install synthesisengineering/tap/slopcheck
```

Or, with the tap added once:

```sh
brew tap synthesisengineering/tap
brew install slopcheck
```

## Verify

```sh
slopcheck --list-models
which slopcheck
brew test slopcheck
```

## Updating

On each new slopcheck release:

1. Tag the new version in `synthesis-slopcheck`.
2. Bump the `url` in `Formula/slopcheck.rb` to point at the new tag.
3. Update the `sha256` line with the new tarball checksum.
4. Commit to `homebrew-tap`. Users get the update on `brew upgrade slopcheck`.
