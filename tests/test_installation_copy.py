"""Static installation-surface checks; no network, providers or installation."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InstallMarkup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.tabs = []
        self.panels = []
        self.prompts = []
        self.references = []
        self._prompt = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if 'data-channel-tab' in attrs:
            self.tabs.append(attrs['data-channel-tab'])
        if 'data-channel-panel' in attrs:
            self.panels.append(attrs['data-channel-panel'])
        for name in ('data-copy-target', 'data-select-target', 'aria-controls'):
            if name in attrs:
                self.references.append(attrs[name])
        if tag == 'code' and attrs.get('id', '').endswith('-copy-agent'):
            self._prompt = ''

    def handle_data(self, data):
        if self._prompt is not None:
            self._prompt += data

    def handle_endtag(self, tag):
        if tag == 'code' and self._prompt is not None:
            self.prompts.append(self._prompt)
            self._prompt = None


class InstallationCopyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / 'index.html').read_text()
        cls.markup = InstallMarkup()
        cls.markup.feed(cls.html)

    def test_six_current_channels_have_readable_markup(self):
        expected = ['agent', 'curl', 'brew', 'npm', 'bun', 'source']
        self.assertEqual(self.markup.tabs, expected)
        self.assertEqual(self.markup.panels, expected)
        section = self.html.split('<!-- synthesis-installation:start -->')[1].split('<!-- synthesis-installation:end -->')[0]
        self.assertNotRegex(section, r'(?i)\b(?:paru|AUR)\b')
        self.assertNotRegex(section, r'(?i)fallback needs repair|packaging scaffold|has not been published|unavailable\.')
        self.assertIn('https://synthesiswork.org/download/', section)

    def test_controls_are_scoped_unique_and_resolvable(self):
        self.assertEqual(len(self.markup.ids), len(set(self.markup.ids)))
        for target in self.markup.references:
            self.assertIn(target, self.markup.ids)
        self.assertIn('data-default-profile="slopcheck"', self.html)
        self.assertIn('data-no-dormant-core', self.html)
        self.assertIn('src="installation.js"', self.html)

    def test_agent_prompt_covers_review_explicit_setup_and_local_boundaries(self):
        self.assertEqual(len(self.markup.prompts), 1)
        prompt = self.markup.prompts[0]
        for fragment in ('exact released tag', 'AST', 'dependency trees', 'BYOK', 'file writes', 'sandbox',
                         'After my approval', 'slopcheck setup', '--no-dormant-core', 'postinstall',
                         'outside client discovery', 'separate approval for service startup', 'outcome-verified'):
            self.assertIn(fragment, prompt)
        self.assertNotIn('stop after the review', prompt)

    def test_controller_is_progressive_and_preserves_clipboard_fallback(self):
        source = (ROOT / 'installation.js').read_text()
        for fragment in ('dataset.enhanced', 'clipboard.writeText', 'Clipboard unavailable', 'ArrowRight',
                         'ArrowLeft', 'Home', 'End', 'data-no-dormant-core', 'dataset.optoutCommand'):
            self.assertIn(fragment, source)
        self.assertNotRegex(source, r'\b(?:fetch|eval)\(')

    def test_generated_commands_keep_cdn_obfuscation_exclusions(self):
        section = self.html.split('<!-- synthesis-installation:start -->')[1].split('<!-- synthesis-installation:end -->')[0]
        commands = re.findall(r'<pre\b[^>]*>.*?</pre>', section, re.S)
        protected = re.findall(r'<!--email_off-->\s*(<pre\b[^>]*>.*?</pre>)\s*<!--/email_off-->', section, re.S)
        self.assertEqual(len(commands), 6)
        self.assertEqual(protected, commands)

    def test_scoped_installation_styles_do_not_change_provider_controls(self):
        css = (ROOT / 'style.css').read_text().split('/* synthesis-installation:start */')[1]
        self.assertIn('.install-paths .installation-guide', css)
        self.assertIn('overflow-wrap: anywhere', css)
        self.assertNotRegex(css, r'(?m)^\s*(?:button|label|select)\s*\{')


if __name__ == '__main__':
    unittest.main()
