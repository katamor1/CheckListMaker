#!/usr/bin/env python3
"""Validate the repository's reusable sample catalog."""

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


_CHUNK_SIZE = 1024 * 1024
_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:")
_WINDOWS_DEVICE_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{number}" for number in range(1, 10)}
    | {f"LPT{number}" for number in range(1, 10)}
)


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    location: str
    message: str
    exit_code: int = 1


@dataclass(frozen=True)
class ValidationReport:
    issues: Tuple[ValidationIssue, ...]
    sample_count: int
    file_count: int

    @property
    def exit_code(self) -> int:
        if any(issue.exit_code == 2 for issue in self.issues):
            return 2
        return 1 if self.issues else 0


class _DuplicateKeyError(ValueError):
    """Raised when a JSON object repeats a property name."""


class _NonStandardConstantError(ValueError):
    """Raised when JSON contains NaN or an infinity value."""


def _reject_duplicate_keys(pairs: Sequence[Tuple[str, Any]]) -> Dict[str, Any]:
    value: Dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateKeyError
        value[key] = item
    return value


def _reject_non_standard_constant(_value: str) -> Any:
    raise _NonStandardConstantError


def load_json(
        path: Path,
        location: str,
) -> Tuple[Optional[Any], Tuple[ValidationIssue, ...]]:
    """Load UTF-8 JSON without allowing duplicate object keys."""
    try:
        with path.open("r", encoding="utf-8") as stream:
            return json.load(
                stream,
                object_pairs_hook=_reject_duplicate_keys,
                parse_constant=_reject_non_standard_constant,
            ), ()
    except _DuplicateKeyError:
        return None, (
            ValidationIssue(
                "JSON_DUPLICATE_KEY",
                location,
                "duplicate JSON object key",
            ),
        )
    except (
            _NonStandardConstantError,
            json.JSONDecodeError,
            UnicodeDecodeError,
            RecursionError,
            OverflowError,
            MemoryError,
    ):
        return None, (
            ValidationIssue(
                "JSON_INVALID",
                location,
                "invalid JSON document",
            ),
        )
    except OSError:
        return None, (
            ValidationIssue(
                "INPUT_READ_FAILED",
                location,
                "unable to read validator input",
                exit_code=2,
            ),
        )


def validate_relative_path(
        value: Any,
        location: str,
) -> Tuple[Optional[Tuple[str, ...]], Tuple[ValidationIssue, ...]]:
    """Return safe path segments for a repository-relative POSIX path."""
    invalid = False
    segments: Tuple[str, ...] = ()

    if not isinstance(value, str) or not value:
        invalid = True
    else:
        try:
            value.encode("ascii")
        except UnicodeEncodeError:
            invalid = True

        if (
                "\\" in value
                or value.startswith("/")
                or value.startswith("//")
                or _DRIVE_PREFIX.match(value)
                or ":" in value
                or any(ord(character) < 0x20 or ord(character) == 0x7F
                       for character in value)
        ):
            invalid = True

        segments = tuple(value.split("/"))
        for segment in segments:
            device_stem = segment.split(".", 1)[0].upper()
            if (
                    not segment
                    or segment in {".", ".."}
                    or segment.endswith((".", " "))
                    or device_stem in _WINDOWS_DEVICE_NAMES
            ):
                invalid = True

    if invalid:
        return None, (
            ValidationIssue(
                "PATH_INVALID",
                location,
                "must be a safe ASCII repository-relative path",
            ),
        )
    return segments, ()


