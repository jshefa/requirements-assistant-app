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

export async function advanceStudySession(sessionId) {
  const response = await axios.post(`/api/study/sessions/${sessionId}/advance`);
  return response.data;
}
