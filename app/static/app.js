// app.js - Universal Webhook UI Logic

let pollInterval;
const STATE = {
    currentTab: 'playground',
    theme: 'dark',
    isProcessing: false
};

// ==========================================
// Initialization & Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchSystemStatus();
    
    // Start polling system status
    pollInterval = setInterval(fetchSystemStatus, 3000);
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
});

// ==========================================
// Toast System
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    // Colors based on type
    const colors = {
        success: 'bg-green-500/20 text-green-400 border border-green-500/30',
        error: 'bg-red-500/20 text-red-400 border border-red-500/30',
        info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    };

    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };

    toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-md text-sm font-medium ${colors[type]}`;
    toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4"></i> ${message}`;
    
    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// Tab Switching
// ==========================================
function switchTab(tabId) {
    STATE.currentTab = tabId;
    
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if(btn.id === `tab-${tabId}`) {
            btn.classList.add('active', 'border-primary', 'text-primary');
            btn.classList.remove('border-transparent', 'text-gray-500');
        } else {
            btn.classList.remove('active', 'border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-gray-500');
        }
    });

    // Update views
    document.getElementById('view-playground').classList.toggle('hidden', tabId !== 'playground');
    document.getElementById('view-logs').classList.toggle('hidden', tabId !== 'logs');

    if (tabId === 'logs') {
        fetchLogs();
    }
}

// ==========================================
// Theme Toggling
// ==========================================
function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        STATE.theme = 'light';
    } else {
        html.classList.add('dark');
        STATE.theme = 'dark';
    }
}

// ==========================================
// System Status Polling
// ==========================================
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/system/status');
        if (!res.ok) throw new Error("API Offline");
        const data = await res.json();
        
        document.getElementById('sys-status').textContent = data.status || 'Healthy';
        document.getElementById('sys-status').classList.remove('text-red-400');
        document.getElementById('sys-status').classList.add('text-gray-300');
        document.getElementById('sys-queue').textContent = data.queue_size || 0;
        document.getElementById('sys-processed').textContent = data.processed || 0;
    } catch (error) {
        document.getElementById('sys-status').textContent = 'Offline';
        document.getElementById('sys-status').classList.add('text-red-400');
        document.getElementById('sys-status').classList.remove('text-gray-300');
    }
}

// ==========================================
// Playground Features
// ==========================================
const SAMPLES = {
    stripe: {
        id: "evt_1NkhO02eZvKYlo2CLY",
        object: "event",
        type: "payment_intent.succeeded",
        data: {
            object: {
                id: "pi_1NkhO02eZv",
                amount: 2000,
                currency: "usd",
                status: "succeeded"
            }
        }
    },
    github: {
        action: "opened",
        issue: {
            url: "https://api.github.com/repos/test/test",
            number: 1347,
            title: "Found a bug",
            state: "open"
        },
        sender: {
            login: "octocat",
            id: 1
        }
    }
};

function loadSample(type) {
    const ta = document.getElementById('raw-input');
    ta.value = JSON.stringify(SAMPLES[type], null, 2);
    showToast(`Loaded ${type} sample`, 'info');
}

function formatJSON(elementId) {
    const el = document.getElementById(elementId);
    try {
        if (!el.value.trim()) return;
        const parsed = JSON.parse(el.value);
        el.value = JSON.stringify(parsed, null, 2);
        showToast('JSON Formatted');
    } catch(e) {
        showToast('Invalid JSON', 'error');
    }
}

async function copyJSON(elementId) {
    const el = document.getElementById(elementId);
    try {
        await navigator.clipboard.writeText(el.value);
        showToast('Copied to clipboard');
    } catch (e) {
        showToast('Auto-copy failed', 'error');
    }
}

// ==========================================
// Playground Processing
// ==========================================
async function processWebhook() {
    if (STATE.isProcessing) return;

    const rawInputEl = document.getElementById('raw-input');
    const rawVal = rawInputEl.value.trim();
    
    // Validation
    if (!rawVal) {
        showToast('Please enter a payload', 'error');
        return;
    }
    
    let parsedJson;
    try {
        parsedJson = JSON.parse(rawVal);
    } catch(e) {
        showToast('Invalid JSON Payload', 'error');
        return;
    }

    // UI Feedback
    STATE.isProcessing = true;
    const btnText = document.getElementById('btn-process-text');
    const btnSpinner = document.getElementById('btn-process-spinner');
    const processBtn = document.getElementById('btn-process');
    const loaderOverlay = document.getElementById('playground-loader');
    
    btnText.textContent = 'Queuing...';
    btnSpinner.classList.remove('hidden');
    processBtn.disabled = true;
    loaderOverlay.classList.remove('opacity-0');
    
    // Reset outputs
    document.getElementById('normalized-output').value = '';
    document.getElementById('output-meta').classList.add('hidden');
    document.getElementById('playground-status').className = 'status-badge hidden';
    document.getElementById('playground-confidence').className = 'confidence-badge hidden';

    try {
        const res = await fetch('/universal-webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedJson)
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Server Error');
        }
        
        const data = await res.json();
        const reqId = data.request_id;
        showToast('Webhook Queued', 'info');
        
        // Wait and poll for result (up to 15 seconds)
        btnText.textContent = 'Processing Pattern...';
        await pollForResult(reqId);

    } catch (e) {
        showToast(e.message, 'error');
        document.getElementById('normalized-output').value = `Error: ${e.message}`;
    } finally {
        // Reset button
        STATE.isProcessing = false;
        btnText.textContent = 'Process Webhook';
        btnSpinner.classList.add('hidden');
        processBtn.disabled = false;
        loaderOverlay.classList.add('opacity-0');
    }
}

