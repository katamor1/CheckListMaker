import hashlib
import json
import re
import unittest
from pathlib import Path


class SampleContentTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SAMPLES_ROOT = REPOSITORY_ROOT / "samples"
    SCENARIO_ROOT = SAMPLES_ROOT / "ja-machine-control-design-review"
    GUIDE_PATH = REPOSITORY_ROOT / "docs/user-guide/samples-gui-demo.md"

    TEXT_ASSETS = (
        SCENARIO_ROOT / "README.md",
        SCENARIO_ROOT / "generation/document-request.json",
        SCENARIO_ROOT / "existing-document/expected-outcomes.json",
        SCENARIO_ROOT / "references/basic-design-template.md",
        SCENARIO_ROOT / "references/control-terminology.txt",
        GUIDE_PATH,
    )

    EXPECTED_REFERENCES = (
        (
            "REF-001",
            "references/quality-assurance-policy.pdf",
            "品質保証規程（デモ）",
            "必須品質規則と禁止事項",
            "binding",
            100,
        ),
        (
            "REF-002",
            "references/basic-design-template.md",
            "基本設計テンプレート",
            "必須章、記載項目、順序",
            "approved",
            80,
        ),
        (
            "REF-003",
            "references/control-terminology.txt",
            "制御用語集",
            "用語と表記の統一",
            "working",
            60,
        ),
        (
            "REF-004",
            "references/reference-design.docx",
            "設備状態監視機能 参考設計書",
            "上位資料と矛盾しない記述例",
            "reference",
            40,
        ),
    )

    EXPECTED_REPAIR_POLICIES = {
        "COND-01": ("valid", "inherited", "suggest_only"),
        "COND-02": ("invalid", "inherited", "suggest_only"),
        "COND-03": ("invalid", "auto_fix", "auto_fix"),
        "COND-04": ("invalid", "auto_fix", "auto_fix"),
        "COND-05": ("needs_information", "do_not_modify", "do_not_modify"),
        "COND-06": ("invalid", "do_not_modify", "do_not_modify"),
        "COND-07": ("valid", "suggest_only", "suggest_only"),
        "COND-08": ("valid", "suggest_only", "suggest_only"),
        "COND-09": ("invalid", "auto_fix", "auto_fix"),
    }

    @staticmethod
    def read(path: Path) -> str:
        return path.read_text(encoding="utf-8")

    @staticmethod
    def read_json(path: Path):
        def reject_duplicate_keys(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f"duplicate JSON key: {key}")
                result[key] = value
            return result

        return json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"non-standard JSON constant: {value}")),
        )

    @staticmethod
    def hash_and_size(path: Path):
        payload = path.read_bytes()
        return hashlib.sha256(payload).hexdigest(), len(payload)

    def test_text_assets_are_strict_utf8_lf_with_one_final_newline(self):
        for path in self.TEXT_ASSETS:
            with self.subTest(path=path.relative_to(self.REPOSITORY_ROOT)):
                payload = path.read_bytes()
                self.assertFalse(payload.startswith(b"\xef\xbb\xbf"))
                payload.decode("utf-8", errors="strict")
                self.assertNotIn(b"\r", payload)
                self.assertTrue(payload.endswith(b"\n"))
                self.assertFalse(payload.endswith(b"\n\n"))

    def test_json_assets_use_two_space_indentation(self):
        for path in (
            self.SCENARIO_ROOT / "generation/document-request.json",
            self.SCENARIO_ROOT / "existing-document/expected-outcomes.json",
            self.SCENARIO_ROOT / "sample-manifest.json",
        ):
            with self.subTest(path=path.relative_to(self.REPOSITORY_ROOT)):
                value = self.read_json(path)
                expected = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
                self.assertEqual(expected, self.read(path))

    def test_generation_request_matches_current_electron_contract(self):
        request = self.read_json(
            self.SCENARIO_ROOT / "generation/document-request.json")
        self.assertEqual(
            {
                "title",
                "purpose",
                "audience",
                "language",
                "requestedFormat",
                "instructions",
                "useReferencesAsFacts",
                "prohibitUnsupportedClaims",
            },
            set(request),
        )
        self.assertNotIn("instruction", request)
        self.assertEqual("設備状態監視機能 基本設計書", request["title"])
        self.assertEqual("承認レビュー用の基本設計書初稿を作成する", request["purpose"])
        self.assertEqual("制御ソフトウェア設計者および品質保証担当者", request["audience"])
        self.assertEqual("ja", request["language"])
        self.assertEqual("docx", request["requestedFormat"])
        self.assertIs(True, request["useReferencesAsFacts"])
        self.assertIs(True, request["prohibitUnsupportedClaims"])
        instructions = request["instructions"]
        for section in (
            "1. 目的",
            "2. 適用範囲",
            "3. 構成",
            "4. 機能設計",
            "5. 異常処理",
            "6. スケジュール",
            "7. 承認",
        ):
            self.assertEqual(1, instructions.count(section))
        self.assertIn("参考資料を事実根拠", instructions)
        self.assertIn("根拠のない値を創作せず", instructions)

    def test_scenario_readme_describes_current_main_gui(self):
        text = self.read(self.SCENARIO_ROOT / "README.md")
        for phrase in (
            "最新のElectron GUIでの利用",
            "`main`のElectron版",
            "「概要・文書」「参考資料」「チェックリスト」",
            "`CHK-0001`／`COND-01`",
            "正式な条件IDは`COND-01`から`COND-09`",
            "`ROLE-001`／`品質基準`",
            "GUIでは次の順に1件ずつ追加",
            "JSONの`instructions`を使用する",
            "`outputs/result.json`として作成",
        ):
            self.assertIn(phrase, text)
        self.assertIn("編集済みの`.clmproj`または`.clmcheck`を同梱しません", text)
        self.assertIn("四つの参考資料は常に読み取り専用", text)
        self.assertIn("PDFである`quality-assurance-policy.pdf`は評価と参照にだけ使用", text)
        self.assertIn("AIへの入力ではなく", text)
        self.assertNotIn("Plan 3", text)
        self.assertNotIn("COND-000", text)

    def test_readme_records_reference_order_and_checklist_mapping(self):
        text = self.read(self.SCENARIO_ROOT / "README.md")
        positions = []
        for reference_id, path, title, role, authority, priority in self.EXPECTED_REFERENCES:
            with self.subTest(reference_id=reference_id):
                row_fragment = f"| `{reference_id}` | `{Path(path).name}` | {title} | `{authority}` | {priority} | {role} |"
                self.assertEqual(1, text.count(row_fragment))
                positions.append(text.index(row_fragment))
        self.assertEqual(sorted(positions), positions)
        for item_id, condition_ids in {
            "CHK-0001": ("COND-01", "COND-02"),
            "CHK-0002": ("COND-03", "COND-04"),
            "CHK-0003": ("COND-05", "COND-06"),
            "CHK-0004": ("COND-07", "COND-08"),
            "CHK-0005": ("COND-09",),
        }.items():
            self.assertEqual(1, text.count(f"| `{item_id}`"))
            for condition_id in condition_ids:
                self.assertIn(f"`{condition_id}`", text)

    def test_expected_outcomes_use_current_ids_and_runtime_result_contract(self):
        outcomes = self.read_json(
            self.SCENARIO_ROOT / "existing-document/expected-outcomes.json")
        self.assertEqual("explanatory_only", outcomes["authority"])
        self.assertIs(False, outcomes["aiInput"])
        self.assertEqual(
            {
                "available": False,
                "fileName": "result.json",
                "reason": "generated_by_copilot_at_runtime",
            },
            outcomes["authoritativeResult"],
        )
        self.assertEqual("COND-09", outcomes["itemOutcomes"][0]["conditionId"])
        conditions = outcomes["conditions"]
        self.assertEqual(
            [f"COND-{number:02d}" for number in range(1, 10)],
            [condition["conditionId"] for condition in conditions],
        )
        self.assertNotIn("COND-000", self.read(
            self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"))

    def test_expected_outcomes_cover_judgments_and_repair_policies(self):
        conditions = self.read_json(
            self.SCENARIO_ROOT / "existing-document/expected-outcomes.json")["conditions"]
        by_id = {condition["conditionId"]: condition for condition in conditions}
        self.assertEqual(set(self.EXPECTED_REPAIR_POLICIES), set(by_id))
        for condition_id, (judgment, behavior, policy) in self.EXPECTED_REPAIR_POLICIES.items():
            with self.subTest(condition_id=condition_id):
                outcome = by_id[condition_id]
                self.assertEqual(judgment, outcome["expectedJudgment"])
                self.assertEqual(behavior, outcome["repairBehavior"])
                self.assertEqual(policy, outcome["effectiveRepairPolicy"])
                self.assertIsInstance(outcome["example"], str)
                self.assertTrue(outcome["example"].strip())

    def test_cross_source_outcome_prefers_binding_reference(self):
        conditions = self.read_json(
            self.SCENARIO_ROOT / "existing-document/expected-outcomes.json")["conditions"]
        outcome = next(item for item in conditions if item["conditionId"] == "COND-09")
        self.assertEqual("invalid", outcome["expectedJudgment"])
        self.assertIn("品質保証規程の 250 ms 以下を優先", outcome["example"])
        self.assertEqual(
            {
                "authorityOrder": ["binding", "approved", "working", "reference"],
                "selectedAuthority": "binding",
                "selectedReference": "REF-001",
                "selectedSource": "quality-assurance-policy.pdf",
                "selectedValue": "250 ms以下",
                "lowerAuthority": "reference",
                "lowerReference": "REF-004",
                "lowerSource": "reference-design.docx",
                "rejectedValue": "500 ms",
            },
            outcome["referenceResolution"],
        )

    def test_template_and_terminology_contracts_are_preserved(self):
        template = self.read(
            self.SCENARIO_ROOT / "references/basic-design-template.md")
        headings = re.findall(r"^#{1,2}\s+(.+)$", template, flags=re.MULTILINE)
        self.assertEqual(
            [
                "基本設計書テンプレート",
                "1. 目的",
                "2. 適用範囲",
                "3. 構成",
                "4. 機能設計",
                "5. 異常処理",
                "6. スケジュール",
                "7. 承認",
            ],
            headings,
        )
        self.assertIn("`対象` と `除外` の両方", template)
        self.assertIn("`DMS-####`", template)
        terminology = self.read(
            self.SCENARIO_ROOT / "references/control-terminology.txt").splitlines()
        self.assertEqual("制御用語集", terminology[0])
        self.assertEqual(6, len(terminology))
        self.assertIn("監視周期: 250 ms以下を標準とする。", terminology)
        self.assertIn("機密区分: 「公開」「社内」「機密」のいずれかを使用する。", terminology)

    def test_manifest_matches_payload_hashes_and_reference_metadata(self):
        manifest = self.read_json(self.SCENARIO_ROOT / "sample-manifest.json")
        self.assertEqual("1.0", manifest["sampleFormatVersion"])
        self.assertEqual("ja-machine-control-design-review", manifest["id"])
        self.assertIn("最新のElectron GUI", manifest["description"])
        self.assertEqual(
            [item[0] for item in self.EXPECTED_REFERENCES],
            manifest["entryPoints"]["existing_document"]["referenceIds"],
        )
        self.assertEqual(
            [item[0] for item in self.EXPECTED_REFERENCES],
            manifest["entryPoints"]["document_generation"]["referenceIds"],
        )
        self.assertEqual(
            "projects/existing-document-demo.clmproj",
            manifest["entryPoints"]["existing_document"]["projectPath"],
        )
        self.assertEqual(
            "projects/document-generation-demo.clmproj",
            manifest["entryPoints"]["document_generation"]["projectPath"],
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

    def test_gui_guide_has_no_obsolete_electron_instructions(self):
        text = self.read(self.GUIDE_PATH)
        for phrase in (
            "対象実装: `main`のElectron / React版",
            "`概要・文書`",
            "`参考資料`",
            "`チェックリスト`",
            "`ROLE-001`",
            "`COND-01`～`COND-09`",
            "JSONではキー名が`instructions`",
            "`outputs/result.json`",
        ):
            self.assertIn(phrase, text)
        for obsolete in (
            "agent/replatform-electron",
            "現行GUI未実装",
            "現行GUIでは参考資料を追加できない",
            "COND-0001",
            "Plan 3",
        ):
            self.assertNotIn(obsolete, text)


if __name__ == "__main__":
    unittest.main()
