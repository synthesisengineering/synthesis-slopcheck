"""scripts/cut_release.py against a fake GitHub, tap and build.

Every git, gh and build command the release runs goes to World, which answers as GitHub, the Homebrew tap and this
Mac would and fails the test on any command it does not know: no test reaches the network, tags, publishes, deploys
or runs npm.
"""

import base64
import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from subprocess import CompletedProcess

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("slopcheck_cut_release", ROOT / "scripts" / "cut_release.py")
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

SLUG = "synthesisengineering/synthesis-slopcheck"
REMOTE = f"https://github.com/{SLUG}.git"
TAP = "synthesisengineering/homebrew-tap"
TAP_FORMULA = "Formula/slopcheck.rb"
SHA, OTHER, TAP_MAIN, TAP_BLOB = "a" * 40, "b" * 40, "c" * 40, "f" * 40
VERSION = "0.3.0"
ARCHIVE = f"slopcheck-{VERSION}.tar.gz"
ARCHIVE_URL = f"https://github.com/{SLUG}/releases/download/v{VERSION}/{ARCHIVE}"
ARCHIVE_BYTES = b"archive of " + VERSION.encode()
OLD_FORMULA = ('class Slopcheck < Formula\n  url "https://github.com/%s/releases/download/v0.2.0/'
               'slopcheck-0.2.0.tar.gz"\n  sha256 "%s"\nend\n' % (SLUG, "0" * 64))
CLI_BYTES = b"#!/usr/bin/env python3\nprint('slopcheck')\n"
VALUED = {"-R", "--commit", "--target", "--title", "--notes", "--notes-file", "--dir", "--json", "--limit", "--head",
          "--base", "--body", "--state"}


def done(stdout="", stderr="", code=0):
    return CompletedProcess([], code, stdout, stderr)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def split(args):
    """(options, positional) of a gh command's arguments."""
    options, positional, items = {}, [], iter(args)
    for item in items:
        if item in VALUED:
            options[item] = next(items)
        elif item.startswith("-"):
            options[item] = True
        else:
            positional.append(item)
    return options, positional


