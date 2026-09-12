#!/usr/bin/env python3
"""Opinion Simulator v0.0 Skill CLI (reconstructed).

Rebuilt after the 2026-08-24 accidental repository deletion, guided by the
surviving public test suite (tests/skill/test_opinion_simulator.py) and the
byte-exact golden fixtures under tests/skill/fixtures/v0.0/.

Standard library only. No network access. No credential input.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

SCHEMA_DIR = Path(__file__).resolve().parents[4] / "schemas" / "v0.0"

DISCLAIMER = (
    "AI simulation — not a real quote. AI 模擬——不是真實引言。 This output is a "
    "model-generated prediction conditioned on the supplied Persona and Source. "
    "It is not evidence of what any real person or group actually thinks."
)

# New plans use one fixed order: repeated/static sections come first
# (system rules, output schema, model/sampling), followed by the per-Run
# Persona, questions, and Source sections. Stored Projects remain readable.
TEMPLATE_ID = "default-persona-simulation"
TEMPLATE_VERSION = 2

# Canonical sent-prompt section order, shared with the desktop providers
# (packages/core assemblePrompt). Keys refer to renderedPromptSections.
PROMPT_SECTION_ORDER = (
    "systemAndTaskRules",
    "outputSchema",
    "modelAndSampling",
    "persona",
    "questions",
    "sourceMaterial",
)


def build_prompt(sections: dict) -> str:
    missing = [key for key in PROMPT_SECTION_ORDER if not sections.get(key)]
    if missing:
        raise fail(f"prompt sections missing: {', '.join(missing)}")
    return "\n\n".join(sections[key] for key in PROMPT_SECTION_ORDER)

SYSTEM_AND_TASK_RULES = "\n".join(
    [
        "Predict a possible response conditioned only on the confirmed Persona and supplied Source.",
        "Lead with a natural-language Direct Reaction in the confirmed Persona's voice.",
        "Do not add missing Persona facts or present the output as a real quotation.",
        "Put simulated Persona Recommendations and System Suggestions in separate fields; never merge them into one unlabeled list.",
        "Separate source-supported observations from assumptions and uncertainty.",
        "Return the requested structured Result. Preserve the user's question language.",
    ]
)

TEMPLATE_CONTENT_HASH = hashlib.sha256(SYSTEM_AND_TASK_RULES.encode("utf-8")).hexdigest()

WARNINGS = [
    "v0.0 agent-host prototype: no desktop credential vault, persistent queue, or signed application boundary.",
    "The estimate is a disclosed character-count heuristic, not provider billing data.",
]

COMPARISON_FIELDS = [
    "concerns",
    "directReaction",
    "personaRecommendations",
    "position",
    "reasons",
    "systemSuggestions",
]

CREDENTIAL_KEY_PATTERN = re.compile(
    r"(api[_-]?key|token|secret|password|authorization|cookie|credential)", re.IGNORECASE
)


class ToolError(Exception):
    pass


def compact_json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_canonical(value) -> str:
    return hashlib.sha256(compact_json_bytes(value)).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def fail(message: str) -> "ToolError":
    return ToolError(f"ERROR: {message}")


# ---------------------------------------------------------------------------
# Prompt rendering
# ---------------------------------------------------------------------------

def output_schema_section() -> str:
    schema_text = {
        "answers": [{"answer": "string", "question": "exact user question"}],
        "assumptions": ["string"],
        "concerns": ["string"],
        "directReaction": "natural-language Persona reaction",
        "personaRecommendations": ["string"],
        "position": "string",
        "reasons": ["string"],
        "sourceMappings": [
            {
                "excerpt": "exact text from SOURCE MATERIAL",
                "sourceId": "sourceId from SOURCE MATERIAL",
                "supports": "claim",
            }
        ],
        "systemSuggestions": ["string"],
        "uncertainties": ["string"],
        "validationState": "valid | partial | invalid",
    }
    return json.dumps(schema_text, ensure_ascii=False, sort_keys=True, indent=2)


def persona_prompt_section(persona: dict) -> str:
    accepted = [item for item in persona.get("inferences", []) if item.get("decision") == "accepted"]
    payload = {
        "personaVersionId": persona["id"],
        "label": persona["label"],
        "fields": persona["fields"],
        "notProvidedFields": persona["notProvidedFields"],
        "acceptedInferences": accepted,
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2)


def questions_section(question_set: dict) -> str:
    lines = [f"{index}. {question}" for index, question in enumerate(question_set["questions"], start=1)]
    instructions = question_set.get("responseInstructions") or ""
    if instructions:
        lines.append("")
        lines.append(f"Response instructions: {instructions}")
    return "\n".join(lines)


def model_sampling_section(workflow: dict) -> str:
    execution = workflow["execution"]
    payload = {
        "provider": execution["provider"],
        "model": execution["model"],
        "sampleCount": execution["sampleCount"],
        "settings": execution["settings"],
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2)


def render_prompt_sections(workflow: dict) -> dict:
    sections = {
        "systemAndTaskRules": SYSTEM_AND_TASK_RULES,
        "persona": persona_prompt_section(workflow["persona"]),
        "sourceMaterial": (
            f"SOURCE-ID: {workflow['source']['sourceId']}\n"
            f"SOURCE-TEXT:\n{workflow['source']['text']}"
        ),
        "questions": questions_section(workflow["questionSet"]),
        "outputSchema": output_schema_section(),
        "modelAndSampling": model_sampling_section(workflow),
    }
    return {key: sections[key] for key in sorted(sections)}


def finalize_persona(persona: dict) -> dict:
    body = {key: value for key, value in persona.items() if key != "contentHash"}
    return {**body, "contentHash": sha256_canonical(body)}


def make_plan(workflow: dict) -> tuple[dict, str]:
    persona = finalize_persona(workflow["persona"])
    execution = workflow["execution"]
    sample_count = execution["sampleCount"]
    if not isinstance(sample_count, int) or isinstance(sample_count, bool) or not 1 <= sample_count <= 10:
        raise fail("sampleCount must be an integer from 1 through 10")
    sections = render_prompt_sections(workflow)
    characters = sum(len(text) for text in sections.values())
    estimate = {
        "inputCharactersPerRequest": characters,
        "approximateInputTokensPerRequest": math.ceil(characters / 4),
        "method": "character-count-divided-by-four; non-billing heuristic",
        "requestCount": sample_count,
    }
    run_id = execution["runId"]
    plan = {
        "sourceRefs": [{"sourceId": workflow["source"]["sourceId"], "sha256": sha256_canonical_text(workflow)}],
        "personaRefs": [
            {
                "personaId": persona["personaId"],
                "personaVersionId": persona["id"],
                "version": persona["version"],
                "contentHash": persona["contentHash"],
            }
        ],
        "questionSet": workflow["questionSet"],
        "promptTemplate": {
            "id": TEMPLATE_ID,
            "version": TEMPLATE_VERSION,
            "contentHash": TEMPLATE_CONTENT_HASH,
        },
        "renderedPromptSections": sections,
        "provider": execution["provider"],
        "model": execution["model"],
        "endpointClass": execution["endpointClass"],
        "settings": execution["settings"],
        "sampleCount": sample_count,
        "sampleIds": [f"{run_id}-sample-{index:03d}" for index in range(1, sample_count + 1)],
        "truncation": execution["truncation"],
        "estimate": estimate,
    }
    plan_hash = sha256_canonical(plan)
    plan["planHash"] = plan_hash
    return plan, plan_hash


def sha256_canonical_text(workflow: dict) -> str:
    return sha256_bytes(workflow["source"]["text"].encode("utf-8"))


def preflight_view(workflow: dict, plan: dict, plan_hash: str) -> dict:
    persona = finalize_persona(workflow["persona"])
    pending = [item for item in persona.get("inferences", []) if item.get("decision") == "pending"]
    if pending:
        raise fail("a proposed inference has no final user decision (pending); ask the user to accept or reject it")
    real_person = persona.get("review", {}).get("realPerson", {})
    view = {
        "schemaVersion": "0.0",
        "approvalStatus": "pending",
        "createdAt": workflow["execution"]["preflightCreatedAt"],
        "runId": workflow["execution"]["runId"],
        "sampleCount": plan["sampleCount"],
        "sampleIds": plan["sampleIds"],
        "destination": {
            "provider": plan["provider"],
            "model": plan["model"],
            "endpointClass": plan["endpointClass"],
        },
        "estimate": plan["estimate"],
        "outbound": {
            "source": {
                "sourceId": workflow["source"]["sourceId"],
                "filename": workflow["source"]["filename"],
                "text": workflow["source"]["text"],
                "sha256": plan["sourceRefs"][0]["sha256"],
            },
            "personaVersion": persona,
            "promptSections": plan["renderedPromptSections"],
        },
        "planHash": plan_hash,
        "predictionDisclaimer": DISCLAIMER,
        "requiresRealPersonReconfirmation": bool(real_person.get("applies")),
        "truncation": plan["truncation"],
        "warnings": WARNINGS,
    }
    return view


# ---------------------------------------------------------------------------
# Validation of inputs before build
# ---------------------------------------------------------------------------

def assert_safe_raw_response(sample: dict, index: int) -> None:
    def walk(node, path):
        if isinstance(node, dict):
            for key, value in node.items():
                if CREDENTIAL_KEY_PATTERN.search(str(key)):
                    raise fail(
                        f"samples[{index}] rawProviderResponse field at {path} uses a prohibited credential-shaped key name; "
                        "remove it before building"
                    )
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for position, item in enumerate(node):
                walk(item, f"{path}[{position}]")

    walk(sample.get("rawProviderResponse"), "$")


def assert_exact_mappings(sample: dict, index: int, source_text: str) -> None:
    for position, mapping in enumerate(sample.get("parsedResult", {}).get("sourceMappings", [])):
        excerpt = mapping.get("excerpt", "")
        if excerpt not in source_text:
            raise fail(
                f"samples[{index}] sourceMappings[{position}] excerpt is not exact Source text; "
                "copy the excerpt character-for-character from the Source"
            )


def assert_result_contract(parsed: dict) -> None:
    if not isinstance(parsed.get("directReaction"), str) or not parsed.get("directReaction", "").strip():
        raise fail(
            "parsedResult is missing the required natural-language Direct Reaction field; "
            "the current contract needs directReaction plus labelled personaRecommendations/systemSuggestions"
        )
    if "personaRecommendations" not in parsed or "systemSuggestions" not in parsed:
        raise fail(
            "parsedResult needs separate personaRecommendations and systemSuggestions fields; "
            "one unlabeled recommendations list cannot express provenance"
        )


def check_approval(approval: dict, workflow: dict, plan_hash: str) -> None:
    if approval.get("planHash") != plan_hash:
        raise fail("the stored approval is stale: its planHash does not match the current plan; rerun Preflight")
    if approval.get("runId") != workflow["execution"]["runId"]:
        raise fail("approval runId does not match the workflow runId")
    if approval.get("acknowledgedDisclaimer") is not True:
        raise fail("approval must acknowledge the prediction disclaimer")
    persona = finalize_persona(workflow["persona"])
    real_person = persona.get("review", {}).get("realPerson", {})
    if real_person.get("applies") and approval.get("realPersonReconfirmed") is not True:
        raise fail("this Persona describes a real person and requires Preflight reconfirmation")


# ---------------------------------------------------------------------------
# Project writing
# ---------------------------------------------------------------------------

METHODOLOGY_TEXT = """# Opinion Simulator method limits

