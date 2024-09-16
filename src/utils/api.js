const API_BASE_URL = 'http://localhost:5010';

export const fetchProjects = async () => {
  const response = await fetch(`${API_BASE_URL}/projects`);
  const data = await response.json();
  return data;
};

export const fetchRecentDocuments = async () => {
  const response = await fetch(`${API_BASE_URL}/documents`);
  const data = await response.json();
  return data;
};

export const fetchTeamActivity = async () => {
  const response = await fetch(`${API_BASE_URL}/team-activity`);
  const data = await response.json();
  return data;
};

export const fetchFileContent = async (fileName) => {
  const response = await fetch(`${API_BASE_URL}/api/convert-document/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.content || !data.fileType) {
    throw new Error('Invalid response format from server');
  }
  return {
    content: data.content,
    fileType: data.fileType
  };
};