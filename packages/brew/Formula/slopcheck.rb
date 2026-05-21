# Homebrew formula for slopcheck.
#
# Lives in the synthesisengineering/homebrew-tap repository on GitHub. Users
# install via:
#
#   brew tap synthesisengineering/tap
#   brew install slopcheck
#
# OR in a single command:
#
#   brew install synthesisengineering/tap/slopcheck

class Slopcheck < Formula
  desc "Open source slop detection — slop detection, not just AI detection"
  homepage "https://tools.synthesiswriting.org/slopcheck"
  url "https://github.com/synthesisengineering/synthesis-slopcheck/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_TARBALL_SHA256"
  license "MIT"
  head "https://github.com/synthesisengineering/synthesis-slopcheck.git", branch: "main"

  depends_on "python@3.12"

  def install
    # Install the CLI script and a small shim that points at the right Python.
    libexec.install "cli/slopcheck.py"
    (bin/"slopcheck").write <<~SHELL
      #!/usr/bin/env bash
      exec "#{Formula["python@3.12"].opt_bin}/python3" "#{libexec}/slopcheck.py" "$@"
    SHELL
    chmod 0755, bin/"slopcheck"
  end

  test do
    assert_match "Available providers", shell_output("#{bin}/slopcheck --list-models")
  end
end
