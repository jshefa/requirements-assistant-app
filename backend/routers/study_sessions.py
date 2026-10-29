from uuid import UUID

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, StringConstraints

from database import get_connection
from study_data.study_config import STUDY_CONFIG
from typing import Literal, Annotated
from study_analysis import research_analysis

router = APIRouter(prefix="/api/study/sessions", tags=["study-sessions"])

class SessionCreate(BaseModel):
    participant_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1)
    ]
    class_section: str

class AdvanceRequest(BaseModel):
    completion_reason: Literal["manual", "timeout"] = "manual"

SECTION_GROUPS = {
    "ISE-2804 Section 1": "human_ai",
    "ISE-2804 Section 2": "ai_only",
    "ISE-5804 Breakout Room 1": "grad_human_ai",
    "ISE-5804 Breakout Room 2": "grad_ai_only"
}

STAGE_FLOWS = {
    "human_ai": [
        "intro",
        "reading",
        "manual_instructions",
        "manual_review",
        "ai_instructions",
        "ai_review",
    ],
    "ai_only": [
        "intro",
        "reading",
        "ai_instructions",
        "ai_review",
    ],
    "grad_human_ai": [
        "intro",
        "confidence_instructions",
        "confidence",
        "reading",
        "manual_instructions",
        "manual_review",
        "ai_instructions",
        "ai_review",
        "post_confidence"
    ],
    "grad_ai_only": [
        "intro",
        "confidence_instructions",
        "confidence",
        "reading",
        "ai_instructions",
        "ai_review",
        "post_confidence"
    ]
}

def _get_experiment_group(class_section: str) -> str:
    group = SECTION_GROUPS.get(class_section)
    if group is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid class section"
        )
    return group

@router.post("/")
def create_session(data: SessionCreate, background_tasks: BackgroundTasks):
    experiment_group = _get_experiment_group(data.class_section)

    with get_connection() as conn:

        session = conn.execute("""
            INSERT INTO study_sessions
                (class_section, experiment_group)
            VALUES (%s, %s)
            RETURNING id, current_stage, experiment_group
        """, (
            data.class_section,
            experiment_group
        )).fetchone()

        conn.execute("""
            INSERT INTO participant_identity.name_mapping (session_id, full_name)
            VALUES (%s, %s)
        """, (session["id"], data.participant_name.strip()))

        conn.execute("""
            INSERT INTO study_stage_history
                (session_id, stage)
            VALUES (%s, %s)
        """, (
            session["id"],
            session["current_stage"]
        ))

    background_tasks.add_task(research_analysis, session["id"])

    return session

@router.get("/{session_id}")
def get_session(session_id: UUID):
    with get_connection() as conn:
        session = conn.execute("""
            SELECT
                s.id,
                s.class_section,
                s.experiment_group,
                s.current_stage,
                s.created_at,
                s.completed_at,
                h.started_at AS stage_started_at
            FROM study_sessions s
            LEFT JOIN study_stage_history h
                ON h.session_id = s.id
                AND h.completed_at IS NULL
            WHERE s.id = %s
        """, (session_id,)).fetchone()

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

    return {**session, "config": STUDY_CONFIG}

@router.post("/{session_id}/advance")
def advance_section(session_id: UUID, data: AdvanceRequest | None = None):
    completion_reason = data.completion_reason if data else "manual"
    with get_connection() as conn:

        # retrieve and lock the session
        session = conn.execute("""
            SELECT current_stage, experiment_group, completed_at
            FROM study_sessions
            WHERE id = %s
            FOR UPDATE
        """, (session_id,)).fetchone()

        if session is None:
            raise HTTPException(404, "Session not found")

        if session["completed_at"] is not None:
            raise HTTPException(409, "Session already completed")

        current_stage = session["current_stage"]
        group = session["experiment_group"]

        # if during context/requirement reading, make sure the student can only advance if after minumum reading time 
        if current_stage == "reading" and group in ["ai_only", "grad_ai_only"]:
            result = conn.execute("""
                SELECT
                    started_at + (%s * INTERVAL '1 minute') <= NOW() AS allowed
                FROM study_stage_history
                WHERE session_id = %s
                AND stage = 'reading'
                AND completed_at IS NULL
            """, (STUDY_CONFIG["min_read_minutes"], session_id)).fetchone()

            if result is None or not result["allowed"]:
                raise HTTPException(
                    status_code=409,
                    detail="Minimum reading time has not elapsed."
                )

        stages = STAGE_FLOWS.get(group)

        if stages is None or current_stage not in stages:
            raise HTTPException(400, "Invalid experiment stage configuration")

        current_index = stages.index(current_stage)

        next_stage = (
            stages[current_index + 1]
            if current_index + 1 < len(stages)
            else None
        )

        # finish current stage
        curr_stage = conn.execute("""
            UPDATE study_stage_history
            SET completed_at = NOW(),
                completion_reason = %s
            WHERE session_id = %s
                AND stage = %s
                AND completed_at IS NULL
            RETURNING id
        """, (completion_reason, session_id, current_stage)).fetchone()

        if curr_stage is None:
            raise HTTPException(409, "No active stage record found")

        if next_stage is None:
            # experiment is finished
            conn.execute("""
                UPDATE study_sessions
                SET current_stage = 'completed',
                    completed_at = NOW()
                WHERE id = %s
            """, (session_id,))

            next_stage = "completed"

        else:
            # start the next stage
            conn.execute("""
                INSERT INTO study_stage_history (session_id, stage)
                VALUES (%s, %s)
            """, (session_id, next_stage))

            # update current session stage
            conn.execute("""
                UPDATE study_sessions
                SET current_stage = %s
                WHERE id = %s
            """, (next_stage, session_id))

    return {
        "session_id": session_id,
        "current_stage": next_stage
    }

@router.get("/{session_id}/analysis")
def get_study_analysis(session_id: UUID):
    with get_connection() as conn:
        session = conn.execute(
            "SELECT id FROM study_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()

        if session is None:
            raise HTTPException(404, "Session not found")

        analysis = conn.execute("""
            SELECT id, status, result
            FROM ai_analyses
            WHERE session_id = %s
            ORDER BY started_at DESC, id DESC
            LIMIT 1
        """, (session_id,)).fetchone()

    if analysis is None:
        return {
            "analysis_id": None,
            "status": "pending",
            "result": None
        }

    if analysis["status"] == "failed":
        return {
            "analysis_id": analysis["id"],
            "status": "failed",
            "result": None,
            "error": (analysis["result"] or {}).get(
                "error", "AI analysis failed."
            )
        }

    return {
        "analysis_id": analysis["id"],
        "status": analysis["status"],
        "result": (
            analysis["result"]
            if analysis["status"] == "completed"
            else None
        )
    }

@router.post("/{session_id}/retry-analysis")
def retry_analysis(session_id: UUID, background_tasks: BackgroundTasks):
    with get_connection() as conn:
        session = conn.execute(
            "SELECT id FROM study_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
        if session is None:
            raise HTTPException(404, "Session not found")
        analysis = conn.execute("""
                    SELECT id, status
                    FROM ai_analyses
                    WHERE session_id = %s
                    ORDER BY started_at DESC, id DESC
                    LIMIT 1
                """, (session_id,)).fetchone()
    if analysis is None or analysis["status"] != "failed":
        raise HTTPException(status_code=409, detail="Analysis already in progress")
    
    background_tasks.add_task(research_analysis, session["id"])
    return {"status": "queued", "message": "AI analysis retry scheduled"}
        
        
    