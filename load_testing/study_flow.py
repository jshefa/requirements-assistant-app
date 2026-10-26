from locust.exception import StopUser
import gevent
import random
from config import *
import uuid
import time

def run_study(user):
    session_id = create_session(user)
    session = get_session(user, session_id)
    group = session["experiment_group"]
    for call in STAGE_FLOWS[group]:
        call(user, session_id)

def create_session(user):
    response = user.client.post(
        "/api/study/sessions/",
        json={
            "participant_name": f"test_{uuid.uuid4().hex[:12]}",
            "class_section": CLASS
        },
        name="Create session"
    )
    if not response.ok:
        raise StopUser()
    return response.json()["id"]

def advance_stage(user, session_id):
    response = user.client.post(
        f"/api/study/sessions/{session_id}/advance",
        json={
            "completion_reason": "manual"
        },
        name="Advance Stage")
    if not response.ok:
        raise StopUser()

def get_session(user, session_id):
    response = user.client.get(
        f"/api/study/sessions/{session_id}",
        name="Get Session"
    )
    if not response.ok:
        raise StopUser()
    vals = response.json()
    return {"experiment_group": vals["experiment_group"], "config": vals["config"]}

def get_materials(user):
    response = user.client.get(
        "/api/study/materials",
        name="Get Materials"
    )
    if not response.ok:
        raise StopUser()
    return response.json()

def get_analysis(user, session_id):
    deadline = time.monotonic() + 600

    while time.monotonic() < deadline:
        response = user.client.get(
            f"/api/study/sessions/{session_id}/analysis",
            name="Get Analysis"
        )

        if not response.ok:
            raise StopUser()

        data = response.json()
        status = data["status"]

        if status == "completed":
            return data

        if status == "failed":
            raise StopUser()

        if status not in ("pending", "running"):
            raise RuntimeError(f"Unexpected analysis status: {status}")

        gevent.sleep(3)

    raise RuntimeError("AI analysis timed out")

def get_ai_decisions(user, session_id):
    response = user.client.get(
        f"/api/study/sessions/{session_id}/ai-decisions",
        name="Get AI Decisions"
    )
    if not response.ok:
        raise StopUser()

def manual_review_choice(user, session_id, criterion_id, requirement_id, notes="", selected=True):
    payload = {
        "criterion_id": criterion_id,
        "notes": notes,
        "requirement_id": requirement_id,
        "selected": selected
    }
    response = user.client.post(
        f"/api/study/sessions/{session_id}/manual-evals",
        json=payload,
        name="Manual Review Choice"
    )
    if not response.ok:
        raise StopUser()

def ai_review_choice(user, session_id, criterion_id, requirement_id, decision, analysis_id, substituted_text=None):
    payload = {
        "analysis_id": analysis_id,
        "criterion_id": criterion_id,
        "decision": decision,
        "requirement_id": requirement_id,
        "substituted_text": substituted_text
    }
    response = user.client.post(
        f"/api/study/sessions/{session_id}/ai-decisions",
        json=payload,
        name="AI Review Choice"
    )
    if not response.ok:
        raise StopUser()

def click_event(user, session_id, criterion_id, requirement_id, event_type, event_data=None):
    payload = {
            "criterion_id": criterion_id,
            "event_type": event_type,
            "requirement_id": requirement_id,
            **({"event_data": event_data} if event_data else {})
        }
    
    response = user.client.post(
        f"/api/study/sessions/{session_id}/log",
        json=payload,
        name="Click Event"
    )
    if not response.ok:
        raise StopUser()

def intro_section(user, session_id):
    get_session(user, session_id)
    wait(1, 15)
    advance_stage(user, session_id)

def read_section(user, session_id):
    session = get_session(user, session_id)
    get_materials(user)

    # reading 
    if session["experiment_group"] in ["ai_only", "grad_ai_only"]:
        wait_time = float(session["config"]["min_read_minutes"]) * 60
        wait(wait_time + 2, wait_time + 5, False)
    else:
        wait(1, 30)

    advance_stage(user, session_id)

