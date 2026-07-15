import json
import re
import unittest
from pathlib import Path


class SampleContentTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SAMPLES_ROOT = REPOSITORY_ROOT / "samples"
    SCENARIO_ROOT = SAMPLES_ROOT / "ja-machine-control-design-review"
    ASSET_PATHS = (
        SAMPLES_ROOT / "README.md",
        SCENARIO_ROOT / "README.md",
        SCENARIO_ROOT / "references/basic-design-template.md",
        SCENARIO_ROOT / "references/control-terminology.txt",
        SCENARIO_ROOT / "generation/document-request.json",
        SCENARIO_ROOT / "existing-document/expected-outcomes.json",
    )
    SECTION_HEADINGS = (
        "## 1. 目的",
        "## 2. 適用範囲",
        "## 3. 構成",
        "## 4. 機能設計",
        "## 5. 異常処理",
        "## 6. スケジュール",
        "## 7. 承認",
    )

    @staticmethod
    def read(path):
        return path.read_text(encoding="utf-8")

    @staticmethod
    def read_json(path):
        def reject_duplicate_keys(pairs):
            value = {}
            for key, item in pairs:
                if key in value:
                    raise ValueError(f"duplicate JSON key: {key}")
                value[key] = item
            return value

        return json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"non-standard JSON constant: {value}")),
        )

    @staticmethod
    def markdown_headings(text):
        headings = []
        for line in text.splitlines():
            match = re.match(r"^(#{1,6})[ \t]+", line)
            if match is not None:
                headings.append((len(match.group(1)), line))
        return headings

    @staticmethod
    def markdown_h2_section(text, heading):
        lines = text.splitlines()
        start = lines.index(heading) + 1
        end = len(lines)
        for index in range(start, len(lines)):
            if re.match(r"^##[ \t]+", lines[index]):
                end = index
                break
        return "\n".join(lines[start:end]).strip()

    def test_assets_are_strict_utf8_with_lf_and_one_final_newline(self):
        for path in self.ASSET_PATHS:
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
            self.SCENARIO_ROOT
            / "existing-document/expected-outcomes.json",
        ):
            with self.subTest(path=path.relative_to(self.REPOSITORY_ROOT)):
                value = self.read_json(path)
                expected = json.dumps(
                    value,
                    ensure_ascii=False,
                    indent=2,
                ) + "\n"
                self.assertEqual(expected, self.read(path))

    def test_template_has_exact_h1_and_ordered_h2_headings(self):
        path = self.SCENARIO_ROOT / "references/basic-design-template.md"
        text = self.read(path)
        h1_and_h2_lines = [
            line for level, line in self.markdown_headings(text)
            if level in (1, 2)
        ]

        self.assertEqual(
            ["# 基本設計書テンプレート", *self.SECTION_HEADINGS],
            h1_and_h2_lines,
        )

    def test_template_requires_scope_management_and_approval_metadata(self):
        path = self.SCENARIO_ROOT / "references/basic-design-template.md"
        text = self.read(path)
        scope = text.split("## 2. 適用範囲", 1)[1].split(
            "## 3. 構成", 1)[0]
        approval = text.split("## 7. 承認", 1)[1]

        self.assertIn("`対象` と `除外` の両方", scope)
        self.assertIn("- 対象:", scope)
        self.assertIn("- 除外:", scope)
        self.assertIn("`DMS-####`", text)
        self.assertIn("- 改訂日:", approval)
        self.assertIn("- 承認者:", approval)
        self.assertIn("必須", approval)

    def test_terminology_has_exactly_five_normative_lines_after_title(self):
        path = self.SCENARIO_ROOT / "references/control-terminology.txt"
        lines = self.read(path).splitlines()
        self.assertEqual("制御用語集", lines[0])
        self.assertEqual(
            [
                "設備状態監視: センサー値を周期的に取得し、しきい値との比較結果を通知する機能。",
                "監視周期: 250 ms以下を標準とする。",
                "警報: 継続運転を許可しつつ、運転員の確認を要求する通知。",
                "異常: 安全確保のため、対象機能を停止または縮退させる状態。",
                "機密区分: 「公開」「社内」「機密」のいずれかを使用する。",
            ],
            lines[1:],
        )

    def test_catalog_readme_discloses_validation_and_unregistered_outputs(self):
        text = self.read(self.SAMPLES_ROOT / "README.md")
        paragraphs = [paragraph.strip() for paragraph in text.split("\n\n")]
        expected_validation_paragraph = (
            "検証はカタログと manifest の構造、相互参照、ファイルの完全性を確認します。"
            "文書本文の意味的な正しさを判定するものではありません。"
        )
        expected_registration_paragraph = (
            "このカタログには、編集可能なプロジェクトまたはチェックリストの保存物である "
            "`.clmproj` と `.clmcheck` を登録しません。また、`result.json` を含む"
            "実行後の結果ファイルも登録しません。"
        )
        registration_subjects = (
            "`.clmproj`",
            "`.clmcheck`",
            "`result.json`",
            "結果ファイル",
        )
        registration_paragraphs = [
            paragraph for paragraph in paragraphs
            if any(subject in paragraph for subject in registration_subjects)
        ]

        self.assertIn(expected_validation_paragraph, paragraphs)
        self.assertEqual(
            [expected_registration_paragraph],
            registration_paragraphs,
        )
        self.assertIn(
            "```text\npython3 samples/validate_samples.py --root .\n```",
            paragraphs,
        )

    def test_scenario_readme_discloses_data_targets_and_read_only_sources(self):
        text = self.read(self.SCENARIO_ROOT / "README.md")
        expected_intro = (
            "架空の機械制御ソフトウェア「設備状態監視機能」を題材に、既存文書レビューと"
            "文書生成を説明するデモです。固有名詞、組織、担当者、管理番号、日付、連絡先、"
            "性能値を含むすべてのデータは架空であり、実在の製品、顧客、規程、"
            "プロジェクトから転用していません。"
        )
        expected_modes = (
            "- `existing_document`: "
            "`existing-document/target/basic-design-before-review.docx`"
            "（`basic-design-before-review.docx`）をレビュー前の DOCX 主対象として評価します。\n"
            "- `document_generation`: `generation/document-request.json` の依頼と同じ"
            "参考資料群を根拠に、DOCX の基本設計書初稿を生成します。"
        )
        expected_reference_intro = (
            "四つの参考資料は常に読み取り専用です。権威レベルの "
            "`binding > approved > working > reference` を先に比較し、"
            "同じ権威レベルでは数値優先順位の大きい資料を優先します。"
        )
        expected_pdf_disclosure = (
            "参考資料そのものは修正対象にしません。PDF である "
            "`quality-assurance-policy.pdf` は評価と参照にだけ使用し、編集できません。"
        )
        reference_section = self.markdown_h2_section(
            text, "## 参考資料と優先順位")

        self.assertEqual(expected_intro, text.split("\n\n")[1])
        self.assertEqual(
            expected_modes,
            self.markdown_h2_section(text, "## デモモード"),
        )
        self.assertEqual(expected_reference_intro, reference_section.split(
            "\n\n", 1)[0])
        self.assertEqual(expected_pdf_disclosure, reference_section.split(
            "\n\n")[-1])

    def test_scenario_readme_binds_expected_outcomes_disclosures(self):
        text = self.read(self.SCENARIO_ROOT / "README.md")
        expected_disclosure = (
            "`existing-document/expected-outcomes.json`（`expected-outcomes.json`）は"
            "デモ内容を説明するための非権威データです。AI への入力ではありません。"
            "また、実行によって生成された権威ある結果ではありません。正式な "
            "`result.json` は Plan 3 の OutputContract が利用可能になるまで配置しません。"
        )
        subject_lines = [
            line for line in text.splitlines()
            if any(subject in line for subject in (
                "expected-outcomes.json",
                "AI への入力",
                "権威ある結果",
            ))
        ]

        self.assertEqual(
            expected_disclosure,
            self.markdown_h2_section(text, "## 期待結果の扱い"),
        )
        self.assertEqual([expected_disclosure], subject_lines)

    def test_scenario_readme_records_reference_order_and_priorities(self):
        text = self.read(self.SCENARIO_ROOT / "README.md")
        expected_rows = (
            "`quality-assurance-policy.pdf` | `binding` | 100",
            "`basic-design-template.md` | `approved` | 80",
            "`control-terminology.txt` | `working` | 60",
            "`reference-design.docx` | `reference` | 40",
        )
        positions = []
        for row in expected_rows:
            with self.subTest(row=row):
                self.assertEqual(1, text.count(row))
                positions.append(text.index(row))
        self.assertEqual(sorted(positions), positions)

    def test_generation_request_has_exact_metadata_and_constraints(self):
        path = self.SCENARIO_ROOT / "generation/document-request.json"
        request = self.read_json(path)
        self.assertEqual(
            {
                "audience",
                "instruction",
                "language",
                "prohibitUnsupportedClaims",
                "purpose",
                "requestedFormat",
                "title",
                "useReferencesAsFacts",
            },
            set(request),
        )
        self.assertEqual("設備状態監視機能 基本設計書", request["title"])
        self.assertEqual(
            "承認レビュー用の基本設計書初稿を作成する",
            request["purpose"],
        )
        self.assertEqual(
            "制御ソフトウェア設計者および品質保証担当者",
            request["audience"],
        )
        self.assertEqual("ja", request["language"])
        self.assertEqual("docx", request["requestedFormat"])
        self.assertIs(True, request["useReferencesAsFacts"])
        self.assertIs(True, request["prohibitUnsupportedClaims"])

    def test_generation_instruction_orders_all_sections_and_forbids_invention(self):
        path = self.SCENARIO_ROOT / "generation/document-request.json"
        instruction = self.read_json(path)["instruction"]
        positions = []
        for heading in self.SECTION_HEADINGS:
            section_name = heading.removeprefix("## ")
            with self.subTest(section=section_name):
                self.assertEqual(1, instruction.count(section_name))
                positions.append(instruction.index(section_name))
        self.assertEqual(sorted(positions), positions)
        self.assertIn("七つの必須セクション", instruction)
        self.assertIn("参考資料を事実根拠", instruction)
        self.assertIn("根拠のない値を創作せず", instruction)

    def test_expected_outcomes_are_explanatory_only_and_not_ai_input(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        outcomes = self.read_json(path)
        self.assertEqual("explanatory_only", outcomes["authority"])
        self.assertIs(False, outcomes["aiInput"])
        self.assertEqual(
            {
                "authority",
                "aiInput",
                "authoritativeResult",
                "conditions",
            },
            set(outcomes),
        )

    def test_expected_outcomes_defer_authoritative_result_until_plan_3(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        result = self.read_json(path)["authoritativeResult"]
        self.assertEqual(
            {
                "available": False,
                "fileName": "result.json",
                "plannedFor": "Plan 3",
            },
            result,
        )
        self.assertEqual(
            [],
            list(self.SCENARIO_ROOT.rglob("result.json")),
        )

    def test_expected_outcomes_cover_nine_ordered_conditions_and_judgments(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        conditions = self.read_json(path)["conditions"]
        self.assertEqual(9, len(conditions))
        self.assertEqual(
            [f"COND-{number:04d}" for number in range(1, 10)],
            [condition["conditionId"] for condition in conditions],
        )
        self.assertEqual(
            {"valid", "invalid", "needs_information"},
            {condition["expectedJudgment"] for condition in conditions},
        )

    def test_each_expected_outcome_explains_its_judgment_and_repair_behavior(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        conditions = self.read_json(path)["conditions"]
        expected = {
            "COND-0001": (
                "valid", "inherited", "suggest_only",
                ("具体的", "適合とする", "プロジェクト既定を継承"),
            ),
            "COND-0002": (
                "invalid", "inherited", "suggest_only",
                ("対象", "除外", "不適合とする", "原文は変更せず", "追記案"),
            ),
            "COND-0003": (
                "invalid", "auto_fix", "auto_fix",
                ("禁止された曖昧表現", "不適合とする", "安全に置換", "自動修正"),
            ),
            "COND-0004": (
                "invalid", "auto_fix", "auto_fix",
                ("500 ms", "250 ms", "不適合とする", "自動修正"),
            ),
            "COND-0005": (
                "needs_information", "do_not_modify", "do_not_modify",
                ("最終承認者", "情報不足として停止", "推測せず", "確認事項だけ"),
            ),
            "COND-0006": (
                "invalid", "do_not_modify", "do_not_modify",
                ("2026-06-30", "2026-07-01", "不適合とする", "原文変更", "生成しない"),
            ),
            "COND-0007": (
                "valid", "suggest_only", "suggest_only",
                ("DMS-2026", "DMS-####", "適合とする", "原文は変更しない"),
            ),
            "COND-0008": (
                "valid", "suggest_only", "suggest_only",
                ("機密区分「社内」", "許可値", "適合とする", "原文は変更しない"),
            ),
            "COND-0009": (
                "invalid", "auto_fix", "auto_fix",
                ("参考設計書", "品質保証規程", "優先する", "上位資料", "不適合とする"),
            ),
        }

        self.assertEqual(set(expected), {
            condition["conditionId"] for condition in conditions
        })
        for condition in conditions:
            condition_id = condition["conditionId"]
            judgment, behavior, effective_policy, phrases = expected[
                condition_id]
            with self.subTest(condition_id=condition_id):
                example = condition.get("example")
                self.assertIsInstance(example, str)
                self.assertTrue(example.strip())
                self.assertEqual(judgment, condition["expectedJudgment"])
                self.assertEqual(behavior, condition["repairBehavior"])
                self.assertEqual(
                    effective_policy,
                    condition["effectiveRepairPolicy"],
                )
                for phrase in phrases:
                    self.assertIn(phrase, example)
                if judgment == "valid":
                    self.assertNotIn("不適合とする", example)

    def test_expected_outcomes_cover_inherited_and_all_repair_policies(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        conditions = self.read_json(path)["conditions"]
        by_id = {
            condition["conditionId"]: condition for condition in conditions
        }
        self.assertEqual(
            {
                "COND-0001": ("inherited", "suggest_only"),
                "COND-0002": ("inherited", "suggest_only"),
                "COND-0003": ("auto_fix", "auto_fix"),
                "COND-0004": ("auto_fix", "auto_fix"),
                "COND-0005": ("do_not_modify", "do_not_modify"),
                "COND-0006": ("do_not_modify", "do_not_modify"),
                "COND-0007": ("suggest_only", "suggest_only"),
                "COND-0008": ("suggest_only", "suggest_only"),
                "COND-0009": ("auto_fix", "auto_fix"),
            },
            {
                condition_id: (
                    outcome["repairBehavior"],
                    outcome["effectiveRepairPolicy"],
                )
                for condition_id, outcome in by_id.items()
            },
        )

    def test_cross_source_outcome_prefers_binding_policy_to_reference_design(self):
        path = self.SCENARIO_ROOT / "existing-document/expected-outcomes.json"
        conditions = self.read_json(path)["conditions"]
        condition = next(
            item for item in conditions
            if item["conditionId"] == "COND-0009"
        )
        self.assertIn(
            "参考設計書の 500 ms より拘束力のある品質保証規程の 250 ms 以下を優先する",
            condition["example"],
        )
        self.assertIn("上位資料と不一致", condition["example"])
        self.assertEqual("invalid", condition["expectedJudgment"])
        self.assertEqual(
            {
                "authorityOrder": [
                    "binding",
                    "approved",
                    "working",
                    "reference",
                ],
                "selectedAuthority": "binding",
                "selectedReference": "REF-001",
                "selectedSource": "quality-assurance-policy.pdf",
                "selectedValue": "250 ms以下",
                "lowerAuthority": "reference",
                "lowerReference": "REF-004",
                "lowerSource": "reference-design.docx",
                "rejectedValue": "500 ms",
            },
            condition["referenceResolution"],
        )


if __name__ == "__main__":
    unittest.main()
