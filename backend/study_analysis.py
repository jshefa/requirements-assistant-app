"""Generate and persist AI analyses for research study participants.

This is a worker, not an HTTP endpoint. Schedule research_analysis(session_id)
after the study session transaction commits.
"""

import random
import time
from uuid import UUID

from psycopg.types.json import Jsonb

from ai_analyzer import AnalysisContext, _build_prompt, analyze_all_requirements
from provider_config import get_model, get_provider, get_server_api_key, PROVIDER_ENV_KEYS
from database import get_connection
from requirements_parser import parse_requirements, validate_requirements
from routers.study_materials import STUDY_DIR
from study_data.study_config import STUDY_CONFIG

MAX_ATTEMPTS = 3

def _load_research_inputs():
    """Read the fixed study materials instead of accepting participant uploads."""
    requirements = parse_requirements(
        (STUDY_DIR / "requirements.txt").read_text(encoding="utf-8"),
        ".txt",
    )
    validation = validate_requirements(requirements)
    if not validation["valid"]:
        raise ValueError(f"Invalid study requirements: {validation['error']}")
    if not requirements:
        raise ValueError("The study has no requirements to evaluate")

    context = AnalysisContext(
        system_context=(STUDY_DIR / "context.txt").read_text(encoding="utf-8"),
        conops=(STUDY_DIR / "conops.txt").read_text(encoding="utf-8"),
        image_bytes=(STUDY_DIR / "conops_image.png").read_bytes(),
        image_file_type="image/png",
    )
    return requirements, context


def _require_complete_analysis(analysis, requirements):
    """Reject per-requirement error records, even if the analyzer didn't raise."""
    if not isinstance(analysis, dict):
        raise ValueError("AI returned an invalid analysis object")

    results = analysis.get("requirements")
    if not isinstance(results, list):
        raise ValueError("AI returned no requirements list")

    expected_ids = [str(req["id"]) for req in requirements]
    actual_ids = [str(req.get("req_id")) for req in results if isinstance(req, dict)]
    if len(results) != len(expected_ids) or sorted(actual_ids) != sorted(expected_ids):
        raise ValueError("AI returned an incomplete requirements list")

    failed = [
        str(req["req_id"])
        for req in results
        if req.get("error") or not isinstance(req.get("criteria_evaluations"), list)
    ]
    if failed:
        raise ValueError(f"AI did not successfully evaluate requirements: {', '.join(failed)}")


def research_analysis(session_id: UUID) -> dict:
    """Run one participant's analysis using and store it in the ai_analyses table.
    Completed/running analyses aren't regenerated. Reattempts up to 3 times if analysis returns an error.
    """
    provider = get_provider()  # AI_PROVIDER environment variable
    model = get_model(provider)
    material_version = STUDY_CONFIG["MATERIALS_USED"]
    if not material_version:
        raise ValueError("STUDY_CONFIG['MATERIALS_USED'] must be set")

    with get_connection() as conn:
        session = conn.execute(
            "SELECT id FROM study_sessions WHERE id = %s FOR UPDATE", (session_id,)
        ).fetchone()
        if session is None:
            raise ValueError(f"Study session {session_id} does not exist")

        existing = conn.execute(
            """SELECT id, status, result
               FROM ai_analyses WHERE session_id = %s
               ORDER BY started_at DESC, id DESC LIMIT 1""",
            (session_id,),
        ).fetchone()
        if existing and existing["status"] == "completed":
            return existing["result"]
        if existing and existing["status"] == "running":
            raise RuntimeError(f"Analysis already running for session {session_id}")

        analysis_id = conn.execute(
            """INSERT INTO ai_analyses
                 (session_id, provider, model, status,
                  system_prompt, material_version)
               VALUES (%s, %s, %s, 'running', '', %s)
               RETURNING id""",
            (session_id, provider, model, material_version),
        ).fetchone()["id"]

    try:
        api_key = get_server_api_key(provider) or None
        if provider in PROVIDER_ENV_KEYS and not api_key: # if no key and not ollama
            raise RuntimeError(f"{PROVIDER_ENV_KEYS[provider]} is not configured")

        requirements, context = _load_research_inputs()

        system_prompt = _build_prompt(requirements)
        with get_connection() as conn:
            conn.execute(
                "UPDATE ai_analyses SET system_prompt = %s WHERE id = %s",
                (system_prompt, analysis_id),
            )
        print("analyzing")
        # retry on error
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                analysis = analyze_all_requirements(
                    requirements,
                    context,
                    session_id=str(session_id),
                    provider=provider,
                    api_key=api_key,
                )
                _require_complete_analysis(analysis, requirements) # throws error if invalid
                break
            except Exception as error:
                print(
                    f"Research AI analysis {analysis_id} failed on "
                    f"attempt {attempt}/{MAX_ATTEMPTS}: {error}",
                    flush=True,
                )
                if attempt == MAX_ATTEMPTS:
                    raise
                time.sleep(2 ** attempt + random.uniform(0, 1))

        with get_connection() as conn:
            conn.execute(
                """UPDATE ai_analyses
                   SET status = 'completed', result = %s, completed_at = NOW()
                   WHERE id = %s""",
                (Jsonb(analysis), analysis_id),
            )
        return analysis

    except Exception as error:
        print(f"Research AI analysis {analysis_id} failed all attempts: {error}", flush=True)
        with get_connection() as conn:
            conn.execute(
                """UPDATE ai_analyses
                   SET status = 'failed', result = %s, completed_at = NOW()
                   WHERE id = %s""",
                (Jsonb({"error": "AI analysis could not be completed. Please retry."}), analysis_id),
            )
        raise
