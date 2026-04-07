import api from '../api/api';

const getFilenameFromDisposition = (disposition, fallbackName) => {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match?.[1]) return fallbackName;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const readBlobAsJson = async (blob) => {
  try {
    const text = await blob.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export async function downloadPdf(endpoint, fallbackName = 'report.pdf') {
  try {
    const response = await api.get(endpoint, { responseType: 'blob' });
    const filename = getFilenameFromDisposition(
      response.headers?.['content-disposition'],
      fallbackName
    );

    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    if (error?.response?.data instanceof Blob) {
      const parsed = await readBlobAsJson(error.response.data);
      if (parsed) {
        error.response.data = parsed;
      }
    }
    throw error;
  }
}
