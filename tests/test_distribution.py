"""Exercise real installer and package boundaries without provider calls."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "packages/npm/package.json").read_text())["version"]


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve()
        self.home = self.base / "home"
        self.home.mkdir()
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.target = self.home / ".local" / "bin"
        self.release = self.base / "built"
        build = subprocess.run([sys.executable, str(ROOT / "scripts/build_distribution.py"),
                                "--output", str(self.release)],
                               capture_output=True, text=True)
        self.assertEqual(build.returncode, 0, build.stderr)
        self.payload = self.release / f"slopcheck-{VERSION}.tar.gz"
        fake = self.bin / "curl"
        fake.write_text("#!/bin/sh\nwhile [ $# -gt 0 ]; do\n"
                        "case \"$1\" in -o) shift; out=$1 ;; https://*) printf '%s' \"$1\" > \"$FIXTURE_URL\" ;; esac\n"
                        "shift\ndone\ncp \"$FIXTURE_PAYLOAD\" \"$out\"\n")
        fake.chmod(0o755)
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        SLOPCHECK_INSTALL_DIR=str(self.target), FIXTURE_PAYLOAD=str(self.payload),
                        FIXTURE_URL=str(self.base / "requested-url"))

    def tearDown(self):
        self.temp.cleanup()

    def install(self):
        return subprocess.run(["sh", str(self.release / "install.sh")], env=self.env,
                              text=True, capture_output=True)

    def test_posix_and_pinned_acquisition(self):
        self.assertEqual((ROOT / "packages/curl/install.sh").read_text().splitlines()[0], "#!/bin/sh")
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("/main/", (self.base / "requested-url").read_text())
        self.assertIn(f"/v{VERSION}/", (self.base / "requested-url").read_text())
        run = subprocess.run([str(self.target / "slopcheck"), "--list-models"], env=self.env,
                             text=True, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("--provider anthropic", run.stdout)
        installed = sorted(p.relative_to(self.target / f".slopcheck-{VERSION}").as_posix()
                           for p in (self.target / f".slopcheck-{VERSION}").rglob("*") if p.is_file())
        self.assertEqual(installed, ["LICENSE", "README.md", "cli/slopcheck.py"])  # the tool alone, no bundled core

    def test_tampered_payload_never_installs(self):
        self.payload.write_text("print('tampered')\n")
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.target / "slopcheck").exists())

    def test_foreign_target_preserved(self):
        self.target.mkdir(parents=True)
        target = self.target / "slopcheck"
        target.write_text("foreign file\n")
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(target.read_text(), "foreign file\n")

    def test_owned_repeat_and_edited_target(self):
        first = self.install()
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(self.install().returncode, 0)
        target = self.target / "slopcheck"
        target.write_text(target.read_text() + "\n# personal edit\n")
        before = target.read_bytes()
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(target.read_bytes(), before)

    def test_launcher_permission_change_is_preserved(self):
        self.assertEqual(self.install().returncode, 0)
        target = self.target / "slopcheck"
        target.chmod(0o644)
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(target.stat().st_mode & 0o777, 0o644)

    def test_failed_pending_recovery_preserves_evidence(self):
        self.assertEqual(self.install().returncode, 0)
        receipt = self.target / ".slopcheck-install.json"
        pending = self.target / ".slopcheck-install.pending.json"
        before = receipt.read_bytes()
        pending.write_bytes(before)
        receipt.unlink()
        transport = self.bin / "curl"
        original_transport = transport.read_text()
        transport.write_text("#!/bin/sh\nexit 17\n")
        self.assertNotEqual(self.install().returncode, 0)
        self.assertTrue(pending.exists())
        self.assertEqual(pending.read_bytes(), before)
        self.assertFalse(receipt.exists())
        transport.write_text(original_transport)
        payload = self.target / f".slopcheck-{VERSION}/cli/slopcheck.py"
        payload.write_text(payload.read_text() + "\n# preserved edit\n")
        self.assertNotEqual(self.install().returncode, 0)
        self.assertTrue(pending.exists())
        self.assertEqual(pending.read_bytes(), before)
        self.assertFalse(receipt.exists())

    def test_symlink_directory_refused(self):
        outside = self.base / "outside"
        outside.mkdir()
        self.target.parent.mkdir(parents=True)
        self.target.symlink_to(outside, target_is_directory=True)
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])

    def test_npm_has_no_install_scripts(self):
        p = json.loads((ROOT / "packages/npm/package.json").read_text())
        self.assertFalse(set(p.get("scripts", {})) & {"preinstall", "install", "postinstall"})

    def test_generated_brew_wrapper_runs_the_cli_with_its_python(self):
        import re
        import textwrap
        python_bin = self.base / "brew python" / "bin"
        python_bin.mkdir(parents=True)
        python = python_bin / "python3.12"
        python.symlink_to(sys.executable)
        formula = (self.release / "slopcheck.rb").read_text()
        self.assertIn('depends_on "python@3.12"', formula)
        self.assertNotIn('depends_on "git"', formula)
        self.assertNotIn("SYNTHESIS_", formula)
        body = re.search(r'write <<~SHELL\n(.*?)\n    SHELL', formula, re.S)
        self.assertIsNotNone(body)
        wrapper = self.base / "brew-slopcheck"
        script = textwrap.dedent(body.group(1)) + "\n"
        script = script.replace('#{Formula["python@3.12"].opt_bin}', str(python_bin))
        script = script.replace('#{libexec}', str(self.release / "npm/vendor"))
        self.assertNotIn('#{', script)
        wrapper.write_text(script)
        wrapper.chmod(0o755)
        result = subprocess.run([str(wrapper), "--list-models"], env=dict(self.env, PATH="/usr/bin:/bin"),
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--provider anthropic", result.stdout)

    def test_python_two_is_not_accepted_by_node_wrapper(self):
        node = shutil.which("node")
        if node is None:
            self.fail("Node is required to exercise the shipped npm wrapper")
        for name in ("python3", "python"):
            p = self.bin / name
            p.write_text("#!/bin/sh\ncase \"$1\" in --version) echo 'Python 2.7.18'; exit 0 ;; *) exit 1 ;; esac\n")
            p.chmod(0o755)
        result = subprocess.run([node, str(ROOT / "packages/npm/bin/slopcheck.js"), "--help"],
                                env=dict(self.env, PATH=str(self.bin)), capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("Python 3.9", result.stderr)

    def test_installed_payload_edits_are_preserved(self):
        self.assertEqual(self.install().returncode, 0)
        payload = self.target / f".slopcheck-{VERSION}/cli/slopcheck.py"
        payload.write_text(payload.read_text() + "\n# local edit\n")
        before = payload.read_bytes()
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(payload.read_bytes(), before)

    def test_missing_launcher_recovery(self):
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        (self.target / "slopcheck").unlink()
        self.assertEqual(self.install().returncode, 0)

    def test_completed_launcher_interruption_recovers_from_journal(self):
        self.assertEqual(self.install().returncode, 0)
        receipt = self.target / ".slopcheck-install.json"
        record = json.loads(receipt.read_text())
        (self.target / ".slopcheck-install.pending.json").write_text(json.dumps(record))
        receipt.unlink()
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.target / ".slopcheck-install.pending.json").exists())

    def test_npm_and_bun_install_actual_archive(self):
        npm = shutil.which("npm")
        bun = shutil.which("bun")
        self.assertTrue(npm and bun, "Both npm and Bun are required for distribution acceptance")
        package = self.release / "npm"
        result = subprocess.run([npm, "pack", "--json"], cwd=package,
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        packed = json.loads(result.stdout)[0]
        self.assertEqual(sorted(f["path"] for f in packed["files"]),
                         ["LICENSE", "README.md", "bin/slopcheck.js", "package.json", "vendor/slopcheck.py"])
        archive = package / packed["filename"]
        prefix = self.base / "npm-installed"
        result = subprocess.run([npm, "install", "--global", "--prefix", str(prefix),
                                 "--ignore-scripts", "--offline", "--no-audit", "--no-fund", str(archive)],
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for binary in (prefix / "bin/slopcheck",):
            result = subprocess.run([str(binary), "--list-models"], env=self.env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        consumer = self.base / "bun-consumer"
        consumer.mkdir()
        (consumer / "package.json").write_text('{"name":"fixture","private":true}')
        result = subprocess.run([bun, "add", "--ignore-scripts", "--no-progress", str(archive)],
                                cwd=consumer, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run([str(consumer / "node_modules/.bin/slopcheck"), "--list-models"],
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.home / ".claude").exists())
        self.assertFalse((self.home / ".codex").exists())

    def test_release_builder_produces_installable_license_and_vendor(self):
        builder = ROOT / "scripts/build_distribution.py"
        self.assertTrue(builder.is_file())
        output = self.base / "release"
        result = subprocess.run([sys.executable, str(builder), "--output", str(output)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((output / "release.json").read_text())
        archive = output / manifest["archive"]["file"]
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), manifest["archive"]["sha256"])
        import tarfile
        with tarfile.open(archive) as tar:
            self.assertEqual(sorted(m.name for m in tar.getmembers()),
                             [f"slopcheck-{VERSION}/{n}" for n in ("LICENSE", "README.md", "cli/slopcheck.py")])
        self.assertNotIn("core_release", manifest)
        self.assertEqual(sorted(p.name for p in (output / "npm/vendor").iterdir()), ["slopcheck.py"])
        self.assertEqual((output / "npm/vendor/slopcheck.py").read_bytes(), (ROOT / "cli/slopcheck.py").read_bytes())
        self.assertTrue((output / "npm/LICENSE").is_file())
        self.assertNotIn("REPLACE_WITH", (output / "slopcheck.rb").read_text())
        self.assertNotIn("REPLACE_WITH", (output / "PKGBUILD").read_text())

    def test_the_cli_offers_no_setup_or_lifecycle_commands(self):
        result = subprocess.run([sys.executable, str(ROOT / "cli/slopcheck.py"), "--help"],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for retired in ("slopcheck setup", "slopcheck synthesis", "dormant"):
            self.assertNotIn(retired, result.stdout)


class CurlCancellationTests(unittest.TestCase):
    """Run actual installer bytes with a disposable transport worker."""
    def fixture(self, root, phase, mode='wait'):
        import io, shlex, tarfile
        home=root/'home';home.mkdir();fake=root/'fake';fake.mkdir()
        prefix=root/'prefix';archive=root/'payload.tar.gz';installer=root/'install.sh'
        worker=root/'worker.py'
        python_code=('import os,signal,time\nfrom pathlib import Path\n'
            'mode=os.environ.get("CURL_CHILD_MODE","wait")\n'
            'if mode=="exit":raise SystemExit(23)\n'
            'if mode=="signal":signal.signal(signal.SIGTERM,signal.SIG_DFL);os.kill(os.getpid(),signal.SIGTERM)\n'
            'def stop(sig,frame):\n Path(os.environ["CURL_STOPPED"]).write_text(str(sig))\n raise SystemExit(0)\n'
            'for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(sig,stop)\n'
            'Path(os.environ["CURL_READY"]).write_text(str(os.getpid()))\ntime.sleep(30)\n')
        worker.write_text(python_code)
        setup_code = python_code
        with tarfile.open(archive,'w:gz') as output:
            for name,data in [('cli/slopcheck.py',setup_code.encode())]:
                member=tarfile.TarInfo('slopcheck-9.8.7/'+name);member.size=len(data);member.mode=0o755
                output.addfile(member,io.BytesIO(data))
        source=(ROOT/'packages/curl/install.sh').read_text()
        installer.write_text(source.replace('@VERSION@','9.8.7').replace('@ARCHIVE_SHA256@',hashlib.sha256(archive.read_bytes()).hexdigest()))
        curl=fake/'curl'
        if phase=='transport':curl.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(worker))+'\n')
        else:curl.write_text('#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\ncp "$CURL_ARCHIVE" "$2"\n')
        curl.chmod(0o755)
        env=dict(os.environ,HOME=str(home),PATH=str(fake)+os.pathsep+os.environ['PATH'],
                 CURL_READY=str(root/'ready'),CURL_STOPPED=str(root/'stopped'),CURL_ARCHIVE=str(archive),CURL_CHILD_MODE=mode)
        return ['sh',str(installer),'--prefix',str(prefix)],env,prefix

    def test_installer_forwards_and_reaps_each_incoming_signal(self):
        import signal,time
        for phase in ('transport',):
            for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):
                with self.subTest(phase=phase,signal=sig),tempfile.TemporaryDirectory(prefix='slopcheck-cancel-') as tmp:
                    root=Path(tmp).resolve();command,env,prefix=self.fixture(root,phase)
                    child=None
                    parent=subprocess.Popen(command,env=env,start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
                    try:
                        deadline=time.monotonic()+5
                        while not (root/'ready').exists() and time.monotonic()<deadline:
                            if parent.poll() is not None:self.fail('worker did not start: '+parent.stderr.read().decode())
                            time.sleep(.01)
                        self.assertTrue((root/'ready').exists(),'worker readiness timeout')
                        child=int((root/'ready').read_text());parent.send_signal(sig)
                        self.assertEqual(parent.wait(timeout=5),-sig)
                        self.assertEqual((root/'stopped').read_text(),str(sig))
                        with self.assertRaises(ProcessLookupError):os.kill(child,0)
                        self.assertFalse(list(prefix.glob('.slopcheck-download-*')))
                        self.assertFalse((prefix/'.slopcheck-install.json').exists())
                    finally:
                        if child:
                            try:os.kill(child,signal.SIGTERM)
                            except ProcessLookupError:pass
                        try:os.killpg(parent.pid,signal.SIGTERM)
                        except ProcessLookupError:pass
                        parent.wait(timeout=5);parent.stderr.close()

    def test_installer_preserves_child_exit_and_signal(self):
        import signal
        for phase in ('transport',):
            for mode,expected in [('exit',23),('signal',-signal.SIGTERM)]:
                with self.subTest(phase=phase,mode=mode),tempfile.TemporaryDirectory(prefix='slopcheck-status-') as tmp:
                    command,env,prefix=self.fixture(Path(tmp).resolve(),phase,mode)
                    result=subprocess.run(command,env=env,capture_output=True,timeout=5)
                    self.assertEqual(result.returncode,expected,result.stderr.decode())
                    self.assertFalse(list(prefix.glob('.slopcheck-download-*')))


if __name__ == "__main__":
    unittest.main()
