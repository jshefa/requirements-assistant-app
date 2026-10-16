CREATE TABLE study_sessions (
    id UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    vt_pid              TEXT,
    class_section       TEXT NOT NULL,
    experiment_group    TEXT NOT NULL,
    current_stage       TEXT NOT NULL DEFAULT 'intro',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE TABLE confidence_answers (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    question_id         TEXT NOT NULL,
    answer              INTEGER NOT NULL,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE manual_evals (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    requirement_id      TEXT NOT NULL,
    criterion_id        TEXT NOT NULL,
    violated            BOOLEAN NOT NULL,
    notes               TEXT,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_analyses (
    id UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    provider            TEXT NOT NULL,
    model               TEXT NOT NULL,
    status              TEXT NOT NULL
        CHECK (status IN ('running', 'completed', 'failed')),
    result              JSONB,
    system_prompt       TEXT NOT NULL,
    user_prompt         TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE TABLE ai_review_decisions (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    analysis_id UUID    NOT NULL REFERENCES ai_analyses(id),
    requirement_id      TEXT NOT NULL,
    criterion_id        TEXT NOT NULL,
    decision            TEXT NOT NULL
        CHECK (decision IN ('accept', 'reject', 'substitute')),
    substituted_text    TEXT,
    decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE study_stage_history (
    id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID     NOT NULL REFERENCES study_sessions(id),
    stage               TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);