import contextlib
import hashlib
import inspect
import io
import json
import os
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import samples.tools.update_sample_manifest as builder


class SampleManifestBuilderTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SCENARIO_ROOT = (
        REPOSITORY_ROOT / "samples" / "ja-machine-control-design-review"
    )
    EXPECTED_PATHS = [
        "existing-document/expected-outcomes.json",
        "existing-document/target/basic-design-before-review.docx",
        "generation/document-request.json",
        "projects/document-generation-demo.clmproj",
        "projects/existing-document-demo.clmproj",
        "README.md",
        "references/basic-design-template.md",
        "references/control-terminology.txt",
        "references/quality-assurance-policy.pdf",
        "references/reference-design.docx",
    ]
    DOCX_MEDIA_TYPE = (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    )
    EXPECTED_FILE_METADATA = {
        "existing-document/expected-outcomes.json": (
            "expected_outcomes",
            "application/json",
        ),
        "existing-document/target/basic-design-before-review.docx": (
            "target_document",
            DOCX_MEDIA_TYPE,
        ),
        "generation/document-request.json": (
            "generation_request",
            "application/json",
        ),
        "projects/document-generation-demo.clmproj": (
            "project_file",
            "application/vnd.checklistmaker.project+zip",
        ),
        "projects/existing-document-demo.clmproj": (
            "project_file",
            "application/vnd.checklistmaker.project+zip",
        ),
        "README.md": ("documentation", "text/markdown"),
        "references/basic-design-template.md": (
            "reference_document",
            "text/markdown",
        ),
        "references/control-terminology.txt": (
            "reference_document",
            "text/plain",
        ),
        "references/quality-assurance-policy.pdf": (
            "reference_document",
            "application/pdf",
        ),
        "references/reference-design.docx": (
            "reference_document",
            DOCX_MEDIA_TYPE,
        ),
    }
    EXPECTED_ENTRY_POINTS = {
        "existing_document": {
            "targetPath": (
                "existing-document/target/basic-design-before-review.docx"
            ),
            "expectedOutcomesPath": (
                "existing-document/expected-outcomes.json"
            ),
            "projectPath": "projects/existing-document-demo.clmproj",
            "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
        },
        "document_generation": {
            "requestPath": "generation/document-request.json",
            "projectPath": "projects/document-generation-demo.clmproj",
            "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
        },
    }
    EXPECTED_JUDGMENTS = [
        "必須項目の不足を invalid と判定する",
        "任意項目の不足を警告として示す",
        "根拠情報が不足する場合は needs_information と判定する",
        "binding の参考資料を reference より優先する",
    ]
    EXPECTED_OPERATIONS = [
        "Electron GUIで既存DOCXを読み込んでレビューする",
        "Electron GUIで4参考資料の権威レベルと優先順位を設定する",
        "Electron GUIで5チェック項目と9条件を構成する",
        "参考資料を根拠としてDOCXを生成する",
    ]
    EXPECTED_REFERENCES = [
        {
            "id": "REF-001",
            "filePath": "references/quality-assurance-policy.pdf",
            "displayName": "品質保証規程（デモ）",
            "role": "必須品質規則と禁止事項",
            "authorityLevel": "binding",
            "priority": 100,
        },
        {
            "id": "REF-002",
            "filePath": "references/basic-design-template.md",
            "displayName": "基本設計テンプレート",
            "role": "必須章、記載項目、順序",
            "authorityLevel": "approved",
            "priority": 80,
        },
        {
            "id": "REF-003",
            "filePath": "references/control-terminology.txt",
            "displayName": "制御用語集",
            "role": "用語と表記の統一",
            "authorityLevel": "working",
            "priority": 60,
        },
        {
            "id": "REF-004",
            "filePath": "references/reference-design.docx",
            "displayName": "設備状態監視機能 参考設計書",
            "role": "上位資料と矛盾しない記述例",
            "authorityLevel": "reference",
            "priority": 40,
        },
    ]

    def copy_scenario(self):
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        sample_root = Path(temporary_directory.name) / self.SCENARIO_ROOT.name
        shutil.copytree(self.SCENARIO_ROOT, sample_root)
        return sample_root

    def test_public_builder_interfaces_are_stable(self):
        expected_signatures = {
            "hash_and_size": ("path",),
            "build_manifest": ("sample_root",),
            "render_manifest": ("manifest",),
            "write_manifest": ("sample_root",),
            "check_manifest": ("sample_root",),
            "main": ("argv",),
        }
        for name, parameters in expected_signatures.items():
            with self.subTest(name=name):
                function = getattr(builder, name)
                self.assertTrue(callable(function))
                self.assertEqual(
                    parameters,
                    tuple(inspect.signature(function).parameters),
                )

    def test_build_manifest_has_exact_inventory_metadata_and_hashes(self):
        sample_root = self.copy_scenario()

        manifest = builder.build_manifest(sample_root)

        self.assertEqual(
            [
                "sampleFormatVersion",
                "id",
                "title",
                "description",
                "language",
                "entryPoints",
                "files",
                "references",
                "expectedJudgments",
                "demoOperations",
            ],
            list(manifest),
        )
        self.assertEqual("1.0", manifest["sampleFormatVersion"])
        self.assertEqual("ja-machine-control-design-review", manifest["id"])
        self.assertEqual(
            "設備状態監視機能 基本設計レビュー", manifest["title"]
        )
        self.assertEqual(
            "既存文書レビューと文書生成を確認する日本語デモ",
            manifest["description"],
        )
        self.assertEqual("ja", manifest["language"])
        self.assertEqual(self.EXPECTED_ENTRY_POINTS, manifest["entryPoints"])
        self.assertEqual(self.EXPECTED_REFERENCES, manifest["references"])
        self.assertEqual(
            self.EXPECTED_JUDGMENTS, manifest["expectedJudgments"]
        )
        self.assertEqual(self.EXPECTED_OPERATIONS, manifest["demoOperations"])

        files = manifest["files"]
        self.assertEqual(self.EXPECTED_PATHS, [entry["path"] for entry in files])
        for entry in files:
            relative_path = entry["path"]
            with self.subTest(path=relative_path):
                purpose, media_type = self.EXPECTED_FILE_METADATA[relative_path]
                payload = (sample_root / relative_path).read_bytes()
                self.assertEqual(
                    ["path", "purpose", "mediaType", "sha256", "sizeBytes"],
                    list(entry),
                )
                self.assertEqual(purpose, entry["purpose"])
                self.assertEqual(media_type, entry["mediaType"])
                self.assertRegex(entry["sha256"], re.compile(r"^[0-9a-f]{64}$"))
                self.assertEqual(
                    hashlib.sha256(payload).hexdigest(), entry["sha256"]
                )
                self.assertEqual(len(payload), entry["sizeBytes"])

    def test_hash_and_size_streams_the_complete_payload(self):
        sample_root = self.copy_scenario()
        path = sample_root / "large-payload.bin"
        payload = (b"0123456789abcdef" * 65_537) + b"tail"
        path.write_bytes(payload)

        sha256, size = builder.hash_and_size(path)

        self.assertEqual(hashlib.sha256(payload).hexdigest(), sha256)
        self.assertEqual(len(payload), size)

    def test_render_manifest_is_canonical_utf8_lf_json(self):
        manifest = builder.build_manifest(self.copy_scenario())

        rendered = builder.render_manifest(manifest)

        self.assertIsInstance(rendered, bytes)
        self.assertNotIn(b"\r", rendered)
        self.assertTrue(rendered.endswith(b"\n"))
        self.assertFalse(rendered.endswith(b"\n\n"))
        self.assertIn("設備状態監視".encode("utf-8"), rendered)
        self.assertNotIn(b"\\u8a2d", rendered)
        self.assertEqual(
            json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
            + b"\n",
            rendered,
        )

    def test_discovery_ignores_file_and_directory_symlinks(self):
        sample_root = self.copy_scenario()
        outside = sample_root.parent / "outside.txt"
        outside.write_text("outside\n", encoding="utf-8")
        file_link = sample_root / "linked-file.txt"
        directory_link = sample_root / "linked-directory"
        try:
            file_link.symlink_to(outside)
            directory_link.symlink_to(
                sample_root / "references",
                target_is_directory=True,
            )
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {type(error).__name__}")

        manifest = builder.build_manifest(sample_root)

        self.assertEqual(
            self.EXPECTED_PATHS,
            [entry["path"] for entry in manifest["files"]],
        )

    def test_unknown_or_missing_regular_payload_is_rejected(self):
        sample_root = self.copy_scenario()
        unknown = sample_root / "unexpected.txt"
        unknown.write_text("unexpected\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "payload inventory"):
            builder.build_manifest(sample_root)

        unknown.unlink()
        (sample_root / self.EXPECTED_PATHS[0]).unlink()
        with self.assertRaisesRegex(ValueError, "payload inventory"):
            builder.build_manifest(sample_root)

    def test_write_uses_same_directory_atomic_replace(self):
        sample_root = self.copy_scenario()
        manifest_path = sample_root / "sample-manifest.json"
        real_replace = os.replace

        with mock.patch.object(
            builder.os, "replace", wraps=real_replace
        ) as replace:
            builder.write_manifest(sample_root)

        self.assertEqual(
            builder.render_manifest(builder.build_manifest(sample_root)),
            manifest_path.read_bytes(),
        )
        replace.assert_called_once()
        source, destination = replace.call_args.args
        self.assertEqual(sample_root, Path(source).parent)
        self.assertEqual(manifest_path, Path(destination))
        self.assertFalse(Path(source).exists())

    def test_check_detects_byte_mutation_without_rewriting(self):
        sample_root = self.copy_scenario()
        builder.write_manifest(sample_root)
        manifest_path = sample_root / "sample-manifest.json"
        manifest_before = manifest_path.read_bytes()
        payload_path = sample_root / self.EXPECTED_PATHS[0]
        payload_before = payload_path.read_bytes()
        payload_path.write_bytes(payload_before + b" ")

        self.assertFalse(builder.check_manifest(sample_root))

        self.assertEqual(manifest_before, manifest_path.read_bytes())
        self.assertEqual(payload_before + b" ", payload_path.read_bytes())

    def test_cli_check_reports_relative_path_and_never_rewrites(self):
        sample_root = self.copy_scenario()
        builder.write_manifest(sample_root)
        manifest_path = sample_root / "sample-manifest.json"
        before = manifest_path.read_bytes()
        target = sample_root / self.EXPECTED_PATHS[-1]
        target.write_bytes(target.read_bytes() + b"x")
        stdout = io.StringIO()
        stderr = io.StringIO()

        with mock.patch.object(builder, "SAMPLE_ROOT", sample_root):
            with contextlib.redirect_stdout(stdout):
                with contextlib.redirect_stderr(stderr):
                    exit_code = builder.main(("--check",))

        self.assertEqual(1, exit_code)
        self.assertEqual("", stdout.getvalue())
        self.assertEqual(
            "ERROR samples/ja-machine-control-design-review/"
            "sample-manifest.json is out of date\n",
            stderr.getvalue(),
        )
        self.assertNotIn(str(sample_root), stderr.getvalue())
        self.assertEqual(before, manifest_path.read_bytes())

    def test_cli_write_then_check_and_usage_codes_are_deterministic(self):
        sample_root = self.copy_scenario()
        (sample_root / "sample-manifest.json").unlink(missing_ok=True)

        with mock.patch.object(builder, "SAMPLE_ROOT", sample_root):
            self.assertEqual(0, builder.main(("--write",)))
            self.assertEqual(0, builder.main(("--check",)))

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(2, builder.main(()))
        self.assertEqual(
            "ERROR CLI_USAGE cli: choose exactly one of --write or --check\n",
            stderr.getvalue(),
        )


if __name__ == "__main__":
    unittest.main()
