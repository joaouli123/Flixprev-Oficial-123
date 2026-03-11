export type Tutorial = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
};

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: string })?.error || `Erro ${response.status}`));
  }

  return payload as T;
}

export async function fetchTutorials() {
  const response = await fetch(`${getApiBaseUrl()}/api/tutorials`);
  return parseJsonResponse<Tutorial[]>(response);
}

export async function createTutorial(userId: string, payload: Omit<Tutorial, 'id' | 'created_at' | 'updated_at'>) {
  const response = await fetch(`${getApiBaseUrl()}/api/admin/tutorials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<Tutorial>(response);
}

export async function updateTutorial(userId: string, tutorialId: string, payload: Omit<Tutorial, 'id' | 'created_at' | 'updated_at'>) {
  const response = await fetch(`${getApiBaseUrl()}/api/admin/tutorials/${tutorialId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<Tutorial>(response);
}

export async function deleteTutorial(userId: string, tutorialId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/admin/tutorials/${tutorialId}`, {
    method: 'DELETE',
    headers: {
      'x-user-id': userId,
    },
  });

  return parseJsonResponse<{ success: boolean }>(response);
}

export function getYouTubeEmbedUrl(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = String(url || '').match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }

  return null;
}