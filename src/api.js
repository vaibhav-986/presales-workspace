export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
    this.rows = body?.error?.rows || [];
  }
}

export async function request(path, options = {}, csrfToken = '') {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    let body;
    try { body = await response.json(); } catch { body = null; }
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return null;
  if (options.responseType === 'blob') return response.blob();
  return response.json();
}
