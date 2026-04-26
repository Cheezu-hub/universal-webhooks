/**
 * Universal Webhook Inspector — Popup Logic
 *
 * Manages three tabs:
 *  1. Inspector  — shows captured webhooks with detail view + normalize CTA
 *  2. Recent Logs — shows processed webhooks from backend with system status
 *  3. Normalize  — freeform JSON input → AI normalization → result display
 */

"use strict";

// ─── State ────────────────────────────────────────────────────────────────────
let activeTab = "inspector";
let captures = [];
let recentLogs = [];
let selectedCapture = null;
let selectedLog = null;
let backendUrl = "http://localhost:8000";
let settingsOpen = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await checkBackendConnection();
  initTabs();
  initSettings();
  initInspector();
  initLogs();
  initNormalize();
  initFooter();

  // Listen for real-time capture updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CAPTURE_UPDATED") {
      const idx = captures.findIndex((c) => c.id === msg.capture.id);
      if (idx !== -1) captures[idx] = msg.capture;
      else captures.unshift(msg.capture);
      renderCaptures();
      updateCaptureCount();

      // If we're viewing this capture's result tab, refresh
      if (selectedCapture?.id === msg.capture.id) {
        selectedCapture = msg.capture;
        if (msg.capture.normalizedResult) {
          showNormalizedResult(msg.capture.normalizedResult, msg.capture);
        }
        if (msg.capture.status === "failed") {
          showResultError(msg.capture.error || "Normalization failed");
        }
      }
    }
  });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  backendUrl = await msg("GET_BACKEND_URL").then((r) => r.data || "http://localhost:8000");
  const inp = $("backend-url-input");
  if (inp) inp.value = backendUrl;
}

function initSettings() {
  const btn = $("settings-btn");
  const panel = $("settings-panel");
  const saveBtn = $("save-backend-btn");

  btn.addEventListener("click", () => {
    settingsOpen = !settingsOpen;
    panel.style.display = settingsOpen ? "block" : "none";
    btn.classList.toggle("active", settingsOpen);
  });

  saveBtn.addEventListener("click", async () => {
    const val = $("backend-url-input").value.trim().replace(/\/$/, "");
    if (!val) return;
    backendUrl = val;
    await msg("SET_BACKEND_URL", { url: val });
    saveBtn.textContent = "Saved ✓";
    setTimeout(() => (saveBtn.textContent = "Save"), 1500);
    await checkBackendConnection();
  });
}

// ─── Backend Connection Check ──────────────────────────────────────────────────
async function checkBackendConnection() {
  const dot = $("status-dot");
  try {
    const resp = await fetchBackend("/health", { timeout: 3000 });
    if (resp.ok) {
      dot.className = "status-dot connected";
      dot.title = `Connected — ${backendUrl}`;
    } else {
      throw new Error();
    }
  } catch {
    dot.className = "status-dot error";
    dot.title = "Backend unreachable — check URL in settings";
  }
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;

  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-content").forEach((p) => {
    p.classList.remove("active");
    p.style.display = "none";
  });
  const panel = $(`panel-${tab}`);
  panel.classList.add("active");
  panel.style.display = "flex";

  if (tab === "logs") loadLogs();
  if (tab === "inspector") loadCaptures();
}

// ─── Inspector Tab ────────────────────────────────────────────────────────────
function initInspector() {
  $("refresh-captures-btn").addEventListener("click", loadCaptures);
  $("clear-captures-btn").addEventListener("click", async () => {
    if (!confirm("Clear all captured webhooks?")) return;
    await msg("CLEAR_CAPTURES");
    captures = [];
    renderCaptures();
    updateCaptureCount();
  });
  $("back-btn").addEventListener("click", closeCapturDetail);

  // Detail sub-tabs
  document.querySelectorAll(".detail-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.dtab;
      document.querySelectorAll(".detail-tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.dtab === name)
      );
      document.querySelectorAll(".dtab-panel").forEach((p) =>
        p.classList.toggle("active", p.dataset.dtabPanel === name)
      );
    });
  });

  $("normalize-this-btn").addEventListener("click", () => {
    if (!selectedCapture) return;
    normalizeCapture(selectedCapture);
  });

  loadCaptures();
}

