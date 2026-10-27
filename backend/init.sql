-- stores data about the user's session. one user can have multiple sessions, but we won't be doing that for the sake of the experiment
CREATE TABLE study_sessions (
    id UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    class_section       TEXT NOT NULL,
    experiment_group    TEXT NOT NULL,
    current_stage       TEXT NOT NULL DEFAULT 'intro',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

-- stores the answers to the confidence survey. This includes changes that are later overwritten.
CREATE TABLE confidence_answers (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    question_id         TEXT NOT NULL,
    answer              JSONB NOT NULL,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- stores the answers to the manual analysis survey. This includes changes that are later overwritten.
CREATE TABLE manual_evals (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id          UUID NOT NULL REFERENCES study_sessions(id),
    requirement_id      TEXT NOT NULL,
    criterion_id        TEXT NOT NULL,
    selected            BOOLEAN NOT NULL,
    notes               TEXT,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- information about a session's specific AI analysis 
CREATE TABLE ai_analyses (
    id UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    provider            TEXT NOT NULL,
    model               TEXT NOT NULL,
    status              TEXT NOT NULL
        CHECK (status IN ('running', 'completed', 'failed')),
    result              JSONB,
    system_prompt       TEXT NOT NULL,
    material_version    TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

-- stores the changes to the ai analysis review (accepts/rejects/modifies). This includes changes that are later overwritten.
CREATE TABLE ai_review_decisions (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    analysis_id UUID    NOT NULL REFERENCES ai_analyses(id),
    requirement_id      TEXT NOT NULL,
    criterion_id        TEXT NOT NULL,
    decision            TEXT NOT NULL
        CHECK (decision IN ('accept', 'reject', 'substitute', 'suggest')),
    substituted_text    TEXT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- stores timestamps for when the user completes each stage 
CREATE TABLE study_stage_history (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    stage               TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    completion_reason TEXT CHECK (completion_reason IN ('manual', 'timeout'))
);

/* stores extra timestamps for the following other interactions: 
    - requirement_next : participant clicks next requirement within manual evaluation 
    - requirement_previous : participant clicks previous requirement within manual evaluation 
    - context_opened : participant opens context/conops pane during manual evaluation or ai review
    - context_closed : participant closes context/conops pane during manual evaluation or ai review
    - reasoning_focused : participant focuses on manual criterion reasoning box
    - reasoning_blurred : participant blurred/unfocuses manual criterion reasoning box
    - ai_substitution_focused : participant focuses on ai violation substitution box
    - ai_substitution_blurred : participant blurs/unfocuses ai violation substitution box
    - ai_suggestion_focused : participant focuses on unviolated suggestion box
    - ai_suggestion_blurred : participant blurs/unfocuses unviolated suggested box
    - tab_hidden : participant tabs out from experiment
    - tab_visible : participant tabs into experiment
    - page_refreshed : participant refreshes the page 
    - survey_section_next : participant clicks next requirement within survey section
    - survey_section_previous : participant clicks next requirement within survey section
*/
CREATE TABLE study_interaction_events (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id          UUID NOT NULL REFERENCES study_sessions(id),
    stage               TEXT NOT NULL,
    requirement_id      TEXT,
    criterion_id        TEXT,
    event_type          TEXT NOT NULL,
    event_data          JSONB,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX one_active_stage_per_session
ON study_stage_history (session_id)
WHERE completed_at IS NULL;

-- these views give the final answers to each section. The main tables also store stale replaced ones, these are only the final results
CREATE VIEW final_confidence_answers AS
SELECT DISTINCT ON (session_id, question_id)
    session_id,
    question_id,
    answer,
    answered_at
FROM confidence_answers
ORDER BY session_id, question_id, id DESC;

CREATE VIEW final_manual_evals AS
SELECT DISTINCT ON (session_id, requirement_id, criterion_id)
    session_id,
    requirement_id,
    criterion_id,
    selected,
    notes,
    answered_at
FROM manual_evals
ORDER BY session_id, requirement_id, criterion_id, id DESC;

CREATE VIEW final_ai_review_decisions AS
SELECT DISTINCT ON (
    session_id,
    analysis_id,
    requirement_id,
    criterion_id
)
    session_id,
    analysis_id,
    requirement_id,
    criterion_id,
    decision,
    substituted_text,
    decided_at
FROM ai_review_decisions
ORDER BY
    session_id,
    analysis_id,
    requirement_id,
    criterion_id,
    id DESC;

CREATE SCHEMA participant_identity;

CREATE TABLE participant_identity.name_mapping (
    session_id UUID PRIMARY KEY REFERENCES public.study_sessions(id),
    full_name TEXT NOT NULL
);