import json
import unittest
import xml.etree.ElementTree as ElementTree
import zipfile
from pathlib import Path


class CrossArtifactCoherenceTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SCENARIO_ROOT = (
        REPOSITORY_ROOT / "samples" / "ja-machine-control-design-review"
    )
    PROJECT_PATH = (
        REPOSITORY_ROOT
        / "tests/CheckListMaker.Domain.Tests/Fixtures/complete-project.json"
    )
    OUTCOMES_PATH = (
        SCENARIO_ROOT / "existing-document/expected-outcomes.json"
    )
    TARGET_PATH = (
        SCENARIO_ROOT
        / "existing-document/target/basic-design-before-review.docx"
    )
    WORD_NAMESPACE = (
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    )
    WORD_TEXT = f"{{{WORD_NAMESPACE}}}t"
    WORD_TABLE = f"{{{WORD_NAMESPACE}}}tbl"

    @classmethod
    def setUpClass(cls):
        cls.project = cls.read_json(cls.PROJECT_PATH)
        cls.outcomes = cls.read_json(cls.OUTCOMES_PATH)
        with zipfile.ZipFile(cls.TARGET_PATH) as package:
            document_xml = package.read("word/document.xml")
        cls.document = ElementTree.fromstring(document_xml)
        cls.document_text = cls.element_text(cls.document)

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

    @classmethod
    def element_text(cls, element):
        return "".join(
            node.text or "" for node in element.iter(cls.WORD_TEXT)
        )

    def conditions_by_id(self):
        return {
            condition["id"]: condition
            for item in self.project["checklist"]["items"]
            for condition in item["conditions"]
        }

    def outcomes_by_condition_id(self):
        return {
            outcome["conditionId"]: outcome
            for outcome in self.outcomes["conditions"]
        }

    def test_absent_approval_table_drives_cond_0005_needs_information(self):
        condition = self.conditions_by_id()["COND-0005"]
        scope = condition["scope"]
        self.assertEqual(
            {
                "type": "table",
                "onNotFound": "needs_information",
                "sourceIds": [],
                "description": "承認情報",
                "expectedColumns": [],
            },
            scope,
        )
        table_texts = [
            self.element_text(table)
            for table in self.document.iter(self.WORD_TABLE)
        ]
        self.assertTrue(table_texts)
        self.assertTrue(all("承認情報" not in text for text in table_texts))
        self.assertEqual("occurrences", condition["measure"])
        self.assertEqual("less_than_or_equal", condition["operator"])
        self.assertEqual(0, condition["value"])
        self.assertEqual("未定", condition["occurrenceText"])
        self.assertIn("最終承認者: 未定", self.document_text)

        outcome = self.outcomes_by_condition_id()["COND-0005"]
        self.assertEqual("needs_information", outcome["expectedJudgment"])
        for phrase in ("承認情報", "needs_information", "最終承認者", "未定"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, outcome["example"])

    def test_date_and_management_number_exist_in_selected_entire_document_scopes(self):
        conditions = self.conditions_by_id()
        for condition_id, expected_text in (
            ("COND-0006", "改訂日: 2026-06-30"),
            ("COND-0007", "DMS-2026"),
        ):
            with self.subTest(condition_id=condition_id):
                scope = conditions[condition_id]["scope"]
                self.assertEqual("entire_document", scope["type"])
                self.assertEqual("needs_information", scope["onNotFound"])
                self.assertEqual([], scope["sourceIds"])
                self.assertIn(expected_text, self.document_text)

    def test_optional_item_and_warning_presentation_agree(self):
        item = next(
            item for item in self.project["checklist"]["items"]
            if item["id"] == "CHK-0005"
        )
        self.assertIs(False, item["required"])
        self.assertIs(True, item["allowNotApplicable"])
        self.assertEqual(
            ["COND-0009"],
            [condition["id"] for condition in item["conditions"]],
        )

        item_outcomes = self.outcomes.get("itemOutcomes")
        self.assertIsInstance(item_outcomes, list)
        self.assertEqual(1, len(item_outcomes))
        self.assertEqual(
            {
                "checkItemId": "CHK-0005",
                "required": False,
                "allowNotApplicable": True,
                "conditionId": "COND-0009",
                "conditionJudgment": "invalid",
                "presentation": "warning",
                "example": (
                    "任意項目 CHK-0005 の COND-0009 は不適合だが、"
                    "ユーザーには警告として表示する。"
                ),
            },
            item_outcomes[0],
        )
        condition_outcome = self.outcomes_by_condition_id()["COND-0009"]
        self.assertEqual(
            item_outcomes[0]["conditionJudgment"],
            condition_outcome["expectedJudgment"],
        )

    def test_condition_ids_and_outcomes_map_exactly(self):
        expected_ids = [f"COND-{number:04d}" for number in range(1, 10)]
        fixture_ids = [
            condition["id"]
            for item in self.project["checklist"]["items"]
            for condition in item["conditions"]
        ]
        outcome_ids = [
            outcome["conditionId"]
            for outcome in self.outcomes["conditions"]
        ]
        self.assertEqual(expected_ids, fixture_ids)
        self.assertEqual(expected_ids, outcome_ids)
        self.assertEqual(
            {
                "COND-0001": "valid",
                "COND-0002": "invalid",
                "COND-0003": "invalid",
                "COND-0004": "invalid",
                "COND-0005": "needs_information",
                "COND-0006": "invalid",
                "COND-0007": "valid",
                "COND-0008": "valid",
                "COND-0009": "invalid",
            },
            {
                outcome["conditionId"]: outcome["expectedJudgment"]
                for outcome in self.outcomes["conditions"]
            },
        )


if __name__ == "__main__":
    unittest.main()
