/**
 * Universal Webhook Inspector — Background Service Worker
 *
 * Responsibilities:
 * - Listen for webhook payload captures from content scripts
 * - Store captured payloads in chrome.storage.local
 * - Normalize payloads via the Universal Webhook Adapter API
 * - Poll for status updates after normalization
 * - Maintain the recent logs cache from the backend
 */

const BACKEND_URL = "http://localhost:8000";
const MAX_CAPTURED = 50; // max captured webhooks kept in memory
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15;

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "CAPTURE_WEBHOOK":
      handleCapture(message.data, sender.tab)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true; // async

    case "NORMALIZE_PAYLOAD":
      normalizePayload(message.payload, message.captureId)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_RECENT_LOGS":
      fetchRecentLogs()
        .then((logs) => sendResponse({ ok: true, data: logs }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_SYSTEM_STATUS":
      fetchSystemStatus()
        .then((status) => sendResponse({ ok: true, data: status }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_CAPTURES":
      getCaptures().then((captures) => sendResponse({ ok: true, data: captures }));
      return true;

    case "CLEAR_CAPTURES":
      chrome.storage.local.set({ captures: [] }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "DELETE_CAPTURE":
      deleteCapture(message.captureId).then(() => sendResponse({ ok: true }));
      return true;

    case "SET_BACKEND_URL":
      chrome.storage.local.set({ backendUrl: message.url }, () =>
        sendResponse({ ok: true })
      );
      return true;

    case "GET_BACKEND_URL":
      chrome.storage.local.get("backendUrl", (res) =>
        sendResponse({ ok: true, data: res.backendUrl || BACKEND_URL })
      );
      return true;
  }
});

// ─── Capture Handling ─────────────────────────────────────────────────────────
async function handleCapture(data, tab) {
  const captures = await getCaptures();
  const capture = {
    id: generateId(),
    timestamp: Date.now(),
    url: data.url || tab?.url || "unknown",
    method: data.method || "POST",
    headers: data.headers || {},
    payload: data.payload,
    status: "captured",
    normalizedResult: null,
    requestId: null,
    tabTitle: tab?.title || "Unknown Page",
    tabFavicon: tab?.favIconUrl || null,
  };

  captures.unshift(capture);
  if (captures.length > MAX_CAPTURED) captures.length = MAX_CAPTURED;
  await saveCaptures(captures);

  // Notify popup if open
  try {
    chrome.runtime.sendMessage({
      type: "CAPTURE_UPDATED",
      capture,
    });
  } catch (_) {}

  // Show notification for significant webhooks
  notifyCapture(capture);

  return capture;
}

async function deleteCapture(captureId) {
  const captures = await getCaptures();
  const filtered = captures.filter((c) => c.id !== captureId);
  await saveCaptures(filtered);
}

// ─── Normalize ────────────────────────────────────────────────────────────────
async function normalizePayload(payload, captureId) {
  const url = await getBackendUrl();

  const response = await fetch(`${url}/api/v1/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const requestId = result.request_id;

  // Update capture with pending state
  if (captureId) {
    await updateCapture(captureId, {
      status: "normalizing",
      requestId,
    });
  }

  // Poll for completion
  const normalized = await pollForResult(requestId, captureId);
  return normalized;
}

async function pollForResult(requestId, captureId) {
  const url = await getBackendUrl();
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    await sleep(POLL_INTERVAL_MS);
    attempts++;

    try {
      const resp = await fetch(`${url}/webhooks/${requestId}`);
      if (!resp.ok) continue;

      const data = await resp.json();

      if (data.status === "processed") {
        if (captureId) {
          await updateCapture(captureId, {
            status: "normalized",
            normalizedResult: data.normalized_payload,
            requestId,
          });
        }
        return data;
      }

      if (data.status === "failed") {
        if (captureId) {
          await updateCapture(captureId, {
            status: "failed",
            error: data.error_detail,
          });
        }
        throw new Error(data.error_detail || "Normalization failed");
      }
    } catch (err) {
      if (err.message.includes("Normalization failed")) throw err;
      // Network error, continue polling
    }
  }

  throw new Error("Timeout: normalization did not complete in time");
}

// ─── Backend API ──────────────────────────────────────────────────────────────
async function fetchRecentLogs() {
  const url = await getBackendUrl();
  const resp = await fetch(`${url}/api/webhooks?limit=20`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

async function fetchSystemStatus() {
  const url = await getBackendUrl();
  const resp = await fetch(`${url}/api/system/status`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
function getCaptures() {
  return new Promise((resolve) => {
    chrome.storage.local.get("captures", (res) =>
      resolve(res.captures || [])
    );
  });
}

function saveCaptures(captures) {
  return new Promise((resolve) =>
    chrome.storage.local.set({ captures }, resolve)
  );
}

async function updateCapture(captureId, updates) {
  const captures = await getCaptures();
  const idx = captures.findIndex((c) => c.id === captureId);
  if (idx !== -1) {
    captures[idx] = { ...captures[idx], ...updates };
    await saveCaptures(captures);
    try {
      chrome.runtime.sendMessage({ type: "CAPTURE_UPDATED", capture: captures[idx] });
    } catch (_) {}
  }
}

function getBackendUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("backendUrl", (res) =>
      resolve(res.backendUrl || BACKEND_URL)
    );
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────
function notifyCapture(capture) {
  try {
    const hostname = new URL(capture.url).hostname;
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "⚡ Webhook Captured",
      message: `POST from ${hostname} — click to inspect`,
      silent: true,
    });
  } catch (_) {}
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function generateId() {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Startup ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log("Universal Webhook Inspector installed.");
  chrome.storage.local.get("captures", (res) => {
    if (!res.captures) chrome.storage.local.set({ captures: [] });
  });
});
