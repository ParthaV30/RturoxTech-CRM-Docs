const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// On Vercel (and other serverless platforms) the filesystem is read-only
// except for /tmp. Use os.tmpdir() for any writable directories.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDir = IS_SERVERLESS
    ? path.join(os.tmpdir(), 'rturox_temp_uploads')
    : path.join(__dirname, 'data', 'temp_uploads');

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (e) {
    console.warn('Could not create uploadDir:', uploadDir, e.message);
}
const upload = multer({ dest: uploadDir });

// Middlewares
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// API ENDPOINTS (AUTHENTICATION)
// ----------------------------------------------------

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rturox@123';
const TOKEN_SECRET = 'rturox-secure-session-token-2026';

// Unprotected Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: TOKEN_SECRET });
    }
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
});

// Authentication middleware for subsequent API routes
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (token === TOKEN_SECRET) {
        return next();
    }
    res.status(401).json({ success: false, error: 'Unauthorized' });
}

// Protect all following api routes
app.use('/api', authenticateAdmin);

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

    if (!doc_type || !doc_no || !client_name || !data) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
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
    const filename = isJson ? `rturox_backup_${dateStr}.json` : `rturox_backup_${dateStr}.sqlite`;

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
        console.log(`Rturox Tech Portal is running on port ${PORT}`);
        console.log(`Database Mode: ${db.isJsonDb() ? 'JSON File Database Fallback' : 'SQLite Database Connected'}`);
        console.log(`Access Portal locally at: http://localhost:${PORT}`);
        console.log(`==================================================`);
    });
}).catch(err => {
    console.error('Failed to initialize database. Server cannot start.', err);
    process.exit(1);
});
