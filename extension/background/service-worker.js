'use strict';

const DEFAULT_API_URL = 'https://promptperfect.vercel.app';
const DEFAULT_MODE = 'better';
const FETCH_TIMEOUT_MS = 30_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'OPTIMIZE') return false;

  (async () => {
    const settings = await chrome.storage.sync.get({
      apiUrl: DEFAULT_API_URL,
      mode: DEFAULT_MODE,
      apiKey: '',
    });
    const apiUrl =
      typeof settings.apiUrl === 'string' && settings.apiUrl.trim()
        ? settings.apiUrl.trim().replace(/\/$/, '')
        : DEFAULT_API_URL;

    // Prefer mode sent by the popup (live dropdown value) over the stored setting.
    // Fall back to stored mode for content-script calls that don't send one.
    const mode =
      typeof message.mode === 'string' && message.mode.trim()
        ? message.mode.trim()
        : typeof settings.mode === 'string' && settings.mode.trim()
          ? settings.mode.trim()
          : DEFAULT_MODE;

    const apiKey =
      typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';

    const url = `${apiUrl}/api/optimize-sync`;
    const body = { prompt: message.text, mode };
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        return {
          error:
            data.error ||
            data.message ||
            `Request failed (${res.status})`,
        };
      }
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        error: isTimeout
          ? 'Request timed out — check your API URL or connection'
          : err instanceof Error
            ? err.message
            : 'Network error — check API URL',
      };
    }
  })()
    .then(sendResponse)
    .catch((e) =>
      sendResponse({
        error: e instanceof Error ? e.message : 'Optimization failed',
      }),
    );

  return true;
});
