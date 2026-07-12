// ==========================================================================
// PORTAL CLIENT ENGINE
// ==========================================================================

const companyData = {
    name: "Orbenyx",
    address1: "Vadavalli",
    address2: "Coimbatore, Tamil Nadu – 641046",
    mobile: "+91 63811 69124",
    email: "rturoxtechnology@gmail.com",
    gstin: "33DMKPA5355R1ZL",
    pan: "DMKPA5355R"
};

// Global State
let currentModule = '';
let savedDocumentsList = [];
let editingDocumentId = null;

// Dynamic list items containers
let invoiceRows = [];
let quoteRows = [];
let quoteSpecs = [];

// Initialize Portal on Load
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
});

// Authentication Helpers
window.togglePasswordVisibility = function(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        iconEl.classList.remove('fa-eye-slash');
        iconEl.classList.add('fa-eye');
    } else {
        input.type = 'password';
        iconEl.classList.remove('fa-eye');
        iconEl.classList.add('fa-eye-slash');
    }
};

function checkAdminAuth() {
    const token = localStorage.getItem('rturox_admin_token');
    const overlay = document.getElementById('login-overlay');

    if (!token) {
        overlay.style.display = 'flex';
        document.getElementById('login-username').focus();
    } else {
        overlay.style.display = 'none';
        loadPortalData();
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error-msg');

    errorMsg.style.display = 'none';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('rturox_admin_token', data.token);
            checkAdminAuth();
            document.getElementById('login-form').reset();
        } else {
            errorMsg.innerText = data.error || 'Invalid credentials';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.innerText = 'Failed to connect to authentication server.';
        errorMsg.style.display = 'block';
    }
}

function logoutAdmin() {
    localStorage.removeItem('rturox_admin_token');
    const sidebar = document.getElementById('portal-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    if (window.resetExpensesPortalInit) {
        window.resetExpensesPortalInit();
    }
    checkAdminAuth();
    showToast('Logged out successfully.', 'info');
}

// Wrapper for standard fetch to automatically apply authorization tokens
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('rturox_admin_token');
    if (token) {
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.removeItem('rturox_admin_token');
        checkAdminAuth();
        throw new Error('Unauthorized');
    }
    return res;
}

// Load database documents and connection states
async function loadPortalData() {
    try {
        const response = await apiFetch('/api/documents?_t=' + Date.now());
        const data = await response.json();

        if (data.success) {
            savedDocumentsList = data.documents;
            renderStats(data.documents);
            renderHistoryTable(data.documents);
            renderAnalyticsChart(data.documents);
        } else {
            showToast('Failed to load documents registry.', 'error');
        }

        // Detect database status badge
        const badge = document.getElementById('db-status-badge');
        if (badge) {
            try {
                // Test backup endpoint info or simple check
                const testNum = await apiFetch('/api/next_number/quotation?_t=' + Date.now());
                const testNumData = await testNum.json();
                if (testNumData.success) {
                    badge.className = 'db-badge badge-connected';
                    badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> DB Connected Mode';
                } else {
                    badge.className = 'db-badge badge-fallback';
                    badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> DB Fallback Mode';
                }
            } catch (e) {
                badge.className = 'db-badge badge-fallback';
                badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Offline Mode';
            }
        }

    } catch (err) {
        console.error('Error loading initial portal data:', err);
        showToast('Server connection failed.', 'error');
    }
    
    if (window.initializeExpensesPortal) {
        window.initializeExpensesPortal();
    }
}

