const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload directory for restorations
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const uploadDir = isVercel ? '/tmp/temp_uploads' : path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Middlewares
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Setup upload directory for bills
const billUploadDir = isVercel ? '/tmp/bill_uploads' : path.join(__dirname, 'data', 'bill_uploads');
if (!fs.existsSync(billUploadDir)) {
    fs.mkdirSync(billUploadDir, { recursive: true });
}
const billStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, billUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadBill = multer({ storage: billStorage });
app.use('/uploads', express.static(billUploadDir));

// ----------------------------------------------------
// API ENDPOINTS (AUTHENTICATION)
// ----------------------------------------------------

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rturox@123';
const TOKEN_SECRET = 'rturox-secure-session-token-2026';

const ROLES = {
    SUPERADMIN: 'Super Admin',
    ADMIN: 'Admin',
    ACCOUNTANT: 'Accountant',
    EMPLOYEE: 'Employee'
};

const USER_CREDENTIALS = [
    { username: 'superadmin', password: 'rturox@super', role: ROLES.SUPERADMIN, token: 'rturox-session-superadmin' },
    { username: 'admin', password: 'rturox@admin', role: ROLES.ADMIN, token: 'rturox-session-admin' },
    { username: 'accountant', password: 'rturox@accounts', role: ROLES.ACCOUNTANT, token: 'rturox-session-accountant' },
    { username: 'employee', password: 'rturox@emp', role: ROLES.EMPLOYEE, token: 'rturox-session-employee' }
];

// Unprotected Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Query database first
        const user = await db.getEmployeeByUsername(username);
        if (user && user.password === password) {
            // Generate mock session token: 'rturox-session-' + role.toLowerCase() + '-' + username
            const mockToken = `rturox-session-${user.role.replace(/\s+/g, '').toLowerCase()}-${user.username}`;
            return res.json({ success: true, token: mockToken, role: user.role, username: user.username });
        }
    } catch (e) {
        console.error('Login database query error, using fallbacks:', e);
    }
    
    // Fallback hardcoded USER_CREDENTIALS array check
    const hardcodedUser = USER_CREDENTIALS.find(u => u.username === username && u.password === password);
    if (hardcodedUser) {
        return res.json({ success: true, token: hardcodedUser.token, role: hardcodedUser.role, username: hardcodedUser.username });
    }
    
    // Fallback original credentials from environment variables
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: 'rturox-session-superadmin-admin', role: ROLES.SUPERADMIN, username: 'admin' });
    }
    
    res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// Authentication middleware for subsequent API routes
async function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (token === TOKEN_SECRET) {
        req.userRole = ROLES.SUPERADMIN;
        req.username = 'admin';
        return next();
    }

    try {
        // Check dynamic database tokens: 'rturox-session-<role>-<username>'
        if (token.startsWith('rturox-session-')) {
            const parts = token.split('-');
            if (parts.length >= 4) {
                const username = parts[parts.length - 1];
                const user = await db.getEmployeeByUsername(username);
                if (user) {
                    req.userRole = user.role;
                    req.username = user.username;
                    return next();
                }
            }
        }

        // Fallback USER_CREDENTIALS check
        const user = USER_CREDENTIALS.find(u => u.token === token);
        if (user) {
            req.userRole = user.role;
            req.username = user.username;
            return next();
        }
    } catch (e) {
        console.error('Auth check error:', e);
    }
    
    res.status(401).json({ success: false, error: 'Unauthorized' });
}

// Protect all following api routes
app.use('/api', authenticateAdmin);

