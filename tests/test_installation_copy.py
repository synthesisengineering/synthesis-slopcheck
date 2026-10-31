"""Static installation-surface checks; no network, providers or installation."""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = (
    "brew install synthesisengineering/tap/slopcheck",
    "npm install -g @synthesiswork/slopcheck",
    "bun add -g @synthesiswork/slopcheck",
    "curl -fsSL https://github.com/synthesisengineering/synthesis-slopcheck/releases/latest/download/install.sh | sh",
)
# Shown until 2026-10-30, when the retired 4.x synthesis core was removed from the tool.
RETIRED = ("dormant", "--profile", "Agent Prompt", "slopcheck setup", "slopcheck synthesis", "stage-core",
           "data-install-guide", "installation.js")


class InstallationCopyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text()
        cls.section = cls.html.split("<!-- synthesis-installation:start -->")[1].split("<!-- synthesis-installation:end -->")[0]

    def test_page_shows_every_published_command(self):
        for command in PUBLISHED:
            self.assertIn(command, self.section)
        self.assertIn("slopcheck --list-models", self.section)
        self.assertIn("https://synthesiswork.org/download/", self.section)

    def test_readmes_show_the_same_commands(self):
        for name in ("README.md", "cli/README.md"):
            text = (ROOT / name).read_text()
            for command in PUBLISHED:
                self.assertIn(command, text, name)

    def test_nothing_from_the_retired_installer_remains(self):
        for name in ("index.html", "README.md", "cli/README.md", "packages/npm/README.md", "packages/brew/README.md",
                     "packages/npm/PUBLISHING.md", "build.sh", "scripts/publish-site.sh"):
            text = (ROOT / name).read_text()
            for term in RETIRED:
                self.assertNotIn(term, text, f"{name} shows {term!r}")

    def test_commands_keep_cdn_obfuscation_exclusions(self):
        commands = re.findall(r"<pre\b[^>]*>.*?</pre>", self.section, re.S)
        protected = re.findall(r"<!--email_off-->(<pre\b[^>]*>.*?</pre>)<!--/email_off-->", self.section, re.S)
        self.assertEqual(len(commands), len(PUBLISHED))
        self.assertEqual(protected, commands)

    def test_npm_package_version_is_the_cli_user_agent_version(self):
        version = json.loads((ROOT / "packages/npm/package.json").read_text())["version"]
        self.assertIn(f'"slopcheck-cli/{version}"', (ROOT / "cli/slopcheck.py").read_text())


if __name__ == "__main__":
    unittest.main()
