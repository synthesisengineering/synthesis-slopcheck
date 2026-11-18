# Homebrew distribution

The release builder generates the formula from the exact published archive bytes. Run `scripts/build_distribution.py` to produce the source archive, SHA-256, formula and npm package together. `scripts/release.py` commits the generated formula to the public Homebrew tap by a pull request, only after the archive is published, and that pull request merges only when the tap's real Homebrew installation test passes.

The formula declares Python 3.12. Package installation adds the CLI; it does not change agent configuration or start services. Ordinary analysis requires Python 3.9 or newer.

```sh
brew install synthesisengineering/tap/slopcheck
slopcheck --list-models
```

There is no independently maintained formula template in this source repository.
