// ==========================================================================
// FINANCIAL & EXPENSE TRACKER PORTAL ENGINE
// ==========================================================================

// Global state variables
let expensesList = [];
let incomeList = [];
let claimsList = [];
let vendorsList = [];
let subscriptionsList = [];
let assetsList = [];
let projectsList = [];

let currentUser = {
    username: 'admin',
    role: 'Super Admin'
};

let currentPortalTab = 'dashboard';

// Categories and subcategories map
const SUB_CATEGORIES = {
    Office: ['Rent', 'Electricity', 'Water', 'Internet', 'Furniture', 'Stationery'],
    Employees: ['Salary', 'Bonus', 'Incentives', 'Travel', 'Food'],
    Marketing: ['Facebook Ads', 'Google Ads', 'Instagram Ads', 'Printing', 'Events'],
    Development: ['Hosting', 'Domain', 'API', 'AI Credits', 'Software License', 'Play Store', 'Apple Developer'],
    Operations: ['Courier', 'Fuel', 'Vehicle', 'Maintenance', 'Miscellaneous'],
    Miscellaneous: ['General', 'Taxes', 'Others']
};

// Starting Cash/Bank balances
let initialCash = 50000;
let initialBank = 500000;
let settingsList = {};

async function loadSettings() {
    try {
        const res = await apiFetch('/api/settings').then(r => r.json());
        if (res.success) {
            settingsList = res.settings;
            if (settingsList.initial_cash !== undefined) {
                initialCash = parseFloat(settingsList.initial_cash) || 0;
            }
            if (settingsList.initial_bank !== undefined) {
                initialBank = parseFloat(settingsList.initial_bank) || 0;
            }
        }
    } catch (err) {
        console.error('Error fetching settings:', err);
    }
}

// Chart.js instances
let trendChartInstance = null;
let pieChartInstance = null;
let analTrendChartInstance = null;
let analPieChartInstance = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Intercept login credentials from localStorage
    const token = localStorage.getItem('rturox_admin_token');
    if (token) {
        decodeRoleFromToken(token);
    }
});

// Decodes mock token to set permissions
function decodeRoleFromToken(token) {
    if (token.startsWith('rturox-session-')) {
        const parts = token.split('-');
        if (parts.length >= 4) {
            const rolePart = parts[2];
            const userPart = parts[parts.length - 1];
            
            if (rolePart === 'superadmin') currentUser.role = 'Super Admin';
            else if (rolePart === 'admin') currentUser.role = 'Admin';
            else if (rolePart === 'accountant') currentUser.role = 'Accountant';
            else if (rolePart === 'employee') currentUser.role = 'Employee';
            
            currentUser.username = userPart;
            
            document.getElementById('user-display-name').innerText = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
            document.getElementById('user-display-role').innerText = currentUser.role;
        }
    } else {
        if (token.includes('superadmin')) {
            currentUser.role = 'Super Admin';
            currentUser.username = 'superadmin';
        } else if (token.includes('admin')) {
            currentUser.role = 'Admin';
            currentUser.username = 'admin';
        } else if (token.includes('accountant')) {
            currentUser.role = 'Accountant';
            currentUser.username = 'accountant';
        } else if (token.includes('employee')) {
            currentUser.role = 'Employee';
            currentUser.username = 'employee';
        } else {
            currentUser.role = 'Super Admin'; // fallback original token
            currentUser.username = 'admin';
        }
        
        // Update visual layouts & names
        document.getElementById('user-display-name').innerText = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
        document.getElementById('user-display-role').innerText = currentUser.role;
    }
    
    // Manage sidebar item visibility based on role
    configureMenuByRole();
    
    // Show sidebar
    document.getElementById('portal-sidebar').style.display = 'flex';
    
    // Show role switcher for Super Admin
    if (currentUser.role === 'Super Admin') {
        document.getElementById('quick-role-switcher').style.display = 'block';
        document.getElementById('emulate-role-select').value = currentUser.role;
    } else {
        document.getElementById('quick-role-switcher').style.display = 'none';
    }
}

let isExpensesPortalInitialized = false;

// Hook called when portal data loads successfully
window.initializeExpensesPortal = async function() {
    const token = localStorage.getItem('rturox_admin_token');
    if (token) {
        decodeRoleFromToken(token);
    }
    
    await refreshAllData();
    
    if (!isExpensesPortalInitialized) {
        isExpensesPortalInitialized = true;
        switchPortalTab(currentPortalTab);
    }
};

window.resetExpensesPortalInit = function() {
    isExpensesPortalInitialized = false;
};

// Refresh all cache lists from backend
async function refreshAllData() {
    try {
        const [expRes, incRes, clmRes, venRes, subRes, astRes, empRes, projRes] = await Promise.all([
            apiFetch('/api/expenses').then(r => r.json()),
            apiFetch('/api/income').then(r => r.json()),
            apiFetch('/api/claims').then(r => r.json()),
            apiFetch('/api/vendors').then(r => r.json()),
            apiFetch('/api/subscriptions').then(r => r.json()),
            apiFetch('/api/assets').then(r => r.json()),
            apiFetch('/api/employees').then(r => r.json()),
            apiFetch('/api/projects').then(r => r.json())
        ]);

        if (expRes.success) expensesList = expRes.expenses;
        if (incRes.success) incomeList = incRes.income;
        if (clmRes.success) claimsList = clmRes.claims;
        if (venRes.success) vendorsList = venRes.vendors;
        if (subRes.success) subscriptionsList = subRes.subscriptions;
        if (astRes.success) assetsList = astRes.assets;
        if (projRes.success) projectsList = projRes.projects;
        if (empRes.success) {
            portalEmployees = empRes.employees;
            populateEmployeeDropdowns();
            populateProjectAssignedSelect();
        }

        if (currentPortalTab === 'my-salary') {
            renderMySalaryTable();
        }
        if (currentPortalTab === 'projects') {
            renderProjectsTable();
        }

        // Auto mark invoices as Paid if payment matches
        reconcileInvoicePayments();

    } catch (err) {
        console.error('Error refreshing portal lists:', err);
    }
}

// Matches income records with billing invoices to mark them paid
function reconcileInvoicePayments() {
    // Collect all fully paid invoices from income tracking
    const paidInvoices = new Set(
        incomeList
            .filter(inc => inc.pending <= 0)
            .map(inc => inc.invoice_number.trim().toLowerCase())
    );

    // Scan registry in index.js to find matchable invoices
    if (window.savedDocumentsList) {
        window.savedDocumentsList.forEach(async (doc) => {
            if (doc.doc_type === 'invoice' && doc.doc_no) {
                const docNo = doc.doc_no.trim().toLowerCase();
                if (paidInvoices.has(docNo)) {
                    try {
                        const payload = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
                        if (payload.status !== 'Paid') {
                            payload.status = 'Paid';
                            // Save update to database silently
                            await apiFetch('/api/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    doc_type: 'invoice',
                                    doc_no: doc.doc_no,
                                    client_name: doc.client_name,
                                    data: payload
                                })
                            });
                        }
                    } catch (e) {}
                }
            }
        });
    }
}

// Manage navigation items based on current role permissions
function configureMenuByRole() {
    const role = currentUser.role;
    
    // Default show all
    const menuItems = {
        dashboard: document.getElementById('nav-dashboard'),
        expenses: document.getElementById('nav-expenses'),
        income: document.getElementById('nav-income'),
        claims: document.getElementById('nav-claims'),
        vendors: document.getElementById('nav-vendors'),
        subscriptions: document.getElementById('nav-subscriptions'),
        assets: document.getElementById('nav-assets'),
        employees: document.getElementById('nav-employees'),
        docs: document.getElementById('nav-docs'),
        reports: document.getElementById('nav-reports'),
        analytics: document.getElementById('nav-analytics'),
        mySalary: document.getElementById('nav-my-salary'),
        projects: document.getElementById('nav-projects')
    };

    Object.values(menuItems).forEach(el => { if (el) el.style.display = 'flex'; });
    
    // Default hide mySalary for admin/accountant/superadmin
    if (menuItems.mySalary) menuItems.mySalary.style.display = 'none';

    // Apply visibility constraints
    if (role === 'Employee') {
        menuItems.dashboard.style.display = 'none';
        menuItems.expenses.style.display = 'none';
        menuItems.income.style.display = 'none';
        menuItems.vendors.style.display = 'none';
        menuItems.subscriptions.style.display = 'none';
        menuItems.assets.style.display = 'none';
        menuItems.employees.style.display = 'none';
        menuItems.docs.style.display = 'none';
        menuItems.reports.style.display = 'none';
        menuItems.analytics.style.display = 'none';
        
        // Show My Salary for Employee
        if (menuItems.mySalary) menuItems.mySalary.style.display = 'flex';
        
        // Rename claims label
        menuItems.claims.querySelector('span').innerText = 'My Claims';
        
        // Hide backup/restore buttons
        document.querySelectorAll('.topbar-actions button').forEach(b => {
            if (b.innerText.includes('Backup') || b.innerText.includes('Restore')) {
                b.style.display = 'none';
            }
        });
        
        // Force routing to claims tab
        currentPortalTab = 'claims';
    } else if (role === 'Accountant') {
        menuItems.expenses.style.display = 'none';
        menuItems.subscriptions.style.display = 'none';
        menuItems.assets.style.display = 'none';
        menuItems.employees.style.display = 'none';
        menuItems.projects.style.display = 'none';
        menuItems.claims.style.display = 'none';
        
        menuItems.claims.querySelector('span').innerText = 'Expense Claims';
        
        // Restore buttons
        document.querySelectorAll('.topbar-actions button').forEach(b => b.style.display = 'inline-block');
        
        if (currentPortalTab === 'expenses' || currentPortalTab === 'subscriptions' || currentPortalTab === 'assets' || currentPortalTab === 'employees' || currentPortalTab === 'projects' || currentPortalTab === 'claims') {
            currentPortalTab = 'dashboard';
        }
    } else if (role === 'Admin') {
        menuItems.income.style.display = 'none';
        menuItems.employees.style.display = 'none';
        menuItems.docs.style.display = 'none'; // cannot create invoices, only manage expenses
        
        menuItems.claims.querySelector('span').innerText = 'Reimbursements';
        
        document.querySelectorAll('.topbar-actions button').forEach(b => b.style.display = 'inline-block');
        
        if (currentPortalTab === 'income' || currentPortalTab === 'employees' || currentPortalTab === 'docs') {
            currentPortalTab = 'dashboard';
        }
    } else {
        // Super Admin sees everything
        menuItems.claims.querySelector('span').innerText = 'Expense Claims';
        document.querySelectorAll('.topbar-actions button').forEach(b => b.style.display = 'inline-block');
    }

    // Settings visibility control
    const editBalBtn = document.getElementById('btn-edit-balances');
    if (editBalBtn) {
        if (role === 'Super Admin' || role === 'Admin') {
            editBalBtn.style.display = 'inline-block';
        } else {
            editBalBtn.style.display = 'none';
        }
    }
}

// Emulate a role switch (Super Admin testing feature)
window.emulateRoleSwitch = function(newRole) {
    currentUser.role = newRole;
    if (newRole === 'Employee') {
        currentUser.username = 'employee';
    } else if (newRole === 'Accountant') {
        currentUser.username = 'accountant';
    } else if (newRole === 'Admin') {
        currentUser.username = 'admin';
    } else {
        currentUser.username = 'superadmin';
    }
    
    document.getElementById('user-display-name').innerText = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
    document.getElementById('user-display-role').innerText = currentUser.role;
    
    configureMenuByRole();
    switchPortalTab(currentPortalTab);
    showToast(`Switched view mode to ${newRole}`, 'info');
};

// Toggle responsive sidebar drawer
window.toggleSidebar = function() {
    const sidebar = document.getElementById('portal-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('sidebar-open');
    }
};

