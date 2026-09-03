from __future__ import annotations

import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / ".agents" / "skills" / "opinion-simulator" / "scripts" / "opinion_simulator.py"
FIXTURES = ROOT / "tests" / "skill" / "fixtures" / "v0.0"
LEGACY_PROJECT = FIXTURES / "legacy-generic-recommendations" / "project"
SOURCE_TEXT = (
    "市府計畫明年提供成人疫苗接種補助。第一階段先在三個行政區試辦，並公開每月支出與接種人次。"
    "各衛生所需調整排班，但計畫尚未說明新增人力來源。"
)
QUESTION = "你會支持這項計畫嗎？需要哪些修改？"
PERSONA_LABEL = "地方衛生政策分析師"
DIRECT_REACTION = "我原則支持試辦，但應先交代新增人力與公開支出的做法。"
PERSONA_RECOMMENDATION = "執行前提出衛生所人力與排班配套。"
SYSTEM_SUGGESTION = "系統層面應把未說明的人力來源視為計畫缺口，而不是已解決的執行條件。"
UNLABELED_LEGACY_RECOMMENDATION = "這是未標示來源的舊欄位建議。"
REPEATED_METHOD_LIMITS = (
    "Agent-host prototype; no direct provider BYOK call was performed by the deterministic tool.",
    "Repeated Sample consistency is not calibrated confidence and is not real-human validation.",
    "The raw response and structured Result remain in the Run JSON for audit.",
)


def run_tool(*arguments: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-B", str(TOOL), *(str(argument) for argument in arguments)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def tree_bytes(root: Path):
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }


def markdown_section(text: str, heading: str) -> str:
    marker = heading if heading.startswith("#") else f"## {heading}"
    start = text.index(marker)
    remainder = text[start + len(marker) :]
    next_heading = remainder.find("\n## ")
    if next_heading == -1:
        return remainder
    return remainder[:next_heading]


def with_new_result_contract(samples: dict, *, keep_unlabeled: bool = False) -> dict:
    updated = copy.deepcopy(samples)
    for sample in updated["samples"]:
        result = sample["parsedResult"]
        result["directReaction"] = sample["rawProviderResponse"]["text"]
        existing_persona = result.get("personaRecommendations")
        if existing_persona is None:
            existing_persona = list(result.get("recommendations") or [])
        result["personaRecommendations"] = list(existing_persona)
        result["systemSuggestions"] = result.get("systemSuggestions") or [SYSTEM_SUGGESTION]
        if keep_unlabeled:
            result["recommendations"] = [UNLABELED_LEGACY_RECOMMENDATION]
        else:
            result.pop("recommendations", None)
    return updated


def without_direct_reaction_contract(samples: dict) -> dict:
    updated = copy.deepcopy(samples)
    for sample in updated["samples"]:
        result = sample["parsedResult"]
        if "recommendations" not in result:
            result["recommendations"] = list(result.get("personaRecommendations") or [PERSONA_RECOMMENDATION])
        result.pop("directReaction", None)
        result.pop("personaRecommendations", None)
        result.pop("systemSuggestions", None)
    return updated


def write_current_approval(workflow_path: Path, approval_path: Path, base_approval: Path) -> None:
    preflight_path = approval_path.parent / "preflight.json"
    rendered = run_tool(
        "render-preflight",
        "--workflow",
        workflow_path,
        "--output",
        preflight_path,
    )
    if rendered.returncode != 0:
        raise AssertionError(rendered.stderr)
    approval = read_json(base_approval)
    preflight = read_json(preflight_path)
    approval["runId"] = preflight["runId"]
    approval["planHash"] = preflight["planHash"]
    write_json(approval_path, approval)