async function loadCaptures() {
  const result = await msg("GET_CAPTURES");
  captures = result.data || [];
  renderCaptures();
  updateCaptureCount();
}

function renderCaptures() {
  const list = $("captures-list");
  const label = $("inspector-label");

  if (captures.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <strong>No webhooks captured yet</strong>
        <span>Browse any site that fires webhook-like POST requests.<br/>They'll appear here automatically.</span>
      </div>`;
    label.textContent = "No captured webhooks";
    return;
  }

  label.textContent = `${captures.length} captured webhook${captures.length !== 1 ? "s" : ""}`;

  list.innerHTML = captures
    .map(
      (c) => `
    <div class="list-item" data-id="${c.id}" role="button">
      <div class="item-icon ${c.status}">
        ${iconForStatus(c.status)}
      </div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(shortUrl(c.url))}</div>
        <div class="item-sub">
          <span class="pill pill-${c.status}">${c.status}</span>
          ${c.tabTitle ? `<span>${escapeHtml(truncate(c.tabTitle, 28))}</span>` : ""}
        </div>
        <div class="item-sub-url">${escapeHtml(c.url)}</div>
      </div>
      <div class="item-right">
        <span class="item-time">${timeAgo(c.timestamp)}</span>
        ${
          c.normalizedResult?.confidence != null
            ? `<div class="confidence">
                <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round(c.normalizedResult.confidence * 100)}%"></div></div>
                <span class="confidence-label">${Math.round(c.normalizedResult.confidence * 100)}%</span>
              </div>`
            : ""
        }
      </div>
      <button class="btn-delete-item" data-del="${c.id}" title="Delete">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`
    )
    .join("");

  // Attach click handlers
  list.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete-item")) return; // handled separately
      const id = el.dataset.id;
      const capture = captures.find((c) => c.id === id);
      if (capture) openCaptureDetail(capture);
    });
  });

  list.querySelectorAll(".btn-delete-item").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      await msg("DELETE_CAPTURE", { captureId: id });
      captures = captures.filter((c) => c.id !== id);
      renderCaptures();
      updateCaptureCount();
    });
  });
}

function openCaptureDetail(capture) {
  selectedCapture = capture;
  $("captures-list").style.display = "none";
  const detail = $("capture-detail");
  detail.style.display = "flex";

  // Fill raw payload
  $("detail-url-text").textContent = truncate(capture.url, 50);
  $("detail-raw").textContent = JSON.stringify(capture.payload, null, 2);
  $("detail-headers").textContent = JSON.stringify(capture.headers, null, 2);

  // Reset to raw tab
  document.querySelectorAll(".detail-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".dtab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.detail-tab[data-dtab="raw"]').classList.add("active");
  document.querySelector('.dtab-panel[data-dtab-panel="raw"]').classList.add("active");

  // AI result tab state
  if (capture.normalizedResult) {
    showNormalizedResult(capture.normalizedResult, capture);
  } else if (capture.status === "failed") {
    showResultError(capture.error || "Normalization failed");
  } else if (capture.status === "normalizing") {
    showResultLoading();
  } else {
    showResultEmpty();
  }
}

function closeCapturDetail() {
  selectedCapture = null;
  $("capture-detail").style.display = "none";
  $("captures-list").style.display = "block";
  renderCaptures();
}

async function normalizeCapture(capture) {
  const btn = $("normalize-this-btn");
  btn.disabled = true;
  btn.textContent = "Normalizing…";

  // Switch to result tab
  document.querySelectorAll(".detail-tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.dtab === "result")
  );
  document.querySelectorAll(".dtab-panel").forEach((p) =>
    p.classList.toggle("active", p.dataset.dtabPanel === "result")
  );

  showResultLoading();

  try {
    const result = await msg("NORMALIZE_PAYLOAD", {
      payload: capture.payload,
      captureId: capture.id,
    });

    if (result.ok) {
      const data = result.data;
      if (data.normalized_payload) {
        showNormalizedResult(data.normalized_payload, data);
        // Update local capture
        const idx = captures.findIndex((c) => c.id === capture.id);
        if (idx !== -1) {
          captures[idx].normalizedResult = data.normalized_payload;
          captures[idx].status = "normalized";
          selectedCapture = captures[idx];
        }
      } else {
        showResultError("Backend returned no normalized data yet.");
      }
    } else {
      showResultError(result.error || "Normalization failed");
    }
  } catch (err) {
    showResultError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Normalize with AI`;
  }
}