// Route and toggle views based on chosen tab
window.switchPortalTab = function(tabName) {
    currentPortalTab = tabName;
    
    // Close responsive sidebar drawer
    const sidebar = document.getElementById('portal-sidebar');
    if (sidebar) sidebar.classList.remove('sidebar-open');

    // Update active nav indicators
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) activeNav.classList.add('active');

    // Hide all tab views
    document.querySelectorAll('.tab-view').forEach(el => el.style.display = 'none');
    // Also hide the doc builder module workspace (class='module-view') which isn't caught above
    const _mc = document.getElementById('module-container');
    if (_mc && tabName !== 'docs') _mc.style.display = 'none';
    
    // Render chosen tab
    if (tabName === 'dashboard') {
        document.getElementById('financial-dashboard-view').style.display = 'block';
        loadDashboardMetrics();
    } else if (tabName === 'expenses') {
        document.getElementById('expenses-view').style.display = 'block';
        renderExpensesTable();
    } else if (tabName === 'income') {
        document.getElementById('income-view').style.display = 'block';
        renderIncomeTable();
    } else if (tabName === 'claims') {
        document.getElementById('claims-view').style.display = 'block';
        renderClaimsTable();
    } else if (tabName === 'vendors') {
        document.getElementById('vendors-view').style.display = 'block';
        renderVendorsTable();
    } else if (tabName === 'subscriptions') {
        document.getElementById('subscriptions-view').style.display = 'block';
        renderSubscriptionsTable();
    } else if (tabName === 'assets') {
        document.getElementById('assets-view').style.display = 'block';
        renderAssetsTable();
    } else if (tabName === 'employees') {
        document.getElementById('employees-view').style.display = 'block';
        renderEmployeesTable();
    } else if (tabName === 'projects') {
        document.getElementById('projects-view').style.display = 'block';
        renderProjectsTable();
    } else if (tabName === 'my-salary') {
        document.getElementById('my-salary-view').style.display = 'block';
        renderMySalaryTable();
    } else if (tabName === 'docs') {
        // Tie to original Document Registry dashboard view
        // Also ensure the module workspace is hidden (in case user was editing a document)
        const mc = document.getElementById('module-container');
        if (mc) mc.style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        if (window.loadPortalData) window.loadPortalData(); // reloads documents
    } else if (tabName === 'reports') {
        document.getElementById('reports-view').style.display = 'block';
        loadReportFields();
    } else if (tabName === 'analytics') {
        document.getElementById('analytics-view').style.display = 'block';
        loadDetailedAnalytics();
    }
};

// Override original loadPortalData show views
// This allows the original index.js to switch back to Doc Builder tab properly when clicking A4 links
window.showDashboard = function() {
    // Hide the module workspace panel first
    const mc = document.getElementById('module-container');
    if (mc) mc.style.display = 'none';
    switchPortalTab('docs');
};

// ==========================================================================
// 1. FINANCIAL DASHBOARD ENGINE
// ==========================================================================
async function loadDashboardMetrics() {
    await loadSettings();
    await refreshAllData();
    
    const todayStr = new Date().toISOString().split('T')[0];
    const curMonthStr = todayStr.slice(0, 7); // YYYY-MM
    
    // Calculations
    let todayExp = 0;
    let monthExp = 0;
    let totalRev = 0;
    let totalPaidExpenses = 0;
    let pendingPayments = 0;
    
    // Expenses
    expensesList.forEach(exp => {
        const amt = parseFloat(exp.amount) || 0;
        if (exp.date === todayStr) {
            todayExp += amt;
        }
        if (exp.date && exp.date.startsWith(curMonthStr)) {
            monthExp += amt;
        }
        if (exp.status === 'Paid') {
            totalPaidExpenses += amt;
        } else {
            pendingPayments += amt; // Unpaid vendor expenses
        }
    });

    // Approved employee claims addition to expenses
    claimsList.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        if (c.status === 'Approved') {
            totalPaidExpenses += amt;
            if (c.date === todayStr) todayExp += amt;
            if (c.date && c.date.startsWith(curMonthStr)) monthExp += amt;
        } else if (c.status === 'Pending') {
            pendingPayments += amt; // Reimbursement liabilities
        }
    });

    // Income
    let totalReceivedIncome = 0;
    incomeList.forEach(inc => {
        const val = (parseFloat(inc.amount) || 0) + (parseFloat(inc.gst) || 0);
        const rec = parseFloat(inc.payment_received) || 0;
        const pen = parseFloat(inc.pending) || 0;
        
        totalRev += val;
        totalReceivedIncome += rec;
        pendingPayments += pen; // Client outstandings pending receipt
    });

    // Net Profit
    const netProfit = totalRev - totalPaidExpenses;

    // Cash In Hand vs Bank Balances Calculation
    let cashInHand = initialCash;
    let bankBalance = initialBank;

    // Subtract paid expenses based on payment method
    expensesList.forEach(exp => {
        if (exp.status === 'Paid') {
            const amt = parseFloat(exp.amount) || 0;
            if (exp.payment_method === 'Cash') {
                cashInHand -= amt;
            } else {
                bankBalance -= amt;
            }
        }
    });
    // Add received income
    incomeList.forEach(inc => {
        const rec = parseFloat(inc.payment_received) || 0;
        // Incomes are mostly Bank/Card/UPI
        bankBalance += rec;
    });

    // Update DOM
    document.getElementById('dash-today-expenses').innerText = formatCurrency(todayExp);
    document.getElementById('dash-month-expenses').innerText = formatCurrency(monthExp);
    document.getElementById('dash-total-revenue').innerText = formatCurrency(totalRev);
    document.getElementById('dash-net-profit').innerText = formatCurrency(netProfit);
    document.getElementById('dash-pending-payments').innerText = formatCurrency(pendingPayments);
    document.getElementById('dash-cash-in-hand').innerText = formatCurrency(cashInHand);
    document.getElementById('dash-bank-balance').innerText = formatCurrency(bankBalance);
    
    // Dynamic alerts compiler
    renderDashboardAlerts(cashInHand + bankBalance);

    // Load Mini Dashboard Charts
    renderMiniDashboardCharts();
    renderRecentTransactions();
}

