# @synthesisengineering/slopcheck packaging scaffold

This npm package is **unavailable**. It has not been published, so neither npm nor bun can install it from the registry. For local use, review the [CLI source](../../cli/slopcheck.py) and follow the [manual setup guide](../../cli/README.md).

## Prerequisites and packaging

The wrapper requires Node.js 18 or newer and Python 3.9 or newer. It runs a vendored copy of the Python CLI. That file is created during packaging and is not included in this source directory.

[Maintainer publishing instructions](PUBLISHING.md) describe the release work. Availability must be verified against the registry and a clean installation before adding user installation commands here. Bun uses the npm registry; it is not a separate published package.

## What it does

Applies the open source synthesis engineering skill family (v4.0 content-quality + v2.0 fact-checking) to the provided content. Returns a structured analysis covering two axes: AI-provenance signals (by model family) and slop-independence (substance and depth, regardless of authorship).

## Data and file access

The CLI fetches its methodology from GitHub and sends supplied content to the selected model provider using your API key. Provider charges apply. An explicit output path writes the analysis to that file. Review network access and output paths before running it.

## Related

- [Web app](https://tools.synthesiswriting.org/slopcheck)
- [Source repository and current setup guidance](https://github.com/synthesisengineering/synthesis-slopcheck)

## Support the open source work

If slopcheck is useful to you, you can support the synthesis open-source mission on [GitHub Sponsors](https://github.com/sponsors/rajivpant). One-time or recurring, any amount, not a gate on anything.

## License

MIT, as declared in the package metadata.
