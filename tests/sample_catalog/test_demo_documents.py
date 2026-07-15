import contextlib
import inspect
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from pypdf import PdfReader

import samples.tools.build_demo_documents as builder


class DemoDocumentTests(unittest.TestCase):
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    SCENARIO_ROOT = (
        REPOSITORY_ROOT / "samples" / "ja-machine-control-design-review"
    )
    OUTPUT_PATHS = (
        Path("existing-document/target/basic-design-before-review.docx"),
        Path("references/reference-design.docx"),
        Path("references/quality-assurance-policy.pdf"),
    )
    NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

    @classmethod
    def setUpClass(cls):
        cls.first_temporary_directory = tempfile.TemporaryDirectory()
        cls.second_temporary_directory = tempfile.TemporaryDirectory()
        cls.first_generated = Path(cls.first_temporary_directory.name)
        cls.second_generated = Path(cls.second_temporary_directory.name)
        builder.build_all(cls.first_generated)
        builder.build_all(cls.second_generated)

    @classmethod
    def tearDownClass(cls):
        cls.second_temporary_directory.cleanup()
        cls.first_temporary_directory.cleanup()

    @staticmethod
    def _xml_part(path, name):
        with zipfile.ZipFile(path) as archive:
            return ElementTree.fromstring(archive.read(name))

    @classmethod
    def _style(cls, styles, style_id):
        for style in styles.findall("w:style", cls.NS):
            if style.get(f"{{{cls.NS['w']}}}styleId") == style_id:
                return style
        raise AssertionError(f"missing style: {style_id}")

    @classmethod
    def _paragraph_text(cls, paragraph):
        return "".join(paragraph.itertext())

    def test_public_builder_interfaces_are_stable(self):
        expected_signatures = {
            "build_target_docx": ("destination",),
            "build_reference_docx": ("destination",),
            "build_policy_pdf": ("destination",),
            "build_all": ("output_root",),
            "check_committed": ("sample_root",),
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

    def test_two_independent_builds_are_byte_identical(self):
        for relative_path in self.OUTPUT_PATHS:
            with self.subTest(path=relative_path.as_posix()):
                self.assertEqual(
                    (self.first_generated / relative_path).read_bytes(),
                    (self.second_generated / relative_path).read_bytes(),
                )

    def test_docx_has_required_open_package_parts(self):
        path = (
            self.first_generated
            / "existing-document/target/basic-design-before-review.docx"
        )
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            self.assertIn("[Content_Types].xml", names)
            self.assertIn("word/document.xml", names)
            xml = archive.read("word/document.xml").decode("utf-8")
        self.assertIn("設備状態監視機能 基本設計書", xml)
        self.assertIn("500 ms", xml)
        self.assertIn("適切に", xml)

    def test_docx_zip_entries_are_fully_normalized(self):
        for relative_path in self.OUTPUT_PATHS[:2]:
            path = self.first_generated / relative_path
            with self.subTest(path=relative_path.as_posix()):
                with zipfile.ZipFile(path) as archive:
                    entries = archive.infolist()
                self.assertEqual(
                    sorted(entry.filename for entry in entries),
                    [entry.filename for entry in entries],
                )
                for entry in entries:
                    self.assertEqual((1980, 1, 1, 0, 0, 0), entry.date_time)
                    self.assertEqual(zipfile.ZIP_DEFLATED, entry.compress_type)
                    self.assertEqual(0o644, (entry.external_attr >> 16) & 0o777)
                    self.assertTrue(entry.flag_bits & 0x0800)

    def test_docx_core_properties_are_fixed_and_non_sensitive(self):
        expected = {
            "dc:title": None,
            "dc:creator": "CheckListMaker Demo",
            "cp:lastModifiedBy": "CheckListMaker Demo",
            "dcterms:created": "2026-01-01T00:00:00Z",
            "dcterms:modified": "2026-01-01T00:00:00Z",
        }
        namespaces = {
            "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
            "dc": "http://purl.org/dc/elements/1.1/",
            "dcterms": "http://purl.org/dc/terms/",
        }
        titles = {
            self.OUTPUT_PATHS[0]: "設備状態監視機能 基本設計書",
            self.OUTPUT_PATHS[1]: "設備状態監視機能 参考設計書",
        }
        for relative_path, title in titles.items():
            with self.subTest(path=relative_path.as_posix()):
                root = self._xml_part(
                    self.first_generated / relative_path,
                    "docProps/core.xml",
                )
                expected["dc:title"] = title
                for expression, value in expected.items():
                    element = root.find(expression, namespaces)
                    self.assertIsNotNone(element, expression)
                    self.assertEqual(value, element.text, expression)

    def test_docx_uses_exact_standard_business_brief_tokens(self):
        target = self.first_generated / self.OUTPUT_PATHS[0]
        document = self._xml_part(target, "word/document.xml")
        section = document.find(".//w:sectPr", self.NS)
        self.assertIsNotNone(section)
        page_size = section.find("w:pgSz", self.NS)
        page_margin = section.find("w:pgMar", self.NS)
        self.assertEqual("12240", page_size.get(f"{{{self.NS['w']}}}w"))
        self.assertEqual("15840", page_size.get(f"{{{self.NS['w']}}}h"))
        for edge in ("top", "right", "bottom", "left"):
            self.assertEqual(
                "1440", page_margin.get(f"{{{self.NS['w']}}}{edge}")
            )

        styles = self._xml_part(target, "word/styles.xml")
        expected_styles = {
            "Normal": ("Calibri", "22", None, "0", "120", "264"),
            "Heading1": ("Calibri", "32", "2E74B5", "320", "160", None),
            "Heading2": ("Calibri", "26", "2E74B5", "240", "120", None),
            "Heading3": ("Calibri", "24", "1F4D78", "160", "80", None),
        }
        for style_id, expected_values in expected_styles.items():
            with self.subTest(style=style_id):
                style = self._style(styles, style_id)
                fonts = style.find("w:rPr/w:rFonts", self.NS)
                size = style.find("w:rPr/w:sz", self.NS)
                color = style.find("w:rPr/w:color", self.NS)
                spacing = style.find("w:pPr/w:spacing", self.NS)
                actual = (
                    fonts.get(f"{{{self.NS['w']}}}ascii"),
                    size.get(f"{{{self.NS['w']}}}val"),
                    None if color is None else color.get(f"{{{self.NS['w']}}}val"),
                    spacing.get(f"{{{self.NS['w']}}}before", "0"),
                    spacing.get(f"{{{self.NS['w']}}}after"),
                    spacing.get(f"{{{self.NS['w']}}}line"),
                )
                self.assertEqual(expected_values, actual)

        title_style = self._style(styles, "Title")
        self.assertIsNone(title_style.find("w:pPr/w:pBdr", self.NS))

    def test_target_has_exact_content_contract_and_real_structures(self):
        target = self.first_generated / self.OUTPUT_PATHS[0]
        document = self._xml_part(target, "word/document.xml")
        text = "".join(document.itertext())
        for required in (
            "DMS-2026",
            "0.7",
            "社内",
            "2026-06-30",
            "500 ms",
            "適切に通知する",
            "最終承認者: 未定",
        ):
            self.assertIn(required, text)
        self.assertNotIn("除外:", text)

        expected_headings = [f"{number}. {title}" for number, title in (
            (1, "目的"),
            (2, "適用範囲"),
            (3, "構成"),
            (4, "機能設計"),
            (5, "異常処理"),
            (6, "スケジュール"),
            (7, "承認"),
        )]
        actual_headings = []
        bullet_paragraphs = []
        for paragraph in document.findall(".//w:body/w:p", self.NS):
            style = paragraph.find("w:pPr/w:pStyle", self.NS)
            paragraph_text = self._paragraph_text(paragraph)
            if (
                style is not None
                and style.get(f"{{{self.NS['w']}}}val") == "Heading1"
            ):
                actual_headings.append(paragraph_text)
            if paragraph.find("w:pPr/w:numPr", self.NS) is not None:
                bullet_paragraphs.append(paragraph_text)
        self.assertEqual(expected_headings, actual_headings)
        self.assertGreaterEqual(len(bullet_paragraphs), 3)
        self.assertNotIn("•", "".join(bullet_paragraphs))

        tables = document.findall(".//w:body/w:tbl", self.NS)
        self.assertEqual(1, len(tables))
        table = tables[0]
        table_properties = table.find("w:tblPr", self.NS)
        table_width = table_properties.find("w:tblW", self.NS)
        table_indent = table_properties.find("w:tblInd", self.NS)
        self.assertEqual("9360", table_width.get(f"{{{self.NS['w']}}}w"))
        self.assertEqual("dxa", table_width.get(f"{{{self.NS['w']}}}type"))
        self.assertEqual("120", table_indent.get(f"{{{self.NS['w']}}}w"))
        grid_widths = [
            int(column.get(f"{{{self.NS['w']}}}w"))
            for column in table.findall("w:tblGrid/w:gridCol", self.NS)
        ]
        self.assertEqual([2700, 6660], grid_widths)
        for row in table.findall("w:tr", self.NS):
            cell_widths = [
                int(cell.find("w:tcPr/w:tcW", self.NS).get(
                    f"{{{self.NS['w']}}}w"
                ))
                for cell in row.findall("w:tc", self.NS)
            ]
            self.assertEqual(grid_widths, cell_widths)
        margins = table_properties.find("w:tblCellMar", self.NS)
        for side, expected in (
            ("top", "80"),
            ("bottom", "80"),
            ("start", "120"),
            ("end", "120"),
        ):
            element = margins.find(f"w:{side}", self.NS)
            self.assertEqual(expected, element.get(f"{{{self.NS['w']}}}w"))
        self.assertIsNone(document.find(".//w:pBdr", self.NS))

    def test_real_bullet_definition_uses_preset_geometry(self):
        target = self.first_generated / self.OUTPUT_PATHS[0]
        numbering = self._xml_part(target, "word/numbering.xml")
        bullets = []
        for level in numbering.findall(".//w:lvl", self.NS):
            number_format = level.find("w:numFmt", self.NS)
            if (
                number_format is not None
                and number_format.get(f"{{{self.NS['w']}}}val") == "bullet"
            ):
                bullets.append(level)
        self.assertEqual(1, len(bullets))
        indentation = bullets[0].find("w:pPr/w:ind", self.NS)
        spacing = bullets[0].find("w:pPr/w:spacing", self.NS)
        self.assertEqual("720", indentation.get(f"{{{self.NS['w']}}}left"))
        self.assertEqual("360", indentation.get(f"{{{self.NS['w']}}}hanging"))
        self.assertEqual("160", spacing.get(f"{{{self.NS['w']}}}after"))
        self.assertEqual("280", spacing.get(f"{{{self.NS['w']}}}line"))
        self.assertEqual("auto", spacing.get(f"{{{self.NS['w']}}}lineRule"))

    def test_reference_document_preserves_lower_authority_value(self):
        reference = self.first_generated / self.OUTPUT_PATHS[1]
        document = self._xml_part(reference, "word/document.xml")
        text = "".join(document.itertext())
        self.assertIn("設備状態監視機能 参考設計書", text)
        self.assertIn("500 ms", text)
        self.assertNotIn("250 ms", text)

    def test_pdf_is_searchable_and_unencrypted(self):
        reader = PdfReader(
            self.first_generated / "references/quality-assurance-policy.pdf"
        )
        self.assertFalse(reader.is_encrypted)
        self.assertEqual(1, len(reader.pages))
        self.assertEqual("品質保証規程（デモ）", reader.metadata.title)
        self.assertEqual("CheckListMaker Demo", reader.metadata.author)
        self.assertEqual("CheckListMaker Demo", reader.metadata.creator)
        self.assertEqual("基本設計書レビュー用の拘束的な品質規則", reader.metadata.subject)
        text = reader.pages[0].extract_text()
        for required in (
            "DMS-[0-9]{4}",
            "250 ms",
            "適切に",
            "必要に応じて",
            "公開",
            "社内",
            "機密",
            "対象",
            "除外",
            "改訂日",
            "承認者",
        ):
            self.assertIn(required, text)

    def test_pdf_has_no_active_or_embedded_content(self):
        path = self.first_generated / self.OUTPUT_PATHS[2]
        reader = PdfReader(path)
        root = reader.trailer["/Root"]
        for forbidden_key in (
            "/AA",
            "/AcroForm",
            "/Collection",
            "/EmbeddedFiles",
            "/JavaScript",
            "/OpenAction",
            "/Perms",
        ):
            self.assertNotIn(forbidden_key, root)
        self.assertNotIn(b"/EmbeddedFile", path.read_bytes())
        self.assertNotIn(b"/JavaScript", path.read_bytes())
        self.assertNotIn(b"/Encrypt", path.read_bytes())

    def test_check_mode_reports_only_relative_mismatches_and_never_rewrites(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            sample_root = Path(temporary_directory)
            builder.build_all(sample_root)
            changed = sample_root / self.OUTPUT_PATHS[0]
            changed.write_bytes(changed.read_bytes() + b"changed")
            before = changed.read_bytes()
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = builder.check_committed(sample_root)
            self.assertEqual(1, result)
            self.assertEqual(
                self.OUTPUT_PATHS[0].as_posix() + "\n",
                output.getvalue(),
            )
            self.assertEqual(before, changed.read_bytes())

    def test_check_mode_accepts_committed_assets_silently(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = builder.check_committed(self.SCENARIO_ROOT)
        self.assertEqual(0, result)
        self.assertEqual("", output.getvalue())

    def test_cli_output_root_is_test_only_destination(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory)
            self.assertEqual(
                0,
                builder.main(["--write", "--output-root", str(output_root)]),
            )
            for relative_path in self.OUTPUT_PATHS:
                self.assertTrue((output_root / relative_path).is_file())

    def test_development_requirements_are_exactly_pinned(self):
        self.assertEqual(
            (
                "python-docx==1.2.0\n"
                "reportlab==4.4.9\n"
                "pypdf==6.10.0\n"
            ),
            (
                self.REPOSITORY_ROOT / "samples/tools/requirements.txt"
            ).read_text(encoding="utf-8"),
        )

    def test_binary_attributes_are_declared(self):
        attributes = (
            self.REPOSITORY_ROOT / ".gitattributes"
        ).read_text(encoding="utf-8").splitlines()
        self.assertEqual(
            [
                "*.docx binary",
                "*.pdf binary",
                "*.clmproj binary",
                "*.clmcheck binary",
            ],
            attributes[-4:],
        )


if __name__ == "__main__":
    unittest.main()
