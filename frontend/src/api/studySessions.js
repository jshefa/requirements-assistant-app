import axios from "axios";

export async function createStudySession(vtPid, classSection) {
  const response = await axios.post(`/api/study/sessions/`, {
    vt_pid: vtPid,
    class_section: classSection,
  });
  return response.data;
}

export async function getStudySession(sessionId) {
  const response = await axios.get(`/api/study/sessions/${sessionId}`);
  return response.data;
}

export async function advanceStudySession(
  sessionId,
  completionReason = "manual",
) {
  const response = await axios.post(
    `/api/study/sessions/${sessionId}/advance`,
    { completion_reason: completionReason },
  );
  return response.data;
}

export async function getStudyAnalysis(sessionId) {
  const response = await axios.get(`/api/study/sessions/${sessionId}/analysis`);
  return response.data;
}

export async function retryStudyAnalysis(sessionId) {
  const response = await axios.post(
    `/api/study/sessions/${sessionId}/retry-analysis`,
  );
  return response.data;
}
