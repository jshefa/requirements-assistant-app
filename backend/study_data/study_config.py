STUDY_CONFIG = {
  "min_read_minutes": 5,
  "manual_review_max_minutes": 25,
  "ai_review_max_minutes": 25,
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

CONFIDENCE_SURVEY = {
    "version": "v4",
    "title": "Requirements Quality Assessment: Human Performance, Human–AI Teaming, and User Perceptions",
    "description": "This survey asks about your background and perceptions regarding using the AI prototype to evaluate engineering requirements. Requirements quality assessment (RQA) means evaluating requirements against the INCOSE quality criteria.",
    "instructions": "Answer based on your own experience. There are no right or wrong answers. Select one response per question unless otherwise stated. You may skip any question you do not wish to answer.",
    "pre": [
        {
            "id": "background",
            "title": "1. Participant background",
            "questions": [
                {
                    "id": "age",
                    "number": "1.1",
                    "question": "How old are you?",
                    "type": "integer",
                    "answer_prompt": "______ years old",
                },
                {
                    "id": "gender",
                    "number": "1.2",
                    "question": "How do you identify?",
                    "type": "single_choice",
                    "options": [
                        "Male",
                        "Female",
                        "Nonbinary",
                        "Other",
                        "Prefer not to say",
                    ],
                },
                {
                    "id": "education",
                    "number": "1.3",
                    "question": "What is your educational background?",
                    "type": "education_matrix",
                    "instructions": "Educational Background. Please fill in all of your degrees and / or certifications",
                    "columns": [
                        "Education",
                        "Completed",
                        "Subject Area (e.g., Chemistry) Please no acronyms",
                    ],
                    "rows": [
                        "Highschool",
                        "Bachelors",
                        "Masters",
                        "Doctorate",
                        "Other (Please Specify)",
                    ],
                    "completion_options": ["No", "Yes", "Current"],
                    "placeholder": "Not specified",
                },
            ],
        },
        {
            "id": "requirements_experience",
            "title": "2. Requirements engineering experience",
            "questions": [
                {
                    "id": "requirements_coursework_years",
                    "number": "2.1",
                    "question": "How much coursework or training experience do you have in requirements engineering?",
                    "type": "decimal",
                    "answer_prompt": "______ years (Decimals accepted; enter 0 if none).",
                },
                {
                    "id": "requirements_research_professional_years",
                    "number": "2.2",
                    "question": "How much research and/or professional experience do you have in requirements engineering?",
                    "type": "decimal",
                    "answer_prompt": "______ years (Decimals accepted; enter 0 if none).",
                },
                {
                    "id": "systems_engineering_years",
                    "number": "2.3",
                    "question": "How much experience do you have in systems engineering, including coursework, training, research, or professional practice?",
                    "type": "decimal",
                    "answer_prompt": "______ years (Decimals accepted; enter 0 if none).",
                },
            ],
        },
        {
            "id": "ai_experience",
            "title": "3. Prior experience with AI tools",
            "instructions": "For this section, consider AI tools you intentionally use for coursework, research, work, or personal tasks, such as ChatGPT, Claude, Gemini, or AI coding assistants.",
            "questions": [
                {
                    "id": "ai_usage_frequency",
                    "number": "3.1",
                    "question": "How often do you use AI tools?",
                    "type": "single_choice",
                    "options": [
                        "Never",
                        "Less than once a month",
                        "At least monthly but less than weekly",
                        "At least weekly but less than daily",
                        "Daily, for less than 1 hour in total",
                        "Daily, for 1 hour or more in total",
                    ],
                },
                {
                    "id": "ai_usage_years",
                    "number": "3.2",
                    "question": "For how long have you been using AI tools?",
                    "type": "decimal",
                    "answer_prompt": "______ years (Decimals accepted; enter 0 if never used).",
                },
            ],
        },
        {
            "id": "ai_perceptions",
            "title": "4. Perceptions of the AI prototype",
            "instructions": "Select one response per row.",
            "scale_instructions": "1 = Strongly disagree; 2 = Disagree; 3 = Neither agree nor disagree; 4 = Agree; 5 = Strongly agree",
            "type": "likert_groups",
            "groups": [
                {
                    "title": "Performance expectancy",
                    "questions": [
                        {
                            "id": "performance_useful",
                            "question": "I would find the AI prototype useful for RQA tasks.",
                        },
                        {
                            "id": "performance_speed",
                            "question": "Using the AI prototype would enable me to accomplish RQA tasks more quickly.",
                        },
                        {
                            "id": "performance_productivity",
                            "question": "Using the AI prototype would increase my productivity in RQA tasks.",
                        },
                    ],
                },
                {
                    "title": "Effort expectancy",
                    "questions": [
                        {
                            "id": "effort_clear",
                            "question": "My interaction with the AI prototype would be clear and understandable.",
                        },
                        {
                            "id": "effort_skillful",
                            "question": "It would be easy for me to become skillful at using the AI prototype.",
                        },
                        {
                            "id": "effort_easy_to_use",
                            "question": "I would find the AI prototype easy to use.",
                        },
                        {
                            "id": "effort_easy_to_learn",
                            "question": "Learning to operate the AI prototype would be easy for me.",
                        },
                    ],
                },
                {
                    "title": "Behavioral intention",
                    "questions": [
                        {
                            "id": "intention_intend",
                            "question": "I intend to use the AI prototype during the upcoming RQA tasks.",
                        },
                        {
                            "id": "intention_expect",
                            "question": "I expect to use the AI prototype during the upcoming RQA tasks.",
                        },
                        {
                            "id": "intention_plan",
                            "question": "I plan to use the AI prototype during the upcoming RQA tasks.",
                        },
                    ],
                },
            ],
        },
        {
            "id": "pre_confidence",
            "title": "5. Self-confidence and confidence in AI",
            "instructions": "Rate your own ability and the AI prototype’s ability separately. Select one response per row.",
            "scale_instructions": "1 = Very bad; 2 = Bad; 3 = Neutral; 4 = Good; 5 = Very good",
            "type": "likert",
            "questions": [
                {
                    "id": "pre_self_confidence",
                    "question": "How good are you in evaluating the quality of engineering requirements?",
                },
                {
                    "id": "pre_ai_confidence",
                    "question": "How good would the AI prototype be in evaluating the quality of engineering requirements?",
                },
            ],
        },
    ],
    "post": [
        {
            "id": "post_confidence",
            "title": "6. Self-confidence and confidence in AI",
            "instructions": "Based on this session, rate your own ability and the AI prototype’s ability separately. Select one response per row.",
            "scale_instructions": "1 = Very bad; 2 = Bad; 3 = Neutral; 4 = Good; 5 = Very good",
            "type": "likert",
            "questions": [
                {
                    "id": "post_self_confidence",
                    "question": "How good are you in evaluating the quality of engineering requirements?",
                },
                {
                    "id": "post_ai_confidence",
                    "question": "How good is the AI prototype in evaluating the quality of engineering requirements?",
                },
            ],
        },
    ],
}