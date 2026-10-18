from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg.types.json import Jsonb

from database import get_connection
from study_data.study_config import ANALYSIS_SURVEY

router = APIRouter(prefix="/api/study/sessions", tags=["study-logging"])

EventType = Literal[
    "requirement_next",
    "requirement_previous",
    "context_opened",
    "context_closed",
    "reasoning_focused",
    "reasoning_blurred",
    "ai_substitution_focused",
    "ai_substitution_blurred",
    "ai_suggestion_focused",
    "ai_suggestion_blurred",
    "tab_hidden",
    "tab_visible",
    "page_refreshed",
]

MANUAL_CRITERION_IDS = set(ANALYSIS_SURVEY["analysis_survey"]["choices"])

class InteractionLogCreate(BaseModel):
    event_type: EventType
    requirement_id: str | None = None
    criterion_id: str | None = None
    event_data: dict[str, Any] | None = None

class ManualEvalCreate(BaseModel):
    requirement_id: str
    criterion_id: str
    selected: bool
    notes: str | None = None

class AIReviewDecisionCreate(BaseModel):
    analysis_id: UUID
    requirement_id: str
    criterion_id: str
    decision: Literal["accept", "reject", "substitute", "suggest"]
    substituted_text: str | None = None

def _get_session(conn, session_id: UUID, *, for_update: bool = False):
    sql = "SELECT current_stage, completed_at FROM study_sessions WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"

    session = conn.execute(sql, (session_id,)).fetchone()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

def _require_active_stage(session, expected_stage: str):
    if session["completed_at"] is not None:
        raise HTTPException(status_code=409, detail="Session already completed")
    if session["current_stage"] != expected_stage:
        raise HTTPException(
            status_code=409,
            detail=f"Session is not in the {expected_stage} stage",
        )

@router.post("/{session_id}/log")
def log_interaction(session_id: UUID, data: InteractionLogCreate):
    with get_connection() as conn:
        session = _get_session(conn, session_id)
        if session["completed_at"] is not None:
            raise HTTPException(status_code=409, detail="Session already completed")

        event = conn.execute(
            """
            INSERT INTO study_interaction_events
                (session_id, stage, requirement_id, criterion_id,
                 event_type, event_data)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, occurred_at
            """,
            (
                session_id,
                session["current_stage"],
                data.requirement_id,
                data.criterion_id,
                data.event_type,
                Jsonb(data.event_data) if data.event_data is not None else None,
            ),
        ).fetchone()

    return {"id": event["id"], "occurred_at": event["occurred_at"]}

@router.get("/{session_id}/manual-evals")
def get_manual_evals(session_id: UUID):
    """Latest saved state for each criterion, including deselected criteria."""
    with get_connection() as conn:
        _get_session(conn, session_id)
        rows = conn.execute(
            """
            SELECT requirement_id, criterion_id, selected, notes, answered_at
            FROM final_manual_evals
            WHERE session_id = %s
            ORDER BY requirement_id, criterion_id
            """,
            (session_id,),
        ).fetchall()
    return rows

@router.post("/{session_id}/manual-evals")
def save_manual_eval(session_id: UUID, data: ManualEvalCreate):
    if data.criterion_id not in MANUAL_CRITERION_IDS:
        raise HTTPException(status_code=400, detail="Invalid manual criterion")

    with get_connection() as conn:
        # Lock against simultaneous writes and stage advancement.
        session = _get_session(conn, session_id, for_update=True)
        _require_active_stage(session, "manual_review")

        if data.selected:
            current = conn.execute(
                """
                SELECT criterion_id
                FROM final_manual_evals
                WHERE session_id = %s
                  AND requirement_id = %s
                  AND selected = TRUE
                """,
                (session_id, data.requirement_id),
            ).fetchall()
            selected_ids = {row["criterion_id"] for row in current}

            if data.criterion_id == "A1" and (selected_ids - {"A1"}):
                raise HTTPException(
                    status_code=409,
                    detail="Deselect other criteria before selecting A1",
                )
            if data.criterion_id != "A1" and "A1" in selected_ids:
                raise HTTPException(
                    status_code=409,
                    detail="Deselect A1 before selecting other criteria",
                )

        saved = conn.execute(
            """
            INSERT INTO manual_evals
                (session_id, requirement_id, criterion_id, selected, notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, answered_at
            """,
            (
                session_id,
                data.requirement_id,
                data.criterion_id,
                data.selected,
                data.notes,
            ),
        ).fetchone()

    return {"id": saved["id"], "answered_at": saved["answered_at"]}

@router.get("/{session_id}/ai-decisions")
def get_ai_decisions(session_id: UUID):
    """Latest review decision for each finding across this session's analyses."""
    with get_connection() as conn:
        _get_session(conn, session_id)
        rows = conn.execute(
            """
            SELECT analysis_id, requirement_id, criterion_id,
                   decision, substituted_text, decided_at
            FROM final_ai_review_decisions
            WHERE session_id = %s
            ORDER BY analysis_id, requirement_id, criterion_id
            """,
            (session_id,),
        ).fetchall()
    return rows

@router.post("/{session_id}/ai-decisions")
def save_ai_decision(session_id: UUID, data: AIReviewDecisionCreate):
    if data.decision in ("substitute", "suggest") and not (data.substituted_text or "").strip():
        raise HTTPException(
            status_code=400,
            detail="substituted_text is required for substitute and suggest decisions",
        )

    with get_connection() as conn:
        session = _get_session(conn, session_id, for_update=True)
        _require_active_stage(session, "ai_review")

        analysis = conn.execute(
            """
            SELECT status FROM ai_analyses
            WHERE id = %s AND session_id = %s
            """,
            (data.analysis_id, session_id),
        ).fetchone()
        if analysis is None:
            raise HTTPException(status_code=404, detail="AI analysis not found for session")
        if analysis["status"] != "completed":
            raise HTTPException(status_code=409, detail="AI analysis is not completed")

        saved = conn.execute(
            """
            INSERT INTO ai_review_decisions
                (session_id, analysis_id, requirement_id, criterion_id,
                 decision, substituted_text)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, decided_at
            """,
            (
                session_id,
                data.analysis_id,
                data.requirement_id,
                data.criterion_id,
                data.decision,
                data.substituted_text if data.decision in ("substitute", "suggest") else None,
            ),
        ).fetchone()

    return {"id": saved["id"], "decided_at": saved["decided_at"]}

# TODO: confidence enpoints 
