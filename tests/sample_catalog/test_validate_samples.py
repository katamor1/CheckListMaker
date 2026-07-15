import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from samples.validate_samples import (
    hash_and_size,
    load_json,
    main,
    resolve_regular_file,
    validate_catalog,
    validate_relative_path,
)


class ValidatorCoreTests(unittest.TestCase):
    def make_repo(self, catalog=None, catalog_text=None):
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        root = Path(temporary_directory.name)

        sample_directory = root / "samples" / "sample-a"
        sample_directory.mkdir(parents=True)
        expected_outcomes = b"[]\n"
        target_document = b"demo target document\n"
        (sample_directory / "expected-outcomes.json").write_bytes(
            expected_outcomes)
        (sample_directory / "target.txt").write_bytes(target_document)
        manifest = {
            "demoOperations": [],
            "description": "説明",
            "entryPoints": {
                "existing_document": {
                    "expectedOutcomesPath": "expected-outcomes.json",
                    "referenceIds": [],
                    "targetPath": "target.txt",
                }
            },
            "expectedJudgments": [],
            "files": [
                {
                    "mediaType": "application/json",
                    "path": "expected-outcomes.json",
                    "purpose": "expected_outcomes",
                    "sha256": hashlib.sha256(expected_outcomes).hexdigest(),
                    "sizeBytes": len(expected_outcomes),
                },
                {
                    "mediaType": "text/plain",
                    "path": "target.txt",
                    "purpose": "target_document",
                    "sha256": hashlib.sha256(target_document).hexdigest(),
                    "sizeBytes": len(target_document),
                }
            ],
            "id": "sample-a",
            "language": "ja",
            "references": [],
            "sampleFormatVersion": "1.0",
            "title": "サンプル",
        }
        self.write_json(sample_directory / "sample-manifest.json", manifest)

        samples_directory = root / "samples"
        if catalog_text is not None:
            self.write_text(samples_directory / "catalog.json", catalog_text)
        else:
            if catalog is None:
                catalog = [
                    {
                        "description": "説明",
                        "id": "sample-a",
                        "manifestPath": (
                            "samples/sample-a/sample-manifest.json"
                        ),
                        "modes": ["existing_document"],
                        "status": "active",
                        "title": "サンプル",
                    }
                ]
            self.write_json(samples_directory / "catalog.json", catalog)

        return root

    @staticmethod
    def write_json(path, value):
        ValidatorCoreTests.write_text(
            path,
            json.dumps(
                value,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
        )

    @staticmethod
    def write_text(path, value):
        with path.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(value)

    def test_duplicate_json_key_is_rejected(self):
        root = self.make_repo(
            catalog_text='[{"id":"a","id":"b"}]\n')
        report = validate_catalog(root)
        self.assertEqual(1, report.exit_code)
        self.assertIn(
            "JSON_DUPLICATE_KEY",
            {issue.code for issue in report.issues})

    def test_non_standard_json_constants_are_rejected(self):
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant):
                root = self.make_repo(catalog_text=f"[{constant}]\n")

                report = validate_catalog(root)

                self.assertEqual(1, report.exit_code)
                self.assertEqual(
                    ["JSON_INVALID"],
                    [issue.code for issue in report.issues])

    def test_deeply_nested_malformed_json_is_reported_as_invalid(self):
        depth = 10_000
        malformed = "[" * depth + "0" + "]" * (depth - 1) + "\n"
        root = self.make_repo(catalog_text=malformed)

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assertEqual(
            ["JSON_INVALID"],
            [issue.code for issue in report.issues])

    def test_parent_traversal_manifest_path_is_rejected(self):
        root = self.make_repo(catalog=[{
            "id": "sample-a",
            "manifestPath": "../outside.json",
            "title": "サンプル",
            "description": "説明",
            "modes": ["existing_document"],
            "status": "active"
        }])
        report = validate_catalog(root)
        self.assertIn(
            "PATH_INVALID",
            {issue.code for issue in report.issues})

    def test_windows_reserved_segment_is_rejected(self):
        segments, issues = validate_relative_path(
            "samples/CON/file.json",
            "catalog#/0/manifestPath")
        self.assertIsNone(segments)
        self.assertEqual(["PATH_INVALID"], [issue.code for issue in issues])

    def test_remaining_unsafe_relative_path_forms_are_rejected(self):
        invalid_paths = (
            ("non-string", None),
            ("empty", ""),
            ("non-ASCII", "samples/サンプル/file.json"),
            ("backslash", "samples\\file.json"),
            ("absolute", "/samples/file.json"),
            ("forward-slash UNC", "//server/share/file.json"),
            ("backslash UNC", "\\\\server\\share\\file.json"),
            ("drive-prefixed", "C:/samples/file.json"),
            ("colon", "samples/name:file.json"),
            ("empty segment", "samples//file.json"),
            ("dot segment", "samples/./file.json"),
            ("parent segment", "samples/../file.json"),
            ("trailing dot", "samples/name./file.json"),
            ("trailing space", "samples/name /file.json"),
            ("PRN extension", "samples/prn.txt/file.json"),
            ("AUX mixed case", "samples/AuX/file.json"),
            ("NUL extension", "samples/nul.json/file.json"),
            ("COM1 extension", "samples/com1.txt/file.json"),
            ("COM9", "samples/COM9/file.json"),
            ("LPT1 extension", "samples/lpt1.doc/file.json"),
            ("LPT9 mixed case", "samples/LpT9/file.json"),
        )
        for label, value in invalid_paths:
            with self.subTest(label=label):
                segments, issues = validate_relative_path(value, "location")
                self.assertIsNone(segments)
                self.assertEqual(
                    ["PATH_INVALID"],
                    [issue.code for issue in issues])

    def test_non_device_relative_path_segments_are_accepted(self):
        valid_paths = {
            "samples/COM0/file.json": ("samples", "COM0", "file.json"),
            "samples/COM10/file.json": ("samples", "COM10", "file.json"),
            "samples/LPT0/file.json": ("samples", "LPT0", "file.json"),
            "samples/LPT10/file.json": ("samples", "LPT10", "file.json"),
            "samples/conifer/sample.con": (
                "samples", "conifer", "sample.con"),
        }
        for value, expected_segments in valid_paths.items():
            with self.subTest(value=value):
                segments, issues = validate_relative_path(value, "location")
                self.assertEqual(expected_segments, segments)
                self.assertEqual((), issues)

    def test_regular_file_is_resolved_below_root(self):
        root = self.make_empty_root()
        target = root / "nested" / "file.txt"
        target.parent.mkdir()
        target.write_text("content\n", encoding="utf-8")

        resolved, issues = resolve_regular_file(
            root, ("nested", "file.txt"), "location")

        self.assertEqual(target.resolve(), resolved)
        self.assertEqual((), issues)

    def test_symlink_is_rejected(self):
        root = self.make_empty_root()
        target = root / "target.txt"
        target.write_text("content\n", encoding="utf-8")
        link = root / "link.txt"
        try:
            link.symlink_to(target)
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {type(error).__name__}")

        resolved, issues = resolve_regular_file(
            root, ("link.txt",), "location")

        self.assertIsNone(resolved)
        self.assertEqual(["PATH_SYMLINK"], [issue.code for issue in issues])

    def test_non_regular_missing_and_escaping_paths_are_rejected(self):
        parent = self.make_empty_root()
        root = parent / "root"
        root.mkdir()
        (root / "directory").mkdir()
        (root / "intermediate.txt").write_text(
            "content\n", encoding="utf-8")
        (parent / "outside.txt").write_text("outside\n", encoding="utf-8")
        cases = (
            (("directory",), "FILE_NOT_FOUND"),
            (("intermediate.txt", "child"), "FILE_NOT_FOUND"),
            (("missing.txt",), "FILE_NOT_FOUND"),
            (("..", "outside.txt"), "PATH_ESCAPE"),
        )
        for segments, expected_code in cases:
            with self.subTest(segments=segments):
                resolved, issues = resolve_regular_file(
                    root, segments, "location")
                self.assertIsNone(resolved)
                self.assertEqual(
                    [expected_code],
                    [issue.code for issue in issues])

    def test_hash_and_size_reads_payload_larger_than_one_mebibyte(self):
        root = self.make_empty_root()
        payload = b"a" * (1024 * 1024) + b"tail"
        path = root / "payload.bin"
        path.write_bytes(payload)

        sha256, size = hash_and_size(path)

        self.assertEqual(hashlib.sha256(payload).hexdigest(), sha256)
        self.assertEqual(len(payload), size)

    def test_malformed_and_missing_json_return_sanitized_issues(self):
        root = self.make_empty_root()
        malformed = root / "malformed.json"
        self.write_text(malformed, "{\n")
        cases = (
            (malformed, "JSON_INVALID", 1),
            (root / "missing.json", "INPUT_READ_FAILED", 2),
        )
        for path, expected_code, expected_exit_code in cases:
            with self.subTest(path=path.name):
                value, issues = load_json(path, "samples/catalog.json")
                self.assertIsNone(value)
                self.assertEqual(1, len(issues))
                self.assertEqual(expected_code, issues[0].code)
                self.assertEqual(expected_exit_code, issues[0].exit_code)
                self.assertEqual("samples/catalog.json", issues[0].location)
                self.assertNotIn(str(root), issues[0].message)

    def test_report_and_cli_errors_are_sorted_and_sanitized(self):
        root = self.make_repo(catalog=[
            self.catalog_entry("samples/NUL/file.json", "sample-b"),
            self.catalog_entry("../outside.json", "sample-a"),
        ])
        report = validate_catalog(root)
        sort_key = lambda issue: (issue.location, issue.code, issue.message)
        self.assertEqual(tuple(sorted(report.issues, key=sort_key)), report.issues)

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = main(("--root", str(root)))

        self.assertEqual(1, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertEqual(
            "ERROR PATH_INVALID catalog#/0/manifestPath: "
            "must be a safe ASCII repository-relative path\n"
            "ERROR PATH_INVALID catalog#/1/manifestPath: "
            "must be a safe ASCII repository-relative path\n"
            "FAILED samples=2 files=0 errors=2\n",
            stderr.getvalue())
        self.assertNotIn(str(root), stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())

    def make_empty_root(self):
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        return Path(temporary_directory.name)

    @staticmethod
    def catalog_entry(manifest_path, sample_id):
        return {
            "description": "説明",
            "id": sample_id,
            "manifestPath": manifest_path,
            "modes": ["existing_document"],
            "status": "active",
            "title": "サンプル",
        }


if __name__ == "__main__":
    unittest.main()