class OpinionSimulatorCliTests(unittest.TestCase):
    maxDiff = None

    def assert_success(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertEqual(result.returncode, 0, msg=f"stdout={result.stdout}\nstderr={result.stderr}")

    def build_quick_project(self, samples: dict, temporary_path: Path) -> Path:
        fixture = FIXTURES / "golden-quick"
        samples_path = temporary_path / "samples.json"
        approval_path = temporary_path / "approval.json"
        project = temporary_path / "project"
        write_json(samples_path, samples)
        write_current_approval(fixture / "workflow.json", approval_path, fixture / "approval.json")
        built = run_tool(
            "build-project",
            "--workflow",
            fixture / "workflow.json",
            "--approval",
            approval_path,
            "--samples",
            samples_path,
            "--output",
            project,
        )
        self.assert_success(built)
        return project

    def test_quick_mode_matches_golden_project_and_validates(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-quick-") as temporary:
            temporary_path = Path(temporary)
            preflight = temporary_path / "preflight.json"
            project = temporary_path / "project"
            rendered = run_tool(
                "render-preflight",
                "--workflow",
                fixture / "workflow.json",
                "--output",
                preflight,
            )
            self.assert_success(rendered)
            self.assertEqual(preflight.read_bytes(), (fixture / "preflight.json").read_bytes())

            built = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                fixture / "approval.json",
                "--samples",
                fixture / "samples.json",
                "--output",
                project,
            )
            self.assert_success(built)
            self.assertEqual(tree_bytes(project), tree_bytes(fixture / "project"))
            evidence = json.loads(built.stdout)
            self.assertEqual(evidence["samplesChecked"], 1)
            self.assertEqual(evidence["liveProviderCalls"], "none")

            validated = run_tool("validate-project", project)
            self.assert_success(validated)
            self.assertEqual(json.loads(validated.stdout)["status"], "valid")

    def test_stability_mode_matches_golden_and_reports_traceable_differences(self) -> None:
        fixture = FIXTURES / "golden-stability"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-stability-") as temporary:
            project = Path(temporary) / "project"
            built = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                fixture / "approval.json",
                "--samples",
                fixture / "samples.json",
                "--output",
                project,
            )
            self.assert_success(built)
            self.assertEqual(tree_bytes(project), tree_bytes(fixture / "project"))
            run = read_json(project / "runs" / "run-golden-stability-001.json")
            comparison = run["stabilityComparison"]
            self.assertEqual(comparison["mode"], "three-sample-exact-normalized-comparison")
            self.assertTrue(comparison["consistentThemes"])
            self.assertTrue(comparison["divergentThemes"])
            self.assertNotIn("confidenceScore", comparison)
            compared_fields = {
                item["field"]
                for item in comparison["consistentThemes"] + comparison["divergentThemes"]
            }
            self.assertIn("personaRecommendations", compared_fields)
            self.assertIn("systemSuggestions", compared_fields)
            self.assertNotIn("recommendations", compared_fields)
            self.assertEqual(json.loads(built.stdout)["samplesChecked"], 3)

    def test_accepted_inference_can_supply_a_separately_labelled_field(self) -> None:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["persona"]["fields"]["valuesAndDecisionStyle"] = "偏好分階段試辦"
        workflow["persona"]["notProvidedFields"].remove("valuesAndDecisionStyle")
        workflow["persona"]["inferences"][0]["decision"] = "accepted"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-inference-") as temporary:
            temporary_path = Path(temporary)
            workflow_path = temporary_path / "workflow.json"
            write_json(workflow_path, workflow)
            result = run_tool(
                "render-preflight",
                "--workflow",
                workflow_path,
                "--output",
                temporary_path / "preflight.json",
            )
            self.assert_success(result)
            preflight = read_json(temporary_path / "preflight.json")
            accepted = json.loads(preflight["outbound"]["promptSections"]["persona"])["acceptedInferences"]
            self.assertEqual(accepted[0]["decision"], "accepted")

    def test_pending_inference_blocks_preflight(self) -> None:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["persona"]["inferences"][0]["decision"] = "pending"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-pending-") as temporary:
            workflow_path = Path(temporary) / "workflow.json"
            write_json(workflow_path, workflow)
            result = run_tool(
                "render-preflight",
                "--workflow",
                workflow_path,
                "--output",
                Path(temporary) / "preflight.json",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("no final user decision", result.stderr)

    def test_only_one_or_three_samples_are_allowed(self) -> None:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["execution"]["sampleCount"] = 2
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-count-") as temporary:
            workflow_path = Path(temporary) / "workflow.json"
            write_json(workflow_path, workflow)
            result = run_tool(
                "render-preflight",
                "--workflow",
                workflow_path,
                "--output",
                Path(temporary) / "preflight.json",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("exactly 1 or 3", result.stderr)

    def test_changed_plan_rejects_stale_preflight_approval(self) -> None:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["questionSet"]["questions"][0] = "你是否支持？請說明條件。"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-stale-") as temporary:
            temporary_path = Path(temporary)
            workflow_path = temporary_path / "workflow.json"
            write_json(workflow_path, workflow)
            result = run_tool(
                "build-project",
                "--workflow",
                workflow_path,
                "--approval",
                fixture / "approval.json",
                "--samples",
                fixture / "samples.json",
                "--output",
                temporary_path / "project",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("approval is stale", result.stderr)

    def test_source_id_is_dynamic_material_not_static_output_schema(self) -> None:
        fixture = FIXTURES / "golden-quick"
        changed = read_json(fixture / "workflow.json")
        changed["source"]["sourceId"] = "source-policy-002"
        changed["source"]["text"] = "不同的材料。"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-cache-prefix-") as temporary:
            temporary_path = Path(temporary)
            workflow_path = temporary_path / "workflow.json"
            first_path = temporary_path / "first.json"
            second_path = temporary_path / "second.json"
            write_json(workflow_path, changed)
            first = run_tool(
                "render-preflight",
                "--workflow",
                fixture / "workflow.json",
                "--output",
                first_path,
            )
            second = run_tool(
                "render-preflight",
                "--workflow",
                workflow_path,
                "--output",
                second_path,
            )
            self.assert_success(first)
            self.assert_success(second)
            first_sections = read_json(first_path)["outbound"]["promptSections"]
            second_sections = read_json(second_path)["outbound"]["promptSections"]
            self.assertEqual(first_sections["outputSchema"], second_sections["outputSchema"])
            self.assertIn("SOURCE-ID: source-policy-002", second_sections["sourceMaterial"])

    def test_real_person_requires_second_preflight_confirmation(self) -> None:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["persona"]["review"]["realPerson"] = {
            "applies": True,
            "warningAcknowledgedAt": "2026-08-23T01:06:00Z",
        }
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-real-person-") as temporary:
            temporary_path = Path(temporary)
            workflow_path = temporary_path / "workflow.json"
            preflight_path = temporary_path / "preflight.json"
            approval_path = temporary_path / "approval.json"
            write_json(workflow_path, workflow)
            rendered = run_tool(
                "render-preflight",
                "--workflow",
                workflow_path,
                "--output",
                preflight_path,
            )
            self.assert_success(rendered)
            preflight = read_json(preflight_path)
            self.assertTrue(preflight["requiresRealPersonReconfirmation"])
            approval = read_json(fixture / "approval.json")
            approval["planHash"] = preflight["planHash"]
            approval["realPersonReconfirmed"] = False
            write_json(approval_path, approval)
            built = run_tool(
                "build-project",
                "--workflow",
                workflow_path,
                "--approval",
                approval_path,
                "--samples",
                fixture / "samples.json",
                "--output",
                temporary_path / "project",
            )
            self.assertEqual(built.returncode, 2)
            self.assertIn("requires Preflight reconfirmation", built.stderr)

    def test_non_exact_source_mapping_is_rejected(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        samples["samples"][0]["parsedResult"]["sourceMappings"][0]["excerpt"] = "這段文字不在來源中"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-mapping-") as temporary:
            temporary_path = Path(temporary)
            samples_path = temporary_path / "samples.json"
            approval_path = temporary_path / "approval.json"
            write_json(samples_path, samples)
            write_current_approval(fixture / "workflow.json", approval_path, fixture / "approval.json")
            result = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                approval_path,
                "--samples",
                samples_path,
                "--output",
                temporary_path / "project",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("not exact Source text", result.stderr)

    def test_credential_shaped_raw_response_field_is_rejected(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        samples["samples"][0]["rawProviderResponse"]["apiKey"] = "synthetic-prohibited-value"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-secret-") as temporary:
            temporary_path = Path(temporary)
            samples_path = temporary_path / "samples.json"
            approval_path = temporary_path / "approval.json"
            write_json(samples_path, samples)
            write_current_approval(fixture / "workflow.json", approval_path, fixture / "approval.json")
            result = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                approval_path,
                "--samples",
                samples_path,
                "--output",
                temporary_path / "project",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("prohibited credential", result.stderr)
            self.assertNotIn("synthetic-prohibited-value", result.stderr)

    def test_existing_output_is_never_overwritten(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-overwrite-") as temporary:
            output = Path(temporary) / "project"
            output.mkdir()
            sentinel = output / "sentinel.txt"
            sentinel.write_text("keep", encoding="utf-8")
            result = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                fixture / "approval.json",
                "--samples",
                fixture / "samples.json",
                "--output",
                output,
            )
            self.assertEqual(result.returncode, 2)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_dotfiles_are_ignored_by_checksum_validation(self) -> None:
        fixture_project = FIXTURES / "golden-quick" / "project"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-dotfile-") as temporary:
            project = Path(temporary) / "project"
            shutil.copytree(fixture_project, project)
            (project / ".DS_Store").write_bytes(b"finder")
            result = run_tool("validate-project", project)
            self.assert_success(result)
            self.assertEqual(json.loads(result.stdout)["status"], "valid")

    def test_tampering_is_reported_by_checksum_validation(self) -> None:
        fixture_project = FIXTURES / "golden-quick" / "project"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-tamper-") as temporary:
            project = Path(temporary) / "project"
            shutil.copytree(fixture_project, project)
            source = project / "sources" / "source-policy-001.txt"
            source.write_text(source.read_text(encoding="utf-8") + "遭修改", encoding="utf-8")
            result = run_tool("validate-project", project)
            self.assertEqual(result.returncode, 2)
            self.assertIn("Source hash mismatch", result.stderr)

    def test_published_schema_rejects_unknown_project_field(self) -> None:
        fixture_project = FIXTURES / "golden-quick" / "project"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-schema-") as temporary:
            project = Path(temporary) / "project"
            shutil.copytree(fixture_project, project)
            project_json_path = project / "project.json"
            project_json = read_json(project_json_path)
            project_json["unknownField"] = "not allowed"
            write_json(project_json_path, project_json)
            result = run_tool("validate-project", project)
            self.assertEqual(result.returncode, 2)
            self.assertIn("not allowed by the published schema", result.stderr)

    def test_legacy_generic_recommendations_projects_still_validate(self) -> None:
        legacy = run_tool("validate-project", LEGACY_PROJECT)
        self.assert_success(legacy)
        legacy_result = read_json(LEGACY_PROJECT / "runs" / "run-golden-quick-001.json")["samples"][0]["parsedResult"]
        self.assertIn("recommendations", legacy_result)
        self.assertNotIn("directReaction", legacy_result)
        self.assertNotIn("personaRecommendations", legacy_result)
        self.assertNotIn("systemSuggestions", legacy_result)
        legacy_report = (LEGACY_PROJECT / "reports" / "report-golden-quick-001.md").read_text(encoding="utf-8")
        self.assertIn("### Recommendations", legacy_report)
        self.assertNotIn("Direct Reaction", legacy_report)

    def test_build_rejects_result_without_direct_reaction(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-no-reaction-") as temporary:
            temporary_path = Path(temporary)
            samples_path = temporary_path / "samples.json"
            approval_path = temporary_path / "approval.json"
            write_json(samples_path, without_direct_reaction_contract(read_json(fixture / "samples.json")))
            write_current_approval(fixture / "workflow.json", approval_path, fixture / "approval.json")
            result = run_tool(
                "build-project",
                "--workflow",
                fixture / "workflow.json",
                "--approval",
                approval_path,
                "--samples",
                samples_path,
                "--output",
                temporary_path / "project",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("Direct Reaction", result.stderr)

    def test_report_leads_with_supplied_context_and_direct_reaction(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-report-order-") as temporary:
            project = self.build_quick_project(samples, Path(temporary))
            report = (project / "reports" / "report-golden-quick-001.md").read_text(encoding="utf-8")
            opening = report.split("## Direct Reaction", 1)[0]
            self.assertIn(SOURCE_TEXT, opening)
            self.assertIn(QUESTION, opening)
            self.assertIn(PERSONA_LABEL, opening)
            self.assertNotIn("## Trace", report)
            self.assertNotRegex(opening, r"[a-f0-9]{64}")
            self.assertLess(report.index("## Supplied context"), report.index("## Direct Reaction"))
            self.assertIn(DIRECT_REACTION, markdown_section(report, "Direct Reaction"))
            run = read_json(project / "runs" / "run-golden-quick-001.json")
            self.assertRegex(run["executionPlan"]["planHash"], r"^[a-f0-9]{64}$")
            self.assertEqual(run["samples"][0]["parsedResult"]["directReaction"], DIRECT_REACTION)

    def test_report_separates_persona_recommendations_from_system_suggestions(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-provenance-") as temporary:
            project = self.build_quick_project(samples, Path(temporary))
            report = (project / "reports" / "report-golden-quick-001.md").read_text(encoding="utf-8")
            persona_section = markdown_section(report, "Persona Recommendations")
            analysis_section = markdown_section(report, "Structured analysis")
            self.assertIn(PERSONA_RECOMMENDATION, persona_section)
            self.assertNotIn(SYSTEM_SUGGESTION, persona_section)
            self.assertIn(SYSTEM_SUGGESTION, analysis_section)
            self.assertNotIn(PERSONA_RECOMMENDATION, analysis_section)
            self.assertLess(report.index("## Persona Recommendations"), report.index("## Structured analysis"))
            self.assertIn("System Suggestions", analysis_section)
            self.assertIsNone(re.search(r"^## Recommendations\s*$", report, flags=re.MULTILINE))
            parsed = read_json(project / "runs" / "run-golden-quick-001.json")["samples"][0]["parsedResult"]
            self.assertEqual(parsed["personaRecommendations"], [PERSONA_RECOMMENDATION])
            self.assertEqual(parsed["systemSuggestions"], [SYSTEM_SUGGESTION])
            self.assertNotIn("recommendations", parsed)

    def test_unlabeled_recommendations_are_not_persona_recommendations(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"), keep_unlabeled=True)
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-unlabeled-") as temporary:
            project = self.build_quick_project(samples, Path(temporary))
            report = (project / "reports" / "report-golden-quick-001.md").read_text(encoding="utf-8")
            persona_section = markdown_section(report, "Persona Recommendations")
            self.assertIn(PERSONA_RECOMMENDATION, persona_section)
            self.assertNotIn(UNLABELED_LEGACY_RECOMMENDATION, persona_section)
            self.assertIsNone(re.search(r"^## Recommendations\s*$", report, flags=re.MULTILINE))
            parsed = read_json(project / "runs" / "run-golden-quick-001.json")["samples"][0]["parsedResult"]
            self.assertEqual(parsed["recommendations"], [UNLABELED_LEGACY_RECOMMENDATION])
            self.assertEqual(parsed["personaRecommendations"], [PERSONA_RECOMMENDATION])

    def test_report_references_shared_methodology_instead_of_repeating_limits(self) -> None:
        fixture = FIXTURES / "golden-quick"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-methodology-") as temporary:
            project = self.build_quick_project(samples, Path(temporary))
            methodology = project / "methodology.md"
            report = (project / "reports" / "report-golden-quick-001.md").read_text(encoding="utf-8")
            self.assertTrue(methodology.is_file())
            methodology_text = methodology.read_text(encoding="utf-8")
            self.assertIn("methodology.md", report)
            self.assertNotIn("## Method limits", report)
            for bullet in REPEATED_METHOD_LIMITS:
                self.assertNotIn(bullet, report)
                self.assertIn(bullet, methodology_text)
            self.assertIn("AI simulation — not a real quote", report)
            self.assertIn("Persona Recommendations", methodology_text)
            self.assertIn("System Suggestions", methodology_text)
            self.assertLess(report.index("## Direct Reaction"), report.index("## Details"))

    def test_prompt_contract_requests_direct_reaction_and_recommendation_provenance(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-prompt-") as temporary:
            preflight_path = Path(temporary) / "preflight.json"
            rendered = run_tool(
                "render-preflight",
                "--workflow",
                fixture / "workflow.json",
                "--output",
                preflight_path,
            )
            self.assert_success(rendered)
            sections = read_json(preflight_path)["outbound"]["promptSections"]
            self.assertIn("directReaction", sections["outputSchema"])
            self.assertIn("personaRecommendations", sections["outputSchema"])
            self.assertIn("systemSuggestions", sections["outputSchema"])
            self.assertNotIn('"recommendations"', sections["outputSchema"])
            self.assertIn("Direct Reaction", sections["systemAndTaskRules"])
            self.assertIn("Persona Recommendations", sections["systemAndTaskRules"])
            self.assertIn("System Suggestions", sections["systemAndTaskRules"])

    def build_variant_quick_project(self, temporary_path: Path, suffix: str, *, concern: str, recommendation: str) -> Path:
        fixture = FIXTURES / "golden-quick"
        workflow = read_json(fixture / "workflow.json")
        workflow["project"]["projectId"] = f"project-{suffix}"
        workflow["project"]["title"] = suffix
        workflow["persona"]["id"] = f"persona-version-{suffix}"
        workflow["persona"]["personaId"] = f"persona-{suffix}"
        workflow["persona"]["label"] = f"分析師 {suffix}"
        workflow["execution"]["runId"] = f"run-{suffix}"
        workflow["execution"]["reportId"] = f"report-{suffix}"
        samples = with_new_result_contract(read_json(fixture / "samples.json"))
        samples["runId"] = f"run-{suffix}"
        samples["samples"][0]["sampleId"] = f"run-{suffix}-sample-001"
        samples["samples"][0]["parsedResult"]["concerns"] = [concern]
        samples["samples"][0]["parsedResult"]["personaRecommendations"] = [recommendation]
        workflow_path = temporary_path / f"workflow-{suffix}.json"
        samples_path = temporary_path / f"samples-{suffix}.json"
        approval_path = temporary_path / f"approval-{suffix}.json"
        write_json(workflow_path, workflow)
        write_json(samples_path, samples)
        write_current_approval(workflow_path, approval_path, fixture / "approval.json")
        project = temporary_path / suffix
        built = run_tool(
            "build-project",
            "--workflow",
            workflow_path,
            "--approval",
            approval_path,
            "--samples",
            samples_path,
            "--output",
            project,
        )
        self.assert_success(built)
        return project

    def write_selection(self, path: Path, projects: list[Path], suffixes: list[str]) -> None:
        write_json(
            path,
            {
                "schemaVersion": "0.0",
                "project": {
                    "projectId": "project-synthesis-001",
                    "title": "綜整測試",
                    "description": "Synthetic synthesis fixture",
                    "locale": "zh-TW",
                    "createdAt": "2026-08-23T03:00:00Z",
                },
                "execution": {
                    "runId": "run-synthesis-001",
                    "reportId": "report-synthesis-001",
                    "createdAt": "2026-08-23T03:10:00Z",
                    "startedAt": "2026-08-23T03:11:00Z",
                    "completedAt": "2026-08-23T03:12:00Z",
                    "preflightCreatedAt": "2026-08-23T03:09:00Z",
                    "skillVersion": "0.0.0",
                    "provider": "agent-host",
                    "model": "fixture-agent-model",
                    "endpointClass": "local-test-fixture",
                },
                "selected": [
                    {
                        "projectDirectory": str(project),
                        "runId": f"run-{suffix}",
                        "sampleId": f"run-{suffix}-sample-001",
                    }
                    for project, suffix in zip(projects, suffixes)
                ],
            },
        )

    def attributed_synthesis(self, suffixes: list[str]) -> dict:
        sample_ids = [f"run-{suffix}-sample-001" for suffix in suffixes]
        return {
            "schemaVersion": "0.0",
            "runId": "run-synthesis-001",
            "startedAt": "2026-08-23T03:11:00Z",
            "completedAt": "2026-08-23T03:12:00Z",
            "latencyMs": 0,
            "rawProviderResponse": {"text": "跨 Persona 綜整：有條件支持試辦，但人力配套做法不同。"},
            "parsedResult": {
                "consensus": [
                    {
                        "claim": "有條件支持三區試辦。",
                        "supportingSampleIds": sample_ids,
                    }
                ],
                "disagreements": [
                    {
                        "topic": "人力配套",
                        "views": [
                            {
                                "claim": "建議-alpha",
                                "supportingSampleIds": ["run-alpha-sample-001"],
                            },
                            {
                                "claim": "建議-beta",
                                "supportingSampleIds": ["run-beta-sample-001"],
                            },
                        ],
                    }
                ],
                "uniqueViews": [
                    {
                        "claim": "另一個風險。",
                        "supportingSampleIds": ["run-beta-sample-001"],
                        "personaVersionId": "persona-version-beta",
                    }
                ],
                "validationState": "valid",
            },
            "validationWarnings": [],
            "providerUsage": {"reported": False, "note": "fixture"},
        }

    def test_synthesis_requires_at_least_two_explicit_selections(self) -> None:
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-synth-one-") as temporary:
            temporary_path = Path(temporary)
            alpha = self.build_variant_quick_project(
                temporary_path, "alpha", concern="計畫尚未說明新增人力來源。", recommendation="建議-alpha"
            )
            selection_path = temporary_path / "selection.json"
            self.write_selection(selection_path, [alpha], ["alpha"])
            result = run_tool(
                "render-synthesis-preflight",
                "--selection",
                selection_path,
                "--output",
                temporary_path / "preflight.json",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("at least 2", result.stderr)

    def test_synthesis_rejects_unattributed_claim(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-synth-attr-") as temporary:
            temporary_path = Path(temporary)
            alpha = self.build_variant_quick_project(
                temporary_path, "alpha", concern="計畫尚未說明新增人力來源。", recommendation="建議-alpha"
            )
            beta = self.build_variant_quick_project(
                temporary_path, "beta", concern="另一個風險。", recommendation="建議-beta"
            )
            selection_path = temporary_path / "selection.json"
            self.write_selection(selection_path, [alpha, beta], ["alpha", "beta"])
            preflight_path = temporary_path / "preflight.json"
            rendered = run_tool(
                "render-synthesis-preflight",
                "--selection",
                selection_path,
                "--output",
                preflight_path,
            )
            self.assert_success(rendered)
            approval_path = temporary_path / "approval.json"
            write_current_synthesis_approval(selection_path, approval_path, fixture / "approval.json")
            synthesis = self.attributed_synthesis(["alpha", "beta"])
            synthesis["parsedResult"]["consensus"].append(
                {"claim": "全體專家都無條件支持立即全面上路。", "supportingSampleIds": []}
            )
            synthesis_path = temporary_path / "synthesis.json"
            write_json(synthesis_path, synthesis)
            result = run_tool(
                "build-synthesis-project",
                "--selection",
                selection_path,
                "--approval",
                approval_path,
                "--synthesis",
                synthesis_path,
                "--output",
                temporary_path / "synthesis-project",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("supportingSampleIds", result.stderr)

    def test_synthesis_project_attributes_claims_and_leaves_sources_untouched(self) -> None:
        fixture = FIXTURES / "golden-quick"
        with tempfile.TemporaryDirectory(prefix="opinion-simulator-synth-ok-") as temporary:
            temporary_path = Path(temporary)
            alpha = self.build_variant_quick_project(
                temporary_path, "alpha", concern="計畫尚未說明新增人力來源。", recommendation="建議-alpha"
            )
            beta = self.build_variant_quick_project(
                temporary_path, "beta", concern="另一個風險。", recommendation="建議-beta"
            )
            alpha_before = tree_bytes(alpha)
            beta_before = tree_bytes(beta)
            selection_path = temporary_path / "selection.json"
            self.write_selection(selection_path, [alpha, beta], ["alpha", "beta"])
            preflight_path = temporary_path / "preflight.json"
            rendered = run_tool(
                "render-synthesis-preflight",
                "--selection",
                selection_path,
                "--output",
                preflight_path,
            )
            self.assert_success(rendered)
            preflight = read_json(preflight_path)
            self.assertEqual(len(preflight["outbound"]["selectedResults"]), 2)
            self.assertIn("consensus", preflight["outbound"]["promptSections"]["outputSchema"])
            approval_path = temporary_path / "approval.json"
            write_current_synthesis_approval(selection_path, approval_path, fixture / "approval.json")
            synthesis_path = temporary_path / "synthesis.json"
            write_json(synthesis_path, self.attributed_synthesis(["alpha", "beta"]))
            project = temporary_path / "synthesis-project"
            built = run_tool(
                "build-synthesis-project",
                "--selection",
                selection_path,
                "--approval",
                approval_path,
                "--synthesis",
                synthesis_path,
                "--output",
                project,
            )
            self.assert_success(built)
            self.assertEqual(tree_bytes(alpha), alpha_before)
            self.assertEqual(tree_bytes(beta), beta_before)
            evidence = json.loads(built.stdout)
            self.assertEqual(evidence["status"], "valid")
            run = read_json(project / "runs" / "run-synthesis-001.json")
            self.assertEqual(run["kind"], "synthesis")
            self.assertIsNotNone(run["synthesisAttribution"])
            self.assertEqual(
                run["samples"][0]["parsedResult"]["consensus"][0]["supportingSampleIds"],
                ["run-alpha-sample-001", "run-beta-sample-001"],
            )
            report = (project / "reports" / "report-synthesis-001.md").read_text(encoding="utf-8")
            self.assertIn("AI simulation — not a real quote", report)
            self.assertIn("## Consensus", report)
            self.assertIn("有條件支持三區試辦。", report)
            self.assertIn("分析師 alpha", report)
            self.assertIn("分析師 beta", report)
            self.assertIn("## Disagreements", report)
            self.assertIn("## Unique views", report)
            self.assertNotIn("## Trace", report.split("## Consensus", 1)[0])
            self.assertIn("methodology.md", report)
            validated = run_tool("validate-project", project)
            self.assert_success(validated)
            self.assertEqual(json.loads(validated.stdout)["status"], "valid")


def write_current_synthesis_approval(selection_path: Path, approval_path: Path, base_approval: Path) -> None:
    preflight_path = approval_path.parent / "synthesis-preflight.json"
    rendered = run_tool(
        "render-synthesis-preflight",
        "--selection",
        selection_path,
        "--output",
        preflight_path,
    )
    if rendered.returncode != 0:
        raise AssertionError(rendered.stderr)
    approval = read_json(base_approval)
    approval["runId"] = "run-synthesis-001"
    approval["planHash"] = read_json(preflight_path)["planHash"]
    write_json(approval_path, approval)


if __name__ == "__main__":
    unittest.main()
