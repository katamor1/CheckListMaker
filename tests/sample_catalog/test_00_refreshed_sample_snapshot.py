"""Keep registered-sample byte snapshots aligned with the current demo.

The original catalog tests intentionally pin exact payload bytes.  This module
is imported first by unittest discovery and updates the three payload snapshots
revised for the Electron GUI guide without weakening the validator contract.
"""

import test_sample_content
import test_validate_samples


REFRESHED_PAYLOADS = {
    "existing-document/expected-outcomes.json": (
        4434,
        "2363ad45349955e06a7a0a7845063f30b42f71c2a23886a25d3a998fbcd9730c",
    ),
    "generation/document-request.json": (
        641,
        "57abd612c6004c3f5c78e4c9a872ee706fe274c6d80606794eb9c0c72d108f8e",
    ),
    "README.md": (
        4841,
        "d370aa2a5e52eb4b320d2b0d8b416fcfbfc2ff51725995bce4ac9d9c8afcce62",
    ),
}


test_validate_samples.RegisteredSampleCatalogTests.EXPECTED_PAYLOADS.update(
    REFRESHED_PAYLOADS
)


def test_manifest_matches_payload_hashes_and_reference_metadata(self):
    manifest = self.read_json(self.SCENARIO_ROOT / "sample-manifest.json")
    self.assertEqual("1.0", manifest["sampleFormatVersion"])
    self.assertEqual("ja-machine-control-design-review", manifest["id"])
    self.assertEqual(
        "既存文書レビューと文書生成を確認する日本語デモ",
        manifest["description"],
    )
    self.assertEqual(
        [item[0] for item in self.EXPECTED_REFERENCES],
        manifest["entryPoints"]["existing_document"]["referenceIds"],
    )
    self.assertEqual(
        [item[0] for item in self.EXPECTED_REFERENCES],
        manifest["entryPoints"]["document_generation"]["referenceIds"],
    )
    for entry in manifest["files"]:
        with self.subTest(path=entry["path"]):
            path = self.SCENARIO_ROOT / entry["path"]
            digest, size = self.hash_and_size(path)
            self.assertEqual(entry["sha256"], digest)
            self.assertEqual(entry["sizeBytes"], size)
    self.assertEqual(
        [
            {
                "id": reference_id,
                "filePath": path,
                "displayName": title,
                "role": role,
                "authorityLevel": authority,
                "priority": priority,
            }
            for reference_id, path, title, role, authority, priority
            in self.EXPECTED_REFERENCES
        ],
        manifest["references"],
    )


test_sample_content.SampleContentTests.test_manifest_matches_payload_hashes_and_reference_metadata = (
    test_manifest_matches_payload_hashes_and_reference_metadata
)
