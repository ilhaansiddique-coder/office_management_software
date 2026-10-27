const API_BASE_URL = import.meta.env.VITE_LOCAL_API_URL || "";
const SESSION_TOKEN_KEY = "office-management-session-token";

export const getLocalSessionToken = () => localStorage.getItem(SESSION_TOKEN_KEY);

export const setLocalSessionToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }
};

export const localApiFetch = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const token = getLocalSessionToken();
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Local API request failed (${response.status}).`);
  }
  return result as T;
};
