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
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple


CATALOG_KEYS = frozenset({
    "id", "manifestPath", "title",
    "description", "modes", "status",
})
MANIFEST_KEYS = frozenset({
    "sampleFormatVersion", "id", "title", "description", "language",
    "entryPoints", "files", "references",
    "expectedJudgments", "demoOperations",
})
MODES = frozenset({"existing_document", "document_generation"})
PURPOSES = frozenset({
    "documentation", "target_document", "expected_outcomes",
    "generation_request", "reference_document",
})
MEDIA_BY_SUFFIX = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
}
AUTHORITY_LEVELS = frozenset({
    "reference", "working", "approved", "binding",
})
CATALOG_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
CATALOG_STATUS = "active"

_CATALOG_ID_PATTERN = re.compile(CATALOG_ID_PATTERN)
_REFERENCE_ID_PATTERN = re.compile(r"^REF-[0-9]{3}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_FILE_KEYS = frozenset({
    "path", "purpose", "mediaType", "sha256", "sizeBytes",
})
_REFERENCE_KEYS = frozenset({
    "id", "filePath", "displayName", "role", "authorityLevel", "priority",
})
_ENTRY_POINT_KEYS = {
    "existing_document": frozenset({
        "targetPath", "expectedOutcomesPath", "referenceIds",
    }),
    "document_generation": frozenset({
        "requestPath", "referenceIds",
    }),
}
_ENTRY_POINT_FILES = {
    "existing_document": (
        ("targetPath", "target_document"),
        ("expectedOutcomesPath", "expected_outcomes"),
    ),
    "document_generation": (("requestPath", "generation_request"),),
}
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


class _JsonIntegerLimitError(ValueError):
    """Raised when a JSON integer exceeds Python's conversion limit."""


def _reject_duplicate_keys(pairs: Sequence[Tuple[str, Any]]) -> Dict[str, Any]:
    value: Dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateKeyError
        value[key] = item
    return value


def _reject_non_standard_constant(_value: str) -> Any:
    raise _NonStandardConstantError


def _parse_json_integer(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        raise _JsonIntegerLimitError from None


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
                parse_int=_parse_json_integer,
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
            _JsonIntegerLimitError,
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


def _append_value_invalid(
        issues: List[ValidationIssue],
        location: str,
        message: str,
) -> None:
    issues.append(ValidationIssue("VALUE_INVALID", location, message))


def _validate_exact_properties(
        value: Any,
        keys: frozenset,
        location: str,
        label: str,
        issues: List[ValidationIssue],
) -> bool:
    if not isinstance(value, dict):
        _append_value_invalid(
            issues, location, f"{label} must be a JSON object")
        return False

    for key in sorted(keys - value.keys()):
        issues.append(ValidationIssue(
            "PROPERTY_MISSING",
            f"{location}/{key}",
            "required property is missing",
        ))
    for key in sorted(value.keys() - keys):
        issues.append(ValidationIssue(
            "PROPERTY_UNKNOWN",
            f"{location}/{key}",
            "property is not allowed",
        ))
    return True


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value)


def _payload_location(manifest_path: str, payload_path: str) -> str:
    return str(PurePosixPath(manifest_path).parent / payload_path)


def _validate_text_payload(
        path: Path,
        location: str,
) -> Tuple[ValidationIssue, ...]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            while stream.read(_CHUNK_SIZE):
                pass
    except UnicodeDecodeError:
        return (ValidationIssue(
            "JSON_INVALID",
            location,
            "text payload must be valid UTF-8",
        ),)
    except OSError:
        return (ValidationIssue(
            "INPUT_READ_FAILED",
            location,
            "unable to read validator input",
            exit_code=2,
        ),)
    return ()


