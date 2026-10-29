"""

Exports PostgreSQL study data into CSV, JSONL, and Markdown files.
Run locally from the backend directory.

Database connection:
    Uses DATABASE_URL from the environment or backend/.env.
    For Railway, DATABASE_URL must point to the Railway database
    (directly or through a Railway tunnel).

Arguments:
    --output-dir PATH   Directory to store exports (default: backend/exports/)
    --zip               Also create a ZIP archive of the export

Commands:
    python export_study_data.py
        Generate an export using the default output directory.

    python export_study_data.py --zip
        Generate an export and a ZIP archive.

    python export_study_data.py --output-dir ./my_exports --zip
        Generate an export in a custom directory and create a ZIP.

"""

import argparse
import csv
import json
import os
import shutil
import statistics
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

from study_data.study_config import CONFIDENCE_SURVEY


ROOT = Path(__file__).resolve().parent
GROUP_ORDER = ("human_ai", "ai_only", "grad_human_ai", "grad_ai_only")
MANUAL_GROUPS = {"human_ai", "grad_human_ai"}
GRAD_GROUPS = {"grad_human_ai", "grad_ai_only"}

# Select explicit columns so an added database column is not exported by accident.
# All SQL is static; no user input is interpolated into SQL statements.
EXPORTS = {
    "sessions": (
        "sessions.csv",
        """SELECT id AS session_id, class_section, experiment_group,
                  current_stage, created_at, completed_at,
                  (completed_at IS NOT NULL) AS is_completed
           FROM study_sessions ORDER BY created_at, id""",
        ("session_id", "class_section", "experiment_group", "current_stage",
         "created_at", "completed_at", "is_completed"),
    ),
    "surveys": (
        "survey_responses.csv",
        """SELECT session_id, question_id, answer, answered_at
           FROM final_confidence_answers ORDER BY session_id, question_id""",
        ("session_id", "phase", "question_id", "answer", "answered_at"),
    ),
    "manual": (
        "manual_evaluations.csv",
        """SELECT session_id, requirement_id, criterion_id, selected, notes, answered_at
           FROM final_manual_evals ORDER BY session_id, requirement_id, criterion_id""",
        ("session_id", "requirement_id", "criterion_id", "selected", "notes", "answered_at"),
    ),
    "decisions": (
        "ai_decisions.csv",
        """SELECT session_id, analysis_id, requirement_id, criterion_id,
                  decision, substituted_text, decided_at
           FROM final_ai_review_decisions
           ORDER BY session_id, analysis_id, requirement_id, criterion_id""",
        ("session_id", "analysis_id", "requirement_id", "criterion_id",
         "decision", "substituted_text", "decided_at"),
    ),
    "stages": (
        "stage_history.csv",
        """SELECT id AS stage_record_id, session_id, stage, started_at,
                  completed_at, completion_reason
           FROM study_stage_history ORDER BY session_id, started_at, id""",
        ("stage_record_id", "session_id", "stage", "started_at",
         "completed_at", "completion_reason", "duration_minutes"),
    ),
    "events": (
        "interaction_events.csv",
        """SELECT id AS event_id, session_id, stage, requirement_id,
                  criterion_id, event_type, event_data, occurred_at
           FROM study_interaction_events ORDER BY session_id, occurred_at, id""",
        ("event_id", "session_id", "stage", "requirement_id", "criterion_id",
         "event_type", "event_data", "occurred_at"),
    ),
    "survey_history": (
        "history/survey_history.csv",
        """SELECT id AS response_id, session_id, question_id, answer, answered_at
           FROM confidence_answers ORDER BY session_id, id""",
        ("response_id", "session_id", "phase", "question_id", "answer", "answered_at"),
    ),
    "manual_history": (
        "history/manual_history.csv",
        """SELECT id AS evaluation_id, session_id, requirement_id, criterion_id,
                  selected, notes, answered_at
           FROM manual_evals ORDER BY session_id, id""",
        ("evaluation_id", "session_id", "requirement_id", "criterion_id",
         "selected", "notes", "answered_at"),
    ),
    "decision_history": (
        "history/ai_decision_history.csv",
        """SELECT id AS decision_id, session_id, analysis_id, requirement_id,
                  criterion_id, decision, substituted_text, decided_at
           FROM ai_review_decisions ORDER BY session_id, id""",
        ("decision_id", "session_id", "analysis_id", "requirement_id",
         "criterion_id", "decision", "substituted_text", "decided_at"),
    ),
}

AI_SQL = """SELECT id AS analysis_id, session_id, provider, model, status,
                   result, system_prompt, material_version, started_at, completed_at
            FROM ai_analyses ORDER BY session_id, started_at, id"""