async function pollForResult(requestId) {
    const maxTries = 15;
    const normOut = document.getElementById('normalized-output');
    const metaBar = document.getElementById('output-meta');
    
    for (let i = 0; i < maxTries; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const res = await fetch(`/webhooks/${requestId}`);
        if (!res.ok) continue;
        
        const data = await res.json();
        
        if (data.status === 'processed') {
            normOut.value = JSON.stringify(data.normalized_payload, null, 2);
            
            // Meta updates
            document.getElementById('out-event').textContent = data.normalized_payload.event_type || 'Unknown';
            document.getElementById('out-actor').textContent = data.normalized_payload.actor || 'System';
            metaBar.classList.remove('hidden', 'flex');
            metaBar.classList.add('flex');
            
            // Badges
            updateStatusBadge('playground-status', 'processed');
            updateConfidenceBadge('playground-confidence', data.confidence);
            
            showToast('Processing complete', 'success');
            // Fetch status immediately to update processed count
            fetchSystemStatus(); 
            return;
        } else if (data.status === 'failed') {
            normOut.value = `Processing Failed:\n${data.error_detail}\n\nRetries: ${data.retry_count}`;
            updateStatusBadge('playground-status', 'failed');
            showToast('Processing failed', 'error');
            return;
        }
    }
    
    normOut.value = `Timeout waiting for processor. The ID is:\n${requestId}\n\nCheck the Logs tab later to see the result.`;
    updateStatusBadge('playground-status', 'queued');
    showToast('Still processing in background', 'info');
}

// ==========================================
// Logs View
// ==========================================
function getStatusLabel(status) {
    if(status === 'processed') return `<span class="status-badge status-processed"><i data-lucide="check" class="w-3 h-3"></i> Processed</span>`;
    if(status === 'failed') return `<span class="status-badge status-failed"><i data-lucide="x" class="w-3 h-3"></i> Failed</span>`;
    if(status === 'processing') return `<span class="status-badge status-processing"><i data-lucide="loader" class="w-3 h-3 animate-spin"></i> Processing</span>`;
    return `<span class="status-badge status-queued"><i data-lucide="clock" class="w-3 h-3"></i> Queued</span>`;
}

async function fetchLogs() {
    const container = document.getElementById('logs-container');
    const refreshIcon = document.getElementById('refresh-icon');
    
    refreshIcon.classList.add('animate-spin');
    
    try {
        const res = await fetch('/api/webhooks?limit=20');
        if (!res.ok) throw new Error('Failed to fetch logs');
        
        const data = await res.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-gray-500">No webhooks processed yet.</div>`;
            return;
        }

        let tableHTML = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-gray-900/50 border-b border-gray-800 text-xs uppercase tracking-wider text-gray-400">
                        <th class="p-4 font-medium rounded-tl-xl">ID / Time</th>
                        <th class="p-4 font-medium">Provider</th>
                        <th class="p-4 font-medium">Status</th>
                        <th class="p-4 font-medium">Confidence</th>
                        <th class="p-4 font-medium text-right rounded-tr-xl">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-800/50" id="logs-tbody">
        `;

        data.forEach(wh => {
            const date = new Date(wh.created_at).toLocaleString();
            const confidenceHTML = wh.confidence 
                ? `<span class="confidence-badge conf-${wh.confidence > 0.8 ? 'high' : wh.confidence > 0.4 ? 'medium' : 'low'}">${(wh.confidence * 100).toFixed(0)}%</span>`
                : `<span class="text-gray-600 text-xs italic">N/A</span>`;
            
            tableHTML += `
                <tr class="hover:bg-gray-800/30 transition-colors cursor-pointer group" onclick="openLogModal('${wh.request_id}')">
                    <td class="p-4">
                        <div class="font-mono text-sm text-gray-300 group-hover:text-primary transition-colors">${wh.request_id.split('-')[0]}...</div>
                        <div class="text-xs text-gray-500 mt-1">${date}</div>
                    </td>
                    <td class="p-4 text-sm text-gray-400 capitalize">${wh.provider || 'Unknown'}</td>
                    <td class="p-4">${getStatusLabel(wh.status)}</td>
                    <td class="p-4">${confidenceHTML}</td>
                    <td class="p-4 text-right">
                        <button class="text-gray-500 hover:text-white transition p-2" title="View Details">
                            <i data-lucide="chevron-right" class="w-4 h-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
        lucide.createIcons({ root: container });

    } catch(e) {
        container.innerHTML = `<div class="p-8 text-center text-red-400">Failed to load logs: ${e.message}</div>`;
    } finally {
        setTimeout(() => refreshIcon.classList.remove('animate-spin'), 500);
    }
}