function showResultEmpty() {
  $("result-empty-hint").style.display = "flex";
  $("result-loading").style.display = "none";
  $("result-content").style.display = "none";
}

function showResultLoading() {
  $("result-empty-hint").style.display = "none";
  $("result-loading").style.display = "flex";
  $("result-content").style.display = "none";
}

function showNormalizedResult(normalized, meta) {
  $("result-empty-hint").style.display = "none";
  $("result-loading").style.display = "none";
  $("result-content").style.display = "block";

  const metaRow = $("result-meta-row");
  const confidence = normalized.confidence ?? meta?.confidence ?? null;
  metaRow.innerHTML = `
    ${normalized.event_type ? `<span class="event-type-badge">${escapeHtml(normalized.event_type)}</span>` : ""}
    ${confidence != null ? `
      <div class="confidence">
        <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round(confidence * 100)}%"></div></div>
        <span class="confidence-label">${Math.round(confidence * 100)}% confidence</span>
      </div>` : ""}
    ${normalized.actor ? `<span class="pill pill-captured">${escapeHtml(normalized.actor)}</span>` : ""}
  `;
  $("detail-result").textContent = JSON.stringify(normalized, null, 2);
}

function showResultError(message) {
  $("result-empty-hint").style.display = "none";
  $("result-loading").style.display = "none";
  $("result-content").style.display = "block";
  $("result-meta-row").innerHTML = `<span class="pill pill-failed">Error</span>`;
  $("detail-result").textContent = message;
}

function updateCaptureCount() {
  const badge = $("capture-count");
  badge.textContent = captures.length;
  badge.dataset.count = captures.length;
}

// ─── Recent Logs Tab ──────────────────────────────────────────────────────────
function initLogs() {
  $("refresh-logs-btn").addEventListener("click", loadLogs);
  $("log-back-btn").addEventListener("click", closeLogDetail);
}

