#!/usr/bin/env python3
"""Build and verify the deterministic demo sample manifest."""

import copy
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple


SAMPLE_ROOT = (
    Path(__file__).resolve().parents[1]
    / "ja-machine-control-design-review"
)
MANIFEST_NAME = "sample-manifest.json"
MANIFEST_DISPLAY_PATH = (
    "samples/ja-machine-control-design-review/sample-manifest.json"
)
_CHUNK_SIZE = 1024 * 1024
_DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document"
)

_FILE_METADATA = {
    "existing-document/expected-outcomes.json": (
        "expected_outcomes",
        "application/json",
    ),
    "existing-document/target/basic-design-before-review.docx": (
        "target_document",
        _DOCX_MEDIA_TYPE,
    ),
    "generation/document-request.json": (
        "generation_request",
        "application/json",
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
        _DOCX_MEDIA_TYPE,
    ),
}

_FIXED_METADATA = {
    "sampleFormatVersion": "1.0",
    "id": "ja-machine-control-design-review",
    "title": "設備状態監視機能 基本設計レビュー",
    "description": "既存文書レビューと文書生成を確認する日本語デモ",
    "language": "ja",
    "entryPoints": {
        "existing_document": {
            "targetPath": (
                "existing-document/target/basic-design-before-review.docx"
            ),
            "expectedOutcomesPath": (
                "existing-document/expected-outcomes.json"
            ),
            "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
        },
        "document_generation": {
            "requestPath": "generation/document-request.json",
            "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
        },
    },
    "references": [
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
    ],
    "expectedJudgments": [
        "必須項目の不足を invalid と判定する",
        "任意項目の不足を警告として示す",
        "根拠情報が不足する場合は needs_information と判定する",
        "binding の参考資料を reference より優先する",
    ],
    "demoOperations": [
        "既存 DOCX を読み込んでレビューする",
        "修正方針ごとの提案を比較する",
        "参考資料を根拠として DOCX を生成する",
        "参考資料が読み取り専用であることを確認する",
    ],
}


def hash_and_size(path: Path) -> Tuple[str, int]:
    """Return a payload's lowercase SHA-256 digest and byte length."""
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(_CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def _discover_regular_files(sample_root: Path) -> Tuple[str, ...]:
    discovered: List[str] = []
    pending = [(sample_root, ())]
    while pending:
        directory, parent_segments = pending.pop()
        with os.scandir(directory) as scanner:
            entries = sorted(scanner, key=lambda entry: entry.name)

        child_directories = []
        for entry in entries:
            segments = parent_segments + (entry.name,)
            if entry.is_symlink():
                continue
            if entry.is_dir(follow_symlinks=False):
                child_directories.append((Path(entry.path), segments))
            elif entry.is_file(follow_symlinks=False):
                relative_path = "/".join(segments)
                if relative_path != MANIFEST_NAME:
                    discovered.append(relative_path)
        pending.extend(reversed(child_directories))
    return tuple(sorted(discovered, key=lambda path: path.casefold()))


def build_manifest(sample_root: Path) -> Dict[str, Any]:
    """Build the complete manifest for a supplied sample directory."""
    discovered_paths = _discover_regular_files(sample_root)
    expected_paths = tuple(_FILE_METADATA)
    if discovered_paths != expected_paths:
        raise ValueError("payload inventory does not match the registered sample")

    files = []
    for relative_path in expected_paths:
        purpose, media_type = _FILE_METADATA[relative_path]
        sha256, size_bytes = hash_and_size(sample_root / relative_path)
        files.append({
            "path": relative_path,
            "purpose": purpose,
            "mediaType": media_type,
            "sha256": sha256,
            "sizeBytes": size_bytes,
        })

    metadata = copy.deepcopy(_FIXED_METADATA)
    return {
        "sampleFormatVersion": metadata["sampleFormatVersion"],
        "id": metadata["id"],
        "title": metadata["title"],
        "description": metadata["description"],
        "language": metadata["language"],
        "entryPoints": metadata["entryPoints"],
        "files": files,
        "references": metadata["references"],
        "expectedJudgments": metadata["expectedJudgments"],
        "demoOperations": metadata["demoOperations"],
    }


def render_manifest(manifest: Dict[str, Any]) -> bytes:
    """Render canonical two-space UTF-8/LF JSON with one final newline."""
    text = json.dumps(
        manifest,
        ensure_ascii=False,
        indent=2,
        allow_nan=False,
    ) + "\n"
    return text.encode("utf-8")


def write_manifest(sample_root: Path) -> None:
    """Atomically replace the sample manifest with freshly rendered bytes."""
    destination = sample_root / MANIFEST_NAME
    rendered = render_manifest(build_manifest(sample_root))
    descriptor, temporary_name = tempfile.mkstemp(
        dir=sample_root,
        prefix=f".{MANIFEST_NAME}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(rendered)
            stream.flush()
            os.fsync(stream.fileno())
        temporary_path.chmod(0o644)
        os.replace(temporary_path, destination)
    except BaseException:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass
        raise


def check_manifest(sample_root: Path) -> bool:
    """Return whether the committed manifest exactly matches fresh bytes."""
    expected = render_manifest(build_manifest(sample_root))
    try:
        actual = (sample_root / MANIFEST_NAME).read_bytes()
    except FileNotFoundError:
        return False
    return actual == expected


def main(argv: Sequence[str]) -> int:
    """Run exactly one of the repository manifest write/check modes."""
    arguments = tuple(argv)
    if arguments not in (("--write",), ("--check",)):
        print(
            "ERROR CLI_USAGE cli: choose exactly one of --write or --check",
            file=sys.stderr,
        )
        return 2

    try:
        if arguments == ("--write",):
            write_manifest(SAMPLE_ROOT)
            return 0
        if check_manifest(SAMPLE_ROOT):
            return 0
    except (OSError, ValueError):
        print(
            f"ERROR {MANIFEST_DISPLAY_PATH} could not be built",
            file=sys.stderr,
        )
        return 2

    print(
        f"ERROR {MANIFEST_DISPLAY_PATH} is out of date",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
