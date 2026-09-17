# SlopCheck CLI

Inspect writing quality with your chosen model provider. The package vendors the Python CLI and a thin, integrity-bound launcher for optional Synthesis core staging. Bun consumes the same npm artifact.

## Requirements

Node.js 18 or newer and Python 3.9 or newer. Optional core staging requires Python 3.12–3.14 and Git. Package installation runs no lifecycle scripts, and ordinary CLI use never activates Synthesis.

After installing the package shown at the [downloads hub](https://synthesiswork.org/download/):

```sh
slopcheck --list-models
slopcheck setup
```

`--list-models` performs no provider call. Setup stages shared core assets outside agent discovery roots, without activating hooks or services. To omit that acquisition, use `slopcheck setup --no-dormant-core`. Existing independently staged assets are preserved.

## Data and file access

Analysis fetches methodology from GitHub and sends supplied content only to the model provider you choose, using your API key. Provider charges apply. An explicit output path writes the analysis to that file. Setup contacts release distribution servers but does not send content or provider keys.

The package is MIT licensed. The optional thin acquisition launcher retains its Apache-2.0 license, and acquired Synthesis components retain their own license files. Installation has no telemetry or tracking code; external distribution services observe normal network requests.

Source: https://github.com/synthesisengineering/synthesis-slopcheck

## Activate or inspect the shared core

Built packages expose the core through an explicit command; no global `synthesis` executable or tool reinstall is needed:

```sh
slopcheck synthesis status --json
slopcheck synthesis activate --profile full
slopcheck synthesis deactivate
```

The allowed operations are `activate`, `deactivate`, `status`, `doctor`, `repair`, and `update`; remaining arguments are forwarded unchanged. Use `slopcheck synthesis --help` without accessing the bundle. Activation follows the core's permission, ownership and client-restart checks. Deactivation restores an existing modular selection; it does not invent one. An unstaged or unverifiable installation is reported by the core, with its exit status preserved. Ordinary analysis and model listing do not invoke this bridge. The bundled core inventory is verified before either setup or a lifecycle operation.
