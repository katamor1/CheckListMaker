import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from samples.validate_samples import validate_catalog, validate_relative_path


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


if __name__ == "__main__":
    unittest.main()
