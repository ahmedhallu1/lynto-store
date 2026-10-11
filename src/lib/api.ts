export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const init: RequestInit = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'network', 'Network error. Check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? data?.error ?? `Request failed (${res.status})`, data?.details);
  return data as T;
}

export const api = {
  get: <T>(url: string, headers?: Record<string, string>) => request<T>('GET', url, undefined, headers),
  post: <T>(url: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', url, body ?? {}, headers),
};

const ADMIN_HEADERS = { 'x-lynto-csrf': '1' };
export const adminApi = {
  get: <T>(url: string) => request<T>('GET', `/api/admin${url}`, undefined, ADMIN_HEADERS),
  post: <T>(url: string, body?: unknown) => request<T>('POST', `/api/admin${url}`, body ?? {}, ADMIN_HEADERS),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', `/api/admin${url}`, body ?? {}, ADMIN_HEADERS),
  del: <T>(url: string) => request<T>('DELETE', `/api/admin${url}`, undefined, ADMIN_HEADERS),
  upload: <T>(url: string, form: FormData) => request<T>('POST', `/api/admin${url}`, form, ADMIN_HEADERS),
};