def _enumerate_regular_files(
        root: Path,
        location: str,
) -> Tuple[Tuple[str, ...], Tuple[ValidationIssue, ...]]:
    """List regular files below root without traversing symbolic links."""
    regular_files: List[str] = []
    issues: List[ValidationIssue] = []
    pending: List[Tuple[Path, Tuple[str, ...]]] = [(root, ())]

    while pending:
        directory, parent_segments = pending.pop()
        try:
            with os.scandir(directory) as scanner:
                entries = sorted(scanner, key=lambda entry: entry.name)
        except OSError:
            issues.append(ValidationIssue(
                "INPUT_READ_FAILED",
                location,
                "unable to read validator input",
                exit_code=2,
            ))
            continue

        child_directories: List[Tuple[Path, Tuple[str, ...]]] = []
        for entry in entries:
            segments = parent_segments + (entry.name,)
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    child_directories.append((Path(entry.path), segments))
                elif entry.is_file(follow_symlinks=False):
                    regular_files.append("/".join(segments))
            except OSError:
                issues.append(ValidationIssue(
                    "INPUT_READ_FAILED",
                    location,
                    "unable to read validator input",
                    exit_code=2,
                ))
        pending.extend(reversed(child_directories))

    return tuple(sorted(regular_files)), tuple(issues)


def _validate_catalog_entry_values(
        entry: Dict[str, Any],
        location: str,
        issues: List[ValidationIssue],
) -> Optional[List[str]]:
    sample_id = entry.get("id")
    if "id" in entry and (
            not isinstance(sample_id, str)
            or _CATALOG_ID_PATTERN.fullmatch(sample_id) is None
    ):
        _append_value_invalid(
            issues,
            f"{location}/id",
            "must match the catalog ID pattern",
        )

    for key in ("title", "description"):
        if key in entry and not _is_nonempty_string(entry[key]):
            _append_value_invalid(
                issues,
                f"{location}/{key}",
                "must be a nonempty string",
            )

    modes = entry.get("modes")
    valid_modes: Optional[List[str]] = None
    if "modes" in entry:
        if not isinstance(modes, list):
            _append_value_invalid(
                issues,
                f"{location}/modes",
                "must be a nonempty array of unique supported modes",
            )
        else:
            valid_modes = []
            if not modes:
                _append_value_invalid(
                    issues,
                    f"{location}/modes",
                    "must contain at least one mode",
                )
            seen_modes: Set[str] = set()
            for index, mode in enumerate(modes):
                mode_location = f"{location}/modes/{index}"
                if not isinstance(mode, str) or mode not in MODES:
                    _append_value_invalid(
                        issues, mode_location, "mode is not supported")
                    continue
                valid_modes.append(mode)
                if mode in seen_modes:
                    _append_value_invalid(
                        issues, mode_location, "modes must be unique")
                seen_modes.add(mode)

    if "status" in entry and entry["status"] != CATALOG_STATUS:
        _append_value_invalid(
            issues,
            f"{location}/status",
            "status must equal active",
        )
    return valid_modes