class World:
    """GitHub, the tap and this Mac as the release sees them."""

    def __init__(self, repo):
        self.repo = repo
        self.dirty = ""
        self.head = self.main = SHA
        self.tags = {"0.2.0": OTHER}  # version -> the commit GitHub's tag names
        self.github_down = False
        self.ci = [{"status": "completed", "conclusion": "success", "workflowName": "Distribution"}]
        self.releases = {}  # tag -> {"draft", "target", "title", "notes", "assets": {name: bytes}}
        self.latest = "v0.2.0"
        self.tap_text = OLD_FORMULA
        self.tap_branches = {}
        self.pr = None
        self.pr_checks = []
        self.commands = []
        self.answer_once = {}  # "release create" -> the error GitHub answers once, after it acted
        self.build_error = ""
        self.corrupt = ""  # the asset GitHub serves with other bytes
        self.crash = ""  # the gh command during which the run is interrupted
        self.vendor = None  # bytes the build vendors in the npm package instead of the clone's CLI
        self.clone = None
        self.checked_out = ""
        self.local_tags = []
        self.tag_public_at_download = None

    def __call__(self, argv, timeout=None, cwd=None, env=None):
        argv = [str(item) for item in argv]
        self.commands.append(argv)
        if argv[0] == "git":
            return self.git(argv, env)
        if argv[0] == "gh":
            if self.crash and " ".join(argv[1:3]) == self.crash:
                self.crash = ""
                raise KeyboardInterrupt
            failure = self.answer_once.pop(" ".join(argv[1:3]), None)
            answer = self.gh(argv[1:])
            return done("", failure, 1) if failure else answer
        if argv[0] == sys.executable and argv[1].endswith("build_distribution.py"):
            return self.build(argv, cwd)
        raise AssertionError(f"a command the fakes do not know ran: {argv}")

    @staticmethod
    def without_config(env):
        assert env and env["GIT_CONFIG_GLOBAL"] == os.devnull and env["GIT_CONFIG_NOSYSTEM"] == "1", \
            "what GitHub serves is read with git's own config left out"

    def git(self, argv, env):
        args, where = argv[1:], None
        while args[0].startswith("-"):
            flag = args.pop(0)
            if flag in ("-c", "-C"):
                value = args.pop(0)
                where = value if flag == "-C" else where
        command, rest = args[0], args[1:]
        if command == "ls-remote":
            self.without_config(env)
            assert rest[0] == REMOTE, rest
            if self.github_down:
                return done("", "fatal: unable to access 'https://github.com/': Could not resolve host", 128)
            refs = [f"{self.main}\trefs/heads/main"] + [f"{sha}\trefs/tags/v{v}" for v, sha in sorted(self.tags.items())]
            return done("\n".join(refs) + "\n")
        if command == "clone":
            self.without_config(env)
            assert rest[-2] == REMOTE, rest
            self.clone = Path(rest[-1])
            self.clone.mkdir(parents=True)
            for name in ("packages/npm/package.json", "CHANGELOG.md", "cli/slopcheck.py"):
                if (self.repo / name).is_file():
                    (self.clone / name).parent.mkdir(parents=True, exist_ok=True)
                    (self.clone / name).write_bytes((self.repo / name).read_bytes())
            return done()
        if where == str(self.repo):
            if command == "rev-parse" and rest == ["--show-toplevel"]:
                return done(f"{self.repo}\n")
            if command == "status":
                return done(self.dirty)
            if command == "rev-parse" and rest == ["HEAD"]:
                return done(f"{self.head}\n")
        if self.clone and where == str(self.clone):
            self.without_config(env)
            if command == "checkout":
                self.checked_out = rest[-1]
                return done()
            if command == "rev-parse" and rest == ["HEAD"]:
                return done(f"{self.checked_out}\n")
        raise AssertionError(f"a git command the fakes do not know ran: {argv}")

    def gh(self, a):
        if a[:2] == ["run", "list"]:
            if self.ci is None:
                return done("", "To get started with GitHub CLI, please run:  gh auth login", 4)
            options, _ = split(a[2:])
            assert options["-R"] == f"github.com/{SLUG}" and options["--commit"] == self.head
            return done(json.dumps(self.ci))
        if a[:2] == ["release", "list"]:
            tags = sorted({*self.releases, self.latest})
            return done(json.dumps([{"tagName": t, "isLatest": t == self.latest} for t in tags]))
        if a[0] == "release":
            return self.release(a[1], a[2], *split(a[3:]))
        if a[0] == "api":
            return self.api(a[1:])
        if a[:2] == ["pr", "list"]:
            return done("[]")
        if a[:2] == ["pr", "create"]:
            options, _ = split(a[2:])
            assert options["-R"] == TAP and options["--base"] == "main"
            self.pr = {"url": f"https://github.com/{TAP}/pull/60", "branch": options["--head"], "armed": False}
            return done(self.pr["url"] + "\n")
        if a[:2] == ["pr", "merge"]:
            assert a[2] == self.pr["url"] and "--auto" in a and "--merge" in a, a
            self.pr["armed"] = True
            return done()
        if a[:2] == ["pr", "view"]:
            if self.pr_checks or not self.pr["armed"]:
                return done(json.dumps({"state": "OPEN", "statusCheckRollup": self.pr_checks}))
            self.tap_text = self.tap_branches[self.pr["branch"]]  # its checks passed, so it merged itself
            return done(json.dumps({"state": "MERGED", "statusCheckRollup": []}))
        raise AssertionError(f"a gh command the fakes do not know ran: {a}")

    def release(self, action, tag, options, files):
        assert options.pop("-R") == SLUG
        found = self.releases.get(tag)
        if action == "view":
            if not found:
                return done("", "release not found", 1)
            assets = [{"name": n, "digest": "sha256:" + sha256(b)} for n, b in sorted(found["assets"].items())]
            return done(json.dumps({"tagName": tag, "isDraft": found["draft"], "assets": assets,
                                    "url": f"https://github.com/{SLUG}/releases/tag/{tag}"}))
        if action == "create":
            assert options.pop("--draft"), "a release starts as a draft"
            notes = next((k, v) if v is not True else (k,) for k, v in options.items()
                         if k in ("--notes", "--notes-file", "--generate-notes"))
            self.releases[tag] = {"draft": True, "target": options["--target"], "title": options["--title"],
                                  "notes": notes, "assets": {}}
            self.upload(tag, files)
            return done(f"https://github.com/{SLUG}/releases/tag/untagged-1\n")
        if action == "upload":
            assert found and found["draft"] and options == {"--clobber": True}
            self.upload(tag, files)
            return done()
        if action == "download":
            self.tag_public_at_download = tag[1:] in self.tags
            for name, data in found["assets"].items():
                (Path(options["--dir"]) / name).write_bytes(data + b"!" * (name == self.corrupt))
            return done()
        if action == "edit":
            assert options == {"--draft=false": True, "--latest": True}, options
            found["draft"] = False
            self.tags[tag[1:]] = found["target"]  # publishing puts the tag on GitHub at the target
            self.latest = tag
            return done()
        if action == "delete":
            assert options == {"--yes": True} and found["draft"]
            del self.releases[tag]
            return done()
        raise AssertionError(f"a gh release command the fakes do not know ran: {action}")

    def upload(self, tag, files):
        for file in files:
            self.releases[tag]["assets"][Path(file).name] = Path(file).read_bytes()

    def api(self, a):
        method = a[a.index("-X") + 1] if "-X" in a else "GET"
        path = next(item for item in a if item.startswith("repos/"))
        fields = dict(a[i + 1].split("=", 1) for i, item in enumerate(a) if item in ("-f", "-F"))
        if method == "GET" and path == f"repos/{TAP}/contents/{TAP_FORMULA}?ref=main":
            return done(json.dumps({"content": base64.b64encode(self.tap_text.encode()).decode(), "sha": TAP_BLOB}))
        if method == "GET" and path == f"repos/{TAP}/git/ref/heads/main":
            return done(json.dumps({"object": {"sha": TAP_MAIN}}))
        if method == "POST" and path == f"repos/{TAP}/git/refs":
            assert fields["sha"] == TAP_MAIN
            self.tap_branches[fields["ref"][len("refs/heads/"):]] = self.tap_text
            return done("{}")
        if method == "PUT" and path == f"repos/{TAP}/contents/{TAP_FORMULA}":
            assert fields["sha"] == TAP_BLOB and fields["branch"] in self.tap_branches
            self.tap_branches[fields["branch"]] = base64.b64decode(fields["content"]).decode()
            return done("{}")
        if method == "DELETE" and path.startswith(f"repos/{TAP}/git/refs/heads/"):
            self.tap_branches.pop(path.rsplit("/", 1)[1], None)
            return done()
        raise AssertionError(f"a gh api call the fakes do not know ran: {a}")

    def build(self, argv, cwd):
        assert self.clone and argv[1] == str(self.clone / "scripts" / "build_distribution.py") and cwd == str(self.clone)
        assert argv[2] == "--output" and len(argv) == 4, "the build reads the bytes beside it and takes only --output"
        if self.build_error:
            return done("", self.build_error, 1)
        out = Path(argv[3])
        (out / "npm" / "vendor").mkdir(parents=True)
        cli = (self.clone / "cli" / "slopcheck.py").read_bytes()
        (out / "npm" / "vendor" / "slopcheck.py").write_bytes(cli if self.vendor is None else self.vendor)
        (out / ARCHIVE).write_bytes(ARCHIVE_BYTES)
        (out / "install.sh").write_text(f"#!/bin/sh\n# {sha256(ARCHIVE_BYTES)}\n")
        record = {"schema_version": 1, "version": VERSION, "npm_package": "@synthesiswork/slopcheck",
                  "archive": {"file": ARCHIVE, "url": ARCHIVE_URL, "sha256": sha256(ARCHIVE_BYTES)},
                  "cli_sha256": sha256(cli), "installer_sha256": sha256((out / "install.sh").read_bytes())}
        (out / "release.json").write_text(json.dumps(record))
        (out / "slopcheck.rb").write_text(
            f'class Slopcheck < Formula\n  url "{ARCHIVE_URL}"\n  sha256 "{sha256(ARCHIVE_BYTES)}"\nend\n')
        (out / "PKGBUILD").write_text(f"pkgver={VERSION}\n")
        (out / ".SRCINFO").write_text(f"pkgver = {VERSION}\n")
        (out / "npm" / "package.json").write_text(json.dumps({"name": "@synthesiswork/slopcheck", "version": VERSION}))
        return done(json.dumps(record))


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name).resolve()
        self.repo = base / "checkout"
        (self.repo / "cli").mkdir(parents=True)
        (self.repo / "cli" / "slopcheck.py").write_bytes(CLI_BYTES)
        self.write_version(VERSION)
        self.output = base / "built"
        self.world = World(self.repo)
        self.waits = []

    def write_version(self, version):
        (self.repo / "packages" / "npm").mkdir(parents=True, exist_ok=True)
        (self.repo / "packages" / "npm" / "package.json").write_text(
            json.dumps({"name": "@synthesiswork/slopcheck", "version": version}))

    def release(self, *extra):
        self.before = (json.dumps(self.world.releases, sort_keys=True, default=repr), dict(self.world.tags))
        printed = io.StringIO()
        with redirect_stdout(printed):
            code = release.main(["--repo-root", str(self.repo), "--output", str(self.output), *extra],
                                run=self.world, sleep=self.waits.append)
        return code, printed.getvalue()

    def ran(self, *prefix):
        return [command for command in self.world.commands if command[:len(prefix)] == list(prefix)]

    def assert_nothing_published(self):
        for prefix in (("gh", "release", "create"), ("gh", "release", "upload"), ("gh", "release", "edit"),
                       ("gh", "pr", "create"), ("gh", "pr", "merge")):
            self.assertEqual(self.ran(*prefix), [], prefix)
        self.assertEqual([c for c in self.world.commands if c[:2] == ["gh", "api"] and "-X" in c], [])
        self.assertEqual((json.dumps(self.world.releases, sort_keys=True, default=repr), self.world.tags), self.before,
                         "GitHub holds what it held before the run")

    def assert_npm_never_ran(self):
        self.assertEqual([c for c in self.world.commands
                          if os.path.basename(c[0]) in ("npm", "npx", "bun", "bash", "sh", "wrangler")], [])

    def test_a_release_publishes_from_a_fresh_clone_and_reads_everything_back(self):
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        published = self.world.releases[f"v{VERSION}"]
        self.assertFalse(published["draft"])
        self.assertEqual(published["target"], SHA)
        self.assertEqual(published["title"], f"SlopCheck {VERSION}")
        self.assertEqual(sorted(published["assets"]), ["install.sh", "release.json", ARCHIVE])
        self.assertEqual(published["assets"][ARCHIVE], ARCHIVE_BYTES)
        self.assertEqual(self.world.tags[VERSION], SHA)
        self.assertEqual(self.world.latest, f"v{VERSION}")
        self.assertEqual(self.world.local_tags, [], "the tag is made by publishing on GitHub, never before")
        self.assertEqual(self.world.checked_out, SHA)
        self.assertIs(self.world.tag_public_at_download, False, "the files are read back before the tag is public")
        steps = [c[2] for c in self.ran("gh", "release") if c[2] in ("create", "download", "edit")]
        self.assertEqual(steps, ["create", "download", "edit"])
        self.assertIn(f'url "{ARCHIVE_URL}"', self.world.tap_text)
        self.assertIn(f'sha256 "{sha256(ARCHIVE_BYTES)}"', self.world.tap_text)
        self.assertEqual(self.world.tap_branches, {}, "the tap branch is deleted once it merged")
        self.assertFalse(self.world.clone.exists(), "the clone is removed")
        self.assertIn("release complete: v0.3.0", printed)

    def test_npm_the_page_and_the_email_worker_are_steps_the_release_names_and_never_runs(self):
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        self.assertIn(f"npm pack --dry-run --json {self.output / 'npm'}", printed)
        self.assertIn(f"npm publish --access public {self.output / 'npm'}", printed)
        self.assertIn("bash scripts/publish-site.sh", printed)
        self.assertIn("npm run deploy, in workers/email-in", printed)
        self.assertIn("approves each time", printed)
        self.assert_npm_never_ran()

    def test_an_npm_package_that_vendors_another_cli_publishes_nothing(self):
        self.world.vendor = b"print('another')\n"
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("the npm package does not vendor the clone's cli/slopcheck.py", printed)
        self.assert_nothing_published()

    def test_a_dry_run_checks_prints_the_plan_and_changes_nothing(self):
        code, printed = self.release("--dry-run")
        self.assertEqual(code, 0, printed)
        self.assertIn("nothing was changed", printed)
        self.assertIn(f"v{VERSION}", printed)
        self.assertIn("npm publish", printed)
        self.assert_nothing_published()
        self.assert_npm_never_ran()
        self.assertEqual([c for c in self.world.commands if "clone" in c or "tag" in c], [])
        self.assertEqual([c for c in self.world.commands if c[0] == sys.executable], [])
        self.assertFalse(self.output.exists())

    def test_preflight_refuses_and_publishes_nothing(self):
        cases = {
            "the tree has uncommitted changes": lambda w: setattr(w, "dirty", " M cli/slopcheck.py\n"),
            f"is not the tip of {SLUG} main": lambda w: setattr(w, "main", OTHER),
            f"already has v{VERSION}": lambda w: w.tags.update({VERSION: OTHER}),
            "already has v0.4.0, higher than 0.3.0": lambda w: w.tags.update({"0.4.0": OTHER}),
            f"already has a draft release for v{VERSION}": lambda w: w.releases.update(
                {f"v{VERSION}": {"draft": True, "target": SHA, "assets": {}}}),
            "failed Distribution": lambda w: setattr(w, "ci", [
                {"status": "completed", "conclusion": "failure", "workflowName": "Distribution"}]),
            "running Distribution": lambda w: setattr(w, "ci", [
                {"status": "in_progress", "conclusion": "", "workflowName": "Distribution"}]),
            "no CI run": lambda w: setattr(w, "ci", []),
            "cannot read CI": lambda w: setattr(w, "ci", None),
            f"cannot read {SLUG} on GitHub": lambda w: setattr(w, "github_down", True),
        }
        for expected, arrange in cases.items():
            with self.subTest(expected):
                self.world = World(self.repo)
                arrange(self.world)
                code, printed = self.release()
                self.assertEqual(code, 1, printed)
                self.assertIn("refused before publishing anything", printed)
                self.assertIn(expected, printed)
                self.assert_nothing_published()
                self.assertIsNone(self.world.clone)
                self.assertFalse(self.output.exists())

    def test_preflight_refuses_an_output_folder_that_exists(self):
        self.output.mkdir()
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("must be a new directory", printed)
        self.assert_nothing_published()

    def test_preflight_refuses_a_version_that_is_not_exact(self):
        self.write_version("0.3")
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("not an exact version", printed)
        self.assert_nothing_published()

    def test_preflight_refuses_a_changelog_that_does_not_name_the_version(self):
        (self.repo / "CHANGELOG.md").write_text("# Changelog\n\n## 0.2.9\n\nOlder.\n")
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("CHANGELOG.md's newest entry is 0.2.9", printed)
        self.assert_nothing_published()

    def test_the_changelog_entry_is_the_release_notes_where_one_is_kept(self):
        (self.repo / "CHANGELOG.md").write_text(
            "# Changelog\n\n## [0.3.0] - 2026-11-18\n\nThe email reply keeps its thread.\n\n## [0.2.0]\n\nOlder.\n")
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        self.assertEqual(self.world.releases[f"v{VERSION}"]["notes"], ("--notes", "The email reply keeps its thread."))

    def test_without_a_changelog_the_notes_are_a_file_or_written_by_github(self):
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        self.assertEqual(self.world.releases[f"v{VERSION}"]["notes"], ("--generate-notes",))
        notes = self.repo.parent / "notes.md"
        notes.write_text("SlopCheck 0.3.0 keeps the email reply's thread.\n")
        self.output = self.repo.parent / "built-again"
        self.world = World(self.repo)
        code, printed = self.release("--notes-file", str(notes))
        self.assertEqual(code, 0, printed)
        self.assertEqual(self.world.releases[f"v{VERSION}"]["notes"], ("--notes-file", str(notes)))

    def test_a_file_github_serves_differently_stops_the_release_before_anything_is_public(self):
        self.world.corrupt = "install.sh"
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("byte for byte (install.sh)", printed)
        self.assertIn(f"deleted the draft release v{VERSION}", printed)
        self.assertEqual(self.world.releases, {}, "its own draft is deleted, so a run again starts clean")
        self.assertNotIn(VERSION, self.world.tags)
        self.assertEqual(self.ran("gh", "release", "edit"), [])
        self.assertEqual(self.ran("gh", "pr", "create"), [])

    def test_an_interrupted_run_deletes_its_draft_and_stops(self):
        self.world.crash = "release download"
        with self.assertRaises(KeyboardInterrupt):
            self.release()
        self.assertEqual(self.world.releases, {}, "its own draft is deleted, so a run again starts clean")
        self.assertNotIn(VERSION, self.world.tags)
        self.assertEqual(self.ran("gh", "release", "edit"), [])

    def test_a_failed_build_publishes_nothing(self):
        self.world.build_error = "error: lockfile had changes, but lockfile is frozen"
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("the build failed, so nothing was published", printed)
        self.assert_nothing_published()
        self.assertFalse(self.world.clone.exists())

    def test_a_github_server_error_runs_its_stage_again_with_the_same_draft(self):
        self.world.answer_once["release create"] = "HTTP 502: Bad Gateway (https://api.github.com/)"
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        self.assertEqual(len(self.ran("gh", "release", "create")), 1, "no second draft")
        self.assertEqual(len(self.ran("gh", "release", "upload")), 1, "the run's own draft gets its files again")
        self.assertEqual(self.waits[0], 20)
        self.assertFalse(self.world.releases[f"v{VERSION}"]["draft"])

    def test_a_tap_that_already_serves_the_release_gets_no_pull_request(self):
        self.world.tap_text = f'class Slopcheck < Formula\n  url "{ARCHIVE_URL}"\n  sha256 "{sha256(ARCHIVE_BYTES)}"\n'
        code, printed = self.release()
        self.assertEqual(code, 0, printed)
        self.assertIn("Homebrew already serves slopcheck 0.3.0", printed)
        self.assertEqual(self.ran("gh", "pr", "create"), [])

    def test_a_tap_pull_request_whose_checks_fail_leaves_the_release_not_complete(self):
        self.world.pr_checks = [{"name": "install", "conclusion": "FAILURE", "detailsUrl": ""}]
        code, printed = self.release()
        self.assertEqual(code, 1, printed)
        self.assertIn("did not merge (install)", printed)
        self.assertFalse(self.world.releases[f"v{VERSION}"]["draft"], "a published release stays as it is")
        self.assertNotIn("deleted the draft", printed)
        self.assertIn(OLD_FORMULA, self.world.tap_text)


if __name__ == "__main__":
    unittest.main()