// Render dynamic stat indicators on dashboard
function renderStats(docs) {
    document.getElementById('stat-total-docs').innerText = docs.length;
    let totalInvoicedSum = 0;
    let todayDocsCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    docs.forEach(doc => {
        // Parse date for today count
        if (doc.date === todayStr || (doc.created_at && doc.created_at.startsWith(todayStr))) {
            todayDocsCount++;
        }

        // Sum invoices if data is present
        if (doc.doc_type === 'invoice' && doc.data) {
            try {
                const payload = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
                // Invoice grand total calculation
                let subtotal = 0;
                if (payload.items) {
                    payload.items.forEach(row => {
                        subtotal += (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
                    });
                }
                const tax = subtotal * 0.18;
                totalInvoicedSum += (subtotal + tax);
            } catch (e) {
                // Fallback estimate if parse fails
            }
        }
    });

    document.getElementById('stat-total-invoiced').innerText = `₹ ${totalInvoicedSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('stat-today-docs').innerText = todayDocsCount;
}

// ============================================================
// ANALYTICS CHART — dual bar (docs count + invoice revenue)
// ============================================================
function renderAnalyticsChart(docs) {
    const canvas = document.getElementById('analytics-chart');
    const emptyEl = document.getElementById('analytics-empty');
    if (!canvas) return;

    // Build last-6-months buckets
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('en-IN', { month: 'short' }),
            docs: 0,
            revenue: 0
        });
    }

    // Aggregate documents into buckets
    docs.forEach(doc => {
        const dateStr = doc.date || (doc.created_at ? doc.created_at.slice(0, 10) : null);
        if (!dateStr) return;
        const monthKey = dateStr.slice(0, 7);
        const bucket = months.find(m => m.key === monthKey);
        if (!bucket) return;
        bucket.docs++;

        if (doc.doc_type === 'invoice' && doc.data) {
            try {
                const payload = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
                let sub = 0;
                if (payload.items) payload.items.forEach(r => { sub += (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0); });
                bucket.revenue += sub * 1.18;
            } catch (e) { }
        }
    });

    // Check if any data exists
    const hasData = months.some(m => m.docs > 0);
    if (!hasData) {
        canvas.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    emptyEl.style.display = 'none';

    // Setup canvas DPR-aware sizing
    const wrap = canvas.parentElement;
    const DPR = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    // Layout constants
    const PAD_L = 68, PAD_R = 20, PAD_T = 18, PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const n = months.length;
    const groupW = chartW / n;
    const barW = Math.min(groupW * 0.3, 22);
    const gap = barW * 0.5;

    const maxDocs = Math.max(...months.map(m => m.docs), 1);
    const maxRev = Math.max(...months.map(m => m.revenue), 1);

    // Colors
    const COL_DOCS = '#a855f7';
    const COL_REV = '#10b981';
    const COL_GRID = 'rgba(255,255,255,0.05)';
    const COL_AXIS = 'rgba(255,255,255,0.12)';
    const COL_TEXT = '#71717a';

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Y gridlines + left axis (docs)
    const gridLines = 4;
    ctx.font = '11px Outfit, sans-serif';
    for (let i = 0; i <= gridLines; i++) {
        const y = PAD_T + chartH - (chartH * i / gridLines);
        ctx.strokeStyle = COL_GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_L, y);
        ctx.lineTo(PAD_L + chartW, y);
        ctx.stroke();

        // Left axis label (docs)
        const docVal = Math.round(maxDocs * i / gridLines);
        ctx.fillStyle = COL_TEXT;
        ctx.textAlign = 'right';
        ctx.fillText(docVal, PAD_L - 8, y + 4);
    }

    // Right axis label (revenue) — abbreviated
    for (let i = 0; i <= gridLines; i++) {
        const y = PAD_T + chartH - (chartH * i / gridLines);
        const revVal = maxRev * i / gridLines;
        const label = revVal >= 100000 ? `${(revVal / 100000).toFixed(1)}L`
            : revVal >= 1000 ? `${(revVal / 1000).toFixed(0)}k`
                : Math.round(revVal).toString();
        ctx.fillStyle = COL_TEXT;
        ctx.textAlign = 'left';
        ctx.fillText(label, PAD_L + chartW + 5, y + 4);
    }

    // X axis line
    ctx.strokeStyle = COL_AXIS;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T + chartH);
    ctx.lineTo(PAD_L + chartW, PAD_T + chartH);
    ctx.stroke();

    // Store bar rects for hit-testing on hover
    canvas._barRects = [];

    // Draw bars with animation
    let progress = 0;
    const ANIM_DURATION = 600; // ms
    let startTime = null;

    function drawBars(animP) {
        // Clear chart area only
        ctx.clearRect(PAD_L, PAD_T, chartW, chartH + 1);

        months.forEach((m, idx) => {
            const cx = PAD_L + groupW * idx + groupW / 2;
            const x1 = cx - gap / 2 - barW;
            const x2 = cx + gap / 2;

            // Docs bar (purple)
            const docH = (m.docs / maxDocs) * chartH * animP;
            const docY = PAD_T + chartH - docH;

            const gradDoc = ctx.createLinearGradient(0, docY, 0, docY + docH);
            gradDoc.addColorStop(0, '#c084fc');
            gradDoc.addColorStop(1, '#7e22ce');
            ctx.fillStyle = gradDoc;
            ctx.beginPath();
            ctx.roundRect(x1, docY, barW, docH, [4, 4, 0, 0]);
            ctx.fill();

            // Revenue bar (green)
            const revH = (m.revenue / maxRev) * chartH * animP;
            const revY = PAD_T + chartH - revH;

            const gradRev = ctx.createLinearGradient(0, revY, 0, revY + revH);
            gradRev.addColorStop(0, '#34d399');
            gradRev.addColorStop(1, '#065f46');
            ctx.fillStyle = gradRev;
            ctx.beginPath();
            ctx.roundRect(x2, revY, barW, revH, [4, 4, 0, 0]);
            ctx.fill();

            // Store rects for tooltip
            if (animP === 1) {
                canvas._barRects[idx] = {
                    month: m,
                    docRect: { x: x1, y: docY, w: barW, h: docH },
                    revRect: { x: x2, y: revY, w: barW, h: revH },
                    cx
                };
            }

            // X labels
            ctx.fillStyle = COL_TEXT;
            ctx.font = '11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(m.label, cx, PAD_T + chartH + 20);
        });
    }

    function animate(ts) {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        // Ease out cubic
        let t = Math.min(elapsed / ANIM_DURATION, 1);
        t = 1 - Math.pow(1 - t, 3);
        drawBars(t);
        if (t < 1) requestAnimationFrame(animate);
        else {
            drawBars(1); // ensure final render with rects stored
        }
    }

    requestAnimationFrame(animate);

    // Tooltip setup
    let tooltipEl = document.querySelector('.chart-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'chart-tooltip';
        document.body.appendChild(tooltipEl);
    }

    canvas.onmousemove = (e) => {
        if (!canvas._barRects || !canvas._barRects.length) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let hit = null;
        canvas._barRects.forEach(r => {
            if (!r) return;
            const inDoc = mx >= r.docRect.x && mx <= r.docRect.x + r.docRect.w && my >= r.docRect.y;
            const inRev = mx >= r.revRect.x && mx <= r.revRect.x + r.revRect.w && my >= r.revRect.y;
            const inGroup = mx >= r.docRect.x - 4 && mx <= r.revRect.x + r.revRect.w + 4;
            if (inDoc || inRev || (inGroup && my >= PAD_T && my <= PAD_T + chartH)) hit = r;
        });

        if (hit) {
            const m = hit.month;
            const revFmt = m.revenue >= 100000 ? `₹${(m.revenue / 100000).toFixed(2)}L`
                : m.revenue >= 1000 ? `₹${(m.revenue / 1000).toFixed(1)}k`
                    : `₹${Math.round(m.revenue).toLocaleString('en-IN')}`;
            tooltipEl.innerHTML = `
                <div class="chart-tooltip-month">${m.label}</div>
                <div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:#a855f7"></span><span>${m.docs} document${m.docs !== 1 ? 's' : ''}</span></div>
                <div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:#10b981"></span><span>Revenue: ${revFmt}</span></div>
            `;
            tooltipEl.classList.add('visible');
            tooltipEl.style.left = (e.clientX + 14) + 'px';
            tooltipEl.style.top = (e.clientY - 10) + 'px';
        } else {
            tooltipEl.classList.remove('visible');
        }
    };

    canvas.onmouseleave = () => {
        tooltipEl.classList.remove('visible');
    };
}

// Render the documents table grid
function renderHistoryTable(docs) {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '';

    if (docs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center empty-history">
                    <i class="fa-solid fa-folder-open"></i> No documents saved in database yet.
                </td>
            </tr>
        `;
        return;
    }

    docs.forEach(doc => {
        const docDate = doc.date ? doc.date.split('-').reverse().join('/') : 'N/A';
        const createdDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : 'N/A';

        const typeLabels = {
            quotation: 'Project Proposal / Quote',
            invoice: 'Billing Invoice',
            receipt: 'Receipt Slip',
            voucher: 'Cash Voucher',
            labour: 'Developer Contract',
            handover: 'Project Handover',
            expense: 'Office Expense',
            letterpad: 'Letter Pad'
        };

        tbody.innerHTML += `
            <tr data-type="${doc.doc_type}">
                <td><span class="history-doc-badge badge-${doc.doc_type}">${typeLabels[doc.doc_type]}</span></td>
                <td><strong>${doc.doc_no}</strong></td>
                <td>${doc.client_name || 'N/A'}</td>
                <td>${docDate}</td>
                <td>${createdDate}</td>
                <td class="text-center">
                    <div class="history-actions">
                        <button type="button" class="action-btn edit-btn" onclick="editDocument(${doc.id})" title="Edit Document"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button type="button" class="action-btn reprint-btn" onclick="reprintDocument(${doc.id})" title="Print / PDF"><i class="fa-solid fa-print"></i></button>
                        <button type="button" class="action-btn delete-btn" onclick="deleteDocument(${doc.id})" title="Delete Document"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// Filter the history table by search string & type selector
function filterHistoryTable() {
    const searchVal = document.getElementById('history-search').value.toLowerCase();
    const filterVal = document.getElementById('history-filter').value;

    const rows = document.querySelectorAll('#history-tbody tr');
    rows.forEach(row => {
        // Skip empty row indicator
        if (row.cells.length === 1) return;

        const type = row.getAttribute('data-type');
        const textContent = row.textContent.toLowerCase();

        const matchesSearch = textContent.includes(searchVal);
        const matchesFilter = filterVal === 'all' || type === filterVal;

        if (matchesSearch && matchesFilter) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// --- MODULE ROUTER & WORKSPACE TOGGLE ---
function showDashboard() {
    document.getElementById('dashboard-view').style.display = 'block';
    document.getElementById('module-container').style.display = 'none';
    currentModule = '';
    editingDocumentId = null;
    loadPortalData(); // Refresh history registry
}

// --- API DATABASE ACTIONS ---
async function fetchAutoNumber(docType, inputId, updateFunction) {
    try {
        const response = await apiFetch(`/api/next_number/${docType}?_t=${Date.now()}`);
        const data = await response.json();
        if (data.success) {
            document.getElementById(inputId).value = data.doc_no;
            if (updateFunction) updateFunction();
        }
    } catch (error) {
        console.error("Error fetching auto number:", error);
    }
}

// Save Document (Creates or Updates)
async function saveDocumentData() {
    let payload = { doc_type: currentModule, doc_no: '', client_name: '', data: {} };

    try {
        if (currentModule === 'quotation') {
            payload.doc_no = document.getElementById('quo-no').value;
            payload.client_name = document.getElementById('quo-cust').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('quo-date').value,
                valid: document.getElementById('quo-valid').value,
                client: payload.client_name,
                addr: document.getElementById('quo-addr').value,
                mob: document.getElementById('quo-mob').value,
                email: document.getElementById('quo-email').value,
                project: document.getElementById('quo-project').value,
                venue: document.getElementById('quo-venue').value,
                dsign: document.getElementById('quo-dsign-check').checked,
                auth: document.getElementById('quo-auth').value,
                items: quoteRows,
                specs: quoteSpecs
            };
        } else if (currentModule === 'invoice') {
            payload.doc_no = document.getElementById('inv-no').value;
            payload.client_name = document.getElementById('inv-cust').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('inv-date').value,
                due: document.getElementById('inv-due').value,
                client: payload.client_name,
                addr: document.getElementById('inv-addr').value,
                mob: document.getElementById('inv-mob').value,
                pos: document.getElementById('inv-pos').value,
                gstin: document.getElementById('inv-gst').value,
                pan: document.getElementById('inv-pan').value,
                dsign: document.getElementById('inv-dsign-check').checked,
                auth: document.getElementById('inv-auth').value,
                received: parseFloat(document.getElementById('inv-received').value) || 0,
                items: invoiceRows
            };
        } else if (currentModule === 'receipt') {
            payload.doc_no = document.getElementById('rec-no').value;
            payload.client_name = document.getElementById('rec-from').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('rec-date').value,
                from: payload.client_name,
                amt: parseFloat(document.getElementById('rec-amt').value) || 0,
                desc: document.getElementById('rec-desc').value,
                method: document.getElementById('rec-method').value,
                dsign: document.getElementById('rec-dsign-check').checked,
                by: document.getElementById('rec-by').value,
                auth: document.getElementById('rec-auth').value
            };
        } else if (currentModule === 'voucher') {
            payload.doc_no = document.getElementById('vou-no').value;
            payload.client_name = document.getElementById('vou-to').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('vou-date').value,
                to: payload.client_name,
                amt: parseFloat(document.getElementById('vou-amt').value) || 0,
                desc: document.getElementById('vou-desc').value,
                mode: document.getElementById('vou-mode').value,
                dsign: document.getElementById('vou-dsign-check').checked,
                by: document.getElementById('vou-by').value,
                appr: document.getElementById('vou-appr').value,
                rec: document.getElementById('vou-rec').value
            };
        } else if (currentModule === 'labour') {
            payload.doc_no = document.getElementById('lab-no').value;
            payload.client_name = document.getElementById('lab-contractor').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('lab-date').value,
                contractor: payload.client_name,
                addr: document.getElementById('lab-addr').value,
                mob: document.getElementById('lab-mob').value,
                site: document.getElementById('lab-site').value,
                scope: document.getElementById('lab-scope').value,
                rate: parseFloat(document.getElementById('lab-rate').value) || 0,
                total: parseFloat(document.getElementById('lab-total').value) || 0,
                schedule: document.getElementById('lab-schedule').value,
                retention: parseFloat(document.getElementById('lab-retention').value) || 0,
                target: document.getElementById('lab-target').value,
                dsign: document.getElementById('lab-dsign-check').checked,
                auth: document.getElementById('lab-auth').value
            };
        } else if (currentModule === 'handover') {
            payload.doc_no = document.getElementById('hnd-no').value;
            payload.client_name = document.getElementById('hnd-client').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('hnd-date').value,
                client: payload.client_name,
                company: document.getElementById('hnd-company').value,
                addr: document.getElementById('hnd-addr').value,
                stall: document.getElementById('hnd-stall').value,
                venue: document.getElementById('hnd-venue').value,
                event: document.getElementById('hnd-event').value,
                completion: document.getElementById('hnd-completion').value,
                dsign: document.getElementById('hnd-dsign-check').checked,
                auth: document.getElementById('hnd-auth').value,
                rec: document.getElementById('hnd-rec').value
            };
        } else if (currentModule === 'expense') {
            payload.doc_no = document.getElementById('exp-id').value;
            payload.client_name = document.getElementById('exp-to').value;
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('exp-date').value,
                to: payload.client_name,
                amt: parseFloat(document.getElementById('exp-amt').value) || 0,
                desc: document.getElementById('exp-desc').value,
                cat: document.getElementById('exp-cat').value,
                dsign: document.getElementById('exp-dsign-check').checked,
                by: document.getElementById('exp-by').value,
                auth: document.getElementById('exp-auth').value
            };
        } else if (currentModule === 'letterpad') {
            payload.doc_no = document.getElementById('let-no').value;
            const subjectVal = document.getElementById('let-subject').value.trim();
            payload.client_name = subjectVal || '(Letter)'; // Store subject as descriptor; fallback prevents empty field rejection
            payload.data = {
                no: payload.doc_no,
                date: document.getElementById('let-date').value,
                subject: payload.client_name,
                body: document.getElementById('let-body').value,
                dsign: document.getElementById('let-dsign-check').checked,
                auth: document.getElementById('let-auth').value,
                showgst: document.getElementById('let-showgst-check').checked
            };
        }
    } catch (err) {
        showToast('Please fill in the form correctly.', 'error');
        return;
    }

    // Send to backend
    try {
        const response = await apiFetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            showToast('Document saved successfully!', 'success');
            showDashboard();
        } else {
            showToast(`Save failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Network error, failed to save document.', 'error');
    }
}

// Edit/Load document from registry
async function editDocument(id) {
    editingDocumentId = id;
    try {
        const response = await apiFetch(`/api/documents/${id}?_t=${Date.now()}`);
        const data = await response.json();

        if (data.success) {
            const doc = data.document;
            openModule(doc.doc_type, doc.data);
            showToast('Document loaded for editing.', 'info');
        } else {
            showToast('Failed to load document data.', 'error');
        }
    } catch (err) {
        showToast('Error connecting to backend.', 'error');
    }
}

// Delete document from registry
function deleteDocument(id) {
    if (window.showConfirm) {
        window.showConfirm(
            'Delete Document',
            'Are you sure you want to permanently delete this document from the registry?',
            async () => {
                try {
                    const response = await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
                    const data = await response.json();
                    if (data.success) {
                        showToast('Document deleted.', 'success');
                        loadPortalData();
                    } else {
                        showToast('Delete failed.', 'error');
                    }
                } catch (err) {
                    showToast('Network error.', 'error');
                }
            }
        );
    } else {
        // Fallback for cases where custom modal isn't loaded yet
        if (!confirm('Are you sure you want to permanently delete this document?')) return;
        apiFetch(`/api/documents/${id}`, { method: 'DELETE' })
            .then(r => r.json())
            .then(data => {
                if (data.success) { showToast('Document deleted.', 'success'); loadPortalData(); }
                else showToast('Delete failed.', 'error');
            })
            .catch(() => showToast('Network error.', 'error'));
    }
}

// Reprint directly by loading page and running print
async function reprintDocument(id) {
    try {
        const response = await apiFetch(`/api/documents/${id}?_t=${Date.now()}`);
        const data = await response.json();

        if (data.success) {
            const doc = data.document;
            openModule(doc.doc_type, doc.data);
            setTimeout(() => {
                window.print();
            }, 300);
        } else {
            showToast('Failed to load document.', 'error');
        }
    } catch (err) {
        showToast('Error connecting to server.', 'error');
    }
}

// Trigger browser printing window
function triggerPrint() {
    window.print();
}

// Redirect download database backup
function backupDatabase() {
    downloadBackup();
}

function downloadBackup() {
    const token = localStorage.getItem('rturox_admin_token');
    window.location.href = '/api/backup?token=' + encodeURIComponent(token || '');
    showToast('Downloading database backup...', 'success');
}

// Topbar restore trigger — clicks the hidden file input
function triggerRestoreUpload() {
    const input = document.getElementById('restore-file-input');
    if (input) input.click();
}

// Handle file selection from topbar restore input
async function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('backup_file', file);

    showToast('Uploading and restoring database...', 'info');

    try {
        const response = await apiFetch('/api/restore', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            showToast(data.message || 'Database restored!', 'success');
            setTimeout(() => { window.location.reload(); }, 1000);
        } else {
            showToast(`Restore failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast('Network error during restoration.', 'error');
    }
    // Reset file input so same file can be re-selected
    event.target.value = '';
}

// Open restore modal
function openRestoreModal() {
    document.getElementById('restore-modal').style.display = 'flex';
    document.getElementById('backup-file-input').value = '';
    document.getElementById('upload-details').innerText = 'Drag file here or click to browse';
}

function closeRestoreModal() {
    document.getElementById('restore-modal').style.display = 'none';
}

// Submit database restore file
async function submitRestore() {
    const fileInput = document.getElementById('backup-file-input');
    if (fileInput.files.length === 0) {
        showToast('Please select a file first.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('backup_file', fileInput.files[0]);

    showToast('Uploading and restoring database...', 'info');
    closeRestoreModal();

    try {
        const response = await apiFetch('/api/restore', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            showToast(data.message, 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showToast(`Restore failed: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast('Network error during restoration.', 'error');
    }
}

// Listen to upload input events to show filename (modal restore input)
const _bfi = document.getElementById('backup-file-input');
if (_bfi) {
    _bfi.addEventListener('change', (e) => {
        const details = document.getElementById('upload-details');
        if (details && e.target.files.length > 0) {
            details.innerHTML = `<strong>Selected file:</strong> ${e.target.files[0].name}`;
        }
    });
}


// --- OPEN MODULE WRAPPER ---
function openModule(moduleName, editData = null) {
    currentModule = moduleName;
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('module-container').style.display = 'flex';

    // Set toolbar indicator styling
    const indicator = document.getElementById('module-icon-indicator');
    const title = document.getElementById('module-title');

    const icons = {
        quotation: 'fa-file-invoice-dollar',
        invoice: 'fa-receipt',
        receipt: 'fa-file-signature',
        voucher: 'fa-cash-register',
        labour: 'fa-laptop-code',
        handover: 'fa-circle-check',
        expense: 'fa-credit-card',
        letterpad: 'fa-envelope-open-text'
    };

    const titles = {
        quotation: 'Project Proposal / Quote',
        invoice: 'Billing Invoice',
        receipt: 'Receipt Slip',
        voucher: 'Cash Voucher',
        labour: 'Developer Contract',
        handover: 'Project Handover',
        expense: 'Office Expense',
        letterpad: 'Letter Pad'
    };

    const colors = {
        quotation: 'var(--primary)',
        invoice: 'var(--success)',
        receipt: 'var(--accent)',
        voucher: 'var(--warning)',
        labour: '#8b5cf6',
        handover: '#ec4899',
        expense: '#f97316',
        letterpad: '#14b8a6'
    };

    indicator.style.background = colors[moduleName];
    indicator.innerHTML = `<i class="fa-solid ${icons[moduleName]}"></i>`;
    title.innerText = titles[moduleName];

    // Reset preview wrapper DOM
    document.getElementById('preview-wrapper').innerHTML = '';

    // Branch on modules forms & updates
    if (moduleName === 'quotation') {
        renderQuoteForm(editData);
    } else if (moduleName === 'invoice') {
        renderInvoiceForm(editData);
    } else if (moduleName === 'receipt') {
        renderReceiptForm(editData);
    } else if (moduleName === 'voucher') {
        renderVoucherForm(editData);
    } else if (moduleName === 'labour') {
        renderLabourForm(editData);
    } else if (moduleName === 'handover') {
        renderHandoverForm(editData);
    } else if (moduleName === 'expense') {
        renderExpenseForm(editData);
    } else if (moduleName === 'letterpad') {
        renderLetterPadForm(editData);
    }
}


// ==========================================================================
// 1. QUOTATION MODULE
// ==========================================================================
function renderQuoteForm(data = null) {
    // Reset lists
    if (data) {
        quoteRows = data.items || [];
        quoteSpecs = data.specs || [];
    } else {
        quoteRows = [{ service: 'Custom Web Application Development', desc: 'Design, frontend, backend API integration & deployment', qty: 1, rate: 45000 }];
        quoteSpecs = [{ text: 'Payment Terms: 30% advance, 40% on milestone demo, 30% on launch.' }, { text: 'Ownership: Full source code ownership transferred upon payment clearance.' }, { text: 'Deployment: Handed over on AWS/Vercel server environments.' }];
    }

    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Quotation No</label><input type="text" id="quo-no" value="${data ? data.no : 'QT-...'}" oninput="updateQuotePreview()"></div>
            <div class="form-group"><label>Date</label><input type="date" id="quo-date" value="${data ? data.date : getToday()}" oninput="updateQuotePreview()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Valid Upto</label><input type="date" id="quo-valid" value="${data ? data.valid : ''}" oninput="updateQuotePreview()"></div>
        </div>
        
        <h3>Quote Details</h3>
        <div class="form-group"><label>Client Name / Company</label><input type="text" id="quo-cust" value="${data ? data.client : 'Client Name'}" oninput="updateQuotePreview()"></div>
        <div class="form-group"><label>Client Address</label><textarea id="quo-addr" rows="2" oninput="updateQuotePreview()">${data ? data.addr : 'Client Address details'}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Mobile</label><input type="text" id="quo-mob" value="${data ? data.mob || '' : ''}" oninput="updateQuotePreview()"></div>
            <div class="form-group"><label>Email</label><input type="text" id="quo-email" value="${data ? data.email || '' : ''}" oninput="updateQuotePreview()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Project Name</label><input type="text" id="quo-project" value="${data ? data.project || '' : 'Web Application Development'}" oninput="updateQuotePreview()"></div>
            <div class="form-group"><label>Deployment Target</label><input type="text" id="quo-venue" value="${data ? data.venue || '' : 'Vercel Cloud & AWS'}" oninput="updateQuotePreview()"></div>
        </div>
        
        <h3>Digital Signature</h3>
        <div class="form-check">
            <input type="checkbox" id="quo-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateQuotePreview()">
            <label for="quo-dsign-check">Enable Digital Signature</label>
        </div>
        <div class="form-group"><label>Authorized Signatory Name</label><input type="text" id="quo-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateQuotePreview()"></div>
        
        <h3>Itemized Estimates</h3>
        <div id="quo-items-container"></div>
        <button class="btn btn-primary btn-sm" onclick="addQuoteRow()"><i class="fa-solid fa-plus"></i> Add Item Row</button>
        
        <h3>Specifications / Terms</h3>
        <div id="quo-specs-container"></div>
        <button class="btn btn-primary btn-sm" onclick="addQuoteSpec()"><i class="fa-solid fa-plus"></i> Add Specification</button>
    `;

    renderQuoteItemInputs();
    renderQuoteSpecInputs();

    if (!data) {
        fetchAutoNumber('quotation', 'quo-no', updateQuotePreview);
    } else {
        updateQuotePreview();
    }
}

function renderQuoteItemInputs() {
    const container = document.getElementById('quo-items-container');
    container.innerHTML = '';
    quoteRows.forEach((row, index) => {
        container.innerHTML += `
            <div class="dynamic-row-card">
                <div class="dynamic-row-header">
                    <span>Item #${index + 1}</span>
                    <button class="btn btn-danger btn-sm" onclick="removeQuoteRow(${index})"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div class="form-group"><label>Service Name</label><input type="text" value="${row.service}" oninput="updateQuoRow(${index}, 'service', this.value)"></div>
                <div class="form-group"><label>Description Subtext</label><input type="text" value="${row.desc}" oninput="updateQuoRow(${index}, 'desc', this.value)"></div>
                <div class="form-row">
                    <div class="form-group"><label>Qty</label><input type="number" value="${row.qty}" oninput="updateQuoRow(${index}, 'qty', this.value)"></div>
                    <div class="form-group"><label>Rate (₹)</label><input type="number" value="${row.rate}" oninput="updateQuoRow(${index}, 'rate', this.value)"></div>
                </div>
            </div>
        `;
    });
}

function renderQuoteSpecInputs() {
    const container = document.getElementById('quo-specs-container');
    container.innerHTML = '';
    quoteSpecs.forEach((spec, index) => {
        container.innerHTML += `
            <div class="form-row" style="margin-bottom:8px; align-items:center;">
                <div class="form-group" style="flex:5; margin-bottom:0;"><input type="text" value="${spec.text}" placeholder="Terms line item..." oninput="updateQuoSpec(${index}, this.value)"></div>
                <button class="btn btn-danger btn-sm" style="height:38px; margin-top:0;" onclick="removeQuoteSpec(${index})"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    });
}

