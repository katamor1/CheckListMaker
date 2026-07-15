import contextlib
import hashlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import samples.validate_samples as validator
from samples.validate_samples import (
    ValidationIssue,
    _report,
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

    def test_oversized_json_integer_is_reported_as_invalid(self):
        oversized_integer = "9" * 10_000
        root = self.make_repo(
            catalog_text=f"[{oversized_integer}]\n")

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assertEqual(
            ["JSON_INVALID"],
            [issue.code for issue in report.issues])

    def test_oversized_json_integer_is_rejected_with_runtime_guard_disabled(self):
        oversized_integer = "9" * 10_000
        root = self.make_repo(
            catalog_text=f"[{oversized_integer}]\n")
        set_limit = getattr(sys, "set_int_max_str_digits", None)
        get_limit = getattr(sys, "get_int_max_str_digits", None)
        previous_limit = get_limit() if get_limit is not None else None

        try:
            if set_limit is not None:
                set_limit(0)
            report = validate_catalog(root)
        finally:
            if set_limit is not None and previous_limit is not None:
                set_limit(previous_limit)

        self.assertEqual(1, report.exit_code)
        self.assertEqual(
            ["JSON_INVALID"],
            [issue.code for issue in report.issues])

    def test_valid_json_integers_remain_supported(self):
        root = self.make_empty_root()
        path = root / "integers.json"
        self.write_text(path, "[-123, 0, 456]\n")

        value, issues = load_json(path, "integers.json")

        self.assertEqual([-123, 0, 456], value)
        self.assertEqual((), issues)

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
        collected_issues = (
            ValidationIssue("A_CODE", "z/location", "a message"),
            ValidationIssue("B_CODE", "a/location", "a message"),
            ValidationIssue("A_CODE", "a/location", "z message"),
            ValidationIssue("A_CODE", "a/location", "a message"),
        )
        sort_key = lambda issue: (issue.location, issue.code, issue.message)
        expected_issues = tuple(sorted(collected_issues, key=sort_key))
        self.assertEqual(tuple(reversed(expected_issues)), collected_issues)

        report = _report(collected_issues, sample_count=0, file_count=0)

        self.assertEqual(expected_issues, report.issues)

        root = self.make_repo(catalog=[
            self.catalog_entry("samples/NUL/file.json", "sample-a"),
            self.catalog_entry("../outside.json", "sample-b"),
        ])

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

    def test_cli_escapes_newline_and_escape_in_unknown_property_name(self):
        unsafe_property = "bad\n\x1b[31m"
        entry = self.catalog_entry(
            "samples/sample-a/sample-manifest.json", "sample-a")
        entry[unsafe_property] = True
        root = self.make_repo(catalog=[entry])

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = main(("--root", str(root)))

        self.assertEqual(1, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertEqual(
            "ERROR PROPERTY_UNKNOWN catalog#/0/bad\\n\\x1b[31m: "
            "property is not allowed\n"
            "FAILED samples=1 files=2 errors=1\n",
            stderr.getvalue(),
        )
        self.assertNotIn("\x1b", stderr.getvalue())

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


class ValidatorContractAndMutationTests(unittest.TestCase):
    """Exercise the complete format 1.0 contract in temporary repositories."""

    def make_repo(self):
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
                self.file_entry(
                    "expected-outcomes.json",
                    "expected_outcomes",
                    "application/json",
                    expected_outcomes,
                ),
                self.file_entry(
                    "target.txt",
                    "target_document",
                    "text/plain",
                    target_document,
                ),
            ],
            "id": "sample-a",
            "language": "ja",
            "references": [],
            "sampleFormatVersion": "1.0",
            "title": "サンプル",
        }
        self.write_json(sample_directory / "sample-manifest.json", manifest)
        self.write_json(root / "samples" / "catalog.json", [{
            "description": "説明",
            "id": "sample-a",
            "manifestPath": "samples/sample-a/sample-manifest.json",
            "modes": ["existing_document"],
            "status": "active",
            "title": "サンプル",
        }])
        return root

    @staticmethod
    def file_entry(path, purpose, media_type, payload):
        return {
            "mediaType": media_type,
            "path": path,
            "purpose": purpose,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "sizeBytes": len(payload),
        }

    @staticmethod
    def write_json(path, value):
        ValidatorContractAndMutationTests.write_text(
            path,
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
            + "\n",
        )

    @staticmethod
    def write_text(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(value)

    @staticmethod
    def read_json(path):
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)

    def catalog_path(self, root):
        return root / "samples" / "catalog.json"

    def manifest_path(self, root):
        return root / "samples" / "sample-a" / "sample-manifest.json"

    def sample_directory(self, root):
        return self.manifest_path(root).parent

    def mutate_catalog(self, root, mutation):
        catalog = self.read_json(self.catalog_path(root))
        mutation(catalog)
        self.write_json(self.catalog_path(root), catalog)

    def mutate_manifest(self, root, mutation):
        manifest = self.read_json(self.manifest_path(root))
        mutation(manifest)
        self.write_json(self.manifest_path(root), manifest)

    def add_payload(self, root, path, purpose, media_type, payload):
        payload_path = self.sample_directory(root) / path
        payload_path.parent.mkdir(parents=True, exist_ok=True)
        payload_path.write_bytes(payload)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"].append(
                self.file_entry(path, purpose, media_type, payload)),
        )

    def add_reference(self, root, reference_id="REF-001"):
        payload = b"reference text\n"
        self.add_payload(
            root,
            "reference.txt",
            "reference_document",
            "text/plain",
            payload,
        )

        def mutation(manifest):
            manifest["references"].append({
                "authorityLevel": "binding",
                "displayName": "参考資料",
                "filePath": "reference.txt",
                "id": reference_id,
                "priority": 100,
                "role": "quality policy",
            })
            manifest["entryPoints"]["existing_document"][
                "referenceIds"].append(reference_id)

        self.mutate_manifest(root, mutation)

    def add_generation_mode(self, root):
        payload = b'{"request":"generate"}\n'
        self.add_payload(
            root,
            "request.json",
            "generation_request",
            "application/json",
            payload,
        )
        self.mutate_catalog(
            root,
            lambda catalog: catalog[0]["modes"].append(
                "document_generation"),
        )
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"].update({
                "document_generation": {
                    "referenceIds": [],
                    "requestPath": "request.json",
                }
            }),
        )

    def append_matching_sample(self, root, sample_id, directory_name):
        destination = root / "samples" / directory_name
        shutil.copytree(self.sample_directory(root), destination)
        manifest_path = destination / "sample-manifest.json"
        manifest = self.read_json(manifest_path)
        manifest["id"] = sample_id
        self.write_json(manifest_path, manifest)

        catalog = self.read_json(self.catalog_path(root))
        entry = dict(catalog[0])
        entry["id"] = sample_id
        entry["manifestPath"] = (
            f"samples/{directory_name}/sample-manifest.json")
        catalog.append(entry)
        self.write_json(self.catalog_path(root), catalog)

    def assert_issue(self, root, expected_code):
        report = validate_catalog(root)
        self.assertEqual(1, report.exit_code)
        self.assertIn(expected_code, [issue.code for issue in report.issues])
        return report

    def assert_diagnostic(self, report, code, location, message):
        self.assertIn(
            ValidationIssue(code, location, message),
            report.issues,
        )

    def test_valid_format_1_catalog_and_manifest_pass(self):
        root = self.make_repo()

        report = validate_catalog(root)

        self.assertEqual(0, report.exit_code)
        self.assertEqual(1, report.sample_count)
        self.assertEqual(2, report.file_count)
        self.assertEqual((), report.issues)

    def test_both_entry_point_shapes_and_references_pass(self):
        root = self.make_repo()
        self.add_reference(root)
        self.add_generation_mode(root)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"][
                "document_generation"]["referenceIds"].append("REF-001"),
        )

        report = validate_catalog(root)

        self.assertEqual(0, report.exit_code)
        self.assertEqual(4, report.file_count)
        self.assertEqual((), report.issues)

    def test_schema_matches_public_validator_constants(self):
        expected_catalog_keys = frozenset({
            "id", "manifestPath", "title",
            "description", "modes", "status",
        })
        expected_manifest_keys = frozenset({
            "sampleFormatVersion", "id", "title", "description", "language",
            "entryPoints", "files", "references",
            "expectedJudgments", "demoOperations",
        })
        expected_modes = frozenset({
            "existing_document", "document_generation",
        })
        expected_purposes = frozenset({
            "documentation", "target_document", "expected_outcomes",
            "generation_request", "reference_document",
        })
        expected_media = {
            ".md": "text/markdown",
            ".txt": "text/plain",
            ".json": "application/json",
            ".pdf": "application/pdf",
            ".docx": (
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
        }
        expected_authority_levels = frozenset({
            "reference", "working", "approved", "binding",
        })
        schema_path = Path(validator.__file__).with_name("catalog.schema.json")
        schema = self.read_json(schema_path)
        entry_schema = schema["items"]
        properties = entry_schema["properties"]

        self.assertEqual(expected_catalog_keys, validator.CATALOG_KEYS)
        self.assertEqual(expected_manifest_keys, validator.MANIFEST_KEYS)
        self.assertEqual(expected_modes, validator.MODES)
        self.assertEqual(expected_purposes, validator.PURPOSES)
        self.assertEqual(expected_media, validator.MEDIA_BY_SUFFIX)
        self.assertEqual(
            expected_authority_levels, validator.AUTHORITY_LEVELS)
        self.assertEqual(
            "^[a-z0-9]+(?:-[a-z0-9]+)*$",
            validator.CATALOG_ID_PATTERN,
        )
        self.assertEqual("active", validator.CATALOG_STATUS)
        self.assertEqual("array", schema["type"])
        self.assertFalse(entry_schema["additionalProperties"])
        self.assertEqual(expected_catalog_keys, frozenset(entry_schema["required"]))
        self.assertEqual(expected_catalog_keys, frozenset(properties))
        self.assertEqual(
            validator.CATALOG_ID_PATTERN,
            properties["id"]["pattern"],
        )
        self.assertEqual(
            expected_modes,
            frozenset(properties["modes"]["items"]["enum"]),
        )
        self.assertEqual(1, properties["modes"]["minItems"])
        self.assertTrue(properties["modes"]["uniqueItems"])
        self.assertEqual(
            validator.CATALOG_STATUS, properties["status"]["const"])

    def test_catalog_requires_exact_properties(self):
        root = self.make_repo()
        self.mutate_catalog(root, lambda catalog: catalog[0].pop("title"))
        self.assert_issue(root, "PROPERTY_MISSING")

        root = self.make_repo()
        self.mutate_catalog(
            root, lambda catalog: catalog[0].update({"extra": True}))
        self.assert_issue(root, "PROPERTY_UNKNOWN")

    def test_manifest_and_nested_objects_require_exact_properties(self):
        mutations = (
            (
                "manifest missing",
                lambda manifest: manifest.pop("language"),
                "PROPERTY_MISSING",
            ),
            (
                "manifest unknown",
                lambda manifest: manifest.update({"extra": True}),
                "PROPERTY_UNKNOWN",
            ),
            (
                "entry point missing",
                lambda manifest: manifest["entryPoints"][
                    "existing_document"].pop("targetPath"),
                "PROPERTY_MISSING",
            ),
            (
                "entry point unknown",
                lambda manifest: manifest["entryPoints"][
                    "existing_document"].update({"extra": True}),
                "PROPERTY_UNKNOWN",
            ),
            (
                "file missing",
                lambda manifest: manifest["files"][0].pop("sha256"),
                "PROPERTY_MISSING",
            ),
            (
                "file unknown",
                lambda manifest: manifest["files"][0].update({"extra": True}),
                "PROPERTY_UNKNOWN",
            ),
        )
        for label, mutation, expected_code in mutations:
            with self.subTest(label=label):
                root = self.make_repo()
                self.mutate_manifest(root, mutation)
                self.assert_issue(root, expected_code)

        for label, mutation, expected_code in (
            (
                "reference missing",
                lambda manifest: manifest["references"][0].pop("role"),
                "PROPERTY_MISSING",
            ),
            (
                "reference unknown",
                lambda manifest: manifest["references"][0].update(
                    {"extra": True}),
                "PROPERTY_UNKNOWN",
            ),
        ):
            with self.subTest(label=label):
                root = self.make_repo()
                self.add_reference(root)
                self.mutate_manifest(root, mutation)
                self.assert_issue(root, expected_code)

    def test_catalog_rejects_wrong_json_types(self):
        cases = (
            ("id", 1, "VALUE_INVALID"),
            ("manifestPath", [], "PATH_INVALID"),
            ("title", False, "VALUE_INVALID"),
            ("description", {}, "VALUE_INVALID"),
            ("modes", "existing_document", "VALUE_INVALID"),
            ("status", None, "VALUE_INVALID"),
        )
        for field, value, expected_code in cases:
            with self.subTest(field=field):
                root = self.make_repo()
                self.mutate_catalog(
                    root,
                    lambda catalog, field=field, value=value: catalog[0].update(
                        {field: value}),
                )
                self.assert_issue(root, expected_code)

    def test_manifest_rejects_wrong_json_types(self):
        cases = (
            ("sampleFormatVersion", 1, "VALUE_INVALID"),
            ("id", False, "VALUE_INVALID"),
            ("title", [], "VALUE_INVALID"),
            ("description", {}, "VALUE_INVALID"),
            ("language", None, "VALUE_INVALID"),
            ("entryPoints", [], "VALUE_INVALID"),
            ("files", {}, "VALUE_INVALID"),
            ("references", {}, "VALUE_INVALID"),
            ("expectedJudgments", {}, "VALUE_INVALID"),
            ("demoOperations", {}, "VALUE_INVALID"),
        )
        for field, value, expected_code in cases:
            with self.subTest(field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest.update(
                        {field: value}),
                )
                self.assert_issue(root, expected_code)

    def test_nested_objects_reject_wrong_json_types(self):
        file_cases = (
            ("path", 1, "PATH_INVALID"),
            ("purpose", [], "VALUE_INVALID"),
            ("mediaType", {}, "VALUE_INVALID"),
            ("sha256", False, "VALUE_INVALID"),
            ("sizeBytes", "1", "VALUE_INVALID"),
        )
        for field, value, expected_code in file_cases:
            with self.subTest(kind="file", field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest[
                        "files"][0].update({field: value}),
                )
                self.assert_issue(root, expected_code)

        reference_cases = (
            ("id", 1, "REFERENCE_ID_INVALID"),
            ("filePath", [], "PATH_INVALID"),
            ("displayName", False, "VALUE_INVALID"),
            ("role", {}, "VALUE_INVALID"),
            ("authorityLevel", None, "VALUE_INVALID"),
            ("priority", True, "VALUE_INVALID"),
        )
        for field, value, expected_code in reference_cases:
            with self.subTest(kind="reference", field=field):
                root = self.make_repo()
                self.add_reference(root)
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest[
                        "references"][0].update({field: value}),
                )
                self.assert_issue(root, expected_code)

        entry_cases = (
            ("targetPath", 1, "PATH_INVALID"),
            ("expectedOutcomesPath", [], "PATH_INVALID"),
            ("referenceIds", "REF-001", "VALUE_INVALID"),
        )
        for field, value, expected_code in entry_cases:
            with self.subTest(kind="entry point", field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest[
                        "entryPoints"]["existing_document"].update(
                            {field: value}),
                )
                self.assert_issue(root, expected_code)

    def test_catalog_ids_must_be_strictly_ascending(self):
        root = self.make_repo()
        self.append_matching_sample(root, "sample-0", "sample-zero")

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assert_diagnostic(
            report,
            "VALUE_INVALID",
            "catalog#/1/id",
            "catalog IDs must be strictly ascending",
        )

    def test_exact_duplicate_catalog_id_is_not_strictly_ascending(self):
        root = self.make_repo()
        self.append_matching_sample(root, "sample-a", "sample-duplicate")

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assert_diagnostic(
            report,
            "VALUE_INVALID",
            "catalog#/1/id",
            "catalog IDs must be strictly ascending",
        )

    def test_catalog_ids_must_be_unique_ignoring_case(self):
        root = self.make_repo()
        self.append_matching_sample(root, "SAMPLE-A", "sample-upper")
        catalog = self.read_json(self.catalog_path(root))
        self.write_json(self.catalog_path(root), [catalog[1], catalog[0]])

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assert_diagnostic(
            report,
            "VALUE_INVALID",
            "catalog#/1/id",
            "catalog IDs must be unique ignoring case",
        )
        self.assertNotIn(
            ValidationIssue(
                "VALUE_INVALID",
                "catalog#/1/id",
                "catalog IDs must be strictly ascending",
            ),
            report.issues,
        )

    def test_catalog_id_must_match_pattern(self):
        root = self.make_repo()
        self.mutate_catalog(
            root,
            lambda catalog: catalog[0].update({"id": "sample_a"}),
        )
        self.mutate_manifest(
            root,
            lambda manifest: manifest.update({"id": "sample_a"}),
        )

        report = validate_catalog(root)

        self.assertEqual(1, report.exit_code)
        self.assert_diagnostic(
            report,
            "VALUE_INVALID",
            "catalog#/0/id",
            "must match the catalog ID pattern",
        )

    def test_manifest_paths_are_case_insensitively_unique(self):
        root = self.make_repo()

        def mutation(catalog):
            second = dict(catalog[0])
            second["id"] = "sample-b"
            second["manifestPath"] = (
                "SAMPLES/SAMPLE-A/SAMPLE-MANIFEST.JSON")
            catalog.append(second)

        self.mutate_catalog(root, mutation)
        self.assert_issue(root, "PATH_CASE_COLLISION")

    def test_catalog_and_manifest_metadata_must_match(self):
        cases = (
            ("id", "different-id"),
            ("title", "別のタイトル"),
            ("description", "別の説明"),
        )
        for field, value in cases:
            with self.subTest(field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest.update(
                        {field: value}),
                )
                self.assert_issue(root, "VALUE_INVALID")

        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"].update({
                "document_generation": {
                    "requestPath": "expected-outcomes.json",
                    "referenceIds": [],
                }
            }),
        )
        report = self.assert_issue(root, "PROPERTY_UNKNOWN")
        self.assertIn(
            "VALUE_INVALID", [issue.code for issue in report.issues])

    def test_manifest_version_and_language_are_exact(self):
        manifest_cases = (
            ("sampleFormatVersion", "2.0"),
            ("language", "en"),
        )
        for field, value in manifest_cases:
            with self.subTest(field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest.update(
                        {field: value}),
                )
                self.assert_issue(root, "VALUE_INVALID")

    def test_catalog_values_report_the_direct_field_diagnostic(self):
        catalog_cases = (
            (
                "empty modes",
                "modes",
                [],
                "catalog#/0/modes",
                "must contain at least one mode",
            ),
            (
                "duplicate modes",
                "modes",
                ["existing_document", "existing_document"],
                "catalog#/0/modes/1",
                "modes must be unique",
            ),
            (
                "unknown mode",
                "modes",
                ["review"],
                "catalog#/0/modes/0",
                "mode is not supported",
            ),
            (
                "inactive",
                "status",
                "inactive",
                "catalog#/0/status",
                "status must equal active",
            ),
            (
                "empty title",
                "title",
                "",
                "catalog#/0/title",
                "must be a nonempty string",
            ),
            (
                "empty description",
                "description",
                "",
                "catalog#/0/description",
                "must be a nonempty string",
            ),
        )
        for label, field, value, location, message in catalog_cases:
            with self.subTest(label=label):
                root = self.make_repo()
                self.mutate_catalog(
                    root,
                    lambda catalog, field=field, value=value: catalog[0].update(
                        {field: value}),
                )
                report = validate_catalog(root)
                self.assertEqual(1, report.exit_code)
                self.assert_diagnostic(
                    report, "VALUE_INVALID", location, message)

    def test_file_inventory_detects_missing_unlisted_and_non_regular_files(self):
        root = self.make_repo()
        (self.sample_directory(root) / "target.txt").unlink()
        self.assert_issue(root, "FILE_NOT_FOUND")

        root = self.make_repo()
        (self.sample_directory(root) / "unlisted.txt").write_text(
            "unlisted\n", encoding="utf-8")
        self.assert_issue(root, "FILE_UNLISTED")

        root = self.make_repo()
        target = self.sample_directory(root) / "target.txt"
        target.unlink()
        target.mkdir()
        self.assert_issue(root, "FILE_NOT_FOUND")

    def test_file_inventory_detects_duplicates_and_case_collisions(self):
        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"].append(
                dict(manifest["files"][0])),
        )
        self.assert_issue(root, "VALUE_INVALID")

        root = self.make_repo()
        self.add_payload(
            root, "Case.txt", "documentation", "text/plain", b"upper\n")
        self.add_payload(
            root, "case.txt", "documentation", "text/plain", b"lower\n")
        self.assert_issue(root, "PATH_CASE_COLLISION")

    def test_file_size_and_sha256_are_verified(self):
        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"][0].update({
                "sizeBytes": manifest["files"][0]["sizeBytes"] + 1
            }),
        )
        self.assert_issue(root, "FILE_SIZE_MISMATCH")

        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"][0].update(
                {"sha256": "0" * 64}),
        )
        self.assert_issue(root, "FILE_SHA256_MISMATCH")

    def test_media_type_must_match_a_supported_lowercase_extension(self):
        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"][1].update(
                {"mediaType": "application/json"}),
        )
        self.assert_issue(root, "MEDIA_EXTENSION_MISMATCH")

        root = self.make_repo()
        self.add_payload(
            root,
            "unsupported.bin",
            "documentation",
            "application/octet-stream",
            b"binary\n",
        )
        self.assert_issue(root, "MEDIA_EXTENSION_MISMATCH")

    def test_references_require_valid_unique_ids_and_paths(self):
        root = self.make_repo()
        self.add_reference(root, "REF-01")
        self.assert_issue(root, "REFERENCE_ID_INVALID")

        root = self.make_repo()
        self.add_reference(root)

        def duplicate_id(manifest):
            duplicate = dict(manifest["references"][0])
            duplicate["filePath"] = "target.txt"
            manifest["references"].append(duplicate)

        self.mutate_manifest(root, duplicate_id)
        self.assert_issue(root, "REFERENCE_ID_DUPLICATE")

        root = self.make_repo()
        self.add_reference(root)

        def duplicate_path(manifest):
            duplicate = dict(manifest["references"][0])
            duplicate["id"] = "REF-002"
            manifest["references"].append(duplicate)

        self.mutate_manifest(root, duplicate_path)
        self.assert_issue(root, "VALUE_INVALID")

    def test_reference_paths_must_name_listed_reference_documents(self):
        root = self.make_repo()
        self.add_reference(root)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["references"][0].update(
                {"filePath": "missing.txt"}),
        )
        self.assert_issue(root, "REFERENCE_FILE_UNKNOWN")

        root = self.make_repo()
        self.add_reference(root)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["references"][0].update(
                {"filePath": "target.txt"}),
        )
        self.assert_issue(root, "REFERENCE_FILE_UNKNOWN")

    def test_entry_point_reference_ids_are_unique_and_known(self):
        root = self.make_repo()
        self.add_reference(root)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"][
                "existing_document"]["referenceIds"].append("REF-001"),
        )
        self.assert_issue(root, "REFERENCE_ID_DUPLICATE")

        root = self.make_repo()
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"][
                "existing_document"]["referenceIds"].append("REF-999"),
        )
        self.assert_issue(root, "ENTRY_POINT_REFERENCE_UNKNOWN")

    def test_entry_point_files_must_be_listed_with_the_required_purpose(self):
        cases = (
            ("targetPath", "missing.txt"),
            ("targetPath", "expected-outcomes.json"),
            ("expectedOutcomesPath", "target.txt"),
        )
        for field, value in cases:
            with self.subTest(mode="existing_document", field=field):
                root = self.make_repo()
                self.mutate_manifest(
                    root,
                    lambda manifest, field=field, value=value: manifest[
                        "entryPoints"]["existing_document"].update(
                            {field: value}),
                )
                self.assert_issue(root, "ENTRY_POINT_FILE_UNKNOWN")

        root = self.make_repo()
        self.add_generation_mode(root)
        self.mutate_manifest(
            root,
            lambda manifest: manifest["entryPoints"][
                "document_generation"].update({"requestPath": "target.txt"}),
        )
        self.assert_issue(root, "ENTRY_POINT_FILE_UNKNOWN")

    def test_text_payloads_must_be_valid_utf8(self):
        for suffix, media_type in (
            (".md", "text/markdown"),
            (".txt", "text/plain"),
        ):
            with self.subTest(suffix=suffix):
                root = self.make_repo()
                self.add_payload(
                    root,
                    "invalid" + suffix,
                    "documentation",
                    media_type,
                    b"\xff\xfe",
                )
                self.assert_issue(root, "JSON_INVALID")

    def test_json_payloads_reject_duplicate_object_keys(self):
        root = self.make_repo()
        self.add_payload(
            root,
            "duplicate.json",
            "documentation",
            "application/json",
            b'{"value":1,"value":2}\n',
        )
        self.assert_issue(root, "JSON_DUPLICATE_KEY")

    def test_issue_order_is_deterministic_and_paths_are_sanitized(self):
        root = self.make_repo()

        def mutation(manifest):
            manifest["files"][1]["sha256"] = "f" * 64
            manifest["files"][0]["sizeBytes"] += 1
            manifest["entryPoints"]["existing_document"][
                "targetPath"] = str(root / "secret.txt")

        self.mutate_manifest(root, mutation)
        first = validate_catalog(root)
        second = validate_catalog(root)
        first_keys = [
            (issue.location, issue.code, issue.message)
            for issue in first.issues
        ]

        self.assertEqual(first.issues, second.issues)
        self.assertEqual(sorted(first_keys), first_keys)
        rendered = "\n".join(
            f"{issue.code} {issue.location}: {issue.message}"
            for issue in first.issues
        )
        self.assertNotIn(str(root), rendered)

    def test_cli_returns_zero_one_and_two_with_stable_codes(self):
        root = self.make_repo()
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = main(("--root", str(root)))
        self.assertEqual(0, exit_code)
        self.assertEqual("OK samples=1 files=2\n", stdout.getvalue())
        self.assertEqual("", stderr.getvalue())

        self.mutate_manifest(
            root,
            lambda manifest: manifest["files"][0].update(
                {"sha256": "0" * 64}),
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = main(("--root", str(root)))
        self.assertEqual(1, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertIn("ERROR FILE_SHA256_MISMATCH ", stderr.getvalue())
        self.assertNotIn(str(root), stderr.getvalue())

        missing_root = root / "missing"
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = main(("--root", str(missing_root)))
        self.assertEqual(2, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertIn("ERROR INPUT_READ_FAILED ", stderr.getvalue())
        self.assertNotIn(str(root), stderr.getvalue())

    def test_cli_usage_and_internal_failures_return_two_without_tracebacks(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            exit_code = main(("--not-an-option",))
        self.assertEqual(2, exit_code)
        self.assertEqual(
            "ERROR CLI_USAGE cli: invalid command-line arguments\n",
            stderr.getvalue(),
        )

        stderr = io.StringIO()
        with mock.patch.object(
                validator, "validate_catalog", side_effect=RuntimeError("secret")):
            with contextlib.redirect_stderr(stderr):
                exit_code = main(())
        self.assertEqual(2, exit_code)
        self.assertEqual(
            "ERROR INTERNAL_ERROR samples/catalog.json: "
            "unexpected validator failure\n",
            stderr.getvalue(),
        )
        self.assertNotIn("secret", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())


class RegisteredSampleCatalogTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SCENARIO_ROOT = (
        REPOSITORY_ROOT / "samples" / "ja-machine-control-design-review"
    )
    EXPECTED_CATALOG = [
        {
            "id": "ja-machine-control-design-review",
            "manifestPath": (
                "samples/ja-machine-control-design-review/"
                "sample-manifest.json"
            ),
            "title": "設備状態監視機能 基本設計レビュー",
            "description": "既存文書レビューと文書生成を確認する日本語デモ",
            "modes": ["existing_document", "document_generation"],
            "status": "active",
        }
    ]
    EXPECTED_PAYLOADS = {
        "existing-document/expected-outcomes.json": (
            3959,
            "98b0a934304d23491d8724de7b7781ae67f82c41193bbfa3853c141f7efc07d4",
        ),
        "existing-document/target/basic-design-before-review.docx": (
            37366,
            "9e98b7d5485f321c94e18ed0c4da9367eb650da9a768de0cf68622fbf86107bc",
        ),
        "generation/document-request.json": (
            640,
            "19e28253b07185be668e7caf2ec146a2e352075d8077da119100a03278bdda9c",
        ),
        "README.md": (
            2046,
            "d711162c49a0532c0728cd85c87cb6d9d012de5c17661617b3828ee01e71ab11",
        ),
        "references/basic-design-template.md": (
            1377,
            "ec977d63a4ac916171563e60ac7e316b49994bfd7599214f6c820bb0f711895a",
        ),
        "references/control-terminology.txt": (
            436,
            "d90983e882e103b093aae4b2609b91e8026f2ce917af9aaf711010e5c5a4d913",
        ),
        "references/quality-assurance-policy.pdf": (
            4423,
            "7a307f0e7461891d92f21522c22bcef6f42b8e4a2bf4737d036eb0c8bb0d9f4a",
        ),
        "references/reference-design.docx": (
            36699,
            "50d6ab7caef850a62227943c3a1ea9567f459ebd6b0f556efd6e128a19b71544",
        ),
    }

    @staticmethod
    def read_json(path):
        with path.open("r", encoding="utf-8") as stream:
            return json.load(stream)

    def test_repository_catalog_is_the_exact_single_active_entry(self):
        catalog_path = self.REPOSITORY_ROOT / "samples" / "catalog.json"

        catalog = self.read_json(catalog_path)

        self.assertEqual(self.EXPECTED_CATALOG, catalog)
        self.assertEqual(
            json.dumps(
                self.EXPECTED_CATALOG,
                ensure_ascii=False,
                indent=2,
            ).encode("utf-8") + b"\n",
            catalog_path.read_bytes(),
        )

    def test_repository_manifest_completely_locks_all_payload_bytes(self):
        manifest = self.read_json(self.SCENARIO_ROOT / "sample-manifest.json")
        files = manifest["files"]
        actual_paths = []
        for path in self.SCENARIO_ROOT.rglob("*"):
            if path.is_symlink() or not path.is_file():
                continue
            relative_path = path.relative_to(self.SCENARIO_ROOT).as_posix()
            if relative_path != "sample-manifest.json":
                actual_paths.append(relative_path)

        expected_paths = list(self.EXPECTED_PAYLOADS)
        self.assertEqual(expected_paths, sorted(actual_paths, key=str.casefold))
        self.assertEqual(expected_paths, [entry["path"] for entry in files])
        for entry in files:
            relative_path = entry["path"]
            expected_size, expected_sha256 = self.EXPECTED_PAYLOADS[relative_path]
            payload = (self.SCENARIO_ROOT / relative_path).read_bytes()
            with self.subTest(path=relative_path):
                self.assertEqual(expected_size, len(payload))
                self.assertEqual(
                    expected_sha256, hashlib.sha256(payload).hexdigest()
                )
                self.assertEqual(expected_size, entry["sizeBytes"])
                self.assertEqual(expected_sha256, entry["sha256"])

    def test_repository_validator_cli_reports_exact_success_summary(self):
        stdout = io.StringIO()
        stderr = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            with contextlib.redirect_stderr(stderr):
                exit_code = main(("--root", str(self.REPOSITORY_ROOT)))

        self.assertEqual(0, exit_code)
        self.assertEqual("OK samples=1 files=8\n", stdout.getvalue())
        self.assertEqual("", stderr.getvalue())

    def test_validator_detects_mutation_without_rewriting_any_bytes(self):
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        root = Path(temporary_directory.name)
        shutil.copytree(self.REPOSITORY_ROOT / "samples", root / "samples")
        sample_root = root / "samples" / "ja-machine-control-design-review"
        manifest_path = sample_root / "sample-manifest.json"
        manifest_before = manifest_path.read_bytes()
        payload_path = sample_root / "README.md"
        payload_before = payload_path.read_bytes()
        payload_path.write_bytes(payload_before + b"x")
        stdout = io.StringIO()
        stderr = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            with contextlib.redirect_stderr(stderr):
                exit_code = main(("--root", str(root)))

        self.assertEqual(1, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertIn("ERROR FILE_SIZE_MISMATCH ", stderr.getvalue())
        self.assertIn("ERROR FILE_SHA256_MISMATCH ", stderr.getvalue())
        self.assertNotIn(str(root), stderr.getvalue())
        self.assertEqual(manifest_before, manifest_path.read_bytes())
        self.assertEqual(payload_before + b"x", payload_path.read_bytes())


if __name__ == "__main__":
    unittest.main()