- Version: 0.0.1
- Applies to: v0.0 Skill Prototype

This file is the shared method-limits surface for this Project. Ordinary reports reference it instead of repeating these limits.

- Outputs are model-generated predictions conditioned on the supplied Persona and Source. They are not quotes, measurements, or evidence of what any real person or group actually thinks.
- Direct Reaction is a simulated natural-language response, not a real-person quote.
- Persona Recommendations belong to the simulated Persona voice. System Suggestions are AI-system analysis outside that voice.
- Agent-host prototype; no direct provider BYOK call was performed by the deterministic tool.
- Repeated Sample consistency is not calibrated confidence and is not real-human validation.
- The raw response and structured Result remain in the Run JSON for audit.
"""


def is_hidden(relative_path: Path) -> bool:
    return any(part.startswith(".") for part in relative_path.parts)


def canonical_files(root: Path) -> list[Path]:
    found = [
        path
        for path in root.rglob("*")
        if path.is_file() and not is_hidden(path.relative_to(root))
    ]
    return sorted(found, key=lambda path: path.relative_to(root).as_posix())


def write_checksums(project_dir: Path) -> None:
    lines = []
    for path in canonical_files(project_dir):
        relative = path.relative_to(project_dir).as_posix()
        if relative == "checksums.sha256":
            continue
        digest = sha256_bytes(path.read_bytes())
        lines.append(f"{digest}  {relative}")
    (project_dir / "checksums.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")


def normalize(text: str) -> str:
    return text.strip()


def scalar_or_list_items(result: dict, field: str) -> list[str]:
    value = result.get(field)
    if isinstance(value, str):
        return [value]
    return [str(item) for item in (value or [])]


def compare_stability(samples: list[dict]) -> dict:
    sample_ids = [sample["sampleId"] for sample in samples]
    consistent: list[dict] = []
    divergent: list[dict] = []

    for field in COMPARISON_FIELDS:
        if isinstance(samples[0]["parsedResult"].get(field), str):
            groups: dict[str, list[str]] = {}
            for sample in samples:
                groups.setdefault(normalize(str(sample["parsedResult"].get(field))), []).append(sample["sampleId"])
            for text in sorted(groups):
                entry = {"field": field, "text": text, "sampleIds": sorted(groups[text])}
                if len(groups[text]) == len(samples):
                    consistent.append(entry)
                else:
                    divergent.append(entry)
        else:
            per_sample: list[list[str]] = [
                [normalize(item) for item in scalar_or_list_items(sample["parsedResult"], field)]
                for sample in samples
            ]
            common: set[str] = set(per_sample[0])
            for values in per_sample[1:]:
                common &= set(values)
            for text in sorted(common):
                consistent.append({"field": field, "text": text, "sampleIds": sorted(sample_ids)})
            mixed: dict[str, list[str]] = {}
            for values in per_sample:
                for text in values:
                    if text in common:
                        continue
                    mixed.setdefault(text, [])
                    if sample_ids[per_sample.index(values)] not in mixed[text]:
                        mixed[text].append(sample_ids[per_sample.index(values)])
            for text in sorted(mixed):
                divergent.append({"field": field, "text": text, "sampleIds": sorted(mixed[text])})

    mapping_groups: dict[tuple[str, str], list[str]] = {}
    positions: dict[tuple[str, str], int] = {}
    for sample in samples:
        for mapping in sample["parsedResult"].get("sourceMappings", []):
            key = (mapping.get("sourceId", ""), normalize(mapping.get("excerpt", "")))
            positions.setdefault(key, sample["parsedResult"] and -1)
            mapping_groups.setdefault(key, [])
            if sample["sampleId"] not in mapping_groups[key]:
                mapping_groups[key].append(sample["sampleId"])

    differences = []
    source_text = ""
    for key, holders in mapping_groups.items():
        if len(holders) == len(samples):
            continue
        differences.append(key)
    differences.sort(key=lambda key: source_position(key))
    sourceMappingDifferences = [
        {"sourceId": key[0], "excerpt": key[1], "sampleIds": sorted(mapping_groups[key])}
        for key in differences
    ]

    return {
        "mode": "three-sample-exact-normalized-comparison" if len(samples) == 3 else "exact-normalized-comparison",
        "consistentThemes": consistent,
        "divergentThemes": divergent,
        "sourceMappingDifferences": sourceMappingDifferences,
        "anomalies": [],
        "limitation": (
            "Exact normalized text matching surfaces repetition and divergence but is not semantic "
            "equivalence or a numeric confidence measure."
        ),
    }


_SOURCE_HOLDER: dict = {}


def source_position(key) -> int:
    text = _SOURCE_HOLDER.get("text", "")
    excerpt = key[1]
    position = text.find(excerpt)
    return position if position >= 0 else len(text) + 1


def render_simulation_report(input_data: dict) -> str:
    disclaimer_line = f"> {DISCLAIMER}"
    lines: list[str] = [f"# {input_data['title']}", "", disclaimer_line, "", "## Supplied context", ""]
    lines += [f"- Persona: {input_data['persona_label']}", f"- Question Set: {input_data['question_title']}", ""]
    for number, question in enumerate(input_data["questions"], start=1):
        lines.append(f"{number}. {question}")
    lines += ["", "### Source", "", input_data["source_text"], ""]

    comparison = input_data.get("comparison")
    if comparison is None:
        result = input_data["results"][0]
        lines += [
            "## Direct Reaction",
            "",
            result.get("directReaction", ""),
            "",
            "## Persona Recommendations",
            "",
        ]
        lines += [f"- {item}" for item in result.get("personaRecommendations", [])]
        lines += ["", "## Structured analysis", "", "### Position", "", result.get("position", ""), "", "### Reasons", ""]
        lines += [f"- {item}" for item in result.get("reasons", [])]
        lines += ["", "### Concerns", ""]
        lines += [f"- {item}" for item in result.get("concerns", [])]
        lines += ["", "### System Suggestions", ""]
        lines += [f"- {item}" for item in result.get("systemSuggestions", [])]
        lines += ["", "### Assumptions and uncertainty", ""]
        lines += [f"- {item}" for item in result.get("assumptions", []) + result.get("uncertainties", [])]
        lines += ["", "### Source mappings", ""]
        for mapping in result.get("sourceMappings", []):
            lines.append(f"- `{mapping['sourceId']}`: \u201c{mapping['excerpt']}\u201d \u2192 {mapping['supports']}")
        lines += ["", "## Stability Comparison", "", "One-Sample quick mode does not produce a Stability Comparison."]
    else:
        for index, result in enumerate(input_data["results"], start=1):
            lines += [
                f"## Sample {index}",
                "",
                "### Direct Reaction",
                "",
                result.get("directReaction", ""),
                "",
                "### Persona Recommendations",
                "",
            ]
            lines += [f"- {item}" for item in result.get("personaRecommendations", [])]
            lines += ["", "### Structured analysis", "", "#### Position", "", result.get("position", ""), "", "#### Reasons", ""]
            lines += [f"- {item}" for item in result.get("reasons", [])]
            lines += ["", "#### Concerns", ""]
            lines += [f"- {item}" for item in result.get("concerns", [])]
            lines += ["", "#### System Suggestions", ""]
            lines += [f"- {item}" for item in result.get("systemSuggestions", [])]
            lines += ["", "#### Assumptions and uncertainty", ""]
            lines += [f"- {item}" for item in result.get("assumptions", []) + result.get("uncertainties", [])]
            lines += ["", "#### Source mappings", ""]
            for mapping in result.get("sourceMappings", []):
                lines.append(f"- `{mapping['sourceId']}`: \u201c{mapping['excerpt']}\u201d \u2192 {mapping['supports']}")
            lines.append("")
        lines += [
            "## Stability Comparison",
            "",
            "### Consistent themes",
            "",
        ]
        for theme in comparison["consistentThemes"]:
            lines.append(
                f"- **{theme['field']}** — {theme['text']} ({', '.join(theme['sampleIds'])})"
            )
        lines += ["", "### Divergent themes", ""]
        for theme in comparison["divergentThemes"]:
            lines.append(
                f"- **{theme['field']}** — {theme['text']} ({', '.join(theme['sampleIds'])})"
            )
        lines += ["", f"> {comparison['limitation']}"]

    lines += [
        "",
        "## Details",
        "",
        f"- Run record: `runs/{input_data['run_id']}.json`",
        f"- Method limits: `methodology.md` (version 0.0.1, sha256 `{input_data['methodology_hash']}`)",
        "",
    ]
    return "\n".join(lines)


def build_run_record(
    workflow: dict,
    plan: dict,
    plan_hash: str,
    approval: dict,
    samples: list[dict],
    comparison: dict | None,
) -> dict:
    execution = workflow["execution"]
    run_id = execution["runId"]
    persona = finalize_persona(workflow["persona"])
    record = {
        "schemaVersion": "0.0",
        "runId": run_id,
        "projectId": workflow["project"]["projectId"],
        "kind": "persona-simulation",
        "status": "completed",
        "createdAt": execution["createdAt"],
        "startedAt": execution["startedAt"],
        "completedAt": execution["completedAt"],
        "skillVersion": execution["skillVersion"],
        "executionPlan": {
            **plan,
            "planHash": plan_hash,
            "preflightApproval": approval,
        },
        "samples": [],
        "stabilityComparison": comparison
        or {"mode": "not-applicable", "reason": "One-Sample quick mode does not produce a Stability Comparison."},
        "synthesisAttribution": None,
        "report": {
            "reportId": execution["reportId"],
            "path": f"reports/{execution['reportId']}.md",
            "createdAt": execution["completedAt"],
            "generationMethod": "deterministic-v0.0",
            "disclaimer": DISCLAIMER,
        },
        "integrity": {
            "algorithm": "sha256",
            "planHash": plan_hash,
            "sourceHashes": {ref["sourceId"]: ref["sha256"] for ref in plan["sourceRefs"]},
            "personaContentHashes": {plan["personaRefs"][0]["personaVersionId"]: persona["contentHash"]},
            "templateContentHash": TEMPLATE_CONTENT_HASH,
        },
    }
    for sample in samples:
        record["samples"].append(
            {
                "sampleId": sample["sampleId"],
                "personaRef": plan["personaRefs"][0],
                "status": sample.get("status", "completed"),
                "attemptEvents": [
                    {
                        "attempt": 1,
                        "status": sample.get("status", "completed"),
                        "timestamp": sample["completedAt"],
                        "error": None,
                    }
                ],
                "normalizedRequest": {
                    "runId": run_id,
                    "sampleId": sample["sampleId"],
                    "planHash": plan_hash,
                    "provider": plan["provider"],
                    "model": plan["model"],
                },
                "normalizedResponse": {
                    "provider": plan["provider"],
                    "model": plan["model"],
                    "responseFormat": "structured-json",
                    "validationState": sample["parsedResult"].get("validationState"),
                },
                "rawProviderResponse": sample["rawProviderResponse"],
                "parsedResult": sample["parsedResult"],
                "validationWarnings": sample.get("validationWarnings", []),
                "providerUsage": sample.get("providerUsage", {}),
                "startedAt": sample["startedAt"],
                "completedAt": sample["completedAt"],
                "latencyMs": sample.get("latencyMs", 0),
            }
        )
    return record


def cmd_render_preflight(args) -> int:
    workflow = read_json(args.workflow)
    view = preflight_view(workflow, *make_plan(workflow))
    write_json(Path(args.output), view)
    print(json.dumps({"written": str(args.output), "planHash": view["planHash"]}, ensure_ascii=False, sort_keys=True))
    return 0


def cmd_build_project(args) -> int:
    output = Path(args.output)
    if output.exists():
        raise fail(
            f"output directory {output} already exists; never overwrite an existing Project, choose a new directory"
        )
    workflow = read_json(args.workflow)
    approval = read_json(args.approval)
    samples_doc = read_json(args.samples)

    plan, plan_hash = make_plan(workflow)
    preflight_view(workflow, plan, plan_hash)  # validates pending inferences / sample count
    check_approval(approval, workflow, plan_hash)

    if samples_doc.get("runId") != workflow["execution"]["runId"]:
        raise fail("samples runId does not match the workflow runId")
    expected_ids = plan["sampleIds"]
    actual_ids = [sample["sampleId"] for sample in samples_doc["samples"]]
    if actual_ids != expected_ids:
        raise fail("sample ids do not match the approved execution plan")

    source_text = workflow["source"]["text"]
    for index, sample in enumerate(samples_doc["samples"]):
        assert_safe_raw_response(sample, index)
        assert_exact_mappings(sample, index, source_text)
        assert_result_contract(sample["parsedResult"])

    _SOURCE_HOLDER["text"] = source_text
    comparison = compare_stability(samples_doc["samples"]) if len(samples_doc["samples"]) >= 2 else None

    output.mkdir(parents=False)
    persona = finalize_persona(workflow["persona"])
    write_json(output / "project.json", project_document(workflow, samples_doc))
    write_json(output / "personas.json", {"schemaVersion": "0.0", "drafts": [], "versions": [persona]})
    write_sources(output, workflow)
    methodology_path = output / "methodology.md"
    methodology_path.write_text(METHODOLOGY_TEXT, encoding="utf-8")
    methodology_hash = sha256_bytes(methodology_path.read_bytes())

    record = build_run_record(workflow, plan, plan_hash, approval, samples_doc["samples"], comparison)
    write_json(output / "runs" / f"{workflow['execution']['runId']}.json", record)

    report_input = {
        "title": workflow["project"]["title"],
        "persona_label": persona["label"],
        "question_title": workflow["questionSet"]["title"],
        "questions": workflow["questionSet"]["questions"],
        "source_text": source_text,
        "results": [sample["parsedResult"] for sample in samples_doc["samples"]],
        "comparison": comparison,
        "run_id": workflow["execution"]["runId"],
        "methodology_hash": methodology_hash,
    }
    report = render_simulation_report(report_input)
    report_path = output / "reports" / f"{workflow['execution']['reportId']}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")

    write_checksums(output)
    print(
        json.dumps(
            {
                "output": str(output),
                "samplesChecked": len(samples_doc["samples"]),
                "liveProviderCalls": "none",
                "planHash": plan_hash,
                "filesWritten": len(canonical_files(output)),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


def project_document(workflow: dict, samples_doc: dict | None = None) -> dict:
    execution = workflow["execution"]
    return {
        "schemaVersion": "0.0",
        "projectId": workflow["project"]["projectId"],
        "title": workflow["project"]["title"],
        "description": workflow["project"]["description"],
        "locale": workflow["project"]["locale"],
        "createdAt": workflow["project"]["createdAt"],
        "updatedAt": execution["completedAt"],
        "sourceIds": [workflow["source"]["sourceId"]],
        "currentPersonaVersionIds": [finalize_persona(workflow["persona"])["id"]],
        "questionSets": [workflow["questionSet"]],
        "promptTemplateVersions": [
            {"id": TEMPLATE_ID, "version": TEMPLATE_VERSION, "contentHash": TEMPLATE_CONTENT_HASH}
        ],
        "runIds": [execution["runId"]],
        "reportIds": [execution["reportId"]],
        "compatibility": {
            "writer": "opinion-simulator-skill",
            "writerVersion": "0.0.0",
            "minimumReaderVersion": "0.0",
        },
    }


def write_sources(output: Path, workflow: dict) -> None:
    source = workflow["source"]
    text = source["text"].replace("\r\n", "\n")
    index = {
        "schemaVersion": "0.0",
        "sources": [
            {
                "sourceId": source["sourceId"],
                "filename": source["filename"],
                "mediaType": source["mediaType"],
                "provenance": {"kind": "pasted-text", "recordedAt": source["recordedAt"]},
                "extraction": {"method": "pasted-text", "version": "0.0", "lineEndings": "LF"},
                "warnings": [],
                "textSha256": sha256_bytes(text.encode("utf-8")),
                "originalCopied": False,
            }
        ],
    }
    write_json(output / "sources" / "index.json", index)
    (output / "sources" / f"{source['sourceId']}.txt").write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Published-schema validation (JSON Schema subset)
# ---------------------------------------------------------------------------

def load_schema(name: str) -> dict:
    return read_json(SCHEMA_DIR / name)


def resolve_ref(ref: str) -> dict:
    target_name = ref.split("/")[-1]
    return SCHEMAS.setdefault(target_name, load_schema(target_name))


SCHEMAS: dict[str, dict] = {}


def validate_against_schema(value, schema: dict, path: str, errors: list[str]) -> None:
    if "$ref" in schema:
        validate_against_schema(value, resolve_ref(schema["$ref"]), path, errors)
        return
    if "oneOf" in schema:
        matches = 0
        for branch in schema["oneOf"]:
            local: list[str] = []
            validate_against_schema(value, branch, path, local)
            if not local:
                matches += 1
        if matches != 1:
            errors.append(f"{path}: value matches {matches} branches of oneOf; exactly one is required")
        return
    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(value, dict):
            errors.append(f"{path}: expected object")
            return
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required property '{key}'")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{path}: property '{key}' is not allowed by the published schema")
        for key, child in value.items():
            if key in properties:
                validate_against_schema(child, properties[key], f"{path}.{key}", errors)
    elif expected_type == "array":
        if not isinstance(value, list):
            errors.append(f"{path}: expected array")
            return
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: fewer than {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: more than {schema['maxItems']} items")
        if schema.get("uniqueItems") and len(value) != len({compact_json_bytes(item) for item in map(lambda v: v, value)}):
            errors.append(f"{path}: items are not unique")
        item_schema = schema.get("items")
        if item_schema:
            for position, item in enumerate(value):
                validate_against_schema(item, item_schema, f"{path}[{position}]", errors)
    elif expected_type == "string":
        if not isinstance(value, str):
            errors.append(f"{path}: expected string")
            return
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: shorter than minLength {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: does not match pattern {schema['pattern']}")
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"{path}: expected integer")
    elif expected_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            errors.append(f"{path}: expected number")
    elif expected_type == "boolean":
        if not isinstance(value, bool):
            errors.append(f"{path}: expected boolean")
    elif expected_type == "null":
        if value is not None:
            errors.append(f"{path}: expected null")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: must equal {json.dumps(schema['const'], ensure_ascii=False)}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: must be one of {json.dumps(schema['enum'], ensure_ascii=False)}")


def validate_project_directory(directory: Path) -> tuple[dict, list[str]]:
    errors: list[str] = []
    if not directory.is_dir():
        raise fail(f"{directory} is not a directory")
    files = canonical_files(directory)
    checksum_path = directory / "checksums.sha256"
    recorded: dict[str, str] = {}
    if checksum_path.is_file():
        for line in checksum_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            digest, _, relative = line.partition("  ")
            recorded[relative] = digest
    walked = {path.relative_to(directory).as_posix(): path for path in files}
    for relative, path in walked.items():
        if relative == "checksums.sha256":
            continue
        digest = sha256_bytes(path.read_bytes())
        expected = recorded.get(relative)
        if expected is None:
            errors.append(f"ERROR: {relative} has no recorded checksum")
        elif expected != digest:
            if relative.startswith("sources/"):
                errors.append(f"ERROR: Source hash mismatch for {relative}")
            else:
                errors.append(f"ERROR: Checksum mismatch for {relative}")

    SCHEMAS.clear()
    for document, schema_name, label in [
        ("project.json", "project.schema.json", "Project"),
        ("personas.json", "personas.schema.json", "Personas"),
        ("sources/index.json", "source-index.schema.json", "Source index"),
    ]:
        if document in walked:
            local: list[str] = []
            validate_against_schema(read_json(walked[document]), load_schema(schema_name), document, local)
            errors.extend(f"ERROR: {entry}" for entry in local)

    project = read_json(walked["project.json"]) if "project.json" in walked else {}
    question_sets = {qs.get("id"): qs for qs in project.get("questionSets", [])}
    samples_checked = 0
    runs_checked = 0
    for run_id in project.get("runIds", []):
        run_relative = f"runs/{run_id}.json"
        if run_relative not in walked:
            errors.append(f"ERROR: Run {run_id} is referenced by project.json but missing")
            continue
        runs_checked += 1
        run = read_json(walked[run_relative])
        local: list[str] = []
        validate_against_schema(run, load_schema("run-record.schema.json"), run_relative, local)
        errors.extend(f"ERROR: {entry}" for entry in local)
        if run.get("projectId") != project.get("projectId"):
            errors.append(f"ERROR: {run_relative} projectId does not match project.json")
        for sample in run.get("samples", []):
            samples_checked += 1
            parsed = sample.get("parsedResult", {})
            if "consensus" in parsed:
                continue
            state = parsed.get("validationState")
            if state == "valid":
                answered = [answer.get("question") for answer in parsed.get("answers", [])]
                plan_questions = run.get("executionPlan", {}).get("questionSet", {}).get("questions", [])
                if answered != plan_questions:
                    errors.append(
                        f"ERROR: Run {run_id} Sample {sample.get('sampleId')} answers must answer every Question "
                        "in order when validationState is valid"
                    )
    for report_id in project.get("reportIds", []):
        if f"reports/{report_id}.md" not in walked:
            errors.append(f"ERROR: Report {report_id} is referenced by project.json but missing")
    version_ids = {version.get("id") for version in read_json(walked["personas.json"]).get("versions", [])} \
        if "personas.json" in walked else set()
    for persona_version_id in project.get("currentPersonaVersionIds", []):
        if persona_version_id not in version_ids:
            errors.append(f"ERROR: Persona Version {persona_version_id} is referenced by project.json but missing")

    if "sources/index.json" in walked and "sources" in [p.parent.name for p in files]:
        index = read_json(walked["sources/index.json"])
        indexed_ids = {entry.get("sourceId") for entry in index.get("sources", [])}
        for source_id in project.get("sourceIds", []):
            if source_id not in indexed_ids:
                errors.append(f"ERROR: Source {source_id} is referenced by project.json but missing from the index")
        for entry in index.get("sources", []):
            source_file = walked.get(f"sources/{entry.get('sourceId')}.txt")
            if source_file is None:
                errors.append(f"ERROR: Source file for {entry.get('sourceId')} is missing")
                continue
            digest = sha256_bytes(source_file.read_bytes())
            if digest != entry.get("textSha256"):
                errors.append(f"ERROR: Source hash mismatch for sources/{entry.get('sourceId')}.txt")

    evidence = {
        "schemaVersion": "0.0",
        "status": "valid" if not errors else "invalid",
        "projectDirectory": str(directory),
        "projectId": project.get("projectId"),
        "title": project.get("title"),
        "filesChecked": sum(1 for path in files if path.name != "checksums.sha256"),
        "runsChecked": runs_checked,
        "samplesChecked": samples_checked,
    }
    return evidence, errors


def cmd_validate_project(args) -> int:
    evidence, errors = validate_project_directory(Path(args.project))
    if errors:
        for line in errors:
            print(line, file=sys.stderr)
        evidence["errors"] = len(errors)
        print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
        return 2
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    return 0


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

SYNTHESIS_OUTPUT_SCHEMA = json.dumps(
    {
        "consensus": [{"claim": "string", "supportingSampleIds": ["selected sample ids", "at least two"]}],
        "disagreements": [
            {
                "topic": "string",
                "views": [{"claim": "string", "supportingSampleIds": ["sample id"]}],
            }
        ],
        "uniqueViews": [
            {"claim": "string", "supportingSampleIds": ["exactly one sample id"], "personaVersionId": "string"}
        ],
        "validationState": "valid | partial | invalid",
    },
    ensure_ascii=False,
    sort_keys=True,
    indent=2,
)


def load_selection(selection_path: Path) -> dict:
    selection = read_json(selection_path)
    chosen = selection.get("selected", [])
    if len(chosen) < 2:
        raise fail("synthesis requires explicit selection of at least 2 Samples; this is not a group quotation")
    return selection


def load_selected_samples(selection: dict) -> list[dict]:
    loaded = []
    source_hashes: set[str] = set()
    for item in selection["selected"]:
        directory = Path(item["projectDirectory"])
        project = read_json(directory / "project.json")
        run = read_json(directory / "runs" / f"{item['runId']}.json")
        sample = next((s for s in run["samples"] if s["sampleId"] == item["sampleId"]), None)
        if sample is None:
            raise fail(f"selection references unknown Sample {item['sampleId']} in {directory}")
        source_entry = read_json(directory / "sources" / "index.json")["sources"][0]
        source_hashes.add(source_entry["textSha256"])
        personas = read_json(directory / "personas.json")["versions"]
        persona_version = next(
            (v for v in personas if v["id"] == sample["personaRef"]["personaVersionId"]), None
        )
        if persona_version is None:
            raise fail(f"Persona Version for Sample {item['sampleId']} could not be resolved")
        loaded.append(
            {
                "directory": directory,
                "project": project,
                "run": run,
                "sample": sample,
                "personaVersion": persona_version,
                "sourceEntry": source_entry,
                "sourceText": (directory / "sources" / f"{source_entry['sourceId']}.txt").read_text(encoding="utf-8"),
            }
        )
    if len(source_hashes) != 1:
        raise fail("selected Samples must share one identical Source hash")
    return loaded


def synthesis_plan(selection: dict, loaded: list[dict]) -> tuple[dict, str]:
    execution = selection["execution"]
    persona_versions: dict[str, dict] = {}
    for item in loaded:
        ref = item["sample"]["personaRef"]
        persona_versions.setdefault(ref["personaVersionId"], ref)
    sections = {
        "systemAndTaskRules": SYSTEM_AND_TASK_RULES,
        "selectedResults": json.dumps(
            [
                {
                    "sampleId": item["sample"]["sampleId"],
                    "personaLabel": item["personaVersion"]["label"],
                    "personaVersionId": item["personaVersion"]["id"],
                    "directReaction": item["sample"]["parsedResult"].get("directReaction", ""),
                    "recommendations": item["sample"]["parsedResult"].get("personaRecommendations", []),
                }
                for item in loaded
            ],
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        "outputSchema": SYNTHESIS_OUTPUT_SCHEMA,
    }
    characters = sum(len(text) for text in sections.values())
    plan = {
        "sourceRefs": [
            {"sourceId": loaded[0]["sourceEntry"]["sourceId"], "sha256": loaded[0]["sourceEntry"]["textSha256"]}
        ],
        "personaRefs": [
            persona_versions[key] for key in sorted(persona_versions)
        ],
        "questionSet": {},
        "promptTemplate": {
            "id": TEMPLATE_ID,
            "version": TEMPLATE_VERSION,
            "contentHash": TEMPLATE_CONTENT_HASH,
        },
        "renderedPromptSections": sections,
        "provider": execution["provider"],
        "model": execution["model"],
        "endpointClass": execution["endpointClass"],
        "settings": {},
        "sampleCount": 1,
        "sampleIds": [f"{execution['runId']}-sample-001"],
        "truncation": {"strategy": "none", "applied": False},
        "estimate": {
            "inputCharactersPerRequest": characters,
            "approximateInputTokensPerRequest": math.ceil(characters / 4),
            "method": "character-count-divided-by-four; non-billing heuristic",
            "requestCount": 1,
        },
    }
    plan_hash = sha256_canonical(plan)
    plan["planHash"] = plan_hash
    return plan, plan_hash


def cmd_render_synthesis_preflight(args) -> int:
    selection = load_selection(Path(args.selection))
    loaded = load_selected_samples(selection)
    plan, plan_hash = synthesis_plan(selection, loaded)
    execution = selection["execution"]
    view = {
        "schemaVersion": "0.0",
        "approvalStatus": "pending",
        "createdAt": execution["preflightCreatedAt"],
        "runId": execution["runId"],
        "destination": {
            "provider": plan["provider"],
            "model": plan["model"],
            "endpointClass": plan["endpointClass"],
        },
        "estimate": plan["estimate"],
        "outbound": {
            "sharedSource": {
                "sha256": loaded[0]["sourceEntry"]["textSha256"],
                "text": loaded[0]["sourceText"],
            },
            "selectedResults": [
                {
                    "sampleId": item["sample"]["sampleId"],
                    "runId": item["run"]["runId"],
                    "projectTitle": item["project"]["title"],
                    "personaLabel": item["personaVersion"]["label"],
                    "personaVersionId": item["personaVersion"]["id"],
                    "directReaction": item["sample"]["parsedResult"].get("directReaction", ""),
                    "position": item["sample"]["parsedResult"].get("position", ""),
                }
                for item in loaded
            ],
            "promptSections": plan["renderedPromptSections"],
        },
        "planHash": plan_hash,
        "predictionDisclaimer": DISCLAIMER,
        "requiresRealPersonReconfirmation": False,
        "warnings": WARNINGS,
    }
    write_json(Path(args.output), view)
    print(json.dumps({"written": str(args.output), "planHash": plan_hash}, ensure_ascii=False, sort_keys=True))
    return 0


def assert_attribution(loaded: list[dict], parsed: dict) -> None:
    valid_ids = {item["sample"]["sampleId"] for item in loaded}
    persona_by_sample = {
        item["sample"]["sampleId"]: item["personaVersion"]["id"] for item in loaded
    }
    for index, claim in enumerate(parsed.get("consensus", [])):
        supporters = claim.get("supportingSampleIds", [])
        if not supporters or len(supporters) < 2:
            raise fail(
                f"consensus[{index}] supportingSampleIds is empty or lists fewer than 2 selected Samples; "
                "every synthesized claim must cite its supporting Samples"
            )
        for sample_id in supporters:
            if sample_id not in valid_ids:
                raise fail(
                    f"consensus[{index}] cites unknown Sample {sample_id}; only explicitly selected Samples may support a claim"
                )
    for index, disagreement in enumerate(parsed.get("disagreements", [])):
        if len(disagreement.get("views", [])) < 2:
            raise fail(f"disagreements[{index}] needs at least 2 contrasting views")
        for view in disagreement["views"]:
            for sample_id in view.get("supportingSampleIds", []):
                if sample_id not in valid_ids:
                    raise fail(f"disagreements[{index}] cites unknown Sample {sample_id}")
    for index, unique in enumerate(parsed.get("uniqueViews", [])):
        supporters = unique.get("supportingSampleIds", [])
        if len(supporters) != 1 or supporters[0] not in valid_ids:
            raise fail(f"uniqueViews[{index}] must cite exactly one selected Sample")
        if unique.get("personaVersionId") != persona_by_sample.get(supporters[0]):
            raise fail(f"uniqueViews[{index}] personaVersionId does not match the cited Sample")


def cmd_build_synthesis_project(args) -> int:
    output = Path(args.output)
    if output.exists():
        raise fail(f"output directory {output} already exists; never overwrite an existing Project")
    selection = load_selection(Path(args.selection))
    loaded = load_selected_samples(selection)
    plan, plan_hash = synthesis_plan(selection, loaded)
    approval = read_json(args.approval)
    if approval.get("planHash") != plan_hash:
        raise fail("the stored approval is stale: its planHash does not match the current synthesis plan; rerun Preflight")
    if approval.get("runId") != selection["execution"]["runId"]:
        raise fail("approval runId does not match the synthesis runId")
    if approval.get("acknowledgedDisclaimer") is not True:
        raise fail("approval must acknowledge the prediction disclaimer")

    synthesis = read_json(args.synthesis)
    if synthesis.get("runId") != selection["execution"]["runId"]:
        raise fail("synthesis runId does not match the selection execution runId")
    parsed = synthesis["parsedResult"]
    assert_attribution(loaded, parsed)

    execution = selection["execution"]
    run_id = execution["runId"]
    source_entry = dict(loaded[0]["sourceEntry"])
    source_text = loaded[0]["sourceText"]

    output.mkdir(parents=False)
    persona_versions = []
    seen_persona_ids: set[str] = set()
    for item in loaded:
        version = item["personaVersion"]
        if version["id"] not in seen_persona_ids:
            persona_versions.append(version)
            seen_persona_ids.add(version["id"])

    project = {
        "schemaVersion": "0.0",
        "projectId": selection["project"]["projectId"],
        "title": selection["project"]["title"],
        "description": selection["project"]["description"],
        "locale": selection["project"]["locale"],
        "createdAt": selection["project"]["createdAt"],
        "updatedAt": execution["completedAt"],
        "sourceIds": [source_entry["sourceId"]],
        "currentPersonaVersionIds": [version["id"] for version in persona_versions],
        "questionSets": [loaded[0]["run"]["executionPlan"]["questionSet"]],
        "promptTemplateVersions": [
            {"id": TEMPLATE_ID, "version": TEMPLATE_VERSION, "contentHash": TEMPLATE_CONTENT_HASH}
        ],
        "runIds": [run_id],
        "reportIds": [execution["reportId"]],
        "compatibility": {
            "writer": "opinion-simulator-skill",
            "writerVersion": "0.0.0",
            "minimumReaderVersion": "0.0",
        },
    }
    write_json(output / "project.json", project)
    write_json(output / "personas.json", {"schemaVersion": "0.0", "drafts": [], "versions": persona_versions})
    write_json(output / "sources" / "index.json", {"schemaVersion": "0.0", "sources": [source_entry]})
    (output / "sources" / f"{source_entry['sourceId']}.txt").write_text(source_text, encoding="utf-8")
    methodology_path = output / "methodology.md"
    methodology_path.write_text(METHODOLOGY_TEXT, encoding="utf-8")
    methodology_hash = sha256_bytes(methodology_path.read_bytes())

    labels = {item["sample"]["sampleId"]: item["personaVersion"]["label"] for item in loaded}
    report_lines = [
        f"# {selection['project']['title']}",
        "",
        f"> {DISCLAIMER}",
        "",
        "## Selected results",
        "",
    ]
    for item in loaded:
        sample = item["sample"]
        report_lines.append(
            f"- `{sample['sampleId']}` — Persona: {labels[sample['sampleId']]}"
            f"（`{sample['personaRef']['personaVersionId']}`）"
        )
    report_lines += ["", "## Consensus", ""]
    for claim in parsed.get("consensus", []):
        supporters = "`, `".join(claim["supportingSampleIds"])
        report_lines.append(f"- {claim['claim']} — 支援 Samples：`{supporters}`")
    report_lines += ["", "## Disagreements", ""]
    for disagreement in parsed.get("disagreements", []):
        report_lines.append(f"### {disagreement['topic']}")
        report_lines.append("")
        for view in disagreement["views"]:
            who = ", ".join(labels.get(sid, sid) for sid in view["supportingSampleIds"])
            report_lines.append(f"- {view['claim']}（{who}）")
        report_lines.append("")
    report_lines += ["", "## Unique views", ""]
    for unique in parsed.get("uniqueViews", []):
        who = labels.get(unique["supportingSampleIds"][0], unique["supportingSampleIds"][0])
        report_lines.append(f"- {unique['claim']}（僅 {who}）")
    report_lines += [
        "",
        "## Details",
        "",
        f"- Run record: `runs/{run_id}.json`",
        f"- Method limits: `methodology.md` (version 0.0.1, sha256 `{methodology_hash}`)",
        "",
    ]
    report_path = output / "reports" / f"{execution['reportId']}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report_lines), encoding="utf-8")

    sample_records = []
    for item in loaded:
        sample_records.append(item["sample"])
    record = {
        "schemaVersion": "0.0",
        "runId": run_id,
        "projectId": selection["project"]["projectId"],
        "kind": "synthesis",
        "status": "completed",
        "createdAt": execution["createdAt"],
        "startedAt": execution["startedAt"],
        "completedAt": execution["completedAt"],
        "skillVersion": execution["skillVersion"],
        "executionPlan": {**plan, "preflightApproval": approval},
        "samples": [
            {
                "sampleId": f"{run_id}-sample-001",
                "personaRef": {
                    "personaId": persona_versions[0]["personaId"],
                    "personaVersionId": persona_versions[0]["id"],
                    "version": persona_versions[0]["version"],
                    "contentHash": persona_versions[0]["contentHash"],
                },
                "status": "completed",
                "attemptEvents": [
                    {"attempt": 1, "status": "completed", "timestamp": execution["completedAt"], "error": None}
                ],
                "normalizedRequest": {
                    "runId": run_id,
                    "sampleId": f"{run_id}-sample-001",
                    "planHash": plan_hash,
                    "provider": plan["provider"],
                    "model": plan["model"],
                },
                "normalizedResponse": {
                    "provider": plan["provider"],
                    "model": plan["model"],
                    "responseFormat": "structured-json",
                    "validationState": parsed.get("validationState"),
                },
                "rawProviderResponse": synthesis.get("rawProviderResponse", {}),
                "parsedResult": parsed,
                "validationWarnings": synthesis.get("validationWarnings", []),
                "providerUsage": synthesis.get("providerUsage", {}),
                "startedAt": execution["startedAt"],
                "completedAt": execution["completedAt"],
                "latencyMs": synthesis.get("latencyMs", 0),
            }
        ],
        "stabilityComparison": {
            "mode": "not-applicable",
            "reason": "Synthesis Runs do not produce a Stability Comparison.",
        },
        "synthesisAttribution": {
            "selectedSampleIds": [item["sample"]["sampleId"] for item in loaded],
            "selectedPersonaVersionIds": [item["personaVersion"]["id"] for item in loaded],
            "originalRefs": [
                {
                    "projectDirectory": str(item["directory"]),
                    "runId": item["run"]["runId"],
                    "sampleId": item["sample"]["sampleId"],
                    "projectId": item["project"]["projectId"],
                }
                for item in loaded
            ],
        },
        "report": {
            "reportId": execution["reportId"],
            "path": f"reports/{execution['reportId']}.md",
            "createdAt": execution["completedAt"],
            "generationMethod": "deterministic-v0.0",
            "disclaimer": DISCLAIMER,
        },
        "integrity": {
            "algorithm": "sha256",
            "planHash": plan_hash,
            "sourceHashes": {source_entry["sourceId"]: source_entry["textSha256"]},
            "personaContentHashes": {version["id"]: version["contentHash"] for version in persona_versions},
            "templateContentHash": TEMPLATE_CONTENT_HASH,
        },
    }
    write_json(output / "runs" / f"{run_id}.json", record)
    write_checksums(output)
    evidence = {
        "output": str(output),
        "status": "valid",
        "samplesChecked": 1,
        "liveProviderCalls": "none",
        "selectedSampleCount": len(loaded),
    }
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="opinion_simulator.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p = subparsers.add_parser("render-preflight")
    p.add_argument("--workflow", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_render_preflight)

    p = subparsers.add_parser("build-project")
    p.add_argument("--workflow", required=True)
    p.add_argument("--approval", required=True)
    p.add_argument("--samples", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_build_project)

    p = subparsers.add_parser("validate-project")
    p.add_argument("project")
    p.set_defaults(func=cmd_validate_project)

    p = subparsers.add_parser("render-synthesis-preflight")
    p.add_argument("--selection", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_render_synthesis_preflight)

    p = subparsers.add_parser("build-synthesis-project")
    p.add_argument("--selection", required=True)
    p.add_argument("--approval", required=True)
    p.add_argument("--synthesis", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=cmd_build_synthesis_project)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ToolError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
