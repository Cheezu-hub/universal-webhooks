/**
 * Universal Webhook Inspector — Content Script
 *
 * Intercepts outgoing XHR / fetch POST requests from any page,
 * checks if they look like webhook payloads, and reports them
 * to the background service worker for capture & display.
 */

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__webhookInspectorInjected) return;
  window.__webhookInspectorInjected = true;

  // ─── Configuration ──────────────────────────────────────────────────────────
  const WEBHOOK_PATH_HINTS = [
    /webhook/i,
    /hook/i,
    /event/i,
    /callback/i,
    /notify/i,
    /trigger/i,
    /dispatch/i,
    /inbound/i,
    /receive/i,
  ];

  const WEBHOOK_HEADER_HINTS = [
    "x-hub-signature",
    "stripe-signature",
    "x-shopify-hmac-sha256",
    "x-webhook-id",
    "x-event-key",
    "x-github-event",
    "x-twilio-signature",
  ];

  const MIN_PAYLOAD_SIZE = 20; // ignore tiny payloads
  const MAX_PAYLOAD_SIZE = 500_000; // skip giant binaries

  // ─── Fetch Interceptor ──────────────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const req = new Request(input, init);

    if (shouldCapture(req.method, req.url, init?.headers)) {
      captureFromFetch(req.url, req.method, init).catch(() => {});
    }

    return origFetch.apply(this, [input, init]);
  };

  async function captureFromFetch(url, method, init) {
    try {
      let payload = null;
      let rawBody = init?.body;

      if (typeof rawBody === "string") {
        payload = safeParseJSON(rawBody);
      } else if (rawBody instanceof FormData) {
        payload = formDataToObj(rawBody);
      } else if (rawBody instanceof ArrayBuffer || rawBody instanceof Blob) {
        // Skip binary
        return;
      }

      if (!payload || payloadTooSmall(payload)) return;

      const headers = headersToObj(init?.headers || {});
      sendCapture({ url, method, headers, payload });
    } catch (_) {}
  }

  // ─── XHR Interceptor ────────────────────────────────────────────────────────
  const OrigXMLHttpRequest = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXMLHttpRequest();
    let _method = "GET";
    let _url = "";
    let _headers = {};

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = method;
      _url = resolveURL(url);
      return origOpen(method, url, ...rest);
    };

    const origSetRequestHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name, value) {
      _headers[name.toLowerCase()] = value;
      return origSetRequestHeader(name, value);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      if (shouldCapture(_method, _url, _headers)) {
        try {
          let payload = null;
          if (typeof body === "string") {
            payload = safeParseJSON(body);
          }
          if (payload && !payloadTooSmall(payload)) {
            sendCapture({ url: _url, method: _method, headers: _headers, payload });
          }
        } catch (_) {}
      }
      return origSend(body);
    };

    return xhr;
  }

  // Proxy prototype so instanceof checks still work
  PatchedXHR.prototype = OrigXMLHttpRequest.prototype;
  window.XMLHttpRequest = PatchedXHR;

  // ─── Capture Decision ───────────────────────────────────────────────────────
  function shouldCapture(method, url, headers) {
    if (!method || method.toUpperCase() !== "POST") return false;

    // Always capture if webhook-like headers present
    const headersObj = headersToObj(headers || {});
    for (const key of Object.keys(headersObj)) {
      if (WEBHOOK_HEADER_HINTS.some((h) => key.toLowerCase().includes(h))) {
        return true;
      }
    }

    // Check URL path for webhook hints
    try {
      const parsed = new URL(url, window.location.href);
      return WEBHOOK_PATH_HINTS.some((re) => re.test(parsed.pathname));
    } catch (_) {
      return false;
    }
  }

  function payloadTooSmall(obj) {
    return JSON.stringify(obj).length < MIN_PAYLOAD_SIZE;
  }

  // ─── Send to Background ─────────────────────────────────────────────────────
  function sendCapture(data) {
    try {
      chrome.runtime.sendMessage({ type: "CAPTURE_WEBHOOK", data }, () => {
        if (chrome.runtime.lastError) {
          // Extension context invalidated — ignore
        }
      });
    } catch (_) {}
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────
  function safeParseJSON(str) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch (_) {}
    return null;
  }

  function headersToObj(headers) {
    if (!headers) return {};
    if (typeof headers.entries === "function") {
      return Object.fromEntries(headers.entries());
    }
    if (typeof headers === "object") return { ...headers };
    return {};
  }

  function formDataToObj(fd) {
    const obj = {};
    fd.forEach((val, key) => { obj[key] = val; });
    return obj;
  }

  function resolveURL(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch (_) {
      return url;
    }
  }
})();