def resolve_regular_file(
        root: Path,
        segments: Sequence[str],
        location: str,
) -> Tuple[Optional[Path], Tuple[ValidationIssue, ...]]:
    """Resolve a regular file below root without following symlinks."""
    try:
        resolved_root = root.resolve(strict=True)
    except OSError:
        return None, (
            ValidationIssue(
                "INPUT_READ_FAILED",
                location,
                "unable to read validator input",
                exit_code=2,
            ),
        )

    current = root
    try:
        for index, segment in enumerate(segments):
            current = current / segment
            mode = current.lstat().st_mode
            if stat.S_ISLNK(mode):
                return None, (
                    ValidationIssue(
                        "PATH_SYMLINK",
                        location,
                        "path must not contain symbolic links",
                    ),
                )
            if index < len(segments) - 1:
                if not stat.S_ISDIR(mode):
                    return None, (
                        ValidationIssue(
                            "FILE_NOT_FOUND",
                            location,
                            "path component is not a directory",
                        ),
                    )
            elif not stat.S_ISREG(mode):
                return None, (
                    ValidationIssue(
                        "FILE_NOT_FOUND",
                        location,
                        "path does not identify a regular file",
                    ),
                )

        resolved_file = current.resolve(strict=True)
    except (FileNotFoundError, NotADirectoryError):
        return None, (
            ValidationIssue(
                "FILE_NOT_FOUND",
                location,
                "regular file does not exist",
            ),
        )
    except OSError:
        return None, (
            ValidationIssue(
                "INPUT_READ_FAILED",
                location,
                "unable to read validator input",
                exit_code=2,
            ),
        )

    try:
        common_path = os.path.commonpath((resolved_root, resolved_file))
    except ValueError:
        common_path = ""
    if common_path != str(resolved_root) or resolved_file == resolved_root:
        return None, (
            ValidationIssue(
                "PATH_ESCAPE",
                location,
                "resolved path must remain below the supplied root",
            ),
        )
    return resolved_file, ()


def hash_and_size(path: Path) -> Tuple[str, int]:
    """Return the lower-case SHA-256 and byte length for a file."""
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


def validate_catalog(root: Path) -> ValidationReport:
    """Load the catalog and safely resolve each referenced manifest."""
    issues: List[ValidationIssue] = []
    sample_count = 0
    file_count = 0

    catalog, catalog_issues = load_json(
        root / "samples" / "catalog.json",
        "samples/catalog.json",
    )
    issues.extend(catalog_issues)
    if catalog is None:
        return _report(issues, sample_count, file_count)

    if not isinstance(catalog, list):
        issues.append(ValidationIssue(
            "VALUE_INVALID",
            "catalog#",
            "catalog must be a JSON array",
        ))
        return _report(issues, sample_count, file_count)

    sample_count = len(catalog)
    for index, entry in enumerate(catalog):
        entry_location = f"catalog#/{index}"
        path_location = f"{entry_location}/manifestPath"
        if not isinstance(entry, dict):
            issues.append(ValidationIssue(
                "VALUE_INVALID",
                entry_location,
                "catalog entry must be a JSON object",
            ))
            continue

        manifest_path = entry.get("manifestPath")
        segments, path_issues = validate_relative_path(
            manifest_path,
            path_location,
        )
        issues.extend(path_issues)
        if segments is None:
            continue

        manifest_file, file_issues = resolve_regular_file(
            root,
            segments,
            path_location,
        )
        issues.extend(file_issues)
        if manifest_file is None:
            continue

        manifest, manifest_issues = load_json(manifest_file, manifest_path)
        issues.extend(manifest_issues)
        if isinstance(manifest, dict) and isinstance(manifest.get("files"), list):
            file_count += len(manifest["files"])

    return _report(issues, sample_count, file_count)


def _report(
        issues: Sequence[ValidationIssue],
        sample_count: int,
        file_count: int,
) -> ValidationReport:
    return ValidationReport(
        issues=tuple(sorted(
            issues,
            key=lambda issue: (issue.location, issue.code, issue.message),
        )),
        sample_count=sample_count,
        file_count=file_count,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    try:
        report = validate_catalog(args.root)
    except OSError:
        print(
            "ERROR INPUT_READ_FAILED samples/catalog.json: "
            "unable to read validator input",
            file=sys.stderr)
        return 2
    except Exception:
        print(
            "ERROR INTERNAL_ERROR samples/catalog.json: "
            "unexpected validator failure",
            file=sys.stderr)
        return 2

    if report.exit_code == 0:
        print(
            f"OK samples={report.sample_count} "
            f"files={report.file_count}")
        return 0

    for issue in report.issues:
        print(
            f"ERROR {issue.code} {issue.location}: {issue.message}",
            file=sys.stderr)
    print(
        f"FAILED samples={report.sample_count} "
        f"files={report.file_count} "
        f"errors={len(report.issues)}",
        file=sys.stderr)
    return report.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