def _validate_file_entries(
        manifest_root: Path,
        manifest_path: str,
        manifest: Dict[str, Any],
        issues: List[ValidationIssue],
) -> Tuple[int, Dict[str, Any]]:
    files_location = f"{manifest_path}#/files"
    entries = manifest.get("files")
    if not isinstance(entries, list):
        if "files" in manifest:
            _append_value_invalid(
                issues, files_location, "files must be a JSON array")
        return 0, {}

    purposes_by_path: Dict[str, Any] = {}
    listed_paths: Set[str] = set()
    listed_case_paths: Dict[str, str] = {}

    for index, entry in enumerate(entries):
        entry_location = f"{files_location}/{index}"
        if not _validate_exact_properties(
                entry, _FILE_KEYS, entry_location, "file entry", issues):
            continue

        path = entry.get("path")
        path_location = f"{entry_location}/path"
        segments: Optional[Tuple[str, ...]] = None
        if "path" in entry:
            segments, path_issues = validate_relative_path(path, path_location)
            issues.extend(path_issues)

        if segments is not None and isinstance(path, str):
            folded_path = path.casefold()
            previous_path = listed_case_paths.get(folded_path)
            if path in listed_paths:
                _append_value_invalid(
                    issues, path_location, "file paths must be unique")
            elif previous_path is not None:
                issues.append(ValidationIssue(
                    "PATH_CASE_COLLISION",
                    path_location,
                    "file paths must be unique ignoring case",
                ))
            else:
                listed_case_paths[folded_path] = path
            listed_paths.add(path)
            purposes_by_path.setdefault(path, entry.get("purpose"))

        purpose = entry.get("purpose")
        if "purpose" in entry and (
                not isinstance(purpose, str) or purpose not in PURPOSES
        ):
            _append_value_invalid(
                issues,
                f"{entry_location}/purpose",
                "purpose is not supported",
            )

        media_type = entry.get("mediaType")
        if "mediaType" in entry and not isinstance(media_type, str):
            _append_value_invalid(
                issues,
                f"{entry_location}/mediaType",
                "mediaType must be a string",
            )
        elif isinstance(path, str) and isinstance(media_type, str):
            expected_media = MEDIA_BY_SUFFIX.get(PurePosixPath(path).suffix)
            if expected_media != media_type:
                issues.append(ValidationIssue(
                    "MEDIA_EXTENSION_MISMATCH",
                    f"{entry_location}/mediaType",
                    "mediaType must match a supported file extension",
                ))

        sha256 = entry.get("sha256")
        valid_sha256 = (
            isinstance(sha256, str)
            and _SHA256_PATTERN.fullmatch(sha256) is not None
        )
        if "sha256" in entry and not valid_sha256:
            _append_value_invalid(
                issues,
                f"{entry_location}/sha256",
                "sha256 must be 64 lowercase hexadecimal characters",
            )

        size_bytes = entry.get("sizeBytes")
        valid_size = (
            type(size_bytes) is int
            and size_bytes >= 0
        )
        if "sizeBytes" in entry and not valid_size:
            _append_value_invalid(
                issues,
                f"{entry_location}/sizeBytes",
                "sizeBytes must be a nonnegative integer",
            )

        if segments is None:
            continue
        resolved_file, file_issues = resolve_regular_file(
            manifest_root, segments, path_location)
        issues.extend(file_issues)
        if resolved_file is None:
            continue

        try:
            actual_sha256, actual_size = hash_and_size(resolved_file)
        except OSError:
            issues.append(ValidationIssue(
                "INPUT_READ_FAILED",
                _payload_location(manifest_path, path),
                "unable to read validator input",
                exit_code=2,
            ))
            continue

        if valid_size and size_bytes != actual_size:
            issues.append(ValidationIssue(
                "FILE_SIZE_MISMATCH",
                f"{entry_location}/sizeBytes",
                "sizeBytes does not match the payload",
            ))
        if valid_sha256 and sha256 != actual_sha256:
            issues.append(ValidationIssue(
                "FILE_SHA256_MISMATCH",
                f"{entry_location}/sha256",
                "sha256 does not match the payload",
            ))

        suffix = PurePosixPath(path).suffix
        payload_location = _payload_location(manifest_path, path)
        if suffix in {".md", ".txt"}:
            issues.extend(_validate_text_payload(
                resolved_file, payload_location))
        elif suffix == ".json":
            _, payload_issues = load_json(resolved_file, payload_location)
            issues.extend(payload_issues)

    actual_paths, enumeration_issues = _enumerate_regular_files(
        manifest_root, files_location)
    issues.extend(enumeration_issues)
    actual_paths = tuple(
        path for path in actual_paths if path != "sample-manifest.json")

    actual_case_paths: Dict[str, str] = {}
    for path in actual_paths:
        folded_path = path.casefold()
        previous_path = actual_case_paths.get(folded_path)
        if previous_path is not None and previous_path != path:
            issues.append(ValidationIssue(
                "PATH_CASE_COLLISION",
                _payload_location(manifest_path, path),
                "payload paths must be unique ignoring case",
            ))
        else:
            actual_case_paths[folded_path] = path

        if path not in listed_paths:
            if (
                    folded_path in listed_case_paths
                    and listed_case_paths[folded_path] != path
            ):
                issues.append(ValidationIssue(
                    "PATH_CASE_COLLISION",
                    _payload_location(manifest_path, path),
                    "listed path differs from payload path only by case",
                ))
            issues.append(ValidationIssue(
                "FILE_UNLISTED",
                _payload_location(manifest_path, path),
                "regular payload file is not listed in the manifest",
            ))

    return len(entries), purposes_by_path


