const fs = require('fs');
const path = require('path');
const os = require('os');

// On Vercel/serverless, /var/task is read-only — use /tmp for all writable paths
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_DIR = IS_SERVERLESS
    ? path.join(os.tmpdir(), 'rturox_data')
    : path.join(__dirname, 'data');

try {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
} catch (e) {
    console.warn('Could not create DB_DIR:', DB_DIR, e.message);
}

const SQLITE_PATH = path.join(DB_DIR, 'database.sqlite');
const JSON_PATH = path.join(DB_DIR, 'db.json');

let useJsonDb = false;
let dbInstance = null;

// Try loading sqlite3
try {
    const sqlite3 = require('sqlite3').verbose();
    dbInstance = new sqlite3.Database(SQLITE_PATH);
    console.log('Successfully connected to SQLite database.');
} catch (err) {
    console.warn('SQLite3 import failed or failed to open database. Falling back to JSON database.', err.message);
    useJsonDb = true;
}

// Prefix configuration
const PREFIXES = {
    quotation: 'QT',
    invoice: 'INV',
    receipt: 'REC',
    voucher: 'VOU',
    expense: 'EXP',
    labour: 'LAB',
    handover: 'HND',
    letterpad: 'LET'
};

// ----------------------------------------------------
// JSON DATABASE FALLBACK IMPLEMENTATION
// ----------------------------------------------------
function readJsonDb() {
    if (!fs.existsSync(JSON_PATH)) {
        const initial = {
            sequences: { quotation: 1, invoice: 1, receipt: 1, voucher: 1, expense: 1, labour: 1, handover: 1, letterpad: 1 },
            documents: []
        };
        fs.writeFileSync(JSON_PATH, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        const content = fs.readFileSync(JSON_PATH, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error('Error reading JSON database, resetting database.', err);
        return { sequences: {}, documents: [] };
    }
}

function writeJsonDb(data) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ----------------------------------------------------
// DATABASE API (EXPOSES PROMISE INTERFACES)
// ----------------------------------------------------
const db = {
    init: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                // Ensure JSON structure exists
                readJsonDb();
                console.log('JSON database initialized successfully.');
                return resolve();
            }

            // SQLite init
            dbInstance.serialize(() => {
                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        doc_type TEXT NOT NULL,
                        doc_no TEXT NOT NULL,
                        client_name TEXT,
                        date TEXT,
                        data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS document_sequences (
                        doc_type TEXT PRIMARY KEY,
                        next_val INTEGER NOT NULL DEFAULT 1
                    )
                `, (err) => {
                    if (err) return reject(err);

                    // Insert default sequences
                    const stmt = dbInstance.prepare(`
                        INSERT OR IGNORE INTO document_sequences (doc_type, next_val) VALUES (?, 1)
                    `);
                    Object.keys(PREFIXES).forEach(type => {
                        stmt.run(type);
                    });
                    stmt.finalize((err2) => {
                        if (err2) return reject(err2);
                        console.log('SQLite database tables initialized successfully.');
                        resolve();
                    });
                });
            });
        });
    },

    getNextNumber: (docType) => {
        return new Promise((resolve, reject) => {
            const prefix = PREFIXES[docType] || 'DOC';
            if (useJsonDb) {
                const data = readJsonDb();
                if (!data.sequences) data.sequences = {};
                if (!data.sequences[docType]) data.sequences[docType] = 1;
                
                const nextVal = data.sequences[docType];
                const docNo = `${prefix}-${String(nextVal).padStart(4, '0')}`;
                return resolve(docNo);
            }

            // SQLite
            dbInstance.get(
                `SELECT next_val FROM document_sequences WHERE doc_type = ?`,
                [docType],
                (err, row) => {
                    if (err) return reject(err);
                    const nextVal = row ? row.next_val : 1;
                    const docNo = `${prefix}-${String(nextVal).padStart(4, '0')}`;
                    resolve(docNo);
                }
            );
        });
    },

    saveDocument: (docType, docNo, clientName, docData) => {
        return new Promise(async (resolve, reject) => {
            const dataStr = JSON.stringify(docData);
            const date = docData.date || new Date().toISOString().split('T')[0];

            if (useJsonDb) {
                const data = readJsonDb();
                
                // Add or update document
                const existingIndex = data.documents.findIndex(d => d.doc_type === docType && d.doc_no === docNo);
                if (existingIndex > -1) {
                    data.documents[existingIndex] = {
                        id: data.documents[existingIndex].id,
                        doc_type: docType,
                        doc_no: docNo,
                        client_name: clientName,
                        date: date,
                        data: dataStr,
                        created_at: data.documents[existingIndex].created_at || new Date().toISOString()
                    };
                } else {
                    const newId = data.documents.length > 0 ? Math.max(...data.documents.map(d => d.id)) + 1 : 1;
                    data.documents.push({
                        id: newId,
                        doc_type: docType,
                        doc_no: docNo,
                        client_name: clientName,
                        date: date,
                        data: dataStr,
                        created_at: new Date().toISOString()
                    });

                    // Increment the counter for this sequence if it matched the current next number
                    const nextVal = data.sequences[docType] || 1;
                    const expectedDocNo = `${PREFIXES[docType] || 'DOC'}-${String(nextVal).padStart(4, '0')}`;
                    if (docNo === expectedDocNo) {
                        data.sequences[docType] = nextVal + 1;
                    }
                }
                
                writeJsonDb(data);
                return resolve({ success: true });
            }

            // SQLite transaction
            dbInstance.serialize(() => {
                dbInstance.run('BEGIN TRANSACTION');

                // Check if document already exists
                dbInstance.get(
                    `SELECT id FROM documents WHERE doc_type = ? AND doc_no = ?`,
                    [docType, docNo],
                    (err, row) => {
                        if (err) {
                            dbInstance.run('ROLLBACK');
                            return reject(err);
                        }

                        if (row) {
                            // Update
                            dbInstance.run(
                                `UPDATE documents SET client_name = ?, date = ?, data = ? WHERE id = ?`,
                                [clientName, date, dataStr, row.id],
                                (err2) => {
                                    if (err2) {
                                        dbInstance.run('ROLLBACK');
                                        return reject(err2);
                                    }
                                    dbInstance.run('COMMIT', (errComm) => {
                                        if (errComm) return reject(errComm);
                                        resolve({ success: true });
                                    });
                                }
                            );
                        } else {
                            // Insert
                            dbInstance.run(
                                `INSERT INTO documents (doc_type, doc_no, client_name, date, data) VALUES (?, ?, ?, ?, ?)`,
                                [docType, docNo, clientName, date, dataStr],
                                function(err2) {
                                    if (err2) {
                                        dbInstance.run('ROLLBACK');
                                        return reject(err2);
                                    }
                                    
                                    // Check if we should increment sequence
                                    const lastId = this.lastID;
                                    dbInstance.get(
                                        `SELECT next_val FROM document_sequences WHERE doc_type = ?`,
                                        [docType],
                                        (err3, seqRow) => {
                                            if (err3) {
                                                dbInstance.run('ROLLBACK');
                                                return reject(err3);
                                            }
                                            
                                            const nextVal = seqRow ? seqRow.next_val : 1;
                                            const prefix = PREFIXES[docType] || 'DOC';
                                            const expectedDocNo = `${prefix}-${String(nextVal).padStart(4, '0')}`;
                                            
                                            if (docNo === expectedDocNo) {
                                                dbInstance.run(
                                                    `UPDATE document_sequences SET next_val = next_val + 1 WHERE doc_type = ?`,
                                                    [docType],
                                                    (err4) => {
                                                        if (err4) {
                                                            dbInstance.run('ROLLBACK');
                                                            return reject(err4);
                                                        }
                                                        dbInstance.run('COMMIT', (errComm) => {
                                                            if (errComm) return reject(errComm);
                                                            resolve({ success: true });
                                                        });
                                                    }
                                                );
                                            } else {
                                                dbInstance.run('COMMIT', (errComm) => {
                                                    if (errComm) return reject(errComm);
                                                    resolve({ success: true });
                                                });
                                            }
                                        }
                                    );
                                }
                            );
                        }
                    }
                );
            });
        });
    },

    getAllDocuments: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                // Sort by date/created_at desc
                const sorted = [...data.documents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                return resolve(sorted.map(d => ({
                    id: d.id,
                    doc_type: d.doc_type,
                    doc_no: d.doc_no,
                    client_name: d.client_name,
                    date: d.date,
                    data: d.data,
                    created_at: d.created_at
                })));
            }

            // SQLite
            dbInstance.all(
                `SELECT id, doc_type, doc_no, client_name, date, data, created_at FROM documents ORDER BY created_at DESC`,
                [],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
    },

    getDocument: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                const doc = data.documents.find(d => d.id === intId);
                if (!doc) return resolve(null);
                
                return resolve({
                    id: doc.id,
                    doc_type: doc.doc_type,
                    doc_no: doc.doc_no,
                    client_name: doc.client_name,
                    date: doc.date,
                    data: JSON.parse(doc.data),
                    created_at: doc.created_at
                });
            }

            // SQLite
            dbInstance.get(
                `SELECT * FROM documents WHERE id = ?`,
                [intId],
                (err, row) => {
                    if (err) return reject(err);
                    if (!row) return resolve(null);
                    
                    resolve({
                        id: row.id,
                        doc_type: row.doc_type,
                        doc_no: row.doc_no,
                        client_name: row.client_name,
                        date: row.date,
                        data: JSON.parse(row.data),
                        created_at: row.created_at
                    });
                }
            );
        });
    },

    deleteDocument: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                const initialLen = data.documents.length;
                data.documents = data.documents.filter(d => d.id !== intId);
                if (data.documents.length === initialLen) {
                    return resolve({ success: false, message: 'Document not found' });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            // SQLite
            dbInstance.run(
                `DELETE FROM documents WHERE id = ?`,
                [intId],
                function(err) {
                    if (err) return reject(err);
                    if (this.changes === 0) {
                        return resolve({ success: false, message: 'Document not found' });
                    }
                    resolve({ success: true });
                }
            );
        });
    },

    getDatabasePath: () => {
        return useJsonDb ? JSON_PATH : SQLITE_PATH;
    },

    isJsonDb: () => {
        return useJsonDb;
    },

    restoreDatabase: (srcPath) => {
        return new Promise((resolve, reject) => {
            const destPath = db.getDatabasePath();
            
            if (useJsonDb) {
                // Read uploaded file to ensure it's valid JSON
                try {
                    const content = fs.readFileSync(srcPath, 'utf8');
                    const parsed = JSON.parse(content);
                    if (!parsed.sequences || !Array.isArray(parsed.documents)) {
                        return reject(new Error('Invalid backup file format for JSON DB.'));
                    }
                    fs.copyFileSync(srcPath, destPath);
                    console.log('JSON database restored successfully.');
                    resolve({ success: true });
                } catch (err) {
                    reject(err);
                }
            } else {
                // SQLite restore
                // Close current db first
                dbInstance.close((errClose) => {
                    if (errClose) console.error('Error closing SQLite DB before restore:', errClose);
                    
                    try {
                        fs.copyFileSync(srcPath, destPath);
                        // Re-open DB
                        const sqlite3 = require('sqlite3').verbose();
                        dbInstance = new sqlite3.Database(SQLITE_PATH);
                        console.log('SQLite database restored successfully.');
                        resolve({ success: true });
                    } catch (errCopy) {
                        // Re-open DB anyway
                        const sqlite3 = require('sqlite3').verbose();
                        dbInstance = new sqlite3.Database(SQLITE_PATH);
                        reject(errCopy);
                    }
                });
            }
        });
    }
};

module.exports = db;