async function loadLogs() {
  const logsEl = $("logs-list");
  logsEl.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching from backend…</p></div>`;

  try {
    // Fetch both in parallel
    const [logsRes, statusRes] = await Promise.all([
      msg("GET_RECENT_LOGS"),
      msg("GET_SYSTEM_STATUS"),
    ]);

    if (!logsRes.ok) throw new Error(logsRes.error || "Failed to fetch logs");

    recentLogs = logsRes.data || [];
    renderLogs();

    if (statusRes.ok) {
      renderStatusBar(statusRes.data);
    }
  } catch (err) {
    logsEl.innerHTML = `
      <div class="error-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--danger);opacity:0.6"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p class="err-msg">Cannot reach backend</p>
        <p class="err-hint">${escapeHtml(err.message)}</p>
        <p class="err-hint">Check URL in Settings ↗</p>
      </div>`;
    $("status-bar").style.display = "none";
  }
}

function renderStatusBar(status) {
  const bar = $("status-bar");
  bar.style.display = "flex";
  $("st-total").textContent = status.total ?? "—";
  $("st-processed").textContent = status.processed ?? "—";
  $("st-failed").textContent = status.failed ?? "—";
  $("st-queue").textContent = status.queue_size ?? "—";
}

function renderLogs() {
  const list = $("logs-list");
  if (recentLogs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <strong>No webhooks in backend yet</strong>
        <span>Use the simulator in the dashboard<br/>or send a real webhook.</span>
      </div>`;
    return;
  }

  list.innerHTML = recentLogs
    .map((log) => {
      const normalized = log.normalized_payload;
      const eventType = normalized?.event_type || "—";
      return `
      <div class="list-item" data-log-id="${escapeHtml(log.request_id)}" role="button">
        <div class="item-icon ${log.status}">
          ${iconForStatus(log.status)}
        </div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(eventType)}</div>
          <div class="item-sub">
            <span class="pill pill-${log.status}">${log.status}</span>
            <span class="provider-pill" style="font-size:9px;padding:1px 5px">${escapeHtml(log.provider || "unknown")}</span>
          </div>
          <div class="item-sub-url" style="font-size:9px">${truncate(log.request_id, 36)}</div>
        </div>
        <div class="item-right">
          <span class="item-time">${timeAgo(new Date(log.created_at).getTime())}</span>
          ${
            log.confidence != null
              ? `<div class="confidence">
                  <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round(log.confidence * 100)}%"></div></div>
                  <span class="confidence-label">${Math.round(log.confidence * 100)}%</span>
                </div>`
              : ""
          }
        </div>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".list-item[data-log-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.logId;
      const log = recentLogs.find((l) => l.request_id === id);
      if (log) openLogDetail(log);
    });
  });
}

function openLogDetail(log) {
  selectedLog = log;
  $("logs-list").style.display = "none";
  $("status-bar").style.display = "none";
  const detail = $("log-detail");
  detail.style.display = "flex";

  $("log-detail-provider").textContent = log.provider || "unknown";

  const payload = log.normalized_payload || { message: "Not yet processed" };
  $("log-detail-payload").textContent = JSON.stringify(
    {
      event_type: payload.event_type,
      actor: payload.actor,
      confidence: log.confidence,
      status: log.status,
      payload: payload.payload,
    },
    null,
    2
  );
}

function closeLogDetail() {
  selectedLog = null;
  $("log-detail").style.display = "none";
  $("logs-list").style.display = "block";
  $("status-bar").style.display = "flex";
}

// ─── Normalize Tab ────────────────────────────────────────────────────────────
function initNormalize() {
  const btn = $("normalize-btn");
  const textarea = $("normalize-input");
  const errorEl = $("normalize-error");

  btn.addEventListener("click", async () => {
    const raw = textarea.value.trim();
    if (!raw) {
      showNormalizeError("Please paste a JSON payload.");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      textarea.classList.add("error");
      showNormalizeError(`Invalid JSON: ${e.message}`);
      return;
    }

    textarea.classList.remove("error");
    errorEl.style.display = "none";

    btn.disabled = true;
    $("normalize-loading").style.display = "flex";
    $("normalize-result").style.display = "none";

    try {
      const result = await msg("NORMALIZE_PAYLOAD", { payload: parsed });

      if (!result.ok) throw new Error(result.error || "Normalization failed");

      const data = result.data;
      const normalized = data.normalized_payload;
      if (!normalized) throw new Error("No normalized output received from backend.");

      renderNormalizeResult(normalized, data);
    } catch (err) {
      showNormalizeError(err.message);
    } finally {
      btn.disabled = false;
      $("normalize-loading").style.display = "none";
    }
  });

  textarea.addEventListener("input", () => {
    textarea.classList.remove("error");
    $("normalize-error").style.display = "none";
  });

  $("copy-result-btn").addEventListener("click", () => {
    const code = $("normalize-result-code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      const copyBtn = $("copy-result-btn");
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy JSON`;
      }, 2000);
    });
  });
}

function renderNormalizeResult(normalized, meta) {
  const metaEl = $("normalize-result-meta");
  const confidence = normalized.confidence ?? meta?.confidence ?? null;
  metaEl.innerHTML = `
    ${normalized.event_type ? `<span class="event-type-badge">${escapeHtml(normalized.event_type)}</span>` : ""}
    ${confidence != null ? `
      <div class="confidence">
        <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round(confidence * 100)}%"></div></div>
        <span class="confidence-label">${Math.round(confidence * 100)}% confidence</span>
      </div>` : ""}
    ${normalized.actor ? `<span class="pill pill-captured">actor: ${escapeHtml(normalized.actor)}</span>` : ""}
  `;

  $("normalize-result-code").textContent = JSON.stringify(normalized, null, 2);
  $("normalize-result").style.display = "flex";
}

function showNormalizeError(msg) {
  const el = $("normalize-error");
  el.textContent = msg;
  el.style.display = "block";
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function initFooter() {
  $("open-dashboard-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: backendUrl });
  });
}

// ─── Messaging Helpers ────────────────────────────────────────────────────────
function msg(type, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...extra }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function fetchBackend(path, opts = {}) {
  const url = await new Promise((r) =>
    chrome.storage.local.get("backendUrl", (res) =>
      r(res.backendUrl || "http://localhost:8000")
    )
  );
  return fetch(`${url}${path}`, opts);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function iconForStatus(status) {
  const icons = {
    captured: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    normalizing: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    normalized: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    processed:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    queued:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    processing: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    failed:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  };
  return icons[status] || icons.captured;
}