def _validate_references(
        manifest_path: str,
        manifest: Dict[str, Any],
        purposes_by_path: Dict[str, Any],
        issues: List[ValidationIssue],
) -> Set[str]:
    references_location = f"{manifest_path}#/references"
    references = manifest.get("references")
    known_ids: Set[str] = set()
    seen_paths: Set[str] = set()
    seen_case_paths: Dict[str, str] = {}
    if not isinstance(references, list):
        if "references" in manifest:
            _append_value_invalid(
                issues,
                references_location,
                "references must be a JSON array",
            )
        return known_ids

    for index, reference in enumerate(references):
        reference_location = f"{references_location}/{index}"
        if not _validate_exact_properties(
                reference,
                _REFERENCE_KEYS,
                reference_location,
                "reference",
                issues,
        ):
            continue

        reference_id = reference.get("id")
        id_location = f"{reference_location}/id"
        valid_id = (
            isinstance(reference_id, str)
            and _REFERENCE_ID_PATTERN.fullmatch(reference_id) is not None
        )
        if "id" in reference and not valid_id:
            issues.append(ValidationIssue(
                "REFERENCE_ID_INVALID",
                id_location,
                "reference ID must match REF-###",
            ))
        if valid_id:
            if reference_id in known_ids:
                issues.append(ValidationIssue(
                    "REFERENCE_ID_DUPLICATE",
                    id_location,
                    "reference IDs must be unique",
                ))
            known_ids.add(reference_id)

        file_path = reference.get("filePath")
        path_location = f"{reference_location}/filePath"
        path_segments: Optional[Tuple[str, ...]] = None
        if "filePath" in reference:
            path_segments, path_issues = validate_relative_path(
                file_path, path_location)
            issues.extend(path_issues)
        if path_segments is not None and isinstance(file_path, str):
            folded_path = file_path.casefold()
            previous_path = seen_case_paths.get(folded_path)
            if file_path in seen_paths:
                _append_value_invalid(
                    issues,
                    path_location,
                    "reference file paths must be unique",
                )
            elif previous_path is not None:
                issues.append(ValidationIssue(
                    "PATH_CASE_COLLISION",
                    path_location,
                    "reference paths must be unique ignoring case",
                ))
            else:
                seen_case_paths[folded_path] = file_path
            seen_paths.add(file_path)

            if purposes_by_path.get(file_path) != "reference_document":
                issues.append(ValidationIssue(
                    "REFERENCE_FILE_UNKNOWN",
                    path_location,
                    "reference must name a listed reference_document file",
                ))

        for key in ("displayName", "role"):
            if key in reference and not _is_nonempty_string(reference[key]):
                _append_value_invalid(
                    issues,
                    f"{reference_location}/{key}",
                    "must be a nonempty string",
                )

        authority_level = reference.get("authorityLevel")
        if "authorityLevel" in reference and (
                not isinstance(authority_level, str)
                or authority_level not in AUTHORITY_LEVELS
        ):
            _append_value_invalid(
                issues,
                f"{reference_location}/authorityLevel",
                "authorityLevel is not supported",
            )

        priority = reference.get("priority")
        if "priority" in reference and (
                type(priority) is not int or priority < 0
        ):
            _append_value_invalid(
                issues,
                f"{reference_location}/priority",
                "priority must be a nonnegative integer",
            )

    return known_ids


