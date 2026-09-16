"""Regression checks for user-facing installation guidance; no network or installs."""
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
GUIDANCE = (
    "index.html", "README.md", "cli/README.md",
    "packages/npm/README.md", "packages/brew/README.md", "packages/aur/README.md",
)
UNAVAILABLE_COMMANDS = re.compile(
    r"\b(?:brew\s+(?:install|tap)\s+(?:synthesisengineering/tap(?:/slopcheck)?|slopcheck)"
    r"|(?:npm\s+(?:install|i)|bun\s+add)\s+(?:-g\s+)?@synthesisengineering/slopcheck"
    r"|(?:paru|yay)\s+-S\s+slopcheck"
    r"|pip\s+install\s+synthesis-slopcheck)\b", re.I,
)
CURL_EXECUTION = re.compile(r"\bcurl\b[^\n<>]*\|\s*(?:sh|bash)\b", re.I)


class InstallMarkup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.prompt = None
        self._in_prompt = False
        self.prompt_attrs = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "textarea" and attrs.get("id") == "install-review-prompt":
            self.prompt = ""
            self._in_prompt = True
            self.prompt_attrs = attrs

    def handle_endtag(self, tag):
        if tag == "textarea":
            self._in_prompt = False

    def handle_data(self, data):
        if self._in_prompt:
            self.prompt += data


class InstallationCopyTests(unittest.TestCase):
    def test_detector_rejects_known_unpublished_channels(self):
        for command in (
            "brew install synthesisengineering/tap/slopcheck",
            "npm install -g @synthesisengineering/slopcheck",
            "bun add -g @synthesisengineering/slopcheck",
            "paru -S slopcheck", "pip install synthesis-slopcheck",
        ):
            with self.subTest(command=command):
                self.assertIsNotNone(UNAVAILABLE_COMMANDS.search(command))

    def test_detector_allows_source_inspection_and_channel_status(self):
        for copy in (
            "Homebrew: unavailable. npm and bun: unpublished.",
            "git clone https://github.com/synthesisengineering/synthesis-slopcheck.git",
            "python3 cli/slopcheck.py --help",
        ):
            self.assertIsNone(UNAVAILABLE_COMMANDS.search(copy))
            self.assertIsNone(CURL_EXECUTION.search(copy))

    def test_no_unpublished_install_commands_in_user_guidance(self):
        for relative in GUIDANCE:
            with self.subTest(path=relative):
                self.assertIsNone(UNAVAILABLE_COMMANDS.search(unescape((ROOT / relative).read_text())))

    def test_no_curl_to_shell_in_user_guidance(self):
        self.assertIsNotNone(CURL_EXECUTION.search(
            "curl -fsSL https://synthesisengineering.org/install.sh | sh"))
        for relative in GUIDANCE:
            with self.subTest(path=relative):
                self.assertIsNone(CURL_EXECUTION.search(unescape((ROOT / relative).read_text())))

    def test_agent_prompt_limits_work_to_source_review(self):
        markup = InstallMarkup()
        markup.feed((ROOT / "index.html").read_text())
        self.assertIsNotNone(markup.prompt, "A source-review prompt must be available")
        self.assertIn("readonly", markup.prompt_attrs)
        prompt = markup.prompt.lower()
        for boundary in ("inspect", "exact commit", "python", "network", "file writes",
                         "do not install", "do not run", "approval"):
            with self.subTest(boundary=boundary):
                self.assertIn(boundary, prompt)

    def test_python_requirement_is_consistent(self):
        for relative in ("index.html", "README.md", "cli/README.md", "packages/npm/README.md"):
            with self.subTest(path=relative):
                text = (ROOT / relative).read_text()
                self.assertTrue("Python 3.9" in text, f"Python prerequisite missing in {relative}")
                self.assertNotIn("Python 3.8", text)

    def test_source_help_and_error_guidance_match_manual_install(self):
        source = (ROOT / "cli/slopcheck.py").read_text()
        self.assertNotIn("--use-urllib", source)
        self.assertNotIn("requests` library", source)
        help_run = subprocess.run([sys.executable, str(ROOT / "cli/slopcheck.py"), "--help"], capture_output=True, text=True, check=True)
        examples = help_run.stdout.split("Examples:", 1)[1]
        self.assertIn("python3 cli/slopcheck.py article.md", examples)
        self.assertNotRegex(examples, r"(?m)^  (?:cat [^\n]+ \| )?slopcheck\b")
        error = subprocess.run([sys.executable, str(ROOT / "cli/slopcheck.py"), "--model", "invalid-fixture-model"], capture_output=True, text=True)
        self.assertEqual(error.returncode, 2)
        self.assertIn("python3 cli/slopcheck.py --list-models", error.stderr)


if __name__ == "__main__":
    unittest.main()
