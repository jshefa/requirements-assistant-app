STUDY_CONFIG = {
  "min_read_minutes": .1,
  "manual_review_max_minutes": .25,
  "ai_review_max_minutes": .25,
  "timer_grace_period": 5,
  "timed_read_groups": ["ai_only", "grad_ai_only"],
  "MATERIALS_USED": "point-mass-v1"
}

ANALYSIS_SURVEY = {
    "analysis_survey": {
        "question": "Based on the INCOSE criteria below, which requirement quality characteristic(s) does PLACEHOLDER fail to satisfy?",
        "question_info": "(Select all quality characteristics that apply. If you believe the requirement has no issues, please select the corresponding option.)",
        "choices": {
            "A1": "No issues found with the requirement.",
            "A2": "Necessary: The requirement statement defines a capability, characteristic, constraint, or quality factor needed to satisfy a life cycle concept, need, source, or parent requirement.",
            "A3": "Appropriate: The specific intent and amount of detail of the requirement statement is appropriate to the level (e.g., the level of abstraction, organization, or system architecture) of the entity to which it refers.",
            "A4": "Unambiguous: The requirement statement is stated such that the intent is clear and the requirement can be interpreted in only one way by all the intended stakeholders.",
            "A5": "Complete: The requirement statement sufficiently describes the necessary capability, characteristic, constraint, conditions, or quality factor to meet the need, source, or higher-level requirement from which it was transformed.",
            "A6": "Singular: The requirement statement states a single capability, characteristic, constraint, or quality factor.",
            "A9": "Correct: The requirement statement is an accurate representation of the need, source, or higher-level requirement from which it was transformed.",
            "A10": "Conforming: The requirement statement conforms to an approved standard pattern and style guide or standard for writing and managing requirements."
        }
    }
}