def manual_review_section(user, session_id):
    get_session(user, session_id)
    materials = get_materials(user)

    requirements = materials["requirements"]
    # answer each requirement
    for index, req in enumerate(requirements):
        req_id = req["id"]
        # decide which criteria they select
        num_criteria = random.randint(0, 7)
        criteria_chosen = []
        if num_criteria == 0:
            criteria_chosen.append("A1")
        for i in random.sample(range(1,8), num_criteria):
            criteria_chosen.append(CRITERIA[i])

        # answer each criteria 
        for criterion in criteria_chosen:
            manual_review_choice(user, session_id, criterion, req_id)
            wait(1, 5)
            if criterion != "A1":
                click_event(user, session_id, criterion, req_id, "reasoning_focused")
                wait(10,120)
                click_event(user, session_id, criterion, req_id, "reasoning_blurred")
                manual_review_choice(user, session_id, criterion, req_id, "example response")
            wait(3,15)
            if random.random() < .05: # deselect
                manual_review_choice(user, session_id, criterion, req_id, "", False)
        wait(1, 5)
        if index < len(requirements) - 1:
            next_req_id = requirements[index + 1]["id"]
            click_event(user, session_id, criterion, req_id, "requirement_next", {"to": next_req_id})

    advance_stage(user, session_id) 

# TODO
def confidence_survey_section(user, session_id):
    get_session(user, session_id)
    wait(1, 15)
    advance_stage(user, session_id)

def ai_review_section(user, session_id):
    get_session(user, session_id)
    get_ai_decisions(user, session_id)
    analysis = get_analysis(user, session_id)
    requirements = analysis["result"]["requirements"]
    analysis_id = analysis["analysis_id"]

    # answer each requirement
    for index, req in enumerate(requirements):
        # answer each criteria
        req_id = req["req_id"] 
        evals = req["criteria_evaluations"]
        for criterion in evals:
            wait(5, 20)
            crit_id = criterion["criterion_id"]
            if criterion["satisfied"] == True:
                if random.random() < 0.1:
                    click_event(user, session_id, crit_id, req_id,  "ai_suggestion_focused")
                    wait(5,30)
                    click_event(user, session_id, crit_id, req_id, "ai_suggestion_blurred")
                    ai_review_choice(user, session_id, crit_id, req_id, "suggest", analysis_id, "example suggestion")
                continue
            else:
                select_type = random.random()
                if select_type < .2: # modify
                    ai_review_choice(user, session_id, crit_id, req_id, "substitute", analysis_id, "example substitution")
                    click_event(user, session_id, crit_id, req_id, "ai_substitution_focused")
                    wait(5,30)
                    click_event(user, session_id, crit_id, req_id, "ai_substitution_blurred")
                    ai_review_choice(user, session_id, crit_id, req_id, "substitute", analysis_id, "example substitution")
                elif select_type < .6: # accept 
                    ai_review_choice(user, session_id, crit_id, req_id, "accept", analysis_id)
                else: # reject
                    ai_review_choice(user, session_id, crit_id, req_id, "reject", analysis_id)
        wait(2, 10)
        if index < len(requirements) - 1:
            next_req_id = requirements[index + 1]["req_id"]
            click_event(user, session_id, None, req_id, "requirement_next", {"to": next_req_id})


    advance_stage(user, session_id)

def wait(min_seconds, max_seconds, use_time_scale=True):
    rand = random.uniform(min_seconds, max_seconds)
    time_to_sleep = TIME_SCALE * rand if use_time_scale else rand 
    gevent.sleep(time_to_sleep)

STAGE_FLOWS = {
    "human_ai": [
        intro_section,
        read_section,
        manual_review_section,
        ai_review_section
    ],
    "ai_only": [
        intro_section,
        read_section,
        ai_review_section
    ],
    "grad_human_ai": [
        intro_section,
        confidence_survey_section,
        read_section,
        manual_review_section,
        ai_review_section
    ],
    "grad_ai_only": [
        intro_section,
        confidence_survey_section,
        read_section,
        ai_review_section
    ]
}