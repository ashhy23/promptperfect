'use strict';

const DEFAULT_API_URL = 'https://promptperfect.vercel.app';

// ── Element refs ──────────────────────────────────────────────────────────────
const promptInput    = document.getElementById('promptInput');
const modeEl         = document.getElementById('mode');
const optimizeBtn    = document.getElementById('optimizeBtn');
const optimizeStatus = document.getElementById('optimizeStatus');
const resultSection  = document.getElementById('resultSection');
const resultOutput   = document.getElementById('resultOutput');
const copyBtn        = document.getElementById('copyBtn');

const apiUrlEl   = document.getElementById('apiUrl');
const apiKeyEl   = document.getElementById('apiKey');
const saveBtn    = document.getElementById('save');
const connStatus = document.getElementById('connStatus');

const versionEl  = document.getElementById('ext-version');
const linkAppEl  = document.getElementById('link-app');
const linkDocsEl = document.getElementById('link-docs');

// ── Helpers ───────────────────────────────────────────────────────────────────
function originFromUrl(raw) {
  const s = (raw || DEFAULT_API_URL).trim().replace(/\/$/, '');
  try { return new URL(s).origin; } catch { return DEFAULT_API_URL; }
}

function updateDocLinks(apiUrlValue) {
  const origin = originFromUrl(apiUrlValue);
  linkAppEl.href  = origin + '/';
  linkDocsEl.href = origin + '/docs';
}

function setOptimizeStatus(msg, isError) {
  optimizeStatus.textContent = msg;
  optimizeStatus.className   = isError ? 'err' : '';
}

function setConnStatus(connected) {
  connStatus.textContent = connected ? '✅ Connected' : '❌ Not connected';
  connStatus.className   = connected ? 'connected' : 'disconnected';
}

async function checkConnection() {
  const origin  = originFromUrl(apiUrlEl.value);
  const pingUrl = origin + '/api/optimize-sync';
  try {
    const res = await fetch(pingUrl, { method: 'OPTIONS' });
    setConnStatus(res.ok || res.status === 204 || res.status === 405);
  } catch {
    setConnStatus(false);
  }
}

// ── Version badge ─────────────────────────────────────────────────────────────
if (versionEl && chrome.runtime?.getManifest) {
  versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
}

// ── Optimize flow (stateless — nothing written to storage) ────────────────────
promptInput.addEventListener('input', () => {
  optimizeBtn.disabled = !promptInput.value.trim();
});

optimizeBtn.addEventListener('click', async () => {
  const text = promptInput.value.trim();
  if (!text) return;

  optimizeBtn.disabled     = true;
  optimizeBtn.textContent  = 'Optimizing…';
  resultSection.hidden     = true;
  setOptimizeStatus('', false);

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'OPTIMIZE', text }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (!response) {
      setOptimizeStatus('No response from service worker — reload the extension.', true);
      return;
    }
    if (response.error) {
      setOptimizeStatus('❌ ' + response.error, true);
      return;
    }
    const optimized = response.optimizedText ?? response.result ?? '';
    if (!optimized) {
      setOptimizeStatus('❌ Empty response from API.', true);
      return;
    }
    resultOutput.value   = optimized;
    resultSection.hidden = false;
  } catch (err) {
    setOptimizeStatus('❌ ' + (err instanceof Error ? err.message : 'Optimization failed'), true);
  } finally {
    optimizeBtn.disabled    = !promptInput.value.trim();
    optimizeBtn.textContent = '✨ Optimize';
  }
});

// ── Copy result ───────────────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(resultOutput.value).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  }).catch(() => {
    resultOutput.select();
    document.execCommand('copy');
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
// Stored: apiUrl (endpoint), mode (optimization mode), apiKey (BYOK).
// Never stored: prompt text, optimized output, history of any kind.
saveBtn.addEventListener('click', async () => {
  const apiUrl = (apiUrlEl.value || DEFAULT_API_URL).trim().replace(/\/$/, '');
  const mode   = modeEl.value;
  const apiKey = (apiKeyEl.value || '').trim();
  await chrome.storage.sync.set({ apiUrl, mode, apiKey });
  updateDocLinks(apiUrl);
  connStatus.textContent = 'Saving…';
  connStatus.className   = '';
  await checkConnection();
});

apiUrlEl.addEventListener('change', () => updateDocLinks(apiUrlEl.value));

// ── Boot: load stored settings ────────────────────────────────────────────────
chrome.storage.sync.get(
  { apiUrl: DEFAULT_API_URL, mode: 'better', apiKey: '' },
  (items) => {
    apiUrlEl.value = items.apiUrl || DEFAULT_API_URL;
    modeEl.value   = items.mode   || 'better';
    apiKeyEl.value = items.apiKey || '';
    updateDocLinks(apiUrlEl.value);
    checkConnection();
  },
);
