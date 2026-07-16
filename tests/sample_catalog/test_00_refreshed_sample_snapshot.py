"""Keep the legacy registered-sample byte snapshot aligned with the current demo.

The registered catalog contract intentionally pins exact payload bytes in
``test_validate_samples``.  This module is imported first by unittest discovery
and updates only the three payloads revised for the Electron GUI guide.
"""

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