def _validate_entry_points(
        manifest_path: str,
        manifest: Dict[str, Any],
        catalog_modes: Optional[List[str]],
        purposes_by_path: Dict[str, Any],
        known_reference_ids: Set[str],
        issues: List[ValidationIssue],
) -> None:
    entry_points_location = f"{manifest_path}#/entryPoints"
    entry_points = manifest.get("entryPoints")
    if not isinstance(entry_points, dict):
        if "entryPoints" in manifest:
            _append_value_invalid(
                issues,
                entry_points_location,
                "entryPoints must be a JSON object",
            )
        return

    expected_modes = (
        set(catalog_modes) if catalog_modes is not None else set())
    actual_modes = set(entry_points)
    if catalog_modes is not None and actual_modes != expected_modes:
        _append_value_invalid(
            issues,
            entry_points_location,
            "entry point modes must exactly match catalog modes",
        )
        for mode in sorted(expected_modes - actual_modes):
            issues.append(ValidationIssue(
                "PROPERTY_MISSING",
                f"{entry_points_location}/{mode}",
                "required entry point is missing",
            ))
        for mode in sorted(actual_modes - expected_modes):
            issues.append(ValidationIssue(
                "PROPERTY_UNKNOWN",
                f"{entry_points_location}/{mode}",
                "entry point is not enabled by catalog modes",
            ))

    for mode in sorted(actual_modes & MODES):
        entry_point = entry_points[mode]
        entry_location = f"{entry_points_location}/{mode}"
        if not _validate_exact_properties(
                entry_point,
                _ENTRY_POINT_KEYS[mode],
                entry_location,
                f"{mode} entry point",
                issues,
        ):
            continue

        for key, expected_purpose in _ENTRY_POINT_FILES[mode]:
            if key not in entry_point:
                continue
            path = entry_point[key]
            path_location = f"{entry_location}/{key}"
            segments, path_issues = validate_relative_path(
                path, path_location)
            issues.extend(path_issues)
            if (
                    segments is not None
                    and isinstance(path, str)
                    and purposes_by_path.get(path) != expected_purpose
            ):
                issues.append(ValidationIssue(
                    "ENTRY_POINT_FILE_UNKNOWN",
                    path_location,
                    f"entry point must name a listed {expected_purpose} file",
                ))

        reference_ids = entry_point.get("referenceIds")
        reference_ids_location = f"{entry_location}/referenceIds"
        if "referenceIds" not in entry_point:
            continue
        if not isinstance(reference_ids, list):
            _append_value_invalid(
                issues,
                reference_ids_location,
                "referenceIds must be a JSON array",
            )
            continue

        seen_reference_ids: Set[str] = set()
        for index, reference_id in enumerate(reference_ids):
            id_location = f"{reference_ids_location}/{index}"
            if not isinstance(reference_id, str):
                _append_value_invalid(
                    issues, id_location, "reference ID must be a string")
                continue
            if reference_id in seen_reference_ids:
                issues.append(ValidationIssue(
                    "REFERENCE_ID_DUPLICATE",
                    id_location,
                    "entry point reference IDs must be unique",
                ))
            seen_reference_ids.add(reference_id)
            if reference_id not in known_reference_ids:
                issues.append(ValidationIssue(
                    "ENTRY_POINT_REFERENCE_UNKNOWN",
                    id_location,
                    "entry point reference ID is not declared",
                ))