// ==========================================
// Log Modal & Replay
// ==========================================
let currentModalRequestId = null;

async function openLogModal(requestId) {
    currentModalRequestId = requestId;
    const modal = document.getElementById('log-detail-modal');
    const rawBox = document.getElementById('modal-raw');
    const normBox = document.getElementById('modal-norm');
    const reqIdLabel = document.getElementById('modal-req-id');
    const statusLabel = document.getElementById('modal-status');
    const replayBtn = document.getElementById('modal-replay-btn');
    
    // Reset/loading layout
    reqIdLabel.textContent = requestId;
    rawBox.textContent = 'Loading...';
    normBox.textContent = 'Loading...';
    statusLabel.innerHTML = '';
    
    modal.classList.remove('hidden');
    // slight delay for transition
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    
    try {
        const res = await fetch(`/webhooks/${requestId}`);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        
        statusLabel.innerHTML = getStatusLabel(data.status);
        
        // Let's refetch the raw payload since `/webhooks/{id}` currently doesn't return raw
        // Wait, does `/webhooks/{id}` return raw_payload? Let's check schemas... actually it doesn't.
        // If it doesn't, we will show "Raw Payload not exposed by GET API, but we can Replay it".
        // Wait! WebhookRecord schema: request_id, status, provider, confidence, normalized_payload...
        // Let's modify the GET /webhooks/{request_id} response silently if needed, or just display N/A.
        
        // Luckily we can query `GET /webhooks/{requestId}` which returns WebhookRecord.
        rawBox.textContent = data.raw_payload 
            ? JSON.stringify(data.raw_payload, null, 2) 
            : "// Raw payload is securely stored but not exposed via GET API by default.";
            
        normBox.textContent = data.normalized_payload 
            ? JSON.stringify(data.normalized_payload, null, 2) 
            : "// Normalization not available. Status: " + data.status;
            
    } catch(e) {
        rawBox.textContent = 'Error loading details.';
        normBox.textContent = '';
    }
}

function closeLogModal() {
    const modal = document.getElementById('log-detail-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

document.getElementById('log-detail-modal').addEventListener('click', (e) => {
    if(e.target.id === 'log-detail-modal') closeLogModal();
});

async function replayCurrentWebhook() {
    if (!currentModalRequestId) return;
    
    const btn = document.getElementById('modal-replay-btn');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Queuing...`;
    btn.disabled = true;
    
    try {
        const res = await fetch(`/api/webhooks/${currentModalRequestId}/replay`, {
            method: 'POST'
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed');
        }
        showToast('Webhook successfully queued for Replay', 'success');
        closeLogModal();
        fetchLogs(); // refresh logs
    } catch(e) {
        showToast(`Replay failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        lucide.createIcons({ root: btn });
    }
}

// ==========================================
// Badge Helpers
// ==========================================
function updateStatusBadge(id, status) {
    const el = document.getElementById(id);
    el.classList.remove('hidden', 'status-queued', 'status-processing', 'status-processed', 'status-failed');
    if(status === 'processed') { el.classList.add('status-processed'); el.innerHTML = "PROCESSED"; }
    else if(status === 'failed') { el.classList.add('status-failed'); el.innerHTML = "FAILED"; }
    else if(status === 'processing') { el.classList.add('status-processing'); el.innerHTML = "PROCESSING"; }
    else { el.classList.add('status-queued'); el.innerHTML = "QUEUED"; }
}

function updateConfidenceBadge(id, score) {
    const el = document.getElementById(id);
    el.classList.remove('hidden', 'conf-high', 'conf-medium', 'conf-low');
    if(score === null || score === undefined) return el.classList.add('hidden');
    
    if(score > 0.8) { el.classList.add('conf-high'); el.innerHTML = Math.round(score*100) + "% CONF"; }
    else if(score > 0.4) { el.classList.add('conf-medium'); el.innerHTML = Math.round(score*100) + "% CONF"; }
    else { el.classList.add('conf-low'); el.innerHTML = Math.round(score*100) + "% CONF"; }
}
