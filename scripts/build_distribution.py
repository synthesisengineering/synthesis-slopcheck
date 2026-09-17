#!/usr/bin/env python3
"""Build immutable CLI archives and native package recipes from actual bytes."""
import argparse
import gzip
import hashlib
import io
import json
import re
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--core-package", required=True, type=Path,
                        help="Thin Synthesis package built from the exact reviewed release tag")
    args = parser.parse_args()
    output = args.output.expanduser().absolute()
    if output.exists() or output.is_symlink():
        parser.error("Output must be a new directory; existing contents are never overwritten.")
    metadata = json.loads((ROOT / "packages/npm/package.json").read_text())
    version = metadata["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        parser.error("Package version must be an exact semantic release.")
    cli_digest = hashlib.sha256((ROOT / "cli/slopcheck.py").read_bytes()).hexdigest()
    core = args.core_package.resolve()
    core_meta = json.loads((core / "lib/release.json").read_text())
    if not re.fullmatch(r"[0-9a-f]{40}", core_meta.get("commit", "")) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", core_meta.get("version", "")):
        parser.error("Core package must identify an exact release and source commit.")
    if hashlib.sha256((core / "lib/onboard.sh").read_bytes()).hexdigest() != core_meta.get("bootstrap_sha256"):
        parser.error("Core bootstrap does not match its release checksum.")
    if not (core / "bin/synthesis").is_file():
        parser.error("Core package has no launcher.")
    if set(metadata.get("scripts", {})) & {"preinstall", "install", "postinstall"}:
        parser.error("Package installation must not execute setup scripts.")
    output.parent.mkdir(parents=True, exist_ok=True)
    output = output.parent.resolve() / output.name
    output.mkdir()
    members = {name: ROOT / name for name in ("cli/slopcheck.py", "LICENSE", "README.md")}
    for item in sorted(core.rglob("*")):
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            parser.error("Core package contains an unsupported filesystem object.")
        if item.is_file():
            members["cli/synthesis-core/" + item.relative_to(core).as_posix()] = item
    core_inventory = {p.relative_to(core).as_posix(): {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                      "mode": 0o755 if p.stat().st_mode & 0o111 else 0o644}
                      for p in sorted(core.rglob("*")) if p.is_file()}
    inventory_path = output / "core-files.json"
    inventory_path.write_text(json.dumps(core_inventory, sort_keys=True, indent=2) + "\n")
    members["cli/core-files.json"] = inventory_path
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as tar:
        for relative in sorted(members):
            data = members[relative].read_bytes()
            info = tarfile.TarInfo("slopcheck-%s/%s" % (version, relative))
            info.size = len(data)
            info.mode = 0o755 if relative == "cli/slopcheck.py" or members[relative].stat().st_mode & 0o111 else 0o644
            info.mtime = 0
            tar.addfile(info, io.BytesIO(data))
    archive_name = "slopcheck-%s.tar.gz" % version
    with (output / archive_name).open("wb") as dest:
        with gzip.GzipFile(filename="", mode="wb", fileobj=dest, mtime=0) as compressed:
            compressed.write(stream.getvalue())
    digest = hashlib.sha256((output / archive_name).read_bytes()).hexdigest()
    installer = (ROOT / "packages/curl/install.sh").read_text().replace("@VERSION@", version).replace("@ARCHIVE_SHA256@", digest)
    (output / "install.sh").write_text(installer)
    (output / "install.sh").chmod(0o755)
    url = "https://github.com/synthesisengineering/synthesis-slopcheck/releases/download/v%s/%s" % (version, archive_name)
    package = output / "npm"
    (package / "bin").mkdir(parents=True)
    (package / "vendor").mkdir()
    for name in ("package.json", "README.md"):
        shutil.copyfile(ROOT / "packages/npm" / name, package / name)
    shutil.copyfile(ROOT / "packages/npm/bin/slopcheck.js", package / "bin/slopcheck.js")
    (package / "bin/slopcheck.js").chmod(0o755)
    shutil.copyfile(ROOT / "cli/slopcheck.py", package / "vendor/slopcheck.py")
    shutil.copytree(core, package / "vendor/synthesis-core")
    shutil.copyfile(inventory_path, package / "vendor/core-files.json")
    for relative, entry in core_inventory.items():
        (package / "vendor/synthesis-core" / relative).chmod(entry["mode"])
    shutil.copyfile(ROOT / "LICENSE", package / "LICENSE")
    (output / "slopcheck.rb").write_text('''class Slopcheck < Formula
  desc "Inspect writing quality with your chosen model provider"
  homepage "https://tools.synthesiswriting.org/slopcheck/"
  url "%s"
  sha256 "%s"
  license "MIT"
  depends_on "python@3.12"
  depends_on "git"

  def install
    libexec.install Dir["cli/*"]
    (bin/"slopcheck").write <<~SHELL
      #!/bin/sh
      export SYNTHESIS_BOOTSTRAP_PYTHON="#{Formula["python@3.12"].opt_bin}/python3.12"
      exec "#{Formula["python@3.12"].opt_bin}/python3.12" "#{libexec}/slopcheck.py" "$@"
    SHELL
    chmod 0755, bin/"slopcheck"
  end

  test do
    assert_match "--provider anthropic", shell_output("#{bin}/slopcheck --list-models")
  end
end
''' % (url, digest))
    (output / "PKGBUILD").write_text('''pkgname=slopcheck
pkgver=%s
pkgrel=1
pkgdesc='Inspect writing quality with your chosen model provider'
arch=('any')
url='https://tools.synthesiswriting.org/slopcheck/'
license=('MIT')
depends=('python>=3.9')
source=('%s')
sha256sums=('%s')

package() {
  cd "$srcdir/slopcheck-$pkgver"
  install -Dm755 cli/slopcheck.py "$pkgdir/usr/bin/slopcheck"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  install -Dm644 README.md "$pkgdir/usr/share/doc/$pkgname/README.md"
}
''' % (version, url, digest))
    (output / ".SRCINFO").write_text('''pkgbase = slopcheck
\tpkgdesc = Inspect writing quality with your chosen model provider
\tpkgver = %s
\tpkgrel = 1
\turl = https://tools.synthesiswriting.org/slopcheck/
\tarch = any
\tlicense = MIT
\tdepends = python>=3.9
\tsource = %s
\tsha256sums = %s

pkgname = slopcheck
''' % (version, url, digest))
    record = {"schema_version": 1, "version": version, "archive": {"file": archive_name, "url": url, "sha256": digest},
              "cli_sha256": cli_digest,
              "npm_package": metadata["name"], "core_release": core_meta,
              "installer_sha256": hashlib.sha256((output / "install.sh").read_bytes()).hexdigest()}
    (output / "release.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record))


if __name__ == "__main__":
    main()