def _validate_manifest(
        manifest_file: Path,
        manifest_path: str,
        catalog_entry: Dict[str, Any],
        catalog_modes: Optional[List[str]],
) -> Tuple[List[ValidationIssue], int]:
    issues: List[ValidationIssue] = []
    manifest, manifest_issues = load_json(manifest_file, manifest_path)
    issues.extend(manifest_issues)
    if manifest is None:
        return issues, 0

    manifest_location = f"{manifest_path}#"
    if not _validate_exact_properties(
            manifest,
            MANIFEST_KEYS,
            manifest_location,
            "manifest",
            issues,
    ):
        return issues, 0

    if "sampleFormatVersion" in manifest and (
            manifest["sampleFormatVersion"] != "1.0"
    ):
        _append_value_invalid(
            issues,
            f"{manifest_location}/sampleFormatVersion",
            "sampleFormatVersion must equal 1.0",
        )
    if "language" in manifest and manifest["language"] != "ja":
        _append_value_invalid(
            issues,
            f"{manifest_location}/language",
            "language must equal ja",
        )

    for key in ("id", "title", "description"):
        if key not in manifest:
            continue
        value = manifest[key]
        if not _is_nonempty_string(value):
            _append_value_invalid(
                issues,
                f"{manifest_location}/{key}",
                "must be a nonempty string",
            )
        elif isinstance(catalog_entry.get(key), str) and (
                value != catalog_entry[key]
        ):
            _append_value_invalid(
                issues,
                f"{manifest_location}/{key}",
                f"manifest {key} must match the catalog",
            )

    for key in ("expectedJudgments", "demoOperations"):
        if key in manifest and not isinstance(manifest[key], list):
            _append_value_invalid(
                issues,
                f"{manifest_location}/{key}",
                f"{key} must be a JSON array",
            )

    file_count, purposes_by_path = _validate_file_entries(
        manifest_file.parent,
        manifest_path,
        manifest,
        issues,
    )
    known_reference_ids = _validate_references(
        manifest_path,
        manifest,
        purposes_by_path,
        issues,
    )
    _validate_entry_points(
        manifest_path,
        manifest,
        catalog_modes,
        purposes_by_path,
        known_reference_ids,
        issues,
    )
    return issues, file_count


def validate_catalog(root: Path) -> ValidationReport:
    """Validate the format 1.0 catalog and every referenced manifest."""
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
        _append_value_invalid(
            issues, "catalog#", "catalog must be a JSON array")
        return _report(issues, sample_count, file_count)

    sample_count = len(catalog)
    previous_id: Optional[str] = None
    seen_ids: Dict[str, str] = {}
    seen_manifest_paths: Dict[str, str] = {}

    for index, entry in enumerate(catalog):
        entry_location = f"catalog#/{index}"
        if not _validate_exact_properties(
                entry,
                CATALOG_KEYS,
                entry_location,
                "catalog entry",
                issues,
        ):
            continue

        catalog_modes = _validate_catalog_entry_values(
            entry, entry_location, issues)

        sample_id = entry.get("id")
        if isinstance(sample_id, str):
            folded_id = sample_id.casefold()
            if folded_id in seen_ids:
                _append_value_invalid(
                    issues,
                    f"{entry_location}/id",
                    "catalog IDs must be unique ignoring case",
                )
            else:
                seen_ids[folded_id] = sample_id
            if previous_id is not None and sample_id <= previous_id:
                _append_value_invalid(
                    issues,
                    f"{entry_location}/id",
                    "catalog IDs must be strictly ascending",
                )
            previous_id = sample_id

        manifest_path = entry.get("manifestPath")
        path_location = f"{entry_location}/manifestPath"
        if "manifestPath" not in entry:
            continue
        segments, path_issues = validate_relative_path(
            manifest_path, path_location)
        issues.extend(path_issues)
        if segments is None or not isinstance(manifest_path, str):
            continue

        folded_path = manifest_path.casefold()
        if folded_path in seen_manifest_paths:
            issues.append(ValidationIssue(
                "PATH_CASE_COLLISION",
                path_location,
                "manifest paths must be unique ignoring case",
            ))
        else:
            seen_manifest_paths[folded_path] = manifest_path

        manifest_file, file_issues = resolve_regular_file(
            root, segments, path_location)
        issues.extend(file_issues)
        if manifest_file is None:
            continue

        manifest_validation_issues, manifest_file_count = _validate_manifest(
            manifest_file,
            manifest_path,
            entry,
            catalog_modes,
        )
        issues.extend(manifest_validation_issues)
        file_count += manifest_file_count

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


class _CliUsageError(ValueError):
    """Raised instead of allowing argparse to terminate the process."""


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise _CliUsageError(message)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1])
    try:
        args = parser.parse_args(argv)
    except _CliUsageError:
        print(
            "ERROR CLI_USAGE cli: invalid command-line arguments",
            file=sys.stderr)
        return 2
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
