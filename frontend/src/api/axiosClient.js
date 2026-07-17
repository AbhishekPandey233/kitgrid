import axios from 'axios';

const STATE_CHANGING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const REFRESH_PATH = '/auth/refresh';
const CSRF_TOKEN_PATH = '/auth/csrf-token';
const CSRF_ERROR_MESSAGE = 'Invalid or missing CSRF token';

let csrfToken = null;

function setCsrfToken(token) {
  csrfToken = token;
}

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

axiosClient.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (STATE_CHANGING_METHODS.has(method) && csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

let refreshPromise = null;
let csrfRefreshPromise = null;

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (!response || !config) return Promise.reject(error);

    const isRefreshCall = config.url === REFRESH_PATH;
    const isCsrfTokenCall = config.url === CSRF_TOKEN_PATH;

    // csrfToken lives only in this module's memory (never storage) — anything that resets
    // the JS runtime without a full auth re-check (a dev-server hot reload, a stale tab
    // resumed after the page's module state was otherwise cleared) can leave it null or
    // pointing at an old session even though the user is still genuinely logged in. Rather
    // than surface that as a dead end, fetch a fresh token once and retry — the same
    // self-healing shape as the 401/refresh case below.
    if (response.status === 403 && response.data?.error === CSRF_ERROR_MESSAGE && !isCsrfTokenCall && !config._csrfRetried) {
      config._csrfRetried = true;
      try {
        csrfRefreshPromise = csrfRefreshPromise || axiosClient.get(CSRF_TOKEN_PATH);
        const { data } = await csrfRefreshPromise;
        setCsrfToken(data.csrfToken);
        return axiosClient(config);
      } catch (csrfError) {
        return Promise.reject(error);
      } finally {
        csrfRefreshPromise = null;
      }
    }

    if (response.status !== 401 || config._retried || isRefreshCall) {
      return Promise.reject(error);
    }
    config._retried = true;

    try {
      refreshPromise = refreshPromise || axiosClient.post(REFRESH_PATH);
      await refreshPromise;
      return axiosClient(config);
    } catch (refreshError) {
      return Promise.reject(error);
    } finally {
      refreshPromise = null;
    }
  }
);

export { setCsrfToken };
export default axiosClient;
