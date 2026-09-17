# Homebrew distribution

The release builder generates the formula from the exact published archive bytes. Run `scripts/build_distribution.py` with the reviewed thin Synthesis package to produce the source archive, SHA-256, formula and npm package together. The generated formula is committed to the public Homebrew tap only after archive publication and a real Homebrew installation test.

The formula declares Python 3.12 and Git. Package installation adds the CLI; it does not run setup, change agent configuration or start services. `slopcheck setup` explicitly stages an inert shared core; `slopcheck setup --no-dormant-core` omits that staging. Neither option activates hooks or services. Ordinary analysis requires Python 3.9 or newer; optional core staging requires the shared launcher's supported runtime.

Published channels and exact commands are recorded at the [canonical downloads hub](https://synthesiswork.org/download/). There is no independently maintained formula template in this source repository.

## Activate or inspect the shared core

Built packages expose the core through an explicit command; no global `synthesis` executable or tool reinstall is needed:

```sh
slopcheck synthesis status --json
slopcheck synthesis activate --profile full
slopcheck synthesis deactivate
```

The allowed operations are `activate`, `deactivate`, `status`, `doctor`, `repair`, and `update`; remaining arguments are forwarded unchanged. Use `slopcheck synthesis --help` without accessing the bundle. Activation follows the core's permission, ownership and client-restart checks. Deactivation restores an existing modular selection; it does not invent one. An unstaged or unverifiable installation is reported by the core, with its exit status preserved. Ordinary analysis and model listing do not invoke this bridge. The bundled core inventory is verified before either setup or a lifecycle operation.
