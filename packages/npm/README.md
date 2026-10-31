# SlopCheck CLI

Inspect writing quality with your chosen model provider. The package vendors the Python CLI. Bun consumes the same npm artifact.

## Requirements

Node.js 18 or newer and Python 3.9 or newer. Package installation runs no lifecycle scripts.

```sh
npm install -g @synthesiswork/slopcheck
slopcheck --list-models
```

`--list-models` performs no provider call.

## Data and file access

Analysis fetches methodology from GitHub and sends supplied content only to the model provider you choose, using your API key. Provider charges apply. An explicit output path writes the analysis to that file.

The package is MIT licensed. Installation has no telemetry or tracking code; external distribution services observe normal network requests.

Source: https://github.com/synthesisengineering/synthesis-slopcheck