def survey_question_ids(phase):
    """Read expected question IDs from the study's existing questionnaire config."""
    ids = set()
    for section in CONFIDENCE_SURVEY[phase]:
        ids.update(q["id"] for q in section.get("questions", []))
        for group in section.get("groups", []):
            ids.update(q["id"] for q in group.get("questions", []))
    return ids


def utc_text(value):
    if value is None:
        return ""
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def display_timestamp(value):
    if value is None:
        return "N/A"
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def json_default(value):
    if isinstance(value, datetime):
        return utc_text(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Cannot encode type {type(value).__name__} as JSON")


def csv_value(value, column):
    if column in ("answer", "event_data"):
        # A SQL NULL event_data becomes empty; a JSON null answer becomes 'null'.
        if column == "event_data" and value is None:
            return ""
        return json.dumps(value, ensure_ascii=False, default=json_default)
    if value is None:
        return ""
    if isinstance(value, datetime):
        return utc_text(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    return value


def write_csv(path, columns, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()  # Also write headers when there are zero rows.
        for row in rows:
            writer.writerow({column: csv_value(row.get(column), column) for column in columns})


def write_ai_jsonl(path, rows):
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, default=json_default))
            handle.write("\n")


def enriched_rows(key, original_rows, pre_ids, post_ids):
    """Add useful derived export columns without changing the underlying data."""
    rows = []
    for original in original_rows:
        row = dict(original)
        if key in ("surveys", "survey_history"):
            row["phase"] = (
                "post" if row["question_id"] in post_ids
                else "pre" if row["question_id"] in pre_ids
                else "unknown"
            )
        elif key == "stages":
            start, end = row["started_at"], row["completed_at"]
            row["duration_minutes"] = (
                round((end - start).total_seconds() / 60, 3)
                if start is not None and end is not None else None
            )
        rows.append(row)
    return rows


def minute_stats(values):
    if not values:
        return ("N/A", "N/A", "N/A", "N/A")
    return tuple(f"{x:.1f}" for x in (
        statistics.mean(values), statistics.median(values), min(values), max(values)
    ))


def average(values):
    return f"{statistics.mean(values):.1f}" if values else "N/A"


def ratio(numerator, denominator):
    return f"{numerator / denominator * 100:.1f}%" if denominator else "N/A"


def markdown_table(headers, rows):
    """Render a simple Markdown table with safe plain-text cells."""
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ")

    lines = ["| " + " | ".join(map(cell, headers)) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    lines.extend("| " + " | ".join(cell(v) for v in row) + " |" for row in rows)
    return "\n".join(lines)


def generate_summary(data, generated_at):
    """Build descriptive statistics from exactly the exported database snapshot."""
    sessions = data["sessions"]
    surveys = data["surveys"]
    manual = data["manual"]
    decisions = data["decisions"]
    stages = data["stages"]
    analyses = data["analyses"]

    sessions_by_id = {s["session_id"]: s for s in sessions}
    groups = list(GROUP_ORDER)
    groups.extend(sorted({s["experiment_group"] for s in sessions} - set(groups)))
    by_group = {g: [s for s in sessions if s["experiment_group"] == g] for g in groups}

    stage_done = defaultdict(set)
    stage_times = defaultdict(list)
    for stage in stages:
        sid = stage["session_id"]
        if stage["completed_at"] is None or sid not in sessions_by_id:
            continue
        stage_done[stage["stage"]].add(sid)
        seconds = (stage["completed_at"] - stage["started_at"]).total_seconds()
        if seconds >= 0:
            stage_times[(sessions_by_id[sid]["experiment_group"], stage["stage"])].append(seconds / 60)

    surveys_by_id = defaultdict(list)
    for row in surveys:
        surveys_by_id[(row["session_id"], row["phase"])].append(row)
    manual_by_id = defaultdict(list)
    for row in manual:
        manual_by_id[row["session_id"]].append(row)
    decisions_by_id = defaultdict(list)
    for row in decisions:
        decisions_by_id[row["session_id"]].append(row)

    lines = [
        "# Research Study: Export Summary",
        "",
        f"**Export generated (UTC):** {display_timestamp(generated_at)}  ",
        "**Material versions:** " + (", ".join(sorted({str(a['material_version']) for a in analyses})) or "None") + "  ",
        "**Participant names:** Excluded",
        "",
        "## 1. Participation overview",
        "",
    ]

    participation = []
    for group in groups:
        ss = by_group[group]
        count = sum(s["completed_at"] is not None for s in ss)
        participation.append((f"`{group}`", len(ss), count, len(ss) - count, ratio(count, len(ss))))
    total_complete = sum(s["completed_at"] is not None for s in sessions)
    participation.append(("**Total**", len(sessions), total_complete,
                          len(sessions) - total_complete, ratio(total_complete, len(sessions))))
    lines += [markdown_table(("Experimental group", "Sessions", "Completed", "Incomplete", "Completion rate"), participation), ""]

    starts = [s["created_at"] for s in sessions]
    completions = [s["completed_at"] for s in sessions if s["completed_at"] is not None]
    lines += [
        f"- First session started: {display_timestamp(min(starts)) if starts else 'N/A'}",
        f"- Last session started: {display_timestamp(max(starts)) if starts else 'N/A'}",
        f"- Last session completed: {display_timestamp(max(completions)) if completions else 'N/A'}",
        "",
        "## 2. Responses per section",
        "",
        "Averages are per participant who completed the relevant stage. Only the latest saved responses are counted.",
        "",
        "### Questionnaires",
        "",
    ]

    pre_ids, post_ids = survey_question_ids("pre"), survey_question_ids("post")
    survey_rows = []
    for group in groups:
        if group not in GRAD_GROUPS:
            survey_rows.append((f"`{group}`", "-", "-", "-", "-"))
            continue
        pre_sids = [s["session_id"] for s in by_group[group] if s["session_id"] in stage_done["confidence"]]
        post_sids = [s["session_id"] for s in by_group[group] if s["session_id"] in stage_done["post_confidence"]]
        pre_vals = [len({r["question_id"] for r in surveys_by_id[(sid, "pre")]}) for sid in pre_sids]
        post_vals = [len({r["question_id"] for r in surveys_by_id[(sid, "post")]}) for sid in post_sids]
        survey_rows.append((f"`{group}`", len(pre_sids), average(pre_vals), len(post_sids), average(post_vals)))
    lines += [
        markdown_table(("Group", "Pre-survey (n)", f"Avg. answered (of {len(pre_ids)})",
                        "Post-survey (n)", f"Avg. answered (of {len(post_ids)})"), survey_rows),
        "",
        "### Manual review",
        "",
    ]

    manual_rows = []
    for group in groups:
        if group not in MANUAL_GROUPS:
            continue
        sids = [s["session_id"] for s in by_group[group] if s["session_id"] in stage_done["manual_review"]]
        requirements = []
        violations = []
        notes = []
        for sid in sids:
            records = manual_by_id[sid]
            requirements.append(len({r["requirement_id"] for r in records}))
            violations.append(sum(r["selected"] and r["criterion_id"] != "A1" for r in records))
            notes.append(sum(r["selected"] and r["criterion_id"] != "A1"
                             and bool((r["notes"] or "").strip()) for r in records))
        manual_rows.append((f"`{group}`", len(sids), average(requirements),
                            average(violations), average(notes)))
    lines += [
        markdown_table(("Group", "Participants (n)", "Avg. requirements evaluated",
                        "Avg. violations selected", "Avg. reasoning notes"), manual_rows),
        "",
        "### AI review",
        "",
    ]

    ai_rows = []
    for group in groups:
        sids = [s["session_id"] for s in by_group[group] if s["session_id"] in stage_done["ai_review"]]
        counters = [Counter(r["decision"] for r in decisions_by_id[sid]) for sid in sids]
        ai_rows.append((f"`{group}`", len(sids), average([sum(c.values()) for c in counters]),
                        *[average([c[d] for c in counters]) for d in
                          ("accept", "reject", "substitute", "suggest")]))
    lines += [
        markdown_table(("Group", "Participants (n)", "Avg. decisions", "Avg. accepts",
                        "Avg. rejects", "Avg. substitutes", "Avg. suggestions"), ai_rows),
        "",
        "## 3. Time statistics",
        "",
        "### Total study duration (completed sessions)",
        "",
    ]

    duration_rows = []
    for group in groups:
        values = [(s["completed_at"] - s["created_at"]).total_seconds() / 60
                  for s in by_group[group] if s["completed_at"] is not None]
        duration_rows.append((f"`{group}`", len(values), *minute_stats(values)))
    lines += [
        markdown_table(("Group", "Sessions (n)", "Mean (min)", "Median (min)",
                        "Shortest (min)", "Longest (min)"), duration_rows),
        "",
        "### Average time in each stage",
        "",
    ]

    stages_shown = (
        ("Pre-survey", "confidence", GRAD_GROUPS),
        ("Reading", "reading", None),
        ("Manual review", "manual_review", MANUAL_GROUPS),
        ("AI review", "ai_review", None),
        ("Post-survey", "post_confidence", GRAD_GROUPS),
    )
    time_rows = []
    for label, stage, applicable in stages_shown:
        cells = [label]
        for group in groups:
            if applicable is not None and group not in applicable:
                cells.append("-")
                continue
            values = stage_times[(group, stage)]
            cells.append(f"{average(values)} (n={len(values)})" if values else "N/A (n=0)")
        time_rows.append(cells)
    lines += [
        markdown_table(("Stage", *[f"`{g}`" for g in groups]), time_rows),
        "",
        "Times are elapsed, not necessarily active working time. Only completed stage records are included.",
        "",
        "## 4. AI review acceptance rates",
        "",
    ]

    acceptance_rows = []
    for group in groups:
        sids = {s["session_id"] for s in by_group[group]
                if s["session_id"] in stage_done["ai_review"]}
        counts = Counter(r["decision"] for r in decisions if r["session_id"] in sids)
        decided_findings = counts["accept"] + counts["reject"] + counts["substitute"]
        acceptance_rows.append((f"`{group}`", counts["accept"], decided_findings,
                                ratio(counts["accept"], decided_findings)))
    lines += [
        markdown_table(("Group", "Accepted findings", "Decided AI findings", "Acceptance rate"), acceptance_rows),
        "",
        "Acceptance rate = accepts / (accepts + rejects + substitutes). Suggestions and unanswered findings are excluded.",
        "",
        "## 5. AI analysis status and data completeness",
        "",
    ]

    analyses_by_id = defaultdict(list)
    for a in analyses:
        analyses_by_id[a["session_id"]].append(a)
    latest_statuses = Counter()
    for session in sessions:
        records = analyses_by_id[session["session_id"]]
        if not records:
            latest_statuses["No analysis record"] += 1
        else:
            latest = max(records, key=lambda a: (a["started_at"], str(a["analysis_id"])))
            latest_statuses[latest["status"].title()] += 1
    status_rows = [(status, latest_statuses[status]) for status in
                   ("Completed", "Failed", "Running", "No analysis record")]
    status_rows.append(("**Total**", len(sessions)))
    lines += [
        "### Latest analysis status per session",
        "",
        markdown_table(("Status", "Sessions"), status_rows),
        "",
        f"- Total AI analysis records: {len(analyses)}",
        f"- Sessions with multiple analysis records: {sum(len(v) > 1 for v in analyses_by_id.values())}",
        "",
        "### Missing or unfinished data",
        "",
    ]

    missing_grad = 0
    for s in sessions:
        if s["experiment_group"] not in GRAD_GROUPS or s["completed_at"] is None:
            continue
        sid = s["session_id"]
        answered_pre = {r["question_id"] for r in surveys_by_id[(sid, "pre")]}
        answered_post = {r["question_id"] for r in surveys_by_id[(sid, "post")]}
        if not pre_ids <= answered_pre or not post_ids <= answered_post:
            missing_grad += 1

    active_manual = {r["session_id"] for r in stages if r["stage"] == "manual_review"
                     and r["completed_at"] is None}
    active_ai = {r["session_id"] for r in stages if r["stage"] == "ai_review"
                 and r["completed_at"] is None}
    completed_without_ai = sum(
        s["completed_at"] is not None and not any(a["status"] == "completed"
        for a in analyses_by_id[s["session_id"]]) for s in sessions
    )
    checks = [
        ("Sessions not marked completed", len(sessions) - total_complete),
        ("Completed graduate sessions missing one or more survey answers", missing_grad),
        ("Sessions with an unfinished manual-review stage", len(active_manual)),
        ("Sessions with an unfinished AI-review stage", len(active_ai)),
        ("Completed sessions without a completed AI analysis", completed_without_ai),
    ]
    lines += [
        markdown_table(("Check", "Sessions"), checks),
        "",
        "Skipped optional survey questions count as missing answers, not errors.",
    ]
    return "\n".join(lines)


def generate_readme(generated_at, data):
    counts = {
        "sessions.csv": len(data["sessions"]),
        "survey_responses.csv": len(data["surveys"]),
        "manual_evaluations.csv": len(data["manual"]),
        "ai_analyses.jsonl": len(data["analyses"]),
        "ai_decisions.csv": len(data["decisions"]),
        "stage_history.csv": len(data["stages"]),
        "interaction_events.csv": len(data["events"]),
        "history/survey_history.csv": len(data["survey_history"]),
        "history/manual_history.csv": len(data["manual_history"]),
        "history/ai_decision_history.csv": len(data["decision_history"]),
    }
    descriptions = {
        "sessions.csv": "One row per session, including group, stage and completion status",
        "survey_responses.csv": "Latest saved answer per session and question",
        "manual_evaluations.csv": "Latest selected or deselected state per session, requirement and criterion",
        "ai_analyses.jsonl": "One complete AI analysis attempt per JSON line, with nested result and metadata",
        "ai_decisions.csv": "Latest participant decision per session, analysis, requirement and criterion",
        "stage_history.csv": "Stage timing records, including incomplete stages",
        "interaction_events.csv": "Raw navigation, focus and visibility events",
        "history/survey_history.csv": "All saved questionnaire answers and revisions",
        "history/manual_history.csv": "All saved manual evaluation changes",
        "history/ai_decision_history.csv": "All saved AI review decision changes",
    }
    file_table = markdown_table(("File", "Rows", "Contents"), [
        (f"`{name}`", count, descriptions[name]) for name, count in counts.items()
    ])
    return f"""# Research Study: Data Export

**Export generated (UTC):** {utc_text(generated_at)}  
**Database snapshot:** One repeatable-read, read-only transaction  
**Participant names:** Excluded

## Files

{file_table}

`SUMMARY.md` provides participation, response and timing statistics.

## IDs and relationships

- `session_id`: Identifies a study session and joins almost all files.
- `analysis_id`: Identifies an AI analysis attempt. It joins AI decisions to a specific AI analysis.
- `requirement_id`: Identifies an engineering requirement (for example, `FR1`).
- `criterion_id`: Identifies an INCOSE criterion (for example, `A4`).
- History file row IDs identify individual saved revisions, not unique questions or criteria.

## Data conventions

- All CSVs have a header row and use UTF-8 encoding.
- Timestamps are in ISO 8601 UTC. Durations are elapsed minutes and are not adjusted for inactivity.
- An empty CSV cell may represent SQL NULL or empty text. Explicit `false` and `0` are preserved.
- `answer` fields contain JSON-encoded questionnaire values, including quoted JSON strings and nested values.
- `event_data` contains JSON when present; an empty `event_data` cell represents SQL NULL.
- `phase` is `pre`, `post` or `unknown`, based on question IDs in the current study configuration.
- Final response files contain the latest saved response, including unselected criteria; history files contain every saved revision.
- `ai_analyses.jsonl` contains the original JSONB result under `result`, plus provider, model, prompt, status and timestamps. Running analyses may have a null result.
- Incomplete sessions and unfinished stages are retained. A missing answer is not equivalent to an explicit negative answer.
- A participant selecting `A1` means no issues were found. `A1` is not an AI-tested violation criterion.
"""


def run_export(output_dir, create_zip=False):
    load_dotenv(ROOT / ".env", override=False)
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is missing. Set it in the environment or backend .env file.")

    output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc)
    destination = output_dir / ("study_export_" + generated_at.strftime("%Y-%m-%d_%H%M%S_%f"))
    pre_ids = survey_question_ids("pre")
    post_ids = survey_question_ids("post")

    # Use a temporary directory so a failed export does not look complete.
    with tempfile.TemporaryDirectory(prefix=".study_export_", dir=output_dir) as temp:
        working_dir = Path(temp) / "data"
        working_dir.mkdir()
        data = {}
        with psycopg.connect(url, row_factory=dict_row) as conn:
            with conn.transaction():
                conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                for key, (filename, sql, columns) in EXPORTS.items():
                    rows = enriched_rows(key, conn.execute(sql).fetchall(), pre_ids, post_ids)
                    data[key] = rows
                    write_csv(working_dir / filename, columns, rows)
                data["analyses"] = conn.execute(AI_SQL).fetchall()
                write_ai_jsonl(working_dir / "ai_analyses.jsonl", data["analyses"])

        (working_dir / "SUMMARY.md").write_text(
            generate_summary(data, generated_at), encoding="utf-8"
        )
        (working_dir / "README.md").write_text(
            generate_readme(generated_at, data), encoding="utf-8"
        )
        working_dir.rename(destination)

    print(f"Export created: {destination}")
    if create_zip:
        archive = shutil.make_archive(str(destination), "zip", root_dir=output_dir,
                                      base_dir=destination.name)
        print(f"ZIP created: {archive}")
    return destination


def main():
    parser = argparse.ArgumentParser(description="Export study data from PostgreSQL")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "exports",
                        help="Parent directory for timestamped exports")
    parser.add_argument("--zip", action="store_true", help="Also create a ZIP archive")
    args = parser.parse_args()
    run_export(args.output_dir.resolve(), args.zip)


if __name__ == "__main__":
    main()
