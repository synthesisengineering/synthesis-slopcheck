"""Explicit lifecycle bridge boundaries; fixture core cannot acquire or activate anything."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = ('activate', 'deactivate', 'status', 'doctor', 'repair', 'update')


class LifecycleBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / 'home'
        self.home.mkdir()
        self.vendor = self.root / 'vendor'
        self.vendor.mkdir()
        shutil.copyfile(ROOT / 'cli/slopcheck.py', self.vendor / 'slopcheck.py')
        self.core = self.vendor / 'synthesis-core'
        (self.core / 'bin').mkdir(parents=True)
        launcher = self.core / 'bin/synthesis'
        launcher.write_text('#!' + sys.executable + '\nimport json,os,signal,sys,time\nfrom pathlib import Path\n'
                            'Path(os.environ["HOME"],"called").write_text(json.dumps(sys.argv[1:]))\n'
                            'if os.environ.get("BRIDGE_SIGNAL"): os.kill(os.getpid(),signal.SIGTERM)\n'
                            'if os.environ.get("BRIDGE_WAIT"):\n'
                            ' Path(os.environ["HOME"],"ready").write_text(str(os.getpid()))\n'
                            ' time.sleep(15)\n'
                            'sys.exit(int(os.environ.get("BRIDGE_EXIT","0")))\n')
        launcher.chmod(0o755)
        self.inventory = self.vendor / 'core-files.json'
        self.inventory.write_text(json.dumps({'bin/synthesis': {'sha256': hashlib.sha256(launcher.read_bytes()).hexdigest(), 'mode': 0o755}}))
        self.env = dict(os.environ, HOME=str(self.home))

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args, **environment):
        return subprocess.run([sys.executable, str(self.vendor / 'slopcheck.py'), *args], cwd=self.home,
                              env=dict(self.env, **environment), capture_output=True, text=True)

    def test_help_and_disallowed_operations_do_not_read_or_run_the_bundle(self):
        self.inventory.unlink()
        for args in [('--help',), ('synthesis', '--help')]:
            result = self.run_cli(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('activate', result.stdout)
        for args in [('synthesis',), ('synthesis', 'setup'), ('synthesis', 'stage-core'), ('synthesis', 'enroll'), ('synthesis', 'exec-public')]:
            self.assertEqual(self.run_cli(*args).returncode, 2)
        self.assertEqual(list(self.home.iterdir()), [])

    def test_exact_arguments_and_all_allowed_operations(self):
        for command in COMMANDS:
            args = ['synthesis', command, '--path', 'folder with spaces', ';literal', '']
            result = self.run_cli(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads((self.home / 'called').read_text()), args[1:])
        self.assertEqual(self.run_cli('synthesis', 'repair', BRIDGE_EXIT='23').returncode, 23)

    def test_child_signal_propagates_as_signal(self):
        result = self.run_cli('synthesis', 'status', BRIDGE_SIGNAL='1')
        self.assertEqual(result.returncode, -signal.SIGTERM)

    def test_tampered_missing_extra_and_symlink_core_are_refused(self):
        launcher = self.core / 'bin/synthesis'
        original = launcher.read_bytes()
        for mutate, restore in [
            (lambda: launcher.write_text('changed'), lambda: launcher.write_bytes(original)),
            (lambda: (self.core / 'extra').write_text('extra'), lambda: (self.core / 'extra').unlink()),
            (lambda: launcher.chmod(0o644), lambda: launcher.chmod(0o755)),
        ]:
            mutate()
            self.assertEqual(self.run_cli('synthesis', 'status').returncode, 2)
            self.assertFalse((self.home / 'called').exists())
            restore()
        outside = self.root / 'outside'
        launcher.rename(outside)
        launcher.symlink_to(outside)
        self.assertEqual(self.run_cli('synthesis', 'doctor').returncode, 2)
        self.assertFalse((self.home / 'called').exists())

    def test_npm_wrapper_forwards_incoming_termination_without_orphaning_core(self):
        node = shutil.which('node')
        self.assertIsNotNone(node)
        wrapper = self.root / 'bin/slopcheck.js'
        wrapper.parent.mkdir()
        shutil.copyfile(ROOT / 'packages/npm/bin/slopcheck.js', wrapper)
        process = subprocess.Popen([node, str(wrapper), 'synthesis', 'status'], cwd=self.home,
                                   env=dict(self.env, BRIDGE_WAIT='1'), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child_pid = None
        try:
            deadline = time.monotonic() + 5
            while not (self.home / 'ready').exists() and time.monotonic() < deadline and process.poll() is None:
                time.sleep(0.02)
            self.assertTrue((self.home / 'ready').exists())
            child_pid = int((self.home / 'ready').read_text())
            process.send_signal(signal.SIGTERM)
            process.communicate(timeout=5)
            self.assertEqual(process.returncode, -signal.SIGTERM)
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)
            if child_pid:
                try:
                    os.kill(child_pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass

    def test_model_listing_never_bootstraps(self):
        self.inventory.unlink()
        result = self.run_cli('--list-models')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(list(self.home.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
