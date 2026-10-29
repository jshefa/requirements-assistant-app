import axios from "axios";

export async function logStudyEvent(sessionId, event) {
  const res = await axios.post(`/api/study/sessions/${sessionId}/log`, event);
  return res.data;
}

export async function getManualEvals(sessionId) {
  const res = await axios.get(`/api/study/sessions/${sessionId}/manual-evals`);
  return res.data;
}

export async function saveManualEval(
  sessionId,
  requirementId,
  criterionId,
  selected,
  notes = null,
) {
  const res = await axios.post(
    `/api/study/sessions/${sessionId}/manual-evals`,
    {
      requirement_id: requirementId,
      criterion_id: criterionId,
      selected,
      notes,
    },
  );
  return res.data;
}

export async function getAIDecisions(sessionId) {
  const res = await axios.get(`/api/study/sessions/${sessionId}/ai-decisions`);
  return res.data;
}

export async function saveAIDecision(
  sessionId,
  analysisId,
  requirementId,
  criterionId,
  decision,
  substitutedText = null,
) {
  const res = await axios.post(
    `/api/study/sessions/${sessionId}/ai-decisions`,
    {
      analysis_id: analysisId,
      requirement_id: requirementId,
      criterion_id: criterionId,
      decision,
      substituted_text: substitutedText,
    },
  );
  return res.data;
}

export async function getConfidenceAnswers(sessionId) {
  const res = await axios.get(
    `/api/study/sessions/${sessionId}/confidence-answers`,
  );
  return res.data;
}

export async function saveConfidenceAnswer(sessionId, questionId, answer) {
  const res = await axios.post(
    `/api/study/sessions/${sessionId}/confidence-answers`,
    {
      question_id: questionId,
      answer,
    },
  );
  return res.data;
}