// Employees Management Endpoints
app.get('/api/employees', async (req, res) => {
    try {
        const list = await db.getEmployees();
        res.json({ success: true, employees: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employees', async (req, res) => {
    if (req.userRole !== ROLES.SUPERADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Super Admins can manage employees.' });
    }
    try {
        const result = await db.saveEmployee(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    if (req.userRole !== ROLES.SUPERADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Super Admins can manage employees.' });
    }
    const targetId = req.params.id;
    try {
        // Prevent deleting own account
        const list = await db.getEmployees();
        const self = list.find(e => e.username === req.username);
        if (self && self.id === parseInt(targetId, 10)) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account.' });
        }

        const result = await db.deleteEmployee(targetId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Projects Management Endpoints
app.get('/api/projects', async (req, res) => {
    try {
        const list = await db.getProjects();
        if (req.userRole === ROLES.EMPLOYEE) {
            const employees = await db.getEmployees();
            const self = employees.find(e => e.username === req.username);
            const employeeName = self ? self.name : '';
            const filtered = list.filter(p => p.assigned_employee === employeeName);
            return res.json({ success: true, projects: filtered });
        }
        res.json({ success: true, projects: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied: Employees cannot create projects.' });
    }
    try {
        const result = await db.saveProject(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied: Employees cannot delete projects.' });
    }
    try {
        const result = await db.deleteProject(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.patch('/api/projects/:id/progress', async (req, res) => {
    const projId = req.params.id;
    const { progress, status, last_update } = req.body;
    
    try {
        const list = await db.getProjects();
        const proj = list.find(p => p.id === parseInt(projId, 10));
        if (!proj) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        if (req.userRole === ROLES.EMPLOYEE) {
            const employees = await db.getEmployees();
            const self = employees.find(e => e.username === req.username);
            const employeeName = self ? self.name : '';
            if (proj.assigned_employee !== employeeName) {
                return res.status(403).json({ success: false, error: 'Access denied: Cannot update progress on other employees projects.' });
            }
        }
        
        proj.progress = progress;
        proj.status = status;
        proj.last_update = last_update;
        
        const result = await db.saveProject(proj);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ----------------------------------------------------
// EXPENSE TRACKER & FINANCIAL MODULE ENDPOINTS
// ----------------------------------------------------

// File Upload endpoint for receipts
app.post('/api/upload_bill', uploadBill.single('bill_file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
});

// Expenses
app.get('/api/expenses', async (req, res) => {
    try {
        const list = await db.getExpenses();
        res.json({ success: true, expenses: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied: Employees cannot manage company expenses.' });
    }
    try {
        const result = await db.saveExpense(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteExpense(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Income
app.get('/api/income', async (req, res) => {
    try {
        const list = await db.getIncome();
        res.json({ success: true, income: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/income', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Accountants and Super Admins can manage income.' });
    }
    try {
        const result = await db.saveIncome(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/income/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteIncome(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Expense Claims
app.get('/api/claims', async (req, res) => {
    try {
        let list = await db.getClaims();
        if (req.userRole === ROLES.EMPLOYEE) {
            list = list.filter(c => c.employee === req.username);
        }
        res.json({ success: true, claims: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/claims', async (req, res) => {
    try {
        const claimData = { ...req.body };
        if (req.userRole === ROLES.EMPLOYEE) {
            claimData.employee = req.username;
            claimData.status = 'Pending';
        }
        const result = await db.saveClaim(claimData);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/claims/:id/status', async (req, res) => {
    if (req.userRole !== ROLES.ADMIN && req.userRole !== ROLES.SUPERADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Admins can approve or reject expense claims.' });
    }
    try {
        const { status } = req.body;
        const result = await db.updateClaimStatus(req.params.id, status);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/claims/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteClaim(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Vendors
app.get('/api/vendors', async (req, res) => {
    try {
        const list = await db.getVendors();
        res.json({ success: true, vendors: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/vendors', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.saveVendor(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/vendors/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteVendor(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Subscriptions
app.get('/api/subscriptions', async (req, res) => {
    try {
        const list = await db.getSubscriptions();
        res.json({ success: true, subscriptions: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/subscriptions', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ACCOUNTANT) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.saveSubscription(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/subscriptions/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ACCOUNTANT) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteSubscription(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Assets
app.get('/api/assets', async (req, res) => {
    try {
        const list = await db.getAssets();
        res.json({ success: true, assets: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/assets', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ACCOUNTANT) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.saveAsset(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/assets/:id', async (req, res) => {
    if (req.userRole === ROLES.EMPLOYEE || req.userRole === ROLES.ACCOUNTANT) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    try {
        const result = await db.deleteAsset(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Settings API for cash & bank starting balances
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await db.getSettings();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    if (req.userRole !== ROLES.SUPERADMIN && req.userRole !== ROLES.ADMIN) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Admins can edit settings.' });
    }
    try {
        const oldSettings = await db.getSettings();
        const oldCash = oldSettings.initial_cash !== undefined ? oldSettings.initial_cash : 50000;
        const oldBank = oldSettings.initial_bank !== undefined ? oldSettings.initial_bank : 500000;
        
        const newCash = req.body.initial_cash !== undefined ? req.body.initial_cash : oldCash;
        const newBank = req.body.initial_bank !== undefined ? req.body.initial_bank : oldBank;
        
        // Log changes if values differ
        if (parseFloat(oldCash) !== parseFloat(newCash) || parseFloat(oldBank) !== parseFloat(newBank)) {
            const changedBy = req.username || 'System Admin';
            await db.logBalanceChange(oldCash, newCash, oldBank, newBank, changedBy);
        }

        const promises = Object.entries(req.body).map(([key, val]) => {
            return db.saveSetting(key, val);
        });
        await Promise.all(promises);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/settings/history', async (req, res) => {
    try {
        const history = await db.getBalanceHistory();
        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET next auto number for a document type
app.get('/api/next_number/:docType', async (req, res) => {
    const { docType } = req.params;
    try {
        const docNo = await db.getNextNumber(docType);
        res.json({ success: true, doc_no: docNo });
    } catch (err) {
        console.error(`Error fetching next number for ${docType}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST save document (creates new or updates existing)
app.post('/api/save', async (req, res) => {
    const { doc_type, doc_no, client_name, data } = req.body;

    if (!doc_type || !doc_no || data === undefined || data === null) {
        return res.status(400).json({ success: false, error: 'Missing required fields: doc_type, doc_no, and data are required' });
    }

    try {
        const result = await db.saveDocument(doc_type, doc_no, client_name, data);
        res.json(result);
    } catch (err) {
        console.error('Error saving document:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET list of all documents (compact metadata)
app.get('/api/documents', async (req, res) => {
    try {
        const list = await db.getAllDocuments();
        res.json({ success: true, documents: list });
    } catch (err) {
        console.error('Error fetching documents list:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET load full document by ID
app.get('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const document = await db.getDocument(id);
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        res.json({ success: true, document });
    } catch (err) {
        console.error(`Error fetching document ID ${id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE a document
app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.deleteDocument(id);
        res.json(result);
    } catch (err) {
        console.error(`Error deleting document ID ${id}:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET backup database file download
app.get('/api/backup', (req, res) => {
    const dbPath = db.getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ success: false, error: 'Database file not found.' });
    }

    const isJson = db.isJsonDb();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = isJson ? `orbenyx_backup_${dateStr}.json` : `orbenyx_backup_${dateStr}.sqlite`;

    res.download(dbPath, filename, (err) => {
        if (err) {
            console.error('Error sending backup file:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: 'Error preparing backup download.' });
            }
        }
    });
});

// POST restore database file upload
app.post('/api/restore', upload.single('backup_file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No backup file uploaded.' });
    }

    const tempPath = req.file.path;
    try {
        const result = await db.restoreDatabase(tempPath);
        // Clean up temp file
        fs.unlinkSync(tempPath);
        res.json({ success: true, message: 'Database restored successfully! Re-loading portal...' });
    } catch (err) {
        console.error('Error during database restore:', err);
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        res.status(500).json({ success: false, error: `Restore failed: ${err.message}` });
    }
});

// Start server
db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`Orbenyx Portal is running on port ${PORT}`);
        console.log(`Database Mode: ${db.isJsonDb() ? 'JSON File Database Fallback' : 'SQLite Database Connected'}`);
        console.log(`Access Portal locally at: http://localhost:${PORT}`);
        console.log(`==================================================`);
    });
}).catch(err => {
    console.error('Failed to initialize database. Server cannot start.', err);
    process.exit(1);
});

module.exports = app;