// Generate warnings based on low balances or upcoming renewals
function renderDashboardAlerts(totalCashReserves) {
    const listEl = document.getElementById('dashboard-alerts-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    const alerts = [];

    // Low balance alert
    if (totalCashReserves < 15000) {
        alerts.push({
            type: 'danger',
            icon: 'fa-triangle-exclamation',
            title: 'Critical Cash Alert',
            text: `Liquidity is low! Total combined reserves at ${formatCurrency(totalCashReserves)}.`
        });
    } else if (totalCashReserves < 50000) {
        alerts.push({
            type: 'warning',
            icon: 'fa-circle-exclamation',
            title: 'Low Cash Warning',
            text: `Reserves under ₹50,000. Limit discretionary purchases.`
        });
    }

    // Subscriptions renewal within 7 days
    const today = new Date();
    subscriptionsList.forEach(sub => {
        const renewDate = new Date(sub.renewal_date);
        const diffDays = Math.ceil((renewDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
            alerts.push({
                type: 'warning',
                icon: 'fa-rotate',
                title: 'Upcoming Renewal',
                text: `${sub.name} SaaS renewing in ${diffDays} days on ${sub.renewal_date} (${formatCurrency(sub.monthly_cost)}/mo).`
            });
        }
    });

    // Outstanding invoices
    let invoiceOverdues = 0;
    incomeList.forEach(inc => {
        if (inc.pending > 0 && new Date(inc.due_date) < today) {
            invoiceOverdues++;
        }
    });
    if (invoiceOverdues > 0) {
        alerts.push({
            type: 'danger',
            icon: 'fa-clock',
            title: 'Overdue Client Invoices',
            text: `${invoiceOverdues} invoice collections have crossed their payment due dates.`
        });
    }

    // Pending Claims
    const pendingClaims = claimsList.filter(c => c.status === 'Pending').length;
    if (pendingClaims > 0 && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin')) {
        alerts.push({
            type: 'info',
            icon: 'fa-file-invoice-dollar',
            title: 'Pending Claims Review',
            text: `There are ${pendingClaims} employee reimbursement claims awaiting approval.`
        });
    }

    // Render Alerts
    if (alerts.length === 0) {
        listEl.innerHTML = `<div class="no-alerts-msg"><i class="fa-solid fa-circle-check"></i> All accounts in order. No pending alerts.</div>`;
    } else {
        alerts.forEach(al => {
            const item = document.createElement('div');
            item.className = `alert-item alert-${al.type}`;
            item.innerHTML = `
                <div class="alert-item-icon"><i class="fa-solid ${al.icon}"></i></div>
                <div class="alert-item-content">
                    <h5>${al.title}</h5>
                    <p>${al.text}</p>
                </div>
            `;
            listEl.appendChild(item);
        });
    }
}

// Merges income and expenses into a single unified ledger
function renderRecentTransactions() {
    const tbody = document.getElementById('dash-recent-transactions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const ledger = [];
    
    expensesList.forEach(exp => {
        ledger.push({
            type: 'Expense',
            date: exp.date,
            source: `${exp.category} (${exp.sub_category}) - ${exp.description}`,
            amount: exp.amount,
            method: exp.payment_method,
            status: exp.status
        });
    });

    incomeList.forEach(inc => {
        const val = (parseFloat(inc.amount) || 0) + (parseFloat(inc.gst) || 0);
        ledger.push({
            type: 'Income',
            date: inc.payment_date || inc.due_date,
            source: `Client: ${inc.client_name} - Project: ${inc.project}`,
            amount: val,
            method: 'Bank/UPI',
            status: inc.pending <= 0 ? 'Paid' : 'Pending'
        });
    });

    // Sort by date DESC
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Slice to top 5
    const recent = ledger.slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No transactions logged yet.</td></tr>';
        return;
    }

    recent.forEach(t => {
        const typeClass = t.type === 'Income' ? 'text-success' : 'text-danger';
        const typeIcon = t.type === 'Income' ? '<i class="fa-solid fa-arrow-trend-up"></i>' : '<i class="fa-solid fa-arrow-trend-down"></i>';
        const statusBadge = t.status === 'Paid' ? '<span class="role-badge" style="background:rgba(16,185,129,0.1); color:var(--success);">Paid</span>' : '<span class="role-badge" style="background:rgba(245,158,11,0.1); color:var(--warning);">Pending</span>';

        tbody.innerHTML += `
            <tr>
                <td class="${typeClass} font-weight-bold">${typeIcon} ${t.type}</td>
                <td>${t.date}</td>
                <td class="text-truncate" style="max-width: 250px;" title="${t.source}">${t.source}</td>
                <td class="${typeClass} font-weight-bold">${t.type === 'Expense' ? '-' : '+'} ${formatCurrency(t.amount)}</td>
                <td>${t.method}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });
}

// Renders the mini trend charts using Chart.js on the dashboard
function renderMiniDashboardCharts() {
    // 1. Trend monthly chart
    const trendCtx = document.getElementById('dashboard-trend-chart');
    if (!trendCtx) return;

    if (trendChartInstance) trendChartInstance.destroy();

    const monthlyData = getMonthlyFinancials(6);
    
    trendChartInstance = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: 'Expenses',
                data: monthlyData.expenses,
                backgroundColor: 'rgba(168, 85, 247, 0.65)',
                borderColor: 'var(--primary)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#71717a', font: { family: 'Outfit' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717a', font: { family: 'Outfit' } }
                }
            }
        }
    });

    // 2. Pie Chart category distribution
    const pieCtx = document.getElementById('dashboard-pie-chart');
    if (!pieCtx) return;

    if (pieChartInstance) pieChartInstance.destroy();

    const categoryBreakdown = getCategoryBreakdown();

    if (categoryBreakdown.values.length === 0) {
        // Draw centered empty text on canvas if no expenses
        const ctx = pieCtx.getContext('2d');
        ctx.clearRect(0,0,pieCtx.width,pieCtx.height);
        ctx.fillStyle = '#71717a';
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('No expenses logged.', pieCtx.width / 2, pieCtx.height / 2);
        return;
    }

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: categoryBreakdown.labels,
            datasets: [{
                data: categoryBreakdown.values,
                backgroundColor: [
                    '#ef4444', // Red (Office)
                    '#10b981', // Green (Employees)
                    '#3b82f6', // Blue (Marketing)
                    '#a855f7', // Purple (Development)
                    '#f59e0b', // Yellow (Operations)
                    '#71717a'  // Gray (Misc)
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#fafafa', font: { family: 'Outfit', size: 11 } }
                }
            },
            cutout: '70%'
        }
    });
}

// Helpers to aggregate records monthly
function getMonthlyFinancials(limit = 6) {
    const now = new Date();
    const months = [];
    const labels = [];
    const expenses = [];
    const incomes = [];

    for (let i = limit - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(key);
        labels.push(d.toLocaleString('en-US', { month: 'short', year: '2-digit' }));
        expenses.push(0);
        incomes.push(0);
    }

    expensesList.forEach(exp => {
        const amt = parseFloat(exp.amount) || 0;
        const key = exp.date ? exp.date.slice(0, 7) : '';
        const idx = months.indexOf(key);
        if (idx > -1 && exp.status === 'Paid') {
            expenses[idx] += amt;
        }
    });

    claimsList.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        const key = c.date ? c.date.slice(0, 7) : '';
        const idx = months.indexOf(key);
        if (idx > -1 && c.status === 'Approved') {
            expenses[idx] += amt;
        }
    });

    incomeList.forEach(inc => {
        const val = (parseFloat(inc.amount) || 0) + (parseFloat(inc.gst) || 0);
        const key = (inc.payment_date || inc.due_date || '').slice(0, 7);
        const idx = months.indexOf(key);
        if (idx > -1) {
            incomes[idx] += val;
        }
    });

    return { labels, expenses, incomes };
}

// Aggregate expenses by category
function getCategoryBreakdown() {
    const cats = { Office: 0, Employees: 0, Marketing: 0, Development: 0, Operations: 0, Miscellaneous: 0 };
    
    expensesList.forEach(exp => {
        const amt = parseFloat(exp.amount) || 0;
        if (exp.status === 'Paid' && cats[exp.category] !== undefined) {
            cats[exp.category] += amt;
        }
    });

    claimsList.forEach(c => {
        // claims are employees cost
        const amt = parseFloat(c.amount) || 0;
        if (c.status === 'Approved') {
            cats['Employees'] += amt;
        }
    });

    const labels = [];
    const values = [];
    
    Object.entries(cats).forEach(([k, v]) => {
        if (v > 0) {
            labels.push(k);
            values.push(v);
        }
    });

    return { labels, values };
}

// ==========================================================================
// 2. EXPENSE MANAGEMENT ENGINE
// ==========================================================================
function renderExpensesTable() {
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = '';
    
    if (expensesList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">No expenses registered yet.</td></tr>';
        return;
    }

    expensesList.forEach(exp => {
        const billBtn = exp.bill_path ? `<button class="btn btn-secondary btn-xs" onclick="window.open('${exp.bill_path}', '_blank')"><i class="fa-solid fa-paperclip"></i> View</button>` : '<span style="color:#71717a;">None</span>';
        const gstBadge = exp.gst === 'Yes' ? `<span class="role-badge" style="background:rgba(16,185,129,0.1); color:var(--success);">₹${exp.gst_amount}</span>` : '<span style="color:#71717a;">No</span>';
        const statusClass = exp.status === 'Paid' ? 'style="background:rgba(16,185,129,0.1); color:var(--success);"' : 'style="background:rgba(245,158,11,0.1); color:var(--warning);"';
        
        tbody.innerHTML += `
            <tr>
                <td>EXP-${String(exp.id).padStart(4,'0')}</td>
                <td>${exp.date}</td>
                <td><strong>${exp.category}</strong></td>
                <td>${exp.sub_category}</td>
                <td class="text-truncate" style="max-width: 150px;" title="${exp.description}">${exp.description}</td>
                <td><strong>${formatCurrency(exp.amount)}</strong></td>
                <td>${exp.payment_method}</td>
                <td>${exp.vendor || '-'}</td>
                <td>${exp.employee}</td>
                <td>${gstBadge}</td>
                <td><span class="role-badge" ${statusClass}>${exp.status}</span></td>
                <td>${billBtn}</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editExpense(${exp.id})" title="Edit Expense"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteExpense(${exp.id})" title="Delete Expense"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openExpenseModal = function() {
    document.getElementById('expense-form').reset();
    document.getElementById('exp-id-input').value = '';
    document.getElementById('expense-modal-title').innerHTML = '<i class="fa-solid fa-wallet"></i> Log Expense';
    document.getElementById('exp-date-input').value = new Date().toISOString().split('T')[0];
    populateSubCategories('Office');
    document.getElementById('gst-amount-group').style.display = 'none';
    document.getElementById('exp-file-details').innerText = 'Upload bill copy or drag here';
    document.getElementById('exp-bill-path-input').value = '';
    
    document.getElementById('expense-modal').style.display = 'flex';
};

window.closeExpenseModal = function() {
    document.getElementById('expense-modal').style.display = 'none';
};

window.populateSubCategories = function(cat) {
    const subSelect = document.getElementById('exp-subcategory-input');
    subSelect.innerHTML = '';
    const subs = SUB_CATEGORIES[cat] || [];
    subs.forEach(s => {
        subSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
};

window.toggleGstInput = function(val) {
    const gstGroup = document.getElementById('gst-amount-group');
    if (val === 'Yes') {
        gstGroup.style.display = 'block';
        calculateGstAmount();
    } else {
        gstGroup.style.display = 'none';
        document.getElementById('exp-gst-amount-input').value = '';
    }
};

window.calculateGstAmount = function() {
    const isGst = document.getElementById('exp-gst-input').value;
    if (isGst === 'Yes') {
        const amt = parseFloat(document.getElementById('exp-amount-input').value) || 0;
        // Assume 18% standard GST addition
        const gstVal = amt * 0.18;
        document.getElementById('exp-gst-amount-input').value = gstVal.toFixed(2);
    }
};

window.uploadReceiptFile = async function(type, event) {
    const file = event.target.files[0];
    if (!file) return;

    const detailsEl = document.getElementById(`${type}-file-details`);
    const pathInput = document.getElementById(`${type}-bill-path-input`);
    
    detailsEl.innerText = `Uploading ${file.name}...`;

    const formData = new FormData();
    formData.append('bill_file', file);

    try {
        const res = await fetch('/api/upload_bill', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('rturox_admin_token')}`
            },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            pathInput.value = data.fileUrl;
            detailsEl.innerHTML = `<strong>Uploaded:</strong> ${file.name} (<span style="color:var(--success);">Attached</span>)`;
            showToast('Receipt file uploaded successfully.', 'success');
        } else {
            detailsEl.innerText = 'Upload failed, try again.';
            showToast(data.error || 'File upload failed.', 'error');
        }
    } catch (err) {
        detailsEl.innerText = 'Server error during upload.';
        showToast('Server upload error.', 'error');
    }
};

window.saveExpenseForm = async function(e) {
    e.preventDefault();
    const id = document.getElementById('exp-id-input').value;
    const payload = {
        id: id ? parseInt(id, 10) : undefined,
        date: document.getElementById('exp-date-input').value,
        amount: parseFloat(document.getElementById('exp-amount-input').value) || 0,
        category: document.getElementById('exp-category-input').value,
        sub_category: document.getElementById('exp-subcategory-input').value,
        description: document.getElementById('exp-description-input').value,
        payment_method: document.getElementById('exp-method-input').value,
        vendor: document.getElementById('exp-vendor-input').value,
        employee: document.getElementById('exp-employee-input').value,
        status: document.getElementById('exp-status-input').value,
        gst: document.getElementById('exp-gst-input').value,
        gst_amount: parseFloat(document.getElementById('exp-gst-amount-input').value) || 0,
        bill_path: document.getElementById('exp-bill-path-input').value,
        notes: document.getElementById('exp-notes-input').value
    };

    try {
        const res = await apiFetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeExpenseModal();
            refreshAllData().then(() => renderExpensesTable());
            showToast(id ? 'Expense details updated.' : 'Expense registered successfully.', 'success');
        } else {
            showToast(data.error || 'Failed to save expense.', 'error');
        }
    } catch (err) {
        showToast('Network error saving expense.', 'error');
    }
};

window.editExpense = function(id) {
    const exp = expensesList.find(e => e.id === id);
    if (!exp) return;
    
    document.getElementById('exp-id-input').value = exp.id;
    document.getElementById('expense-modal-title').innerHTML = '<i class="fa-solid fa-wallet"></i> Edit Expense';
    document.getElementById('exp-date-input').value = exp.date;
    document.getElementById('exp-amount-input').value = exp.amount;
    document.getElementById('exp-category-input').value = exp.category;
    populateSubCategories(exp.category);
    document.getElementById('exp-subcategory-input').value = exp.sub_category;
    document.getElementById('exp-description-input').value = exp.description;
    document.getElementById('exp-method-input').value = exp.payment_method;
    document.getElementById('exp-vendor-input').value = exp.vendor || '';
    document.getElementById('exp-employee-input').value = exp.employee;
    document.getElementById('exp-status-input').value = exp.status;
    document.getElementById('exp-gst-input').value = exp.gst || 'No';
    toggleGstInput(exp.gst || 'No');
    if (exp.gst === 'Yes') {
        document.getElementById('exp-gst-amount-input').value = exp.gst_amount;
    }
    document.getElementById('exp-bill-path-input').value = exp.bill_path || '';
    document.getElementById('exp-file-details').innerHTML = exp.bill_path ? `<strong>File attached</strong> (<a href="${exp.bill_path}" target="_blank">View receipt</a>)` : 'Upload bill copy or drag here';
    document.getElementById('exp-notes-input').value = exp.notes || '';
    
    document.getElementById('expense-modal').style.display = 'flex';
};

window.deleteExpense = function(id) {
    window.showConfirm(
        'Delete Expense',
        'Are you sure you want to permanently delete this expense record?',
        async () => {
            try {
                const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    refreshAllData().then(() => renderExpensesTable());
                    showToast('Expense record deleted.', 'info');
                } else {
                    showToast(data.error || 'Failed to delete record.', 'error');
                }
            } catch (e) {
                showToast('Network error occurred.', 'error');
            }
        }
    );
};

window.filterExpenses = function() {
    const search = document.getElementById('expense-search').value.toLowerCase();
    const cat = document.getElementById('expense-category-filter').value;
    const stat = document.getElementById('expense-status-filter').value;
    
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = '';
    
    const filtered = expensesList.filter(exp => {
        const matchesSearch = exp.description.toLowerCase().includes(search) || 
                              exp.employee.toLowerCase().includes(search) || 
                              (exp.vendor && exp.vendor.toLowerCase().includes(search));
        const matchesCategory = cat === 'all' || exp.category === cat;
        const matchesStatus = stat === 'all' || exp.status === stat;
        return matchesSearch && matchesCategory && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">No matching expenses.</td></tr>';
        return;
    }

    filtered.forEach(exp => {
        const billBtn = exp.bill_path ? `<button class="btn btn-secondary btn-xs" onclick="window.open('${exp.bill_path}', '_blank')"><i class="fa-solid fa-paperclip"></i> View</button>` : '<span style="color:#71717a;">None</span>';
        const gstBadge = exp.gst === 'Yes' ? `<span class="role-badge" style="background:rgba(16,185,129,0.1); color:var(--success);">₹${exp.gst_amount}</span>` : '<span style="color:#71717a;">No</span>';
        const statusClass = exp.status === 'Paid' ? 'style="background:rgba(16,185,129,0.1); color:var(--success);"' : 'style="background:rgba(245,158,11,0.1); color:var(--warning);"';
        
        tbody.innerHTML += `
            <tr>
                <td>EXP-${String(exp.id).padStart(4,'0')}</td>
                <td>${exp.date}</td>
                <td><strong>${exp.category}</strong></td>
                <td>${exp.sub_category}</td>
                <td class="text-truncate" style="max-width: 150px;">${exp.description}</td>
                <td><strong>${formatCurrency(exp.amount)}</strong></td>
                <td>${exp.payment_method}</td>
                <td>${exp.vendor || '-'}</td>
                <td>${exp.employee}</td>
                <td>${gstBadge}</td>
                <td><span class="role-badge" ${statusClass}>${exp.status}</span></td>
                <td>${billBtn}</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editExpense(${exp.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteExpense(${exp.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
};


// ==========================================================================
// 3. INCOME TRACKER ENGINE
// ==========================================================================
function renderIncomeTable() {
    const tbody = document.getElementById('income-tbody');
    tbody.innerHTML = '';
    
    if (incomeList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">No income records registered yet.</td></tr>';
        return;
    }

    incomeList.forEach(inc => {
        const val = parseFloat(inc.amount) || 0;
        const gst = parseFloat(inc.gst) || 0;
        const total = val + gst;
        const rec = parseFloat(inc.payment_received) || 0;
        const pen = parseFloat(inc.pending) || 0;
        const isPaid = pen <= 0;
        const statusClass = isPaid ? 'style="background:rgba(16,185,129,0.1); color:var(--success);"' : 'style="background:rgba(245,158,11,0.1); color:var(--warning);"';

        tbody.innerHTML += `
            <tr>
                <td><strong>${inc.invoice_number}</strong></td>
                <td>${inc.client_name}</td>
                <td>${inc.project}</td>
                <td>${formatCurrency(val)}</td>
                <td>₹${gst}</td>
                <td><strong>${formatCurrency(total)}</strong></td>
                <td class="text-success"><strong>${formatCurrency(rec)}</strong></td>
                <td class="${pen > 0 ? 'text-warning' : ''}"><strong>${formatCurrency(pen)}</strong></td>
                <td>${inc.payment_date || '-'}</td>
                <td>${inc.due_date}</td>
                <td><span class="role-badge" ${statusClass}>${isPaid ? 'Paid' : 'Pending'}</span></td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editIncome(${inc.id})" title="Edit Income"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteIncome(${inc.id})" title="Delete Record"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openIncomeModal = function() {
    document.getElementById('income-form').reset();
    document.getElementById('inc-id-input').value = '';
    document.getElementById('income-modal-title').innerHTML = '<i class="fa-solid fa-sack-dollar"></i> Log Client Income';
    document.getElementById('inc-duedate-input').value = new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0]; // due 14 days
    
    document.getElementById('income-modal').style.display = 'flex';
};

window.closeIncomeModal = function() {
    document.getElementById('income-modal').style.display = 'none';
};

window.calculateIncomeTotals = function() {
    const amt = parseFloat(document.getElementById('inc-amount-input').value) || 0;
    
    // Auto calculate 18% standard GST addition if empty
    let gstInput = document.getElementById('inc-gst-input');
    if (gstInput.value === '') {
        gstInput.value = (amt * 0.18).toFixed(2);
    }
    
    const gst = parseFloat(gstInput.value) || 0;
    const total = amt + gst;
    document.getElementById('inc-total-input').value = total.toFixed(2);

    const received = parseFloat(document.getElementById('inc-received-input').value) || 0;
    const pending = total - received;
    document.getElementById('inc-pending-input').value = Math.max(0, pending).toFixed(2);
};

window.saveIncomeForm = async function(e) {
    e.preventDefault();
    const id = document.getElementById('inc-id-input').value;
    const payload = {
        id: id ? parseInt(id, 10) : undefined,
        client_name: document.getElementById('inc-client-input').value,
        project: document.getElementById('inc-project-input').value,
        invoice_number: document.getElementById('inc-invoice-input').value,
        amount: parseFloat(document.getElementById('inc-amount-input').value) || 0,
        gst: parseFloat(document.getElementById('inc-gst-input').value) || 0,
        payment_received: parseFloat(document.getElementById('inc-received-input').value) || 0,
        pending: parseFloat(document.getElementById('inc-pending-input').value) || 0,
        payment_date: document.getElementById('inc-paydate-input').value || undefined,
        due_date: document.getElementById('inc-duedate-input').value
    };

    try {
        const res = await apiFetch('/api/income', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeIncomeModal();
            refreshAllData().then(() => renderIncomeTable());
            showToast(id ? 'Income entry updated.' : 'Income payment logged successfully.', 'success');
        } else {
            showToast(data.error || 'Failed to save income.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.editIncome = function(id) {
    const inc = incomeList.find(i => i.id === id);
    if (!inc) return;

    document.getElementById('inc-id-input').value = inc.id;
    document.getElementById('income-modal-title').innerHTML = '<i class="fa-solid fa-sack-dollar"></i> Edit Income Details';
    document.getElementById('inc-client-input').value = inc.client_name;
    document.getElementById('inc-project-input').value = inc.project;
    document.getElementById('inc-invoice-input').value = inc.invoice_number;
    document.getElementById('inc-amount-input').value = inc.amount;
    document.getElementById('inc-gst-input').value = inc.gst;
    document.getElementById('inc-received-input').value = inc.payment_received;
    document.getElementById('inc-paydate-input').value = inc.payment_date || '';
    document.getElementById('inc-duedate-input').value = inc.due_date;
    
    // Trigger calculation
    calculateIncomeTotals();

    document.getElementById('income-modal').style.display = 'flex';
};

window.deleteIncome = function(id) {
    window.showConfirm(
        'Delete Income Record',
        'Are you sure you want to permanently delete this client payment entry?',
        async () => {
            try {
                const res = await apiFetch(`/api/income/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    refreshAllData().then(() => renderIncomeTable());
                    showToast('Income entry deleted.', 'info');
                } else {
                    showToast(data.error || 'Failed to delete record.', 'error');
                }
            } catch (e) {
                showToast('Network error occurred.', 'error');
            }
        }
    );
};

window.filterIncome = function() {
    const search = document.getElementById('income-search').value.toLowerCase();
    const stat = document.getElementById('income-status-filter').value;

    const tbody = document.getElementById('income-tbody');
    tbody.innerHTML = '';

    const filtered = incomeList.filter(inc => {
        const matchesSearch = inc.client_name.toLowerCase().includes(search) || 
                              inc.project.toLowerCase().includes(search) || 
                              inc.invoice_number.toLowerCase().includes(search);
        
        const isPaid = inc.pending <= 0;
        const matchesStatus = stat === 'all' || (stat === 'Paid' && isPaid) || (stat === 'Pending' && !isPaid);
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">No matching records found.</td></tr>';
        return;
    }

    filtered.forEach(inc => {
        const val = parseFloat(inc.amount) || 0;
        const gst = parseFloat(inc.gst) || 0;
        const total = val + gst;
        const rec = parseFloat(inc.payment_received) || 0;
        const pen = parseFloat(inc.pending) || 0;
        const isPaid = pen <= 0;
        const statusClass = isPaid ? 'style="background:rgba(16,185,129,0.1); color:var(--success);"' : 'style="background:rgba(245,158,11,0.1); color:var(--warning);"';

        tbody.innerHTML += `
            <tr>
                <td><strong>${inc.invoice_number}</strong></td>
                <td>${inc.client_name}</td>
                <td>${inc.project}</td>
                <td>${formatCurrency(val)}</td>
                <td>₹${gst}</td>
                <td><strong>${formatCurrency(total)}</strong></td>
                <td class="text-success"><strong>${formatCurrency(rec)}</strong></td>
                <td class="${pen > 0 ? 'text-warning' : ''}"><strong>${formatCurrency(pen)}</strong></td>
                <td>${inc.payment_date || '-'}</td>
                <td>${inc.due_date}</td>
                <td><span class="role-badge" ${statusClass}>${isPaid ? 'Paid' : 'Pending'}</span></td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editIncome(${inc.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteIncome(${inc.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
};


// ==========================================================================
// 4. EMPLOYEE EXPENSE CLAIMS ENGINE
// ==========================================================================
function renderClaimsTable() {
    const tbody = document.getElementById('claims-tbody');
    tbody.innerHTML = '';
    
    // Hide actions header if Employee role
    const actionsHeader = document.getElementById('claims-actions-header');
    if (currentUser.role === 'Employee') {
        if (actionsHeader) actionsHeader.style.display = 'none';
    } else {
        if (actionsHeader) actionsHeader.style.display = 'table-cell';
    }

    if (claimsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${currentUser.role === 'Employee' ? 8 : 9}" class="text-center">No expense claims logged.</td></tr>`;
        return;
    }

    claimsList.forEach(clm => {
        const billBtn = clm.bill_path ? `<button class="btn btn-secondary btn-xs" onclick="window.open('${clm.bill_path}', '_blank')"><i class="fa-solid fa-paperclip"></i> View Receipt</button>` : '<span style="color:#71717a;">None</span>';
        
        let badgeColor = 'style="background:rgba(255,255,255,0.05); color:#a1a1aa;"';
        if (clm.status === 'Approved') badgeColor = 'style="background:rgba(16,185,129,0.1); color:var(--success);"';
        if (clm.status === 'Rejected') badgeColor = 'style="background:rgba(239,68,68,0.1); color:var(--danger);"';
        
        let actionButtons = '';
        if (currentUser.role !== 'Employee') {
            if (clm.status === 'Pending') {
                actionButtons = `
                    <button class="btn btn-success btn-xs" onclick="approveClaim(${clm.id})" title="Approve Claim"><i class="fa-solid fa-check"></i> Approve</button>
                    <button class="btn btn-danger btn-xs" onclick="rejectClaim(${clm.id})" title="Reject Claim"><i class="fa-solid fa-times"></i> Reject</button>
                `;
            } else {
                actionButtons = '<span style="color:#71717a; font-size:11px;">Processed</span>';
            }
        }

        tbody.innerHTML += `
            <tr>
                <td>CLM-${String(clm.id).padStart(4,'0')}</td>
                <td>${clm.date}</td>
                <td><strong>${clm.employee}</strong></td>
                <td><span class="role-badge" style="background:rgba(168,85,247,0.1); color:var(--primary); font-size:11px;">${clm.type}</span></td>
                <td><strong>${formatCurrency(clm.amount)}</strong></td>
                <td class="text-truncate" style="max-width: 200px;" title="${clm.description}">${clm.description}</td>
                <td>${billBtn}</td>
                <td><span class="role-badge" ${badgeColor}>${clm.status}</span></td>
                ${currentUser.role !== 'Employee' ? `<td class="text-center">${actionButtons}</td>` : ''}
            </tr>
        `;
    });
}

window.openClaimModal = function() {
    document.getElementById('claim-form').reset();
    document.getElementById('claim-id-input').value = '';
    document.getElementById('claim-date-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('claim-file-details').innerText = 'Upload receipt bill copy';
    document.getElementById('claim-bill-path-input').value = '';
    
    // Hide employee selector if logged in as employee (auto-fills to logged in employee username)
    const empGroup = document.getElementById('claim-employee-group');
    if (currentUser.role === 'Employee') {
        empGroup.style.display = 'none';
        document.getElementById('claim-employee-input').removeAttribute('required');
    } else {
        empGroup.style.display = 'block';
        document.getElementById('claim-employee-input').setAttribute('required', 'true');
    }

    document.getElementById('claim-modal').style.display = 'flex';
};

window.closeClaimModal = function() {
    document.getElementById('claim-modal').style.display = 'none';
};

window.saveClaimForm = async function(e) {
    e.preventDefault();
    const payload = {
        date: document.getElementById('claim-date-input').value,
        amount: parseFloat(document.getElementById('claim-amount-input').value) || 0,
        type: document.getElementById('claim-type-input').value,
        employee: currentUser.role === 'Employee' ? currentUser.username : document.getElementById('claim-employee-input').value,
        description: document.getElementById('claim-description-input').value,
        bill_path: document.getElementById('claim-bill-path-input').value,
        status: 'Pending'
    };

    try {
        const res = await apiFetch('/api/claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeClaimModal();
            refreshAllData().then(() => renderClaimsTable());
            showToast('Claim submitted for reimbursement approval.', 'success');
        } else {
            showToast(data.error || 'Failed to submit claim.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.approveClaim = async function(id) {
    try {
        const res = await apiFetch(`/api/claims/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Approved' })
        });
        const data = await res.json();
        if (data.success) {
            refreshAllData().then(() => renderClaimsTable());
            showToast('Expense claim approved.', 'success');
        } else {
            showToast(data.error || 'Failed to approve claim.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.rejectClaim = async function(id) {
    if (!confirm('Are you sure you want to reject this claim?')) return;
    try {
        const res = await apiFetch(`/api/claims/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Rejected' })
        });
        const data = await res.json();
        if (data.success) {
            refreshAllData().then(() => renderClaimsTable());
            showToast('Expense claim rejected.', 'info');
        } else {
            showToast(data.error || 'Failed to reject claim.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};


// ==========================================================================
// 5. VENDORS ENGINE
// ==========================================================================
function renderVendorsTable() {
    const tbody = document.getElementById('vendors-tbody');
    tbody.innerHTML = '';
    
    if (vendorsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No vendors stored yet.</td></tr>';
        return;
    }

    vendorsList.forEach(v => {
        const outstanding = parseFloat(v.outstanding_balance) || 0;
        const outClass = outstanding > 0 ? 'text-warning font-weight-bold' : '';

        tbody.innerHTML += `
            <tr>
                <td><strong>${v.name}</strong></td>
                <td>${v.phone || '-'}</td>
                <td>${v.gst_number || '-'}</td>
                <td class="text-truncate" style="max-width: 250px;" title="${v.address}">${v.address || '-'}</td>
                <td class="${outClass}">${formatCurrency(outstanding)}</td>
                <td>${v.last_transaction || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editVendor(${v.id})" title="Edit Vendor"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteVendor(${v.id})" title="Delete Vendor"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openVendorModal = function() {
    document.getElementById('vendor-form').reset();
    document.getElementById('vendor-id-input').value = '';
    document.getElementById('vendor-modal-title').innerHTML = '<i class="fa-solid fa-shop"></i> Store Vendor Profile';
    document.getElementById('vendor-modal').style.display = 'flex';
};

window.closeVendorModal = function() {
    document.getElementById('vendor-modal').style.display = 'none';
};

window.saveVendorForm = async function(e) {
    e.preventDefault();
    const id = document.getElementById('vendor-id-input').value;
    const payload = {
        id: id ? parseInt(id, 10) : undefined,
        name: document.getElementById('vendor-name-input').value,
        phone: document.getElementById('vendor-phone-input').value,
        gst_number: document.getElementById('vendor-gst-input').value,
        address: document.getElementById('vendor-address-input').value,
        outstanding_balance: parseFloat(document.getElementById('vendor-balance-input').value) || 0,
        last_transaction: document.getElementById('vendor-lastdate-input').value || undefined
    };

    try {
        const res = await apiFetch('/api/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeVendorModal();
            refreshAllData().then(() => renderVendorsTable());
            showToast(id ? 'Vendor details updated.' : 'Vendor profile created.', 'success');
        } else {
            showToast(data.error || 'Failed to save vendor.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.editVendor = function(id) {
    const v = vendorsList.find(ven => ven.id === id);
    if (!v) return;

    document.getElementById('vendor-id-input').value = v.id;
    document.getElementById('vendor-modal-title').innerHTML = '<i class="fa-solid fa-shop"></i> Edit Vendor Profile';
    document.getElementById('vendor-name-input').value = v.name;
    document.getElementById('vendor-phone-input').value = v.phone || '';
    document.getElementById('vendor-gst-input').value = v.gst_number || '';
    document.getElementById('vendor-address-input').value = v.address || '';
    document.getElementById('vendor-balance-input').value = v.outstanding_balance;
    document.getElementById('vendor-lastdate-input').value = v.last_transaction || '';

    document.getElementById('vendor-modal').style.display = 'flex';
};

window.deleteVendor = function(id) {
    window.showConfirm(
        'Delete Vendor Profile',
        'Are you sure you want to permanently delete this vendor profile and outstanding payable records?',
        async () => {
            try {
                const res = await apiFetch(`/api/vendors/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    refreshAllData().then(() => renderVendorsTable());
                    showToast('Vendor profile deleted.', 'info');
                } else {
                    showToast(data.error || 'Failed to delete record.', 'error');
                }
            } catch (e) {
                showToast('Network error occurred.', 'error');
            }
        }
    );
};

window.filterVendors = function() {
    const search = document.getElementById('vendor-search').value.toLowerCase();
    const tbody = document.getElementById('vendors-tbody');
    tbody.innerHTML = '';

    const filtered = vendorsList.filter(v => {
        return v.name.toLowerCase().includes(search) || 
               (v.gst_number && v.gst_number.toLowerCase().includes(search));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matching vendors.</td></tr>';
        return;
    }

    filtered.forEach(v => {
        const outstanding = parseFloat(v.outstanding_balance) || 0;
        const outClass = outstanding > 0 ? 'text-warning font-weight-bold' : '';

        tbody.innerHTML += `
            <tr>
                <td><strong>${v.name}</strong></td>
                <td>${v.phone || '-'}</td>
                <td>${v.gst_number || '-'}</td>
                <td>${v.address || '-'}</td>
                <td class="${outClass}">${formatCurrency(outstanding)}</td>
                <td>${v.last_transaction || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editVendor(${v.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteVendor(${v.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
};


// ==========================================================================
// 6. SUBSCRIPTION TRACKER ENGINE
// ==========================================================================
function renderSubscriptionsTable() {
    const tbody = document.getElementById('subscriptions-tbody');
    tbody.innerHTML = '';
    
    if (subscriptionsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No subscriptions tracked yet.</td></tr>';
        return;
    }

    const today = new Date();

    subscriptionsList.forEach(sub => {
        const mCost = parseFloat(sub.monthly_cost) || 0;
        const yCost = parseFloat(sub.yearly_cost) || 0;
        
        const renewDate = new Date(sub.renewal_date);
        const diffDays = Math.ceil((renewDate - today) / (1000 * 60 * 60 * 24));
        
        let urgencyColor = '';
        let urgencyText = `${diffDays} days`;
        
        if (diffDays < 0) {
            urgencyColor = 'style="color:var(--danger); font-weight:700;"';
            urgencyText = 'Expired';
        } else if (diffDays <= 3) {
            urgencyColor = 'style="color:var(--danger); font-weight:700;"';
            urgencyText = `Urgent: ${diffDays} days`;
        } else if (diffDays <= 7) {
            urgencyColor = 'style="color:var(--warning); font-weight:600;"';
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${sub.name}</strong></td>
                <td>${sub.renewal_date}</td>
                <td><strong>${formatCurrency(mCost)}</strong></td>
                <td>${formatCurrency(yCost)}</td>
                <td><span class="role-badge" style="background:rgba(255,255,255,0.05); color:#a1a1aa;"><i class="fa-solid fa-bell"></i> ${sub.reminder}</span></td>
                <td ${urgencyColor}><strong>${urgencyText}</strong></td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editSubscription(${sub.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteSubscription(${sub.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openSubscriptionModal = function() {
    document.getElementById('subscription-form').reset();
    document.getElementById('sub-id-input').value = '';
    document.getElementById('subscription-modal-title').innerHTML = '<i class="fa-solid fa-rotate"></i> Track SaaS Subscription';
    document.getElementById('sub-renewal-input').value = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]; // renew in 30 days
    document.getElementById('subscription-modal').style.display = 'flex';
};

window.closeSubscriptionModal = function() {
    document.getElementById('subscription-modal').style.display = 'none';
};

window.calculateSubscriptionYearly = function() {
    const monthly = parseFloat(document.getElementById('sub-monthly-input').value) || 0;
    // Auto estimate yearly cost
    document.getElementById('sub-yearly-input').value = (monthly * 12).toFixed(2);
};

window.saveSubscriptionForm = async function(e) {
    e.preventDefault();
    const id = document.getElementById('sub-id-input').value;
    const payload = {
        id: id ? parseInt(id, 10) : undefined,
        name: document.getElementById('sub-name-input').value,
        renewal_date: document.getElementById('sub-renewal-input').value,
        monthly_cost: parseFloat(document.getElementById('sub-monthly-input').value) || 0,
        yearly_cost: parseFloat(document.getElementById('sub-yearly-input').value) || 0,
        reminder: document.getElementById('sub-reminder-input').value
    };

    try {
        const res = await apiFetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeSubscriptionModal();
            refreshAllData().then(() => renderSubscriptionsTable());
            showToast(id ? 'Subscription updated.' : 'Subscription tracked.', 'success');
        } else {
            showToast(data.error || 'Failed to save subscription.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.editSubscription = function(id) {
    const sub = subscriptionsList.find(s => s.id === id);
    if (!sub) return;

    document.getElementById('sub-id-input').value = sub.id;
    document.getElementById('subscription-modal-title').innerHTML = '<i class="fa-solid fa-rotate"></i> Edit SaaS Subscription';
    document.getElementById('sub-name-input').value = sub.name;
    document.getElementById('sub-monthly-input').value = sub.monthly_cost;
    document.getElementById('sub-yearly-input').value = sub.yearly_cost;
    document.getElementById('sub-renewal-input').value = sub.renewal_date;
    document.getElementById('sub-reminder-input').value = sub.reminder;

    document.getElementById('subscription-modal').style.display = 'flex';
};

window.deleteSubscription = function(id) {
    window.showConfirm(
        'Remove Subscription',
        'Are you sure you want to stop tracking this active SaaS subscription?',
        async () => {
            try {
                const res = await apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    refreshAllData().then(() => renderSubscriptionsTable());
                    showToast('Subscription deleted.', 'info');
                } else {
                    showToast(data.error || 'Failed to delete record.', 'error');
                }
            } catch (e) {
                showToast('Network error occurred.', 'error');
            }
        }
    );
};


// ==========================================================================
// 7. ASSET MANAGEMENT ENGINE
// ==========================================================================
function renderAssetsTable() {
    const tbody = document.getElementById('assets-tbody');
    tbody.innerHTML = '';
    
    if (assetsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No assets cataloged yet.</td></tr>';
        return;
    }

    assetsList.forEach(ast => {
        const assignBadge = ast.assigned_employee === 'Not Assigned' ? '<span class="role-badge" style="background:rgba(255,255,255,0.05); color:#a1a1aa;">In Stock</span>' : `<span class="role-badge" style="background:rgba(168,85,247,0.1); color:var(--primary); font-weight:600;"><i class="fa-solid fa-user"></i> ${ast.assigned_employee}</span>`;
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${ast.type}</strong></td>
                <td>${ast.name}</td>
                <td><code>${ast.serial_number}</code></td>
                <td><strong>${formatCurrency(ast.cost)}</strong></td>
                <td>${assignBadge}</td>
                <td>${ast.purchase_date}</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs" onclick="editAsset(${ast.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-xs" onclick="deleteAsset(${ast.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openAssetModal = function() {
    document.getElementById('asset-form').reset();
    document.getElementById('asset-id-input').value = '';
    document.getElementById('asset-modal-title').innerHTML = '<i class="fa-solid fa-laptop-house"></i> Inventory Asset Registration';
    document.getElementById('asset-purchase-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('asset-modal').style.display = 'flex';
};

window.closeAssetModal = function() {
    document.getElementById('asset-modal').style.display = 'none';
};

window.saveAssetForm = async function(e) {
    e.preventDefault();
    const id = document.getElementById('asset-id-input').value;
    const payload = {
        id: id ? parseInt(id, 10) : undefined,
        name: document.getElementById('asset-name-input').value,
        type: document.getElementById('asset-type-input').value,
        serial_number: document.getElementById('asset-serial-input').value,
        cost: parseFloat(document.getElementById('asset-cost-input').value) || 0,
        assigned_employee: document.getElementById('asset-assigned-input').value,
        purchase_date: document.getElementById('asset-purchase-input').value
    };

    try {
        const res = await apiFetch('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeAssetModal();
            refreshAllData().then(() => renderAssetsTable());
            showToast(id ? 'Asset details updated.' : 'Asset cataloged successfully.', 'success');
        } else {
            showToast(data.error || 'Failed to save asset.', 'error');
        }
    } catch (err) {
        showToast('Network error occurred.', 'error');
    }
};

window.editAsset = function(id) {
    const ast = assetsList.find(a => a.id === id);
    if (!ast) return;

    document.getElementById('asset-id-input').value = ast.id;
    document.getElementById('asset-modal-title').innerHTML = '<i class="fa-solid fa-laptop-house"></i> Edit Asset Inventory';
    document.getElementById('asset-name-input').value = ast.name;
    document.getElementById('asset-type-input').value = ast.type;
    document.getElementById('asset-serial-input').value = ast.serial_number;
    document.getElementById('asset-cost-input').value = ast.cost;
    document.getElementById('asset-assigned-input').value = ast.assigned_employee;
    document.getElementById('asset-purchase-input').value = ast.purchase_date;

    document.getElementById('asset-modal').style.display = 'flex';
};

window.deleteAsset = function(id) {
    window.showConfirm(
        'Retire Asset',
        'Are you sure you want to retire or delete this hardware asset from active inventory?',
        async () => {
            try {
                const res = await apiFetch(`/api/assets/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    refreshAllData().then(() => renderAssetsTable());
                    showToast('Asset removed from inventory database.', 'info');
                } else {
                    showToast(data.error || 'Failed to delete record.', 'error');
                }
            } catch (e) {
                showToast('Network error occurred.', 'error');
            }
        }
    );
};


// ==========================================================================
// 8. REPORT ENGINE GENERATOR
// ==========================================================================
window.loadReportFields = function() {
    const reportType = document.getElementById('report-type-select').value;
    const startGroup = document.getElementById('report-start-group');
    const endGroup = document.getElementById('report-end-group');
    
    // Set default dates
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('report-start-date').value = firstDay;
    document.getElementById('report-end-date').value = lastDay;

    // Balance Sheet & P&L don't need date ranges, they are cumulative
    if (reportType === 'balance-sheet') {
        startGroup.style.display = 'none';
        endGroup.style.display = 'none';
    } else {
        startGroup.style.display = 'block';
        endGroup.style.display = 'block';
    }
};

window.generateReport = function() {
    const type = document.getElementById('report-type-select').value;
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    const canvas = document.getElementById('report-sheet-canvas');
    
    let html = '';
    
    // Report headers
    const dateRangeStr = type !== 'balance-sheet' ? `Period: ${start} to ${end}` : `As of Date: ${new Date().toISOString().split('T')[0]}`;
    
    html += `
        <div class="report-header-print">
            <div>
                <h2>Orbenyx</h2>
                <p style="font-size: 0.8rem; color:#52525b; margin-top:4px;">Vadavalli, Coimbatore, Tamil Nadu – 641046</p>
                <p style="font-size: 0.8rem; color:#52525b;">GSTIN: 33DMKPA5355R1ZL</p>
            </div>
            <div style="text-align: right;">
                <h3 style="font-weight: 700; text-transform: uppercase;">${type.replace('-',' ').toUpperCase()}</h3>
                <p style="font-size: 0.85rem; color:#52525b; margin-top:4px;">${dateRangeStr}</p>
            </div>
        </div>
    `;

    // Filter lists by date
    const startD = new Date(start);
    const endD = new Date(end);
    
    const filteredExp = expensesList.filter(e => {
        const d = new Date(e.date);
        return e.status === 'Paid' && d >= startD && d <= endD;
    });

    const filteredInc = incomeList.filter(i => {
        const d = new Date(i.payment_date || i.due_date);
        return d >= startD && d <= endD;
    });

    if (type === 'monthly-expense' || type === 'yearly-expense') {
        let total = 0;
        let tableRows = '';
        
        filteredExp.forEach(e => {
            total += parseFloat(e.amount) || 0;
            tableRows += `
                <tr>
                    <td>${e.date}</td>
                    <td>EXP-${String(e.id).padStart(4,'0')}</td>
                    <td><strong>${e.category}</strong></td>
                    <td>${e.sub_category}</td>
                    <td>${e.description}</td>
                    <td>${e.employee}</td>
                    <td>${e.payment_method}</td>
                    <td><strong>${formatCurrency(e.amount)}</strong></td>
                </tr>
            `;
        });

        html += `
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>ID</th>
                        <th>Category</th>
                        <th>Sub-Category</th>
                        <th>Description</th>
                        <th>Employee</th>
                        <th>Method</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows || '<tr><td colspan="8" style="text-align:center;">No records found.</td></tr>'}
                </tbody>
            </table>
            
            <div class="report-summary-box">
                <div class="report-summary-row total-row">
                    <span>Total Outlay:</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
        `;
    }
    
    else if (type === 'category') {
        const cats = {};
        let total = 0;
        
        filteredExp.forEach(e => {
            const amt = parseFloat(e.amount) || 0;
            cats[e.category] = (cats[e.category] || 0) + amt;
            total += amt;
        });

        let rows = '';
        Object.entries(cats).forEach(([k, v]) => {
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
            rows += `
                <tr>
                    <td><strong>${k}</strong></td>
                    <td>${pct}%</td>
                    <td><strong>${formatCurrency(v)}</strong></td>
                </tr>
            `;
        });

        html += `
            <h4 style="margin-bottom: 12px; font-weight:700;">Category Spending Distribution Summary</h4>
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>Expense Category</th>
                        <th>Percentage Share</th>
                        <th>Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="3" style="text-align:center;">No records.</td></tr>'}
                </tbody>
            </table>
            <div class="report-summary-box">
                <div class="report-summary-row total-row">
                    <span>Total Sum:</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
        `;
    }

    else if (type === 'employee') {
        const emps = {};
        let total = 0;
        
        claimsList.forEach(c => {
            const amt = parseFloat(c.amount) || 0;
            if (c.status === 'Approved') {
                const d = new Date(c.date);
                if (d >= startD && d <= endD) {
                    emps[c.employee] = (emps[c.employee] || 0) + amt;
                    total += amt;
                }
            }
        });

        let rows = '';
        Object.entries(emps).forEach(([k, v]) => {
            rows += `
                <tr>
                    <td><strong>${k}</strong></td>
                    <td>Reimbursed Claims</td>
                    <td><strong>${formatCurrency(v)}</strong></td>
                </tr>
            `;
        });

        html += `
            <h4 style="margin-bottom: 12px; font-weight:700;">Employee Spending Reimbursement Summary</h4>
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>Employee Name</th>
                        <th>Transaction Mode</th>
                        <th>Total Reimbursement</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="3" style="text-align:center;">No records.</td></tr>'}
                </tbody>
            </table>
            <div class="report-summary-box">
                <div class="report-summary-row total-row">
                    <span>Total Cost:</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
        `;
    }

    else if (type === 'vendor') {
        let total = 0;
        let rows = '';
        
        vendorsList.forEach(v => {
            const bal = parseFloat(v.outstanding_balance) || 0;
            total += bal;
            rows += `
                <tr>
                    <td><strong>${v.name}</strong></td>
                    <td>${v.phone || '-'}</td>
                    <td>${v.gst_number || '-'}</td>
                    <td>${v.last_transaction || '-'}</td>
                    <td style="color:${bal > 0 ? 'var(--warning)' : ''}"><strong>${formatCurrency(bal)}</strong></td>
                </tr>
            `;
        });

        html += `
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>Vendor Name</th>
                        <th>Contact</th>
                        <th>GST Number</th>
                        <th>Last Transaction Date</th>
                        <th>Outstanding Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="5" style="text-align:center;">No records.</td></tr>'}
                </tbody>
            </table>
            <div class="report-summary-box">
                <div class="report-summary-row total-row">
                    <span>Total Outstandings:</span>
                    <span>${formatCurrency(total)}</span>
                </div>
            </div>
        `;
    }

    else if (type === 'gst') {
        // GST tax collections on revenue vs paid input tax credits
        let outputGst = 0;
        let inputGst = 0;
        let taxableRevenue = 0;
        let taxableExpenses = 0;
        
        filteredInc.forEach(i => {
            taxableRevenue += parseFloat(i.amount) || 0;
            outputGst += parseFloat(i.gst) || 0;
        });

        filteredExp.forEach(e => {
            if (e.gst === 'Yes') {
                taxableExpenses += parseFloat(e.amount) || 0;
                inputGst += parseFloat(e.gst_amount) || 0;
            }
        });

        const netPayable = outputGst - inputGst;

        html += `
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>GST Component Category</th>
                        <th>Taxable Value</th>
                        <th>GST Tax Value (CGST + SGST 18%)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Output Tax (Revenue Invoices)</strong></td>
                        <td>${formatCurrency(taxableRevenue)}</td>
                        <td class="text-success"><strong>+ ${formatCurrency(outputGst)}</strong></td>
                    </tr>
                    <tr>
                        <td><strong>Input Tax Credits (SaaS / vendor purchases)</strong></td>
                        <td>${formatCurrency(taxableExpenses)}</td>
                        <td class="text-danger"><strong>- ${formatCurrency(inputGst)}</strong></td>
                    </tr>
                </tbody>
            </table>
            
            <div class="report-summary-box">
                <div class="report-summary-row">
                    <span>Output Liability:</span>
                    <span>${formatCurrency(outputGst)}</span>
                </div>
                <div class="report-summary-row">
                    <span>Input Tax Credit (ITC):</span>
                    <span>${formatCurrency(inputGst)}</span>
                </div>
                <div class="report-summary-row total-row">
                    <span>Net GST Payable / Refund:</span>
                    <span style="color:${netPayable > 0 ? 'red' : 'green'}">${formatCurrency(netPayable)}</span>
                </div>
            </div>
        `;
    }

    else if (type === 'cash-flow') {
        let receipts = 0;
        let payments = 0;
        
        filteredInc.forEach(i => {
            receipts += parseFloat(i.payment_received) || 0;
        });

        filteredExp.forEach(e => {
            if (e.status === 'Paid') {
                payments += parseFloat(e.amount) || 0;
            }
        });

        claimsList.forEach(c => {
            if (c.status === 'Approved') {
                const d = new Date(c.date);
                if (d >= startD && d <= endD) {
                    payments += parseFloat(c.amount) || 0;
                }
            }
        });

        const netCashFlow = receipts - payments;

        html += `
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th>Cash Activity Details</th>
                        <th>Inflow (+)</th>
                        <th>Outflow (-)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Cash Receipts (Payments Received from Clients)</strong></td>
                        <td class="text-success"><strong>+ ${formatCurrency(receipts)}</strong></td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td><strong>Cash Payments (Vendor Expenses & Salaries Paid)</strong></td>
                        <td>-</td>
                        <td class="text-danger"><strong>- ${formatCurrency(payments)}</strong></td>
                    </tr>
                </tbody>
            </table>
            
            <div class="report-summary-box">
                <div class="report-summary-row total-row">
                    <span>Net Cash Flow increase / decrease:</span>
                    <span style="color:${netCashFlow >= 0 ? 'green' : 'red'}">${formatCurrency(netCashFlow)}</span>
                </div>
            </div>
        `;
    }

    else if (type === 'profit-loss') {
        let revenue = 0;
        let gstCollected = 0;
        let cogs = 0; // developer developer contracts can be cost of goods
        let opex = 0; // SaaS, hosting, marketing, rent
        
        filteredInc.forEach(i => {
            revenue += parseFloat(i.amount) || 0;
        });

        filteredExp.forEach(e => {
            const amt = parseFloat(e.amount) || 0;
            if (e.category === 'Development' || e.category === 'Employees') {
                cogs += amt;
            } else {
                opex += amt;
            }
        });

        claimsList.forEach(c => {
            if (c.status === 'Approved') {
                const d = new Date(c.date);
                if (d >= startD && d <= endD) {
                    cogs += parseFloat(c.amount) || 0;
                }
            }
        });

        const grossProfit = revenue - cogs;
        const netProfit = grossProfit - opex;

        html += `
            <table class="report-table-print">
                <tbody>
                    <tr>
                        <td style="font-size:1.1rem; font-weight:700;">Revenue / Sales</td>
                        <td></td>
                        <td style="font-size:1.1rem; font-weight:700; text-align:right;">${formatCurrency(revenue)}</td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">IT Tech Services Revenue</td>
                        <td style="text-align:right;">${formatCurrency(revenue)}</td>
                        <td></td>
                    </tr>
                    
                    <tr>
                        <td style="font-size:1.1rem; font-weight:700;">Cost of Services (COGS)</td>
                        <td></td>
                        <td style="font-size:1.1rem; font-weight:700; text-align:right; color:red;">(${formatCurrency(cogs)})</td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Developer Salaries & claims</td>
                        <td style="text-align:right;">${formatCurrency(cogs)}</td>
                        <td></td>
                    </tr>

                    <tr style="background:#f4f4f5; font-weight:700;">
                        <td style="font-size:1.1rem;">Gross Profit</td>
                        <td></td>
                        <td style="font-size:1.1rem; text-align:right; color:${grossProfit >= 0 ? 'green' : 'red'};">${formatCurrency(grossProfit)}</td>
                    </tr>
                    
                    <tr>
                        <td style="font-size:1.1rem; font-weight:700;">Operating Expenses (OPEX)</td>
                        <td></td>
                        <td style="font-size:1.1rem; font-weight:700; text-align:right; color:red;">(${formatCurrency(opex)})</td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Office Rent & SaaS Platforms</td>
                        <td style="text-align:right;">${formatCurrency(opex)}</td>
                        <td></td>
                    </tr>
                    
                    <tr style="background:#e4e4e7; font-weight:800; border-top:2px solid #1c1917;">
                        <td style="font-size:1.2rem;">Net Operating Profit</td>
                        <td></td>
                        <td style="font-size:1.2rem; text-align:right; color:${netProfit >= 0 ? 'green' : 'red'};">${formatCurrency(netProfit)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    else if (type === 'balance-sheet') {
        // Assets vs Liabilities
        let cashBankReserves = initialCash + initialBank;
        
        // Sum expenses and claims paid
        let expensesOut = 0;
        expensesList.forEach(e => { if (e.status === 'Paid') expensesOut += parseFloat(e.amount) || 0; });
        claimsList.forEach(c => { if (c.status === 'Approved') expensesOut += parseFloat(c.amount) || 0; });
        
        let revenueIn = 0;
        incomeList.forEach(i => { revenueIn += parseFloat(i.payment_received) || 0; });

        const cashAsset = cashBankReserves + revenueIn - expensesOut;

        // Assets
        let inventoryAsset = 0;
        assetsList.forEach(a => { inventoryAsset += parseFloat(a.cost) || 0; });

        const totalAssets = cashAsset + inventoryAsset;

        // Liabilities
        let outstandsLiabilities = 0;
        vendorsList.forEach(v => { outstandsLiabilities += parseFloat(v.outstanding_balance) || 0; });
        claimsList.forEach(c => { if (c.status === 'Pending') outstandsLiabilities += parseFloat(c.amount) || 0; });

        // Equity
        const capitalEquity = initialCash + initialBank;
        const retainedEarnings = revenueIn - expensesOut;
        const totalEquityAndLiabilities = capitalEquity + retainedEarnings + outstandsLiabilities;

        html += `
            <table class="report-table-print">
                <thead>
                    <tr>
                        <th colspan="2" style="font-size:1.1rem; font-weight:800;">ASSETS</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Current Assets</strong></td>
                        <td style="text-align:right;"><strong>${formatCurrency(cashAsset)}</strong></td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Cash & Bank Reserves</td>
                        <td style="text-align:right;">${formatCurrency(cashAsset)}</td>
                    </tr>
                    <tr>
                        <td><strong>Fixed Assets</strong></td>
                        <td style="text-align:right;"><strong>${formatCurrency(inventoryAsset)}</strong></td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Office IT Inventory (Laptops/Monitors)</td>
                        <td style="text-align:right;">${formatCurrency(inventoryAsset)}</td>
                    </tr>
                    <tr style="background:#f4f4f5; font-weight:700;">
                        <td>TOTAL ASSETS</td>
                        <td style="text-align:right;">${formatCurrency(totalAssets)}</td>
                    </tr>
                </tbody>
            </table>

            <table class="report-table-print" style="margin-top:20px;">
                <thead>
                    <tr>
                        <th colspan="2" style="font-size:1.1rem; font-weight:800;">LIABILITIES & EQUITY</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Liabilities</strong></td>
                        <td style="text-align:right;"><strong>${formatCurrency(outstandsLiabilities)}</strong></td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Accounts Payable (Vendor outstands + Pending claims)</td>
                        <td style="text-align:right;">${formatCurrency(outstandsLiabilities)}</td>
                    </tr>
                    <tr>
                        <td><strong>Shareholder Equity</strong></td>
                        <td style="text-align:right;"><strong>${formatCurrency(capitalEquity + retainedEarnings)}</strong></td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Initial Partner Capital Contributions</td>
                        <td style="text-align:right;">${formatCurrency(capitalEquity)}</td>
                    </tr>
                    <tr style="color:#71717a;">
                        <td style="padding-left:30px;">Retained Earnings / Surplus</td>
                        <td style="text-align:right;">${formatCurrency(retainedEarnings)}</td>
                    </tr>
                    <tr style="background:#f4f4f5; font-weight:700;">
                        <td>TOTAL LIABILITIES & EQUITY</td>
                        <td style="text-align:right;">${formatCurrency(totalEquityAndLiabilities)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    canvas.innerHTML = html;
};

window.printReport = function() {
    window.print();
};


// ==========================================================================
// 9. DETAILED ANALYTICS MODULE
// ==========================================================================
function loadDetailedAnalytics() {
    const monthlyData = getMonthlyFinancials(6);
    
    // Average Monthly Burn Rate (last 3 months average expenses)
    const recentExp = monthlyData.expenses.slice(-3);
    const avgBurn = recentExp.reduce((a, b) => a + b, 0) / Math.max(recentExp.length, 1);
    
    // Runway (reserves / burn rate)
    let reserves = initialCash + initialBank;
    
    let expensesOut = 0;
    expensesList.forEach(e => { if (e.status === 'Paid') expensesOut += parseFloat(e.amount) || 0; });
    claimsList.forEach(c => { if (c.status === 'Approved') expensesOut += parseFloat(c.amount) || 0; });

    let revenueIn = 0;
    incomeList.forEach(i => { revenueIn += parseFloat(i.payment_received) || 0; });

    const totalCashReserves = reserves + revenueIn - expensesOut;
    const runwayMonths = avgBurn > 0 ? (totalCashReserves / avgBurn).toFixed(1) : '∞';

    document.getElementById('anal-burn-rate').innerText = formatCurrency(avgBurn);
    document.getElementById('anal-runway').innerText = avgBurn > 0 ? `${runwayMonths} Months` : '∞ (No outflow)';

    // Highest category cost
    const cats = getCategoryBreakdown();
    if (cats.values.length > 0) {
        const maxVal = Math.max(...cats.values);
        const maxIdx = cats.values.indexOf(maxVal);
        document.getElementById('anal-highest-cat').innerText = cats.labels[maxIdx];
        document.getElementById('anal-highest-cat-val').innerText = `${formatCurrency(maxVal)} total expense`;
    } else {
        document.getElementById('anal-highest-cat').innerText = '-';
        document.getElementById('anal-highest-cat-val').innerText = '₹ 0.00 total expense';
    }

    // Highs and Lows highlights
    if (expensesList.length > 0) {
        const sorted = [...expensesList].sort((a,b) => b.amount - a.amount);
        const high = sorted[0];
        const low = sorted[sorted.length - 1];
        
        document.getElementById('highlight-highest-exp').innerText = `${formatCurrency(high.amount)} - ${high.category}`;
        document.getElementById('highlight-highest-exp-desc').innerText = `Date: ${high.date} - Desc: ${high.description} - Employee: ${high.employee}`;
        
        document.getElementById('highlight-lowest-exp').innerText = `${formatCurrency(low.amount)} - ${low.category}`;
        document.getElementById('highlight-lowest-exp-desc').innerText = `Date: ${low.date} - Desc: ${low.description} - Employee: ${low.employee}`;
    } else {
        document.getElementById('highlight-highest-exp').innerText = '-';
        document.getElementById('highlight-highest-exp-desc').innerText = 'No expense data';
        document.getElementById('highlight-lowest-exp').innerText = '-';
        document.getElementById('highlight-lowest-exp-desc').innerText = 'No expense data';
    }

    // Load Charts
    renderDetailedCharts(monthlyData);
}

function renderDetailedCharts(monthlyData) {
    // 1. Income vs Expense Double Line/Bar comparison
    const compCtx = document.getElementById('analytics-comparison-chart');
    if (!compCtx) return;

    if (analTrendChartInstance) analTrendChartInstance.destroy();

    analTrendChartInstance = new Chart(compCtx, {
        type: 'line',
        data: {
            labels: monthlyData.labels,
            datasets: [
                {
                    label: 'Client Revenue (Income)',
                    data: monthlyData.incomes,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    tension: 0.25,
                    fill: true
                },
                {
                    label: 'Expenses Outflow',
                    data: monthlyData.expenses,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    tension: 0.25,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fafafa', font: { family: 'Outfit' } } }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#71717a', font: { family: 'Outfit' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717a', font: { family: 'Outfit' } }
                }
            }
        }
    });

    // 2. Cash vs Bank balances pie
    const distCtx = document.getElementById('analytics-distribution-chart');
    if (!distCtx) return;

    if (analPieChartInstance) analPieChartInstance.destroy();

    // Compute reserves
    let reserves = initialCash + initialBank;
    
    let expensesOut = 0;
    expensesList.forEach(e => { if (e.status === 'Paid') expensesOut += parseFloat(e.amount) || 0; });
    claimsList.forEach(c => { if (c.status === 'Approved') expensesOut += parseFloat(c.amount) || 0; });

    let revenueIn = 0;
    incomeList.forEach(i => { revenueIn += parseFloat(i.payment_received) || 0; });

    let cashBalance = initialCash;
    let bankBalance = initialBank;

    // Deduct cash expenses
    expensesList.forEach(exp => {
        if (exp.status === 'Paid') {
            const amt = parseFloat(exp.amount) || 0;
            if (exp.payment_method === 'Cash') {
                cashBalance -= amt;
            } else {
                bankBalance -= amt;
            }
        }
    });
    // Add bank income
    incomeList.forEach(inc => {
        const rec = parseFloat(inc.payment_received) || 0;
        bankBalance += rec;
    });

    analPieChartInstance = new Chart(distCtx, {
        type: 'pie',
        data: {
            labels: ['Cash in Hand', 'Bank Account Reserves'],
            datasets: [{
                data: [Math.max(0, cashBalance), Math.max(0, bankBalance)],
                backgroundColor: ['#ef4444', '#7c3aed'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#fafafa', font: { family: 'Outfit', size: 12 } }
                }
            }
        }
    });
}


// ==========================================================================
// UTILITY HELPERS
// ==========================================================================
function formatCurrency(val) {
    return '₹ ' + (parseFloat(val) || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    if (!toast) return;

    toastMsg.innerText = message;
    
    // Set icons
    if (type === 'success') {
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
    } else if (type === 'error') {
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger);"></i>';
    } else {
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-info" style="color:var(--primary);"></i>';
    }

    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// SETTINGS STARTING BALANCES MODAL
window.openSettingsModal = async function() {
    document.getElementById('settings-cash-input').value = initialCash;
    document.getElementById('settings-bank-input').value = initialBank;
    document.getElementById('settings-modal').style.display = 'flex';

    // Load and render history logs
    const tbody = document.getElementById('balance-history-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-secondary);">Loading history...</td></tr>';
        try {
            const res = await apiFetch('/api/settings/history').then(r => r.json());
            if (res.success && res.history) {
                if (res.history.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-secondary);">No changes logged yet.</td></tr>';
                } else {
                    tbody.innerHTML = res.history.map(item => {
                        const dateFormatted = new Date(item.change_date).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:6px 4px; color:var(--text-primary); white-space:nowrap;">${dateFormatted}</td>
                                <td style="padding:6px 4px; color:var(--primary); font-weight:500;">${item.changed_by}</td>
                                <td style="padding:6px 4px; text-align:right; font-weight:500; white-space:nowrap;">
                                    <span style="color:var(--text-secondary); text-decoration:line-through; font-size:10px;">${formatCurrency(item.old_cash).replace('₹ ', '')}</span>
                                    ➔ 
                                    <span style="color:var(--success);">${formatCurrency(item.new_cash).replace('₹ ', '')}</span>
                                </td>
                                <td style="padding:6px 4px; text-align:right; font-weight:500; white-space:nowrap;">
                                    <span style="color:var(--text-secondary); text-decoration:line-through; font-size:10px;">${formatCurrency(item.old_bank).replace('₹ ', '')}</span>
                                    ➔ 
                                    <span style="color:var(--success);">${formatCurrency(item.new_bank).replace('₹ ', '')}</span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            } else {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--danger);">Failed to load history logs.</td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--danger);">Error connecting to API.</td></tr>';
        }
    }
};

window.closeSettingsModal = function() {
    document.getElementById('settings-modal').style.display = 'none';
};

window.saveSettingsForm = async function(e) {
    e.preventDefault();
    const cash = parseFloat(document.getElementById('settings-cash-input').value) || 0;
    const bank = parseFloat(document.getElementById('settings-bank-input').value) || 0;

    try {
        const res = await apiFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initial_cash: cash,
                initial_bank: bank
            })
        });
        const data = await res.json();
        if (data.success) {
            closeSettingsModal();
            showToast('Starting balances saved successfully.', 'success');
            // Trigger reload
            loadDashboardMetrics();
        } else {
            showToast(data.error || 'Failed to save settings.', 'error');
        }
    } catch (err) {
        showToast('Network error saving starting balances.', 'error');
    }
};

// CUSTOM CONFIRMATION DIALOG MODAL CONTROLLER
let confirmCallback = null;

window.showConfirm = function(title, message, callback) {
    document.getElementById('confirm-title').innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${title}`;
    document.getElementById('confirm-message').innerText = message;
    confirmCallback = callback;
    
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.onclick = function() {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    };
    
    document.getElementById('confirm-modal').style.display = 'flex';
};

window.closeConfirmModal = function() {
    document.getElementById('confirm-modal').style.display = 'none';
    confirmCallback = null;
};

// --- EMPLOYEES PORTAL STATE & HELPERS ---
let portalEmployees = [];

function populateEmployeeDropdowns() {
    const expSelect = document.getElementById('exp-employee-input');
    const claimSelect = document.getElementById('claim-employee-input');
    const assetSelect = document.getElementById('asset-assigned-input');
    
    const optionsHtml = portalEmployees.map(emp => {
        let displayRole = emp.role;
        if (emp.name === 'Partha') displayRole = 'CEO';
        else if (emp.name === 'Sarat' && emp.role === 'Admin') displayRole = 'Admin';
        else if (emp.name === 'Ramesh') displayRole = 'Senior Dev';
        else if (emp.name === 'Suresh') displayRole = 'Marketing';
        else if (emp.name === 'Anita') displayRole = 'Accountant';
        
        return `<option value="${emp.name}">${emp.name} (${displayRole})</option>`;
    }).join('');

    if (expSelect) {
        expSelect.innerHTML = optionsHtml;
    }
    if (claimSelect) {
        claimSelect.innerHTML = optionsHtml;
    }
    if (assetSelect) {
        assetSelect.innerHTML = `<option value="Not Assigned">Not Assigned (In Stock)</option>` + optionsHtml;
    }
}

function renderEmployeesTable() {
    const tbody = document.getElementById('employees-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (portalEmployees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No employees found.</td></tr>';
        return;
    }
    
    portalEmployees.forEach(emp => {
        tbody.innerHTML += `
            <tr>
                <td>${emp.id}</td>
                <td><strong>${emp.name}</strong></td>
                <td><span class="role-badge" style="background: rgba(168, 85, 247, 0.15); color: var(--primary); font-size:11px; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${emp.role}</span></td>
                <td><code>${emp.username}</code></td>
                <td class="text-center">
                    <button class="btn btn-danger btn-xs" onclick="deleteEmployee(${emp.id})" title="Delete Employee"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

window.openEmployeeModal = function() {
    document.getElementById('employee-modal').style.display = 'flex';
    document.getElementById('employee-form').reset();
    document.getElementById('emp-id-input').value = '';
};

window.closeEmployeeModal = function() {
    document.getElementById('employee-modal').style.display = 'none';
};

window.saveEmployeeForm = async function(event) {
    event.preventDefault();
    const name = document.getElementById('emp-name-input').value;
    const role = document.getElementById('emp-role-input').value;
    const username = document.getElementById('emp-username-input').value;
    const password = document.getElementById('emp-password-input').value;
    
    const payload = { name, role, username, password };
    
    try {
        const response = await apiFetch('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
            showToast('Employee saved successfully!', 'success');
            closeEmployeeModal();
            await refreshAllData();
            if (currentPortalTab === 'employees') {
                renderEmployeesTable();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to save employee.', 'error');
    }
};

window.deleteEmployee = async function(id) {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    
    try {
        const response = await apiFetch(`/api/employees/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showToast('Employee deleted successfully.', 'success');
            await refreshAllData();
            if (currentPortalTab === 'employees') {
                renderEmployeesTable();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to delete employee.', 'error');
    }
};

function renderMySalaryTable() {
    const tbody = document.getElementById('my-salary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const loggedInEmployee = portalEmployees.find(e => e.username === currentUser.username);
    const employeeName = loggedInEmployee ? loggedInEmployee.name : '';
    
    if (!employeeName) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading profile name.</td></tr>';
        return;
    }
    
    const mySalaries = expensesList.filter(exp => {
        return exp.employee === employeeName && (exp.category === 'Employees' || exp.sub_category === 'Salary');
    });
    
    if (mySalaries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No salary payments logged yet.</td></tr>';
        return;
    }
    
    mySalaries.forEach(sal => {
        const statusClass = sal.status === 'Paid' ? 'status-approved' : 'status-pending';
        tbody.innerHTML += `
            <tr>
                <td>${sal.date || ''}</td>
                <td><strong>${sal.sub_category || 'Salary'} Payment</strong></td>
                <td>${formatCurrency(sal.amount)}</td>
                <td>${sal.payment_method || 'Bank'}</td>
                <td><span class="status-badge ${statusClass}">${sal.status || 'Pending'}</span></td>
            </tr>
        `;
    });
}

// --- PROJECTS PORTAL CRUD & HELPERS ---
function populateProjectAssignedSelect() {
    const select = document.getElementById('project-assigned-input');
    if (!select) return;
    select.innerHTML = portalEmployees.map(emp => {
        return `<option value="${emp.name}">${emp.name} (${emp.role})</option>`;
    }).join('');
}

function renderProjectsTable() {
    const tbody = document.getElementById('projects-tbody');
    const addBtn = document.getElementById('btn-add-project');
    const subtitle = document.getElementById('projects-subtitle');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const isEmployee = currentUser.role === 'Employee';
    
    if (addBtn) {
        addBtn.style.display = isEmployee ? 'none' : 'inline-block';
    }
    if (subtitle && isEmployee) {
        subtitle.innerText = 'View your assigned projects and update your task completion progress';
    }

    if (projectsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">No projects assigned${isEmployee ? ' to you' : ''} yet.</td></tr>`;
        return;
    }
    
    projectsList.forEach(proj => {
        let statusClass = 'status-pending';
        if (proj.status === 'Completed') statusClass = 'status-approved';
        else if (proj.status === 'On Hold') statusClass = 'status-rejected';
        
        let actionButtons = '';
        if (isEmployee) {
            actionButtons = `<button class="btn btn-primary btn-xs" onclick="openProgressModal(${proj.id})" title="Update Progress"><i class="fa-solid fa-spinner"></i> Update Progress</button>`;
        } else {
            actionButtons = `
                <button class="btn btn-secondary btn-xs" onclick="openProjectModal(${proj.id})" title="Edit Project"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-xs" onclick="deleteProject(${proj.id})" title="Delete Project"><i class="fa-solid fa-trash"></i></button>
            `;
        }
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${proj.name}</strong></td>
                <td>${proj.client_name || ''}</td>
                <td>${proj.assigned_employee || ''}</td>
                <td style="width: 150px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex-grow: 1; height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${proj.progress}%; height: 100%; background: var(--primary); border-radius: 4px;"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: 600; min-width: 32px;">${proj.progress}%</span>
                    </div>
                </td>
                <td><span class="status-badge ${statusClass}">${proj.status}</span></td>
                <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${proj.last_update || ''}">${proj.last_update || 'No updates logged yet.'}</td>
                <td class="text-center">${actionButtons}</td>
            </tr>
        `;
    });
}

window.openProjectModal = function(id = null) {
    populateProjectAssignedSelect();
    document.getElementById('project-modal').style.display = 'flex';
    document.getElementById('project-form').reset();
    document.getElementById('project-id-input').value = '';
    document.getElementById('project-modal-title').innerHTML = `<i class="fa-solid fa-diagram-project"></i> Create Project`;

    if (id) {
        const proj = projectsList.find(p => p.id === id);
        if (proj) {
            document.getElementById('project-id-input').value = proj.id;
            document.getElementById('project-name-input').value = proj.name;
            document.getElementById('project-desc-input').value = proj.description || '';
            document.getElementById('project-client-input').value = proj.client_name || '';
            document.getElementById('project-assigned-input').value = proj.assigned_employee;
            document.getElementById('project-progress-input').value = proj.progress;
            document.getElementById('project-status-input').value = proj.status;
            document.getElementById('project-update-input').value = proj.last_update || '';
            document.getElementById('project-modal-title').innerHTML = `<i class="fa-solid fa-diagram-project"></i> Edit Project`;
        }
    }
};

window.closeProjectModal = function() {
    document.getElementById('project-modal').style.display = 'none';
};

window.saveProjectForm = async function(event) {
    event.preventDefault();
    const id = document.getElementById('project-id-input').value;
    const name = document.getElementById('project-name-input').value;
    const description = document.getElementById('project-desc-input').value;
    const client_name = document.getElementById('project-client-input').value;
    const assigned_employee = document.getElementById('project-assigned-input').value;
    const progress = document.getElementById('project-progress-input').value;
    const status = document.getElementById('project-status-input').value;
    const last_update = document.getElementById('project-update-input').value;

    const payload = { name, description, client_name, assigned_employee, progress, status, last_update };
    if (id) payload.id = id;

    try {
        const response = await apiFetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
            showToast(id ? 'Project updated successfully!' : 'Project created successfully!', 'success');
            closeProjectModal();
            await refreshAllData();
            if (currentPortalTab === 'projects') {
                renderProjectsTable();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to save project.', 'error');
    }
};

window.deleteProject = async function(id) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
        const response = await apiFetch(`/api/projects/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            showToast('Project deleted successfully.', 'success');
            await refreshAllData();
            if (currentPortalTab === 'projects') {
                renderProjectsTable();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to delete project.', 'error');
    }
};

// --- EMPLOYEE PROGRESS UPDATE HANDLERS ---
window.openProgressModal = function(id) {
    const proj = projectsList.find(p => p.id === id);
    if (!proj) return;

    document.getElementById('prog-project-id').value = proj.id;
    document.getElementById('prog-project-name').value = proj.name;
    document.getElementById('prog-percent-input').value = proj.progress;
    document.getElementById('prog-status-input').value = proj.status;
    document.getElementById('prog-update-input').value = proj.last_update || '';
    
    document.getElementById('progress-modal').style.display = 'flex';
};

window.closeProgressModal = function() {
    document.getElementById('progress-modal').style.display = 'none';
};

window.saveProgressForm = async function(event) {
    event.preventDefault();
    const id = document.getElementById('prog-project-id').value;
    const progress = document.getElementById('prog-percent-input').value;
    const status = document.getElementById('prog-status-input').value;
    const last_update = document.getElementById('prog-update-input').value;

    const payload = { progress, status, last_update };

    try {
        const response = await apiFetch(`/api/projects/${id}/progress`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
            showToast('Project progress updated successfully!', 'success');
            closeProgressModal();
            await refreshAllData();
            if (currentPortalTab === 'projects') {
                renderProjectsTable();
            }
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('Failed to update project progress.', 'error');
    }
};
