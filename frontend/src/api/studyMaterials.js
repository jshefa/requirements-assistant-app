import axios from "axios";

export async function getStudyMaterials() {
  const response = await axios.get(`/api/study/materials/`);
  return response.data;
}

export async function getAnalysisSurvey() {
  const response = await axios.get(`/api/study/materials/analysis-survey`);
  return response.data;
}