function addQuoteRow() { quoteRows.push({ service: '', desc: '', qty: 1, rate: 0 }); renderQuoteItemInputs(); updateQuotePreview(); }
function removeQuoteRow(i) { if (quoteRows.length > 1) { quoteRows.splice(i, 1); renderQuoteItemInputs(); updateQuotePreview(); } }
function updateQuoRow(i, field, val) { quoteRows[i][field] = val; updateQuotePreview(); }

function addQuoteSpec() { quoteSpecs.push({ text: '' }); renderQuoteSpecInputs(); updateQuotePreview(); }
function removeQuoteSpec(i) { quoteSpecs.splice(i, 1); renderQuoteSpecInputs(); updateQuotePreview(); }
function updateQuoSpec(i, val) { quoteSpecs[i].text = val; updateQuotePreview(); }

function updateQuotePreview() {
    if (currentModule !== 'quotation') return;
    const no = document.getElementById('quo-no').value;
    const date = document.getElementById('quo-date').value.split('-').reverse().join('/');
    const valid = document.getElementById('quo-valid').value ? document.getElementById('quo-valid').value.split('-').reverse().join('/') : '';
    const cust = document.getElementById('quo-cust').value;
    const addr = document.getElementById('quo-addr').value.replace(/\n/g, '<br>');
    const mob = document.getElementById('quo-mob').value;
    const email = document.getElementById('quo-email').value;
    const project = document.getElementById('quo-project').value;
    const venue = document.getElementById('quo-venue').value;

    const useDsign = document.getElementById('quo-dsign-check').checked;
    const authName = document.getElementById('quo-auth').value;
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br><br>';

    let tbody = '';
    let grandTotal = 0;

    quoteRows.forEach((row, i) => {
        const qty = parseFloat(row.qty) || 0;
        const rate = parseFloat(row.rate) || 0;
        const amt = qty * rate;
        grandTotal += amt;

        tbody += `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td><strong>${row.service}</strong><br><span style="color:#555; font-size:0.75rem;">${row.desc}</span></td>
                <td class="text-center">${qty}</td>
                <td class="text-right">${rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
    });

    let specHtml = '';
    if (quoteSpecs.length > 0) {
        let lis = '';
        quoteSpecs.forEach(s => {
            if (s.text.trim() !== '') lis += `<li>${s.text}</li>`;
        });
        if (lis !== '') {
            specHtml = `
                <div class="page-break"></div>
                <div class="document-paper full-a4" style="margin-top:20px;">
                    <div class="doc-letterhead">
                        <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                        <h1 class="company-name">${companyData.name}</h1>
                        <p>${companyData.address1}, ${companyData.address2}</p>
                        <p>Mobile: ${companyData.mobile} | Email: ${companyData.email}</p>
                    </div>
                    <h3 class="text-center" style="margin-top:15px; margin-bottom:20px; font-size:1.15rem; text-decoration:underline;">SPECIFICATIONS & SCOPE DETAILS</h3>
                    <ol style="margin-left: 25px; line-height: 2; font-size: 0.9rem;">
                        ${lis}
                    </ol>
                </div>
            `;
        }
    }

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper full-a4" style="justify-content: space-between;">
            <div>
                <div class="doc-letterhead">
                    <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                    <h1 class="company-name">${companyData.name}</h1>
                    <p>${companyData.address1}, ${companyData.address2}</p>
                    <p><strong>Mobile:</strong> ${companyData.mobile} | <strong>Email:</strong> ${companyData.email}</p>
                </div>
                
                <div class="doc-flex-row">
                    <div>
                        <div class="doc-bill-title">QUOTE TO</div>
                        <div class="doc-bill-to">
                            <strong>${cust}</strong><br>
                            ${addr}<br>
                            ${mob ? `Mobile: ${mob}<br>` : ''}
                            ${email ? `Email: ${email}` : ''}
                        </div>
                    </div>
                    
                    <div style="text-align: right;">
                        <h2 style="font-size:1.3rem; font-weight:800; margin-bottom:5px;">QUOTATION</h2>
                        <table class="doc-meta-table">
                            <tr><td>Quote No:</td><td><strong>${no}</strong></td></tr>
                            <tr><td>Date:</td><td><strong>${date}</strong></td></tr>
                            ${valid ? `<tr><td>Valid Upto:</td><td><strong>${valid}</strong></td></tr>` : ''}
                            ${project ? `<tr><td>Project:</td><td><strong>${project}</strong></td></tr>` : ''}
                            ${venue ? `<tr><td>Deployment:</td><td><strong>${venue}</strong></td></tr>` : ''}
                        </table>
                    </div>
                </div>
                
                <table class="doc-table">
                    <thead>
                        <tr>
                            <th width="8%" class="text-center">S.NO</th>
                            <th width="48%">SERVICES / SPECIFICATIONS</th>
                            <th width="10%" class="text-center">QTY</th>
                            <th width="16%" class="text-right">RATE</th>
                            <th width="18%" class="text-right">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tbody}
                    </tbody>
                </table>
                
                <div class="doc-grand-totals">
                    <table class="doc-totals-table">
                        <tr class="bold-row">
                            <td>Total Estimate Value</td>
                            <td class="text-right">₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="doc-words-block">
                    <strong>Total Amount (in words):</strong><br>
                    <span>${numberToWords(grandTotal)}</span>
                </div>
            </div>
            
            <div>
                <div class="doc-terms">
                    <strong>Standard Terms & Conditions:</strong>
                    <ul>
                        <li>Projects are initiated upon sign-off of proposal and receipt of advance payment.</li>
                        <li>An advance payment of 30% is required to initialize sprint schedules.</li>
                        <li>All intellectual property and code ownership transfer to client only upon final invoice clearance.</li>
                        <li>Standard SLA support and warranty details are governed by the main Master Services Agreement (MSA).</li>
                    </ul>
                </div>
                
                <div class="doc-signature-block">
                    <div class="doc-signature-wrap">
                        <span>For <strong>Orbenyx</strong></span>
                        ${authSig}
                        <div class="doc-signature-line">Authorized Signatory</div>
                    </div>
                </div>
            </div>
        </div>
        ${specHtml}
    `;
}

// ==========================================================================
// 2. BILLING INVOICE MODULE
// ==========================================================================
function renderInvoiceForm(data = null) {
    if (data) {
        invoiceRows = data.items || [];
    } else {
        invoiceRows = [{ service: 'Software Development Services', desc: 'Custom CRM Portal Development - Milestone 2', sac: '998313', qty: 1, rate: 45000 }];
    }

    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Invoice No</label><input type="text" id="inv-no" value="${data ? data.no : 'INV-...'}" oninput="updateInvoicePreview()"></div>
            <div class="form-group"><label>Invoice Date</label><input type="date" id="inv-date" value="${data ? data.date : getToday()}" oninput="updateInvoicePreview()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Due Date</label><input type="date" id="inv-due" value="${data ? data.due || '' : ''}" oninput="updateInvoicePreview()"></div>
        </div>
        
        <h3>Bill To</h3>
        <div class="form-group"><label>Company Name</label><input type="text" id="inv-cust" value="${data ? data.client : 'AeroTech Coimbatore'}" oninput="updateInvoicePreview()"></div>
        <div class="form-group"><label>Client Address</label><textarea id="inv-addr" rows="2" oninput="updateInvoicePreview()">${data ? data.addr : '12, Avinashi Road, Peelamedu, Coimbatore - 641004'}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label>Mobile</label><input type="text" id="inv-mob" value="${data ? data.mob || '' : '+91 98765 43210'}" oninput="updateInvoicePreview()"></div>
            <div class="form-group"><label>Place of Supply</label><input type="text" id="inv-pos" value="${data ? data.pos || '' : 'Tamil Nadu'}" oninput="updateInvoicePreview()"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Client GSTIN</label><input type="text" id="inv-gst" value="${data ? data.gstin || '' : '33ABYPT0599A2Z8'}" oninput="updateInvoicePreview()"></div>
            <div class="form-group"><label>Client PAN</label><input type="text" id="inv-pan" value="${data ? data.pan || '' : 'ABYPT0599A'}" oninput="updateInvoicePreview()"></div>
        </div>
        
        <h3>Digital Signature</h3>
        <div class="form-check">
            <input type="checkbox" id="inv-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateInvoicePreview()">
            <label for="inv-dsign-check">Enable Digital Signature</label>
        </div>
        <div class="form-group"><label>Authorized Signatory Name</label><input type="text" id="inv-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateInvoicePreview()"></div>
        
        <h3>Itemized Invoice Rows</h3>
        <div id="inv-items-container"></div>
        <button class="btn btn-primary btn-sm" onclick="addInvoiceRow()"><i class="fa-solid fa-plus"></i> Add Item Row</button>
        
        <hr>
        <div class="form-group"><label>Received Amount (₹)</label><input type="number" id="inv-received" value="${data ? data.received : 20000}" oninput="updateInvoicePreview()"></div>
    `;

    renderInvoiceItemInputs();

    if (!data) {
        fetchAutoNumber('invoice', 'inv-no', updateInvoicePreview);
    } else {
        updateInvoicePreview();
    }
}

function renderInvoiceItemInputs() {
    const container = document.getElementById('inv-items-container');
    container.innerHTML = '';
    invoiceRows.forEach((row, index) => {
        container.innerHTML += `
            <div class="dynamic-row-card">
                <div class="dynamic-row-header">
                    <span>Row #${index + 1}</span>
                    <button class="btn btn-danger btn-sm" onclick="removeInvoiceRow(${index})"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:3;"><label>Service Name</label><input type="text" value="${row.service}" oninput="updateInvRow(${index}, 'service', this.value)"></div>
                    <div class="form-group" style="flex:1;"><label>SAC</label><input type="text" value="${row.sac}" oninput="updateInvRow(${index}, 'sac', this.value)"></div>
                </div>
                <div class="form-group"><label>Description Subtext</label><input type="text" value="${row.desc}" oninput="updateInvRow(${index}, 'desc', this.value)"></div>
                <div class="form-row">
                    <div class="form-group"><label>Qty (Units / Sprints)</label><input type="number" value="${row.qty}" oninput="updateInvRow(${index}, 'qty', this.value)"></div>
                    <div class="form-group"><label>Rate (₹)</label><input type="number" value="${row.rate}" oninput="updateInvRow(${index}, 'rate', this.value)"></div>
                </div>
            </div>
        `;
    });
}

function addInvoiceRow() { invoiceRows.push({ service: '', desc: '', sac: '', qty: 1, rate: 0 }); renderInvoiceItemInputs(); updateInvoicePreview(); }
function removeInvoiceRow(i) { if (invoiceRows.length > 1) { invoiceRows.splice(i, 1); renderInvoiceItemInputs(); updateInvoicePreview(); } }
function updateInvRow(i, field, val) { invoiceRows[i][field] = val; updateInvoicePreview(); }

function updateInvoicePreview() {
    if (currentModule !== 'invoice') return;
    const invNo = document.getElementById('inv-no').value;
    const invDate = document.getElementById('inv-date').value.split('-').reverse().join('/');
    const invDue = document.getElementById('inv-due').value ? document.getElementById('inv-due').value.split('-').reverse().join('/') : '';
    const cust = document.getElementById('inv-cust').value;
    const addr = document.getElementById('inv-addr').value.replace(/\n/g, '<br>');
    const mob = document.getElementById('inv-mob').value;
    const pos = document.getElementById('inv-pos').value;
    const gstin = document.getElementById('inv-gst').value;
    const pan = document.getElementById('inv-pan').value;
    const received = parseFloat(document.getElementById('inv-received').value) || 0;

    const useDsign = document.getElementById('inv-dsign-check').checked;
    const authName = document.getElementById('inv-auth').value;
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br><br>';

    let tbody = '';
    let taxableTotal = 0;

    invoiceRows.forEach((row, i) => {
        const qty = parseFloat(row.qty) || 0;
        const rate = parseFloat(row.rate) || 0;
        const amt = qty * rate;
        taxableTotal += amt;

        tbody += `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td><strong>${row.service}</strong><br><span style="color:#555; font-size:0.75rem;">${row.desc}</span></td>
                <td class="text-center">${row.sac}</td>
                <td class="text-center">${qty} SQM</td>
                <td class="text-right">${rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
        `;
    });

    const cgst = taxableTotal * 0.09;
    const sgst = taxableTotal * 0.09;
    const grandTotal = taxableTotal + cgst + sgst;
    const balance = grandTotal - received;

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper full-a4">
            <div class="doc-letterhead">
                <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                <h1 class="company-name">${companyData.name}</h1>
                <p>${companyData.address1}, ${companyData.address2}</p>
                <p><strong>GSTIN:</strong> ${companyData.gstin} | <strong>PAN:</strong> ${companyData.pan}</p>
                <p><strong>Mobile:</strong> ${companyData.mobile} | <strong>Email:</strong> ${companyData.email}</p>
            </div>
            
            <div class="doc-flex-row">
                <div>
                    <div class="doc-bill-title">BILL TO</div>
                    <div class="doc-bill-to">
                        <strong>${cust}</strong><br>
                        ${addr}<br>
                        ${mob ? `Mobile: ${mob}<br>` : ''}
                        ${gstin ? `GSTIN: ${gstin}<br>` : ''}
                        ${pan ? `PAN: ${pan}<br>` : ''}
                        ${pos ? `Place of Supply: ${pos}` : ''}
                    </div>
                </div>
                
                <div style="text-align: right;">
                    <h2 style="font-size:1.3rem; font-weight:800; margin-bottom:5px;">TAX INVOICE</h2>
                    <table class="doc-meta-table">
                        <tr><td>Invoice No:</td><td><strong>${invNo}</strong></td></tr>
                        <tr><td>Invoice Date:</td><td><strong>${invDate}</strong></td></tr>
                        ${invDue ? `<tr><td>Due Date:</td><td><strong>${invDue}</strong></td></tr>` : ''}
                    </table>
                </div>
            </div>
            
            <table class="doc-table">
                <thead>
                    <tr>
                        <th width="8%" class="text-center">S.NO</th>
                        <th width="48%">DESCRIPTION OF SERVICES</th>
                        <th width="10%" class="text-center">SAC</th>
                        <th width="10%" class="text-center">QTY</th>
                        <th width="12%" class="text-right">RATE</th>
                        <th width="12%" class="text-right">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
            
            <div class="doc-grand-totals">
                <table class="doc-totals-table">
                    <tr>
                        <td>Taxable Value</td>
                        <td class="text-right">₹ ${taxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <td>CGST @ 9%</td>
                        <td class="text-right">₹ ${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <td>SGST @ 9%</td>
                        <td class="text-right">₹ ${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr class="bold-row">
                        <td>Total Value (INR)</td>
                        <td class="text-right">₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                        <td>Received Amount</td>
                        <td class="text-right">₹ ${received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr class="bal-row">
                        <td>Balance Outstanding</td>
                        <td class="text-right">₹ ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                </table>
            </div>
            
            <div class="doc-words-block">
                <strong>Total Amount (in words):</strong><br>
                <span>${numberToWords(grandTotal)}</span>
            </div>
            
            <div style="margin-top: 15px; font-size: 0.8rem; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
                <strong>Bank Details for UPI/NEFT Transfer:</strong><br>
                <span>Bank: HDFC Bank | Account Name: Orbenyx | Account No: 50200062402131 | IFSC: HDFC0001216 | Branch: Coimbatore</span>
            </div>
            
            <div class="doc-signature-block" style="margin-top: 30px;">
                <div class="doc-signature-wrap">
                    <span>For <strong>Orbenyx</strong></span>
                    ${authSig}
                    <div class="doc-signature-line">Authorized Signatory</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 3. CASH RECEIPT MODULE (1/3 A4 Compact Slip)
// ==========================================================================
function renderReceiptForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Receipt No</label><input type="text" id="rec-no" value="${data ? data.no : 'REC-...'}" oninput="updateReceiptPreview()"></div>
            <div class="form-group"><label>Date</label><input type="date" id="rec-date" value="${data ? data.date : getToday()}" oninput="updateReceiptPreview()"></div>
        </div>
        <div class="form-group"><label>Received From</label><input type="text" id="rec-from" value="${data ? data.from : 'AeroTech Coimbatore'}" oninput="updateReceiptPreview()"></div>
        <div class="form-row">
            <div class="form-group"><label>Amount (₹)</label><input type="number" id="rec-amt" value="${data ? data.amt : 15000}" oninput="updateReceiptPreview()"></div>
            <div class="form-group">
                <label>Payment Method</label>
                <select id="rec-method" onchange="updateReceiptPreview()">
                    <option value="Cash" ${data && data.method === 'Cash' ? 'selected' : ''}>Cash</option>
                    <option value="Cheque" ${data && data.method === 'Cheque' ? 'selected' : ''}>Cheque</option>
                    <option value="UPI / GPay" ${data && data.method === 'UPI / GPay' ? 'selected' : ''}>UPI / GPay</option>
                    <option value="NEFT / Bank Transfer" ${data && data.method === 'NEFT / Bank Transfer' ? 'selected' : ''}>NEFT / Bank Transfer</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>For Particulars</label><input type="text" id="rec-desc" value="${data ? data.desc : 'Advance payment for UI/UX Design & Wireframing'}" oninput="updateReceiptPreview()"></div>
        
        <h3>Signatures</h3>
        <div class="form-check">
            <input type="checkbox" id="rec-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateReceiptPreview()">
            <label for="rec-dsign-check">Enable Digital Signatures</label>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Received By</label><input type="text" id="rec-by" value="${data ? data.by : 'Finance Manager'}" oninput="updateReceiptPreview()"></div>
            <div class="form-group"><label>Authorized By</label><input type="text" id="rec-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateReceiptPreview()"></div>
        </div>
    `;

    if (!data) {
        fetchAutoNumber('receipt', 'rec-no', updateReceiptPreview);
    } else {
        updateReceiptPreview();
    }
}

function updateReceiptPreview() {
    if (currentModule !== 'receipt') return;
    const no = document.getElementById('rec-no').value;
    const date = document.getElementById('rec-date').value.split('-').reverse().join('/');
    const from = document.getElementById('rec-from').value;
    const amt = parseFloat(document.getElementById('rec-amt').value) || 0;
    const desc = document.getElementById('rec-desc').value;
    const method = document.getElementById('rec-method').value;

    const useDsign = document.getElementById('rec-dsign-check').checked;
    const byName = document.getElementById('rec-by').value;
    const authName = document.getElementById('rec-auth').value;

    const bySig = useDsign && byName ? `<div class="digital-sig">${byName}</div>` : '<br><br>';
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper one-third-a4">
            <div>
                <div class="doc-compact-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="logo.png" alt="Logo" style="height: 35px; object-fit: contain;">
                        <div>
                            <h1 class="company-name" style="margin: 0; font-size: 1.25rem;">${companyData.name}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #555;">${companyData.address1}, ${companyData.address2} | Ph: ${companyData.mobile}</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2>CASH RECEIPT</h2>
                        <div class="doc-compact-meta">No: <strong>${no}</strong> | Date: <strong>${date}</strong></div>
                    </div>
                </div>
                
                <div style="font-size: 0.85rem; line-height: 1.6; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Received From: <strong>${from}</strong></span>
                        <span>Payment Method: <strong>${method}</strong></span>
                    </div>
                    <div>Paid Sum: <strong>₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> <em>(${numberToWords(amt)})</em></div>
                    <div>For Particulars: <strong>${desc}</strong></div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 0.8rem; margin-top: 15px;">
                <div style="text-align: center; width: 120px;">
                    ${bySig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Received By</div>
                </div>
                <div style="text-align: center; width: 150px;">
                    ${authSig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">For Orbenyx</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 4. CASH VOUCHER MODULE (1/3 A4 Compact Petty Cash)
// ==========================================================================
function renderVoucherForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Voucher No</label><input type="text" id="vou-no" value="${data ? data.no : 'VOU-...'}" oninput="updateVoucherPreview()"></div>
            <div class="form-group"><label>Date</label><input type="date" id="vou-date" value="${data ? data.date : getToday()}" oninput="updateVoucherPreview()"></div>
        </div>
        <div class="form-group"><label>Paid To</label><input type="text" id="vou-to" value="${data ? data.to : 'Ganesh Kumar (UI/UX Consultant)'}" oninput="updateVoucherPreview()"></div>
        <div class="form-row">
            <div class="form-group"><label>Amount Paid (₹)</label><input type="number" id="vou-amt" value="${data ? data.amt : 4500}" oninput="updateVoucherPreview()"></div>
            <div class="form-group">
                <label>Payment Mode</label>
                <select id="vou-mode" onchange="updateVoucherPreview()">
                    <option value="Cash" ${data && data.mode === 'Cash' ? 'selected' : ''}>Cash</option>
                    <option value="Cheque" ${data && data.mode === 'Cheque' ? 'selected' : ''}>Cheque</option>
                    <option value="UPI / PhonePe" ${data && data.mode === 'UPI / PhonePe' ? 'selected' : ''}>UPI / PhonePe</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>Particulars / Debit Category</label><input type="text" id="vou-desc" value="${data ? data.desc : 'UI Design Figma Assets Subscription & Assets Purchase'}" oninput="updateVoucherPreview()"></div>
        
        <h3>Signatures</h3>
        <div class="form-check">
            <input type="checkbox" id="vou-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateVoucherPreview()">
            <label for="vou-dsign-check">Enable Digital Signatures</label>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Paid By</label><input type="text" id="vou-by" value="${data ? data.by : 'Studio Lead'}" oninput="updateVoucherPreview()"></div>
            <div class="form-group"><label>Approved By</label><input type="text" id="vou-appr" value="${data ? data.appr : 'Orbenyx'}" oninput="updateVoucherPreview()"></div>
            <div class="form-group"><label>Receiver Signature</label><input type="text" id="vou-rec" value="${data ? data.rec : 'Ganesh Kumar'}" oninput="updateVoucherPreview()"></div>
        </div>
    `;

    if (!data) {
        fetchAutoNumber('voucher', 'vou-no', updateVoucherPreview);
    } else {
        updateVoucherPreview();
    }
}

function updateVoucherPreview() {
    if (currentModule !== 'voucher') return;
    const no = document.getElementById('vou-no').value;
    const date = document.getElementById('vou-date').value.split('-').reverse().join('/');
    const to = document.getElementById('vou-to').value;
    const amt = parseFloat(document.getElementById('vou-amt').value) || 0;
    const desc = document.getElementById('vou-desc').value;
    const mode = document.getElementById('vou-mode').value;

    const useDsign = document.getElementById('vou-dsign-check').checked;
    const byName = document.getElementById('vou-by').value;
    const apprName = document.getElementById('vou-appr').value;
    const recName = document.getElementById('vou-rec').value;

    const bySig = useDsign && byName ? `<div class="digital-sig">${byName}</div>` : '<br><br>';
    const apprSig = useDsign && apprName ? `<div class="digital-sig">${apprName}</div>` : '<br><br>';
    const recSig = useDsign && recName ? `<div class="digital-sig">${recName}</div>` : '<br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper one-third-a4">
            <div>
                <div class="doc-compact-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="logo.png" alt="Logo" style="height: 35px; object-fit: contain;">
                        <div>
                            <h1 class="company-name" style="margin: 0; font-size: 1.25rem;">${companyData.name}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #555;">${companyData.address1}, ${companyData.address2} | Ph: ${companyData.mobile}</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2>CASH VOUCHER</h2>
                        <div class="doc-compact-meta">No: <strong>${no}</strong> | Date: <strong>${date}</strong></div>
                    </div>
                </div>
                
                <div style="font-size: 0.85rem; line-height: 1.6; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Paid To: <strong>${to}</strong></span>
                        <span>Payment Mode: <strong>${mode}</strong></span>
                    </div>
                    <div>Debit Amount: <strong>₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> <em>(${numberToWords(amt)})</em></div>
                    <div>Particulars: <strong>${desc}</strong></div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 0.8rem; margin-top: 15px;">
                <div style="text-align: center; width: 120px;">
                    ${bySig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Paid By</div>
                </div>
                <div style="text-align: center; width: 120px;">
                    ${apprSig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Approved By</div>
                </div>
                <div style="text-align: center; width: 120px;">
                    ${recSig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Receiver's Sign</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 5. LABOUR CONTRACT AGREEMENT MODULE (A4 Page)
// ==========================================================================
function renderLabourForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Contract No</label><input type="text" id="lab-no" value="${data ? data.no : 'LAB-...'}" oninput="updateLabourPreview()"></div>
            <div class="form-group"><label>Agreement Date</label><input type="date" id="lab-date" value="${data ? data.date : getToday()}" oninput="updateLabourPreview()"></div>
        </div>
        
        <h3>Developer / Consultant Details</h3>
        <div class="form-group"><label>Developer Name</label><input type="text" id="lab-contractor" value="${data ? data.contractor : 'Suresh Kumar (React Developer)'}" oninput="updateLabourPreview()"></div>
        <div class="form-group"><label>Developer Address</label><textarea id="lab-addr" rows="2" oninput="updateLabourPreview()">${data ? data.addr : '12, Gandhipuram 4th Street, Coimbatore'}</textarea></div>
        <div class="form-group"><label>Mobile</label><input type="text" id="lab-mob" value="${data ? data.mob || '' : '9443212345'}" oninput="updateLabourPreview()"></div>
        
        <h3>Project Parameters</h3>
        <div class="form-group"><label>Project Name / Description</label><input type="text" id="lab-site" value="${data ? data.site : 'Orbenyx Web Application Development'}" oninput="updateLabourPreview()"></div>
        <div class="form-group"><label>Scope of Work / Stack</label><input type="text" id="lab-scope" value="${data ? data.scope : 'React Native mobile development and REST API integration'}" oninput="updateLabourPreview()"></div>
        
        <div class="form-row">
            <div class="form-group"><label>Hourly / Milestone Rate (₹)</label><input type="number" id="lab-rate" value="${data ? data.rate : 1200}" oninput="updateLabourPreview()"></div>
            <div class="form-group"><label>Total Contract Value (₹)</label><input type="number" id="lab-total" value="${data ? data.total : 60000}" oninput="updateLabourPreview()"></div>
        </div>
        
        <div class="form-row">
            <div class="form-group"><label>Milestone Holdback (%)</label><input type="number" id="lab-retention" value="${data ? data.retention : 10}" oninput="updateLabourPreview()"></div>
            <div class="form-group"><label>Completion Target Date</label><input type="date" id="lab-target" value="${data ? data.target : ''}" oninput="updateLabourPreview()"></div>
        </div>
        <div class="form-group"><label>Payment Schedule Milestone</label><input type="text" id="lab-schedule" value="${data ? data.schedule : '30% UI completion, 40% functional build, 30% App Store submission'}" oninput="updateLabourPreview()"></div>
        
        <h3>Digital Signature</h3>
        <div class="form-check">
            <input type="checkbox" id="lab-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateLabourPreview()">
            <label for="lab-dsign-check">Enable Digital Signature</label>
        </div>
        <div class="form-group"><label>Authorized Project Manager</label><input type="text" id="lab-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateLabourPreview()"></div>
    `;

    if (!data) {
        fetchAutoNumber('labour', 'lab-no', updateLabourPreview);
    } else {
        updateLabourPreview();
    }
}

function updateLabourPreview() {
    if (currentModule !== 'labour') return;
    const no = document.getElementById('lab-no').value;
    const date = document.getElementById('lab-date').value.split('-').reverse().join('/');
    const contractor = document.getElementById('lab-contractor').value;
    const addr = document.getElementById('lab-addr').value.replace(/\n/g, '<br>');
    const mob = document.getElementById('lab-mob').value;
    const site = document.getElementById('lab-site').value;
    const scope = document.getElementById('lab-scope').value;
    const rate = parseFloat(document.getElementById('lab-rate').value) || 0;
    const total = parseFloat(document.getElementById('lab-total').value) || 0;
    const retention = parseFloat(document.getElementById('lab-retention').value) || 0;
    const target = document.getElementById('lab-target').value ? document.getElementById('lab-target').value.split('-').reverse().join('/') : 'N/A';
    const schedule = document.getElementById('lab-schedule').value;

    const useDsign = document.getElementById('lab-dsign-check').checked;
    const authName = document.getElementById('lab-auth').value;
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br>';
    const contractorSig = useDsign && contractor ? `<div class="digital-sig">${contractor.split(' ')[0]}</div>` : '<br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper full-a4" style="justify-content: space-between;">
            <div>
                <div class="doc-letterhead">
                    <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                    <h1 class="company-name">${companyData.name}</h1>
                    <p>${companyData.address1}, ${companyData.address2}</p>
                    <p>Mobile: ${companyData.mobile} | Email: ${companyData.email}</p>
                </div>
                
                <h2 class="text-center" style="font-size: 1.25rem; font-weight: bold; margin-bottom: 20px; text-decoration: underline;">DEVELOPER CONTRACT AGREEMENT</h2>
                
                <p style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 15px;" class="text-justify">
                    This agreement is made on <strong>${date}</strong>, between <strong>Orbenyx</strong> (referred to as the Principal) and <strong>${contractor}</strong>, located at ${addr} (referred to as the Developer).
                </p>
                
                <table class="doc-table" style="margin-bottom: 15px;">
                    <thead>
                        <tr>
                            <th colspan="2">CONTRACT PARAMETERS & TERMS</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td width="30%"><strong>Contract ID:</strong></td><td>${no}</td></tr>
                        <tr><td><strong>Project / Product:</strong></td><td>${site}</td></tr>
                        <tr><td><strong>Scope of Work:</strong></td><td>${scope}</td></tr>
                        <tr><td><strong>Rate Basis:</strong></td><td>₹ ${rate.toLocaleString('en-IN')} per Hour / Milestone</td></tr>
                        <tr><td><strong>Total Agreed Value:</strong></td><td>₹ ${total.toLocaleString('en-IN')} <em>(${numberToWords(total)})</em></td></tr>
                        <tr><td><strong>Milestone Holdback:</strong></td><td>${retention}% (Released upon final production approval)</td></tr>
                        <tr><td><strong>Target Completion Date:</strong></td><td>${target}</td></tr>
                        <tr><td><strong>Payment Milestone Schedule:</strong></td><td>${schedule}</td></tr>
                    </tbody>
                </table>
                
                <div style="font-size: 0.8rem; line-height: 1.5;" class="text-justify">
                    <strong>General Agreement Conditions:</strong>
                    <ol style="margin-left: 20px; margin-top: 5px;">
                        <li>The Developer agrees to write clean, maintainable, and optimized code in compliance with the Project Scope.</li>
                        <li>The Developer agrees to maintain strict confidentiality of all intellectual property, credentials, and business algorithms.</li>
                        <li>The Developer warrants that all work is original and does not infringe upon any third-party licenses or copyrights.</li>
                        <li>The Developer agrees to check code contributions daily into the designated repository (e.g. GitHub).</li>
                    </ol>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 0.85rem; margin-top: 40px;">
                <div style="text-align: center; width: 200px;">
                    ${contractorSig}
                    <div style="border-top: 1px solid #000; padding-top: 3px; font-weight: bold;">Developer Signature</div>
                </div>
                
                <div style="text-align: center; width: 220px;">
                    <span>For <strong>Orbenyx</strong></span>
                    ${authSig}
                    <div style="border-top: 1px solid #000; padding-top: 3px; font-weight: bold;">Authorized Manager</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 6. HANDOVER LETTER MODULE (A4 Page)
// ==========================================================================
function renderHandoverForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Document Ref No</label><input type="text" id="hnd-no" value="${data ? data.no : 'HND-...'}" oninput="updateHandoverPreview()"></div>
            <div class="form-group"><label>Date of Handover</label><input type="date" id="hnd-date" value="${data ? data.date : getToday()}" oninput="updateHandoverPreview()"></div>
        </div>
        
        <h3>Client Info</h3>
        <div class="form-group"><label>Client / Representative Name</label><input type="text" id="hnd-client" value="${data ? data.client : 'S. Jayakumar (Director)'}" oninput="updateHandoverPreview()"></div>
        <div class="form-group"><label>Company Name</label><input type="text" id="hnd-company" value="${data ? data.company : 'AeroTech Coimbatore'}" oninput="updateHandoverPreview()"></div>
        <div class="form-group"><label>Client Company Address</label><textarea id="hnd-addr" rows="2" oninput="updateHandoverPreview()">${data ? data.addr : '12, Avinashi Road, Peelamedu, Coimbatore'}</textarea></div>
        
        <h3>Project Specifics</h3>
        <div class="form-group"><label>Project Name / Repo URL</label><input type="text" id="hnd-stall" value="${data ? data.stall : 'Orbenyx Web Application (Github: repo/orbenyx-app)'}" oninput="updateHandoverPreview()"></div>
        <div class="form-group"><label>Deployment Target / Platform</label><input type="text" id="hnd-venue" value="${data ? data.venue : 'AWS Cloud EC2 & Vercel Production'}" oninput="updateHandoverPreview()"></div>
        <div class="form-group"><label>Project Milestone / Version</label><input type="text" id="hnd-event" value="${data ? data.event : 'Production Release (V1.0.0-stable)'}" oninput="updateHandoverPreview()"></div>
        <div class="form-group"><label>Actual Launch Date</label><input type="date" id="hnd-completion" value="${data ? data.completion : getToday()}" oninput="updateHandoverPreview()"></div>
        
        <h3>Signatures</h3>
        <div class="form-check">
            <input type="checkbox" id="hnd-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateHandoverPreview()">
            <label for="hnd-dsign-check">Enable Digital Signatures</label>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Handed Over By</label><input type="text" id="hnd-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateHandoverPreview()"></div>
            <div class="form-group"><label>Accepted & Received By</label><input type="text" id="hnd-rec" value="${data ? data.rec : 'S. Jayakumar'}" oninput="updateHandoverPreview()"></div>
        </div>
    `;

    if (!data) {
        fetchAutoNumber('handover', 'hnd-no', updateHandoverPreview);
    } else {
        updateHandoverPreview();
    }
}

function updateHandoverPreview() {
    if (currentModule !== 'handover') return;
    const no = document.getElementById('hnd-no').value;
    const date = document.getElementById('hnd-date').value.split('-').reverse().join('/');
    const client = document.getElementById('hnd-client').value;
    const company = document.getElementById('hnd-company').value;
    const addr = document.getElementById('hnd-addr').value.replace(/\n/g, '<br>');
    const stall = document.getElementById('hnd-stall').value;
    const venue = document.getElementById('hnd-venue').value;
    const event = document.getElementById('hnd-event').value;
    const completion = document.getElementById('hnd-completion').value.split('-').reverse().join('/');

    const useDsign = document.getElementById('hnd-dsign-check').checked;
    const authName = document.getElementById('hnd-auth').value;
    const recName = document.getElementById('hnd-rec').value;

    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br>';
    const recSig = useDsign && recName ? `<div class="digital-sig">${recName.split(' ')[0]}</div>` : '<br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper full-a4" style="justify-content: space-between;">
            <div>
                <div class="doc-letterhead">
                    <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                    <h1 class="company-name">${companyData.name}</h1>
                    <p>${companyData.address1}, ${companyData.address2}</p>
                    <p>Mobile: ${companyData.mobile} | Email: ${companyData.email}</p>
                </div>
                
                <div class="doc-flex-row">
                    <div>
                        <div class="doc-bill-title">LETTER TO</div>
                        <div class="doc-bill-to">
                            <strong>${client}</strong><br>
                            ${company}<br>
                            ${addr}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="font-size:1.15rem; font-weight:800; margin-bottom:5px;">HANDOVER LETTER</h2>
                        <div class="doc-compact-meta">Ref: <strong>${no}</strong><br>Date: <strong>${date}</strong></div>
                    </div>
                </div>
                
                <div style="font-size: 0.9rem; line-height: 1.8; margin-top: 15px;" class="text-justify">
                    <p><strong>Dear ${client},</strong></p>
                    <br>
                    <p>
                        We are pleased to inform you that the design, development, and deployment of your software application — <strong>${stall}</strong> — for milestone <strong>${event}</strong> hosted at <strong>${venue}</strong>, have been successfully executed and completed on <strong>${completion}</strong>.
                    </p>
                    <p>
                        All code modules, API structures, database schemas, and frontend interfaces have been fully audited by our software engineering teams and found to be in compliance with the specifications approved by your company.
                    </p>
                    <p>
                        We hereby handover the operational software application and repository credentials to you in perfect and stable production-ready condition.
                    </p>
                    <p>
                        Kindly inspect the application deployments at your earliest convenience and confirm formal sign-off by signing this letter copy.
                    </p>
                    <br>
                    <p>We thank you for partnering with <strong>Orbenyx</strong> and wish you a successful business event!</p>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 0.85rem; margin-top: 40px;">
                <div style="text-align: center; width: 220px;">
                    <span>Handed Over By:</span>
                    ${authSig}
                    <div style="border-top: 1px solid #000; padding-top: 3px; font-weight: bold;">For Orbenyx</div>
                </div>
                
                <div style="text-align: center; width: 200px;">
                    <span>Accepted & Received By:</span>
                    ${recSig}
                    <div style="border-top: 1px solid #000; padding-top: 3px; font-weight: bold;">Client Representative</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 7. EXPENSE MEMO MODULE (1/3 A4 Compact Petty Cash / Expense Voucher)
// ==========================================================================
function renderExpenseForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Expense ID</label><input type="text" id="exp-id" value="${data ? data.no : 'EXP-...'}" oninput="updateExpensePreview()"></div>
            <div class="form-group"><label>Date</label><input type="date" id="exp-date" value="${data ? data.date : getToday()}" oninput="updateExpensePreview()"></div>
        </div>
        <div class="form-group"><label>Paid To (Payee)</label><input type="text" id="exp-to" value="${data ? data.to : 'Amazon Web Services (AWS)'}" oninput="updateExpensePreview()"></div>
        <div class="form-row">
            <div class="form-group"><label>Amount Paid (₹)</label><input type="number" id="exp-amt" value="${data ? data.amt : 1200}" oninput="updateExpensePreview()"></div>
            <div class="form-group">
                <label>Category</label>
                <select id="exp-cat" onchange="updateExpensePreview()">
                    <option value="Server Hosting & Cloud" ${data && data.cat === 'Server Hosting & Cloud' ? 'selected' : ''}>Server Hosting & Cloud</option>
                    <option value="Software Subscriptions & SaaS" ${data && data.cat === 'Software Subscriptions & SaaS' ? 'selected' : ''}>Software Subscriptions & SaaS</option>
                    <option value="Office Rent & Utilities" ${data && data.cat === 'Office Rent & Utilities' ? 'selected' : ''}>Office Rent & Utilities</option>
                    <option value="Hardware & Workstations" ${data && data.cat === 'Hardware & Workstations' ? 'selected' : ''}>Hardware & Workstations</option>
                    <option value="Team Expenses & Refreshments" ${data && data.cat === 'Team Expenses & Refreshments' ? 'selected' : ''}>Team Expenses & Refreshments</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>Particulars Detail</label><input type="text" id="exp-desc" value="${data ? data.desc : 'Monthly AWS production database hosting and cloud storage billing'}" oninput="updateExpensePreview()"></div>
        
        <h3>Signatures</h3>
        <div class="form-check">
            <input type="checkbox" id="exp-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateExpensePreview()">
            <label for="exp-dsign-check">Enable Digital Signatures</label>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Spender Name</label><input type="text" id="exp-by" value="${data ? data.by : 'DevOps Engineer'}" oninput="updateExpensePreview()"></div>
            <div class="form-group"><label>Approver Name</label><input type="text" id="exp-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateExpensePreview()"></div>
        </div>
    `;

    if (!data) {
        fetchAutoNumber('expense', 'exp-id', updateExpensePreview);
    } else {
        updateExpensePreview();
    }
}

function updateExpensePreview() {
    if (currentModule !== 'expense') return;
    const id = document.getElementById('exp-id').value;
    const date = document.getElementById('exp-date').value.split('-').reverse().join('/');
    const to = document.getElementById('exp-to').value;
    const amt = parseFloat(document.getElementById('exp-amt').value) || 0;
    const desc = document.getElementById('exp-desc').value;
    const cat = document.getElementById('exp-cat').value;

    const useDsign = document.getElementById('exp-dsign-check').checked;
    const byName = document.getElementById('exp-by').value;
    const authName = document.getElementById('exp-auth').value;

    const bySig = useDsign && byName ? `<div class="digital-sig">${byName}</div>` : '<br><br>';
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper one-third-a4">
            <div>
                <div class="doc-compact-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="logo.png" alt="Logo" style="height: 35px; object-fit: contain;">
                        <div>
                            <h1 class="company-name" style="margin: 0; font-size: 1.25rem;">${companyData.name}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #555;">${companyData.address1}, ${companyData.address2} | Ph: ${companyData.mobile}</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h2>EXPENSE MEMO</h2>
                        <div class="doc-compact-meta">ID: <strong>${id}</strong> | Date: <strong>${date}</strong></div>
                    </div>
                </div>
                
                <div style="font-size: 0.85rem; line-height: 1.6; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Paid To: <strong>${to}</strong></span>
                        <span>Debit Category: <strong>${cat}</strong></span>
                    </div>
                    <div>Expense Sum: <strong>₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> <em>(${numberToWords(amt)})</em></div>
                    <div>Particulars: <strong>${desc}</strong></div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 0.8rem; margin-top: 15px;">
                <div style="text-align: center; width: 140px;">
                    ${bySig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Spun / Spent By</div>
                </div>
                <div style="text-align: center; width: 150px;">
                    ${authSig}
                    <div style="border-top: 1px solid #000; padding-top: 2px; font-weight: bold;">Approved / Audited By</div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================================================
// 8. LETTER PAD MODULE (A4 Page)
// ==========================================================================
function renderLetterPadForm(data = null) {
    document.getElementById('dynamic-form').innerHTML = `
        <div class="form-row">
            <div class="form-group"><label>Reference Number</label><input type="text" id="let-no" value="${data ? data.no : 'Ref: JGA/' + new Date().getFullYear() + '/...'}" oninput="updateLetterPadPreview()"></div>
            <div class="form-group"><label>Letter Date</label><input type="date" id="let-date" value="${data ? data.date : getToday()}" oninput="updateLetterPadPreview()"></div>
        </div>
        
        <h3>Letter Body</h3>
        <div class="form-group"><label>Subject / Heading</label><input type="text" id="let-subject" value="${data ? data.subject : 'Project Completion Notification for stall'}" oninput="updateLetterPadPreview()"></div>
        <div class="form-group"><label>Main Letter Content</label><textarea id="let-body" rows="8" oninput="updateLetterPadPreview()">${data ? data.body : 'This is to inform that the project fabrication is completed.\n\nPlease find detailed plans attached.'}</textarea></div>
        
        <h3>Letter Settings</h3>
        <div class="form-check">
            <input type="checkbox" id="let-showgst-check" ${data ? (data.showgst ? 'checked' : '') : 'checked'} onchange="updateLetterPadPreview()">
            <label for="let-showgst-check">Show GST/PAN Details in Header</label>
        </div>
        
        <div class="form-check">
            <input type="checkbox" id="let-dsign-check" ${data ? (data.dsign ? 'checked' : '') : 'checked'} onchange="updateLetterPadPreview()">
            <label for="let-dsign-check">Enable Digital Signature</label>
        </div>
        <div class="form-group"><label>Signatory Name</label><input type="text" id="let-auth" value="${data ? data.auth : 'Orbenyx'}" oninput="updateLetterPadPreview()"></div>
    `;

    if (!data) {
        fetchAutoNumber('letterpad', 'let-no', updateLetterPadPreview);
    } else {
        updateLetterPadPreview();
    }
}

function updateLetterPadPreview() {
    if (currentModule !== 'letterpad') return;
    const no = document.getElementById('let-no').value;
    const date = document.getElementById('let-date').value.split('-').reverse().join('/');
    const subject = document.getElementById('let-subject').value;
    const body = document.getElementById('let-body').value.replace(/\n/g, '<br>');
    const showGst = document.getElementById('let-showgst-check').checked;

    const useDsign = document.getElementById('let-dsign-check').checked;
    const authName = document.getElementById('let-auth').value;
    const authSig = useDsign && authName ? `<div class="digital-sig">${authName}</div>` : '<br><br><br>';

    document.getElementById('preview-wrapper').innerHTML = `
        <div class="document-paper full-a4" style="justify-content: space-between;">
            <div>
                <div class="doc-letterhead">
                    <img src="logo.png" alt="Logo" style="height: 50px; margin-bottom: 5px; object-fit: contain;"><br>
                    <h1 class="company-name">${companyData.name}</h1>
                    <p>${companyData.address1}, ${companyData.address2}</p>
                    <p><strong>Mobile:</strong> ${companyData.mobile} | <strong>Email:</strong> ${companyData.email}</p>
                    ${showGst ? `<p><strong>GSTIN:</strong> ${companyData.gstin} | <strong>PAN:</strong> ${companyData.pan}</p>` : ''}
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 0.85rem;">
                    <span>Ref No: <strong>${no}</strong></span>
                    <span>Date: <strong>${date}</strong></span>
                </div>
                
                <div style="font-size: 0.9rem; line-height: 1.8; margin-top: 10px;">
                    <strong>Sub: ${subject}</strong>
                    <br><br>
                    <p class="text-justify">${body}</p>
                </div>
            </div>
            
            <div class="doc-signature-block">
                <div class="doc-signature-wrap">
                    <span>For <strong>Orbenyx</strong></span>
                    ${authSig}
                    <div class="doc-signature-line">Authorized Signatory</div>
                </div>
            </div>
        </div>
    `;
}


// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

// Translate numbers into words format
function numberToWords(num) {
    if (num === 0) return "Zero Rupees Only";
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(n) {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? convert(n % 10000000) : '');
    }
    return convert(Math.floor(num)) + "Rupees Only";
}

// Get standard today date in input format (YYYY-MM-DD)
function getToday() {
    return new Date().toISOString().split('T')[0];
}

// Toast notification trigger
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgSpan = document.getElementById('toast-message');
    const iconSpan = document.getElementById('toast-icon');

    // Set style properties
    toast.className = `toast-notification toast-${type}`;
    msgSpan.innerText = message;

    // Set icons
    if (type === 'success') {
        iconSpan.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else if (type === 'error') {
        iconSpan.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    } else if (type === 'info') {
        iconSpan.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    }

    toast.classList.add('show');

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
