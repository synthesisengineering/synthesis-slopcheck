# AUR package for slopcheck

The PKGBUILD and .SRCINFO in this directory belong in the Arch User Repository.

## One-time setup

1. Make sure Rajiv has an AUR account at https://aur.archlinux.org (or a trusted Arch user co-maintains).
2. Add the SSH public key to the AUR account.
3. Clone the (empty) AUR repo: `git clone ssh://aur@aur.archlinux.org/slopcheck.git`.
4. Copy `PKGBUILD` and `.SRCINFO` from this directory into the clone.
5. Tag a release `v0.1.0` in `synthesis-slopcheck` on GitHub.
6. Compute the tarball SHA256 and replace `REPLACE_WITH_RELEASE_TARBALL_SHA256` in both files:

   ```sh
   curl -sL https://github.com/synthesisengineering/synthesis-slopcheck/archive/refs/tags/v0.1.0.tar.gz | sha256sum
   ```

7. Commit and push to the AUR repo.

## Users install via

```sh
paru -S slopcheck
# or
yay -S slopcheck
```

## Updating

On each release:

1. Bump `pkgver` in `PKGBUILD`.
2. Reset `pkgrel=1`.
3. Update the `sha256sums` line.
4. Regenerate `.SRCINFO`:

   ```sh
   makepkg --printsrcinfo > .SRCINFO
   ```

5. Commit both files.
6. Push to the AUR repo.

## Testing locally

```sh
git clone ssh://aur@aur.archlinux.org/slopcheck.git
cd slopcheck
makepkg -si
slopcheck --list-models
```
