const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
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
            documents: [],
            expenses: [],
            income: [],
            expense_claims: [],
            vendors: [],
            subscriptions: [],
            assets: [],
            settings: {},
            balance_history: [],
            employees: [
                { id: 1, name: 'Partha', role: 'Admin', username: 'admin', password: 'rturox@admin' },
                { id: 2, name: 'Sarat', role: 'Admin', username: 'sarat', password: 'rturox@sarat' },
                { id: 3, name: 'Ramesh', role: 'Employee', username: 'ramesh', password: 'rturox@emp' },
                { id: 4, name: 'Suresh', role: 'Employee', username: 'suresh', password: 'rturox@suresh' },
                { id: 5, name: 'Anita', role: 'Accountant', username: 'accountant', password: 'rturox@accounts' },
                { id: 6, name: 'Super Admin', role: 'Super Admin', username: 'superadmin', password: 'rturox@super' }
            ],
            projects: [
                { id: 1, name: 'CRM Enhancement', description: 'Extend portal features and integrate project tracking.', client_name: 'Rturox Technologies', assigned_employee: 'Ramesh', progress: 60, status: 'In Progress', last_update: 'Completed employee listing pages.' },
                { id: 2, name: 'SEO Optimization', description: 'Optimize main landing pages for search engines.', client_name: 'Orbenyx', assigned_employee: 'Suresh', progress: 20, status: 'In Progress', last_update: 'Conducted keyword research.' }
            ]
        };
        fs.writeFileSync(JSON_PATH, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        const content = fs.readFileSync(JSON_PATH, 'utf8');
        const parsed = JSON.parse(content);
        if (!parsed.sequences) parsed.sequences = {};
        if (!parsed.documents) parsed.documents = [];
        if (!parsed.expenses) parsed.expenses = [];
        if (!parsed.income) parsed.income = [];
        if (!parsed.expense_claims) parsed.expense_claims = [];
        if (!parsed.vendors) parsed.vendors = [];
        if (!parsed.subscriptions) parsed.subscriptions = [];
        if (!parsed.assets) parsed.assets = [];
        if (!parsed.settings) parsed.settings = {};
        if (!parsed.balance_history) parsed.balance_history = [];
        if (!parsed.employees) {
            parsed.employees = [
                { id: 1, name: 'Partha', role: 'Admin', username: 'admin', password: 'rturox@admin' },
                { id: 2, name: 'Sarat', role: 'Admin', username: 'sarat', password: 'rturox@sarat' },
                { id: 3, name: 'Ramesh', role: 'Employee', username: 'ramesh', password: 'rturox@emp' },
                { id: 4, name: 'Suresh', role: 'Employee', username: 'suresh', password: 'rturox@suresh' },
                { id: 5, name: 'Anita', role: 'Accountant', username: 'accountant', password: 'rturox@accounts' },
                { id: 6, name: 'Super Admin', role: 'Super Admin', username: 'superadmin', password: 'rturox@super' }
            ];
            fs.writeFileSync(JSON_PATH, JSON.stringify(parsed, null, 2), 'utf8');
        }
        if (!parsed.projects) {
            parsed.projects = [
                { id: 1, name: 'CRM Enhancement', description: 'Extend portal features and integrate project tracking.', client_name: 'Rturox Technologies', assigned_employee: 'Ramesh', progress: 60, status: 'In Progress', last_update: 'Completed employee listing pages.' },
                { id: 2, name: 'SEO Optimization', description: 'Optimize main landing pages for search engines.', client_name: 'Orbenyx', assigned_employee: 'Suresh', progress: 20, status: 'In Progress', last_update: 'Conducted keyword research.' }
            ];
            fs.writeFileSync(JSON_PATH, JSON.stringify(parsed, null, 2), 'utf8');
        }
        return parsed;
    } catch (err) {
        console.error('Error reading JSON database, resetting database.', err);
        return { sequences: {}, documents: [], expenses: [], income: [], expense_claims: [], vendors: [], subscriptions: [], assets: [], settings: {}, balance_history: [], employees: [], projects: [] };
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
                    CREATE TABLE IF NOT EXISTS expenses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        date TEXT,
                        category TEXT,
                        sub_category TEXT,
                        description TEXT,
                        amount REAL,
                        payment_method TEXT,
                        vendor TEXT,
                        employee TEXT,
                        bill_path TEXT,
                        gst TEXT,
                        gst_amount REAL,
                        status TEXT,
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS income (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        client_name TEXT,
                        project TEXT,
                        invoice_number TEXT,
                        amount REAL,
                        gst REAL,
                        payment_received REAL,
                        pending REAL,
                        payment_date TEXT,
                        due_date TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS expense_claims (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        employee TEXT,
                        type TEXT,
                        amount REAL,
                        date TEXT,
                        description TEXT,
                        bill_path TEXT,
                        status TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS vendors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE,
                        phone TEXT,
                        gst_number TEXT,
                        address TEXT,
                        outstanding_balance REAL DEFAULT 0,
                        last_transaction TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS subscriptions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT,
                        renewal_date TEXT,
                        monthly_cost REAL,
                        yearly_cost REAL,
                        reminder TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS assets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT,
                        type TEXT,
                        assigned_employee TEXT,
                        serial_number TEXT,
                        purchase_date TEXT,
                        cost REAL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                `, (err) => {
                    if (err) return reject(err);
                });

                dbInstance.run(`
                    CREATE TABLE IF NOT EXISTS balance_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        old_cash REAL,
                        new_cash REAL,
                        old_bank REAL,
                        new_bank REAL,
                        changed_by TEXT,
                        change_date DATETIME DEFAULT CURRENT_TIMESTAMP
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
                        
                        // Create employees table
                        dbInstance.run(`
                            CREATE TABLE IF NOT EXISTS employees (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT NOT NULL,
                                role TEXT NOT NULL,
                                username TEXT NOT NULL UNIQUE,
                                password TEXT NOT NULL
                            )
                        `, (err3) => {
                            if (err3) return reject(err3);
                            
                            // Seed employees table if empty
                            dbInstance.get('SELECT COUNT(*) as count FROM employees', (err4, row) => {
                                if (err4) return reject(err4);
                                
                                const doneEmployees = () => {
                                    // Create projects table
                                    dbInstance.run(`
                                        CREATE TABLE IF NOT EXISTS projects (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            name TEXT NOT NULL,
                                            description TEXT,
                                            client_name TEXT,
                                            assigned_employee TEXT NOT NULL,
                                            progress INTEGER NOT NULL DEFAULT 0,
                                            status TEXT NOT NULL DEFAULT 'Not Started',
                                            last_update TEXT,
                                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                        )
                                    `, (errProj) => {
                                        if (errProj) return reject(errProj);
                                        
                                        // Seed projects table if empty
                                        dbInstance.get('SELECT COUNT(*) as count FROM projects', (errProjCount, rowProj) => {
                                            if (errProjCount) return reject(errProjCount);
                                            if (rowProj && rowProj.count > 0) {
                                                console.log('SQLite database tables initialized successfully (with projects).');
                                                return resolve();
                                            }
                                            
                                            const projStmt = dbInstance.prepare('INSERT INTO projects (name, description, client_name, assigned_employee, progress, status, last_update) VALUES (?, ?, ?, ?, ?, ?, ?)');
                                            projStmt.run('CRM Enhancement', 'Extend portal features and integrate project tracking.', 'Rturox Technologies', 'Ramesh', 60, 'In Progress', 'Completed employee listing pages.');
                                            projStmt.run('SEO Optimization', 'Optimize main landing pages for search engines.', 'Orbenyx', 'Suresh', 20, 'In Progress', 'Conducted keyword research.');
                                            projStmt.finalize((errProjSeed) => {
                                                if (errProjSeed) return reject(errProjSeed);
                                                console.log('SQLite database tables initialized successfully (with seeded projects).');
                                                resolve();
                                            });
                                        });
                                    });
                                };
                                
                                if (row && row.count > 0) {
                                    return doneEmployees();
                                }
                                
                                const seedStmt = dbInstance.prepare('INSERT INTO employees (name, role, username, password) VALUES (?, ?, ?, ?)');
                                seedStmt.run('Partha', 'Admin', 'admin', 'rturox@admin');
                                seedStmt.run('Sarat', 'Admin', 'sarat', 'rturox@sarat');
                                seedStmt.run('Ramesh', 'Employee', 'ramesh', 'rturox@emp');
                                seedStmt.run('Suresh', 'Employee', 'suresh', 'rturox@suresh');
                                seedStmt.run('Anita', 'Accountant', 'accountant', 'rturox@accounts');
                                seedStmt.run('Super Admin', 'Super Admin', 'superadmin', 'rturox@super');
                                seedStmt.finalize((err5) => {
                                    if (err5) return reject(err5);
                                    doneEmployees();
                                });
                            });
                        });
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
                    if (!parsed.expenses) parsed.expenses = [];
                    if (!parsed.income) parsed.income = [];
                    if (!parsed.expense_claims) parsed.expense_claims = [];
                    if (!parsed.vendors) parsed.vendors = [];
                    if (!parsed.subscriptions) parsed.subscriptions = [];
                    if (!parsed.assets) parsed.assets = [];
                    
                    fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2), 'utf8');
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
    },

    // EXPENSES CRUD
    getExpenses: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                const sorted = [...data.expenses].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
                return resolve(sorted);
            }
            dbInstance.all('SELECT * FROM expenses ORDER BY date DESC, id DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveExpense: (exp) => {
        return new Promise((resolve, reject) => {
            const amount = parseFloat(exp.amount) || 0;
            const gst_amount = parseFloat(exp.gst_amount) || 0;
            const date = exp.date || new Date().toISOString().split('T')[0];

            if (useJsonDb) {
                const data = readJsonDb();
                if (exp.id) {
                    const idx = data.expenses.findIndex(e => e.id === parseInt(exp.id, 10));
                    if (idx > -1) {
                        data.expenses[idx] = { ...data.expenses[idx], ...exp, id: parseInt(exp.id, 10), amount, gst_amount, date };
                    } else {
                        return reject(new Error('Expense not found'));
                    }
                } else {
                    const newId = data.expenses.length > 0 ? Math.max(...data.expenses.map(e => e.id)) + 1 : 1;
                    data.expenses.push({ ...exp, id: newId, amount, gst_amount, date });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (exp.id) {
                dbInstance.run(
                    `UPDATE expenses SET date = ?, category = ?, sub_category = ?, description = ?, amount = ?, payment_method = ?, vendor = ?, employee = ?, bill_path = ?, gst = ?, gst_amount = ?, status = ?, notes = ? WHERE id = ?`,
                    [date, exp.category, exp.sub_category, exp.description, amount, exp.payment_method, exp.vendor, exp.employee, exp.bill_path, exp.gst, gst_amount, exp.status, exp.notes, parseInt(exp.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO expenses (date, category, sub_category, description, amount, payment_method, vendor, employee, bill_path, gst, gst_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [date, exp.category, exp.sub_category, exp.description, amount, exp.payment_method, exp.vendor, exp.employee, exp.bill_path, exp.gst, gst_amount, exp.status, exp.notes],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteExpense: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.expenses = data.expenses.filter(e => e.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM expenses WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // INCOME CRUD
    getIncome: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                const sorted = [...data.income].sort((a, b) => new Date(b.payment_date || b.due_date) - new Date(a.payment_date || a.due_date) || b.id - a.id);
                return resolve(sorted);
            }
            dbInstance.all('SELECT * FROM income ORDER BY payment_date DESC, due_date DESC, id DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveIncome: (inc) => {
        return new Promise((resolve, reject) => {
            const amount = parseFloat(inc.amount) || 0;
            const gst = parseFloat(inc.gst) || 0;
            const payment_received = parseFloat(inc.payment_received) || 0;
            const pending = parseFloat(inc.pending) || 0;

            if (useJsonDb) {
                const data = readJsonDb();
                if (inc.id) {
                    const idx = data.income.findIndex(i => i.id === parseInt(inc.id, 10));
                    if (idx > -1) {
                        data.income[idx] = { ...data.income[idx], ...inc, id: parseInt(inc.id, 10), amount, gst, payment_received, pending };
                    } else {
                        return reject(new Error('Income entry not found'));
                    }
                } else {
                    const newId = data.income.length > 0 ? Math.max(...data.income.map(i => i.id)) + 1 : 1;
                    data.income.push({ ...inc, id: newId, amount, gst, payment_received, pending });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (inc.id) {
                dbInstance.run(
                    `UPDATE income SET client_name = ?, project = ?, invoice_number = ?, amount = ?, gst = ?, payment_received = ?, pending = ?, payment_date = ?, due_date = ? WHERE id = ?`,
                    [inc.client_name, inc.project, inc.invoice_number, amount, gst, payment_received, pending, inc.payment_date, inc.due_date, parseInt(inc.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO income (client_name, project, invoice_number, amount, gst, payment_received, pending, payment_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [inc.client_name, inc.project, inc.invoice_number, amount, gst, payment_received, pending, inc.payment_date, inc.due_date],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteIncome: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.income = data.income.filter(i => i.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM income WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // CLAIMS CRUD
    getClaims: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                const sorted = [...data.expense_claims].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
                return resolve(sorted);
            }
            dbInstance.all('SELECT * FROM expense_claims ORDER BY date DESC, id DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveClaim: (claim) => {
        return new Promise((resolve, reject) => {
            const amount = parseFloat(claim.amount) || 0;
            const date = claim.date || new Date().toISOString().split('T')[0];
            const status = claim.status || 'Pending';

            if (useJsonDb) {
                const data = readJsonDb();
                if (claim.id) {
                    const idx = data.expense_claims.findIndex(c => c.id === parseInt(claim.id, 10));
                    if (idx > -1) {
                        data.expense_claims[idx] = { ...data.expense_claims[idx], ...claim, id: parseInt(claim.id, 10), amount, date, status };
                    } else {
                        return reject(new Error('Claim not found'));
                    }
                } else {
                    const newId = data.expense_claims.length > 0 ? Math.max(...data.expense_claims.map(c => c.id)) + 1 : 1;
                    data.expense_claims.push({ ...claim, id: newId, amount, date, status });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (claim.id) {
                dbInstance.run(
                    `UPDATE expense_claims SET employee = ?, type = ?, amount = ?, date = ?, description = ?, bill_path = ?, status = ? WHERE id = ?`,
                    [claim.employee, claim.type, amount, date, claim.description, claim.bill_path, status, parseInt(claim.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO expense_claims (employee, type, amount, date, description, bill_path, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [claim.employee, claim.type, amount, date, claim.description, claim.bill_path, status],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    updateClaimStatus: (id, status) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                const idx = data.expense_claims.findIndex(c => c.id === intId);
                if (idx > -1) {
                    data.expense_claims[idx].status = status;
                    writeJsonDb(data);
                    return resolve({ success: true });
                }
                return reject(new Error('Claim not found'));
            }
            dbInstance.run('UPDATE expense_claims SET status = ? WHERE id = ?', [status, intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    deleteClaim: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.expense_claims = data.expense_claims.filter(c => c.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM expense_claims WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // VENDORS CRUD
    getVendors: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.vendors);
            }
            dbInstance.all('SELECT * FROM vendors ORDER BY name ASC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveVendor: (vendor) => {
        return new Promise((resolve, reject) => {
            const outstanding_balance = parseFloat(vendor.outstanding_balance) || 0;

            if (useJsonDb) {
                const data = readJsonDb();
                if (vendor.id) {
                    const idx = data.vendors.findIndex(v => v.id === parseInt(vendor.id, 10));
                    if (idx > -1) {
                        data.vendors[idx] = { ...data.vendors[idx], ...vendor, id: parseInt(vendor.id, 10), outstanding_balance };
                    } else {
                        return reject(new Error('Vendor not found'));
                    }
                } else {
                    // Check duplicate name
                    if (data.vendors.some(v => v.name.toLowerCase() === vendor.name.toLowerCase())) {
                        return reject(new Error('Vendor name already exists'));
                    }
                    const newId = data.vendors.length > 0 ? Math.max(...data.vendors.map(v => v.id)) + 1 : 1;
                    data.vendors.push({ ...vendor, id: newId, outstanding_balance });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (vendor.id) {
                dbInstance.run(
                    `UPDATE vendors SET name = ?, phone = ?, gst_number = ?, address = ?, outstanding_balance = ?, last_transaction = ? WHERE id = ?`,
                    [vendor.name, vendor.phone, vendor.gst_number, vendor.address, outstanding_balance, vendor.last_transaction, parseInt(vendor.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO vendors (name, phone, gst_number, address, outstanding_balance, last_transaction) VALUES (?, ?, ?, ?, ?, ?)`,
                    [vendor.name, vendor.phone, vendor.gst_number, vendor.address, outstanding_balance, vendor.last_transaction],
                    function(err) {
                        if (err) {
                            if (err.message.includes('UNIQUE')) {
                                return reject(new Error('Vendor name already exists'));
                            }
                            return reject(err);
                        }
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteVendor: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.vendors = data.vendors.filter(v => v.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM vendors WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // SUBSCRIPTIONS CRUD
    getSubscriptions: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.subscriptions);
            }
            dbInstance.all('SELECT * FROM subscriptions ORDER BY renewal_date ASC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveSubscription: (sub) => {
        return new Promise((resolve, reject) => {
            const monthly_cost = parseFloat(sub.monthly_cost) || 0;
            const yearly_cost = parseFloat(sub.yearly_cost) || 0;

            if (useJsonDb) {
                const data = readJsonDb();
                if (sub.id) {
                    const idx = data.subscriptions.findIndex(s => s.id === parseInt(sub.id, 10));
                    if (idx > -1) {
                        data.subscriptions[idx] = { ...data.subscriptions[idx], ...sub, id: parseInt(sub.id, 10), monthly_cost, yearly_cost };
                    } else {
                        return reject(new Error('Subscription not found'));
                    }
                } else {
                    const newId = data.subscriptions.length > 0 ? Math.max(...data.subscriptions.map(s => s.id)) + 1 : 1;
                    data.subscriptions.push({ ...sub, id: newId, monthly_cost, yearly_cost });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (sub.id) {
                dbInstance.run(
                    `UPDATE subscriptions SET name = ?, renewal_date = ?, monthly_cost = ?, yearly_cost = ?, reminder = ? WHERE id = ?`,
                    [sub.name, sub.renewal_date, monthly_cost, yearly_cost, sub.reminder, parseInt(sub.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO subscriptions (name, renewal_date, monthly_cost, yearly_cost, reminder) VALUES (?, ?, ?, ?, ?)`,
                    [sub.name, sub.renewal_date, monthly_cost, yearly_cost, sub.reminder],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteSubscription: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.subscriptions = data.subscriptions.filter(s => s.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM subscriptions WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // ASSETS CRUD
    getAssets: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.assets);
            }
            dbInstance.all('SELECT * FROM assets ORDER BY purchase_date DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveAsset: (asset) => {
        return new Promise((resolve, reject) => {
            const cost = parseFloat(asset.cost) || 0;

            if (useJsonDb) {
                const data = readJsonDb();
                if (asset.id) {
                    const idx = data.assets.findIndex(a => a.id === parseInt(asset.id, 10));
                    if (idx > -1) {
                        data.assets[idx] = { ...data.assets[idx], ...asset, id: parseInt(asset.id, 10), cost };
                    } else {
                        return reject(new Error('Asset not found'));
                    }
                } else {
                    const newId = data.assets.length > 0 ? Math.max(...data.assets.map(a => a.id)) + 1 : 1;
                    data.assets.push({ ...asset, id: newId, cost });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (asset.id) {
                dbInstance.run(
                    `UPDATE assets SET name = ?, type = ?, assigned_employee = ?, serial_number = ?, purchase_date = ?, cost = ? WHERE id = ?`,
                    [asset.name, asset.type, asset.assigned_employee, asset.serial_number, asset.purchase_date, cost, parseInt(asset.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO assets (name, type, assigned_employee, serial_number, purchase_date, cost) VALUES (?, ?, ?, ?, ?, ?)`,
                    [asset.name, asset.type, asset.assigned_employee, asset.serial_number, asset.purchase_date, cost],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteAsset: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.assets = data.assets.filter(a => a.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM assets WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // SETTINGS CRUD
    getSettings: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.settings || {});
            }
            dbInstance.all('SELECT * FROM settings', [], (err, rows) => {
                if (err) return reject(err);
                const settingsObj = {};
                rows.forEach(r => {
                    settingsObj[r.key] = r.value;
                });
                resolve(settingsObj);
            });
        });
    },

    saveSetting: (key, value) => {
        return new Promise((resolve, reject) => {
            const valStr = String(value);
            if (useJsonDb) {
                const data = readJsonDb();
                if (!data.settings) data.settings = {};
                data.settings[key] = valStr;
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run(
                'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                [key, valStr],
                (err) => {
                    if (err) return reject(err);
                    resolve({ success: true });
                }
            );
        });
    },

    // BALANCE CHANGE LOGS CRUD
    getBalanceHistory: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                const list = [...(data.balance_history || [])];
                list.sort((a, b) => new Date(b.change_date) - new Date(a.change_date));
                return resolve(list);
            }
            dbInstance.all('SELECT * FROM balance_history ORDER BY change_date DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    logBalanceChange: (oldCash, newCash, oldBank, newBank, changedBy) => {
        return new Promise((resolve, reject) => {
            const changeDate = new Date().toISOString();
            if (useJsonDb) {
                const data = readJsonDb();
                if (!data.balance_history) data.balance_history = [];
                data.balance_history.push({
                    id: data.balance_history.length + 1,
                    old_cash: parseFloat(oldCash) || 0,
                    new_cash: parseFloat(newCash) || 0,
                    old_bank: parseFloat(oldBank) || 0,
                    new_bank: parseFloat(newBank) || 0,
                    changed_by: changedBy,
                    change_date: changeDate
                });
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run(
                'INSERT INTO balance_history (old_cash, new_cash, old_bank, new_bank, changed_by, change_date) VALUES (?, ?, ?, ?, ?, ?)',
                [parseFloat(oldCash) || 0, parseFloat(newCash) || 0, parseFloat(oldBank) || 0, parseFloat(newBank) || 0, changedBy, changeDate],
                function(err) {
                    if (err) return reject(err);
                    resolve({ success: true, id: this.lastID });
                }
            );
        });
    },

    // EMPLOYEES CRUD
    getEmployees: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.employees || []);
            }
            dbInstance.all('SELECT * FROM employees ORDER BY name ASC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    getEmployeeByUsername: (username) => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                const user = (data.employees || []).find(e => e.username === username);
                return resolve(user);
            }
            dbInstance.get('SELECT * FROM employees WHERE username = ?', [username], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    },

    saveEmployee: (emp) => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                if (!data.employees) data.employees = [];
                if (data.employees.some(e => e.username.toLowerCase() === emp.username.toLowerCase() && e.id !== parseInt(emp.id, 10))) {
                    return reject(new Error('Username already exists'));
                }
                if (emp.id) {
                    const idx = data.employees.findIndex(e => e.id === parseInt(emp.id, 10));
                    if (idx > -1) {
                        data.employees[idx] = { ...data.employees[idx], ...emp, id: parseInt(emp.id, 10) };
                    } else {
                        return reject(new Error('Employee not found'));
                    }
                } else {
                    const newId = data.employees.length > 0 ? Math.max(...data.employees.map(e => e.id)) + 1 : 1;
                    data.employees.push({ ...emp, id: newId });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (emp.id) {
                dbInstance.run(
                    `UPDATE employees SET name = ?, role = ?, username = ?, password = ? WHERE id = ?`,
                    [emp.name, emp.role, emp.username, emp.password, parseInt(emp.id, 10)],
                    (err) => {
                        if (err) {
                            if (err.message.includes('UNIQUE')) {
                                return reject(new Error('Username already exists'));
                            }
                            return reject(err);
                        }
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO employees (name, role, username, password) VALUES (?, ?, ?, ?)`,
                    [emp.name, emp.role, emp.username, emp.password],
                    function(err) {
                        if (err) {
                            if (err.message.includes('UNIQUE')) {
                                return reject(new Error('Username already exists'));
                            }
                            return reject(err);
                        }
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteEmployee: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.employees = (data.employees || []).filter(e => e.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM employees WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    },

    // PROJECTS CRUD
    getProjects: () => {
        return new Promise((resolve, reject) => {
            if (useJsonDb) {
                const data = readJsonDb();
                return resolve(data.projects || []);
            }
            dbInstance.all('SELECT * FROM projects ORDER BY created_at DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    saveProject: (proj) => {
        return new Promise((resolve, reject) => {
            const progress = parseInt(proj.progress, 10) || 0;
            if (useJsonDb) {
                const data = readJsonDb();
                if (!data.projects) data.projects = [];
                if (proj.id) {
                    const idx = data.projects.findIndex(p => p.id === parseInt(proj.id, 10));
                    if (idx > -1) {
                        data.projects[idx] = { ...data.projects[idx], ...proj, id: parseInt(proj.id, 10), progress };
                    } else {
                        return reject(new Error('Project not found'));
                    }
                } else {
                    const newId = data.projects.length > 0 ? Math.max(...data.projects.map(p => p.id)) + 1 : 1;
                    data.projects.push({ ...proj, id: newId, progress });
                }
                writeJsonDb(data);
                return resolve({ success: true });
            }

            if (proj.id) {
                dbInstance.run(
                    `UPDATE projects SET name = ?, description = ?, client_name = ?, assigned_employee = ?, progress = ?, status = ?, last_update = ? WHERE id = ?`,
                    [proj.name, proj.description, proj.client_name, proj.assigned_employee, progress, proj.status, proj.last_update, parseInt(proj.id, 10)],
                    (err) => {
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            } else {
                dbInstance.run(
                    `INSERT INTO projects (name, description, client_name, assigned_employee, progress, status, last_update) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [proj.name, proj.description, proj.client_name, proj.assigned_employee, progress, proj.status, proj.last_update],
                    function(err) {
                        if (err) return reject(err);
                        resolve({ success: true, id: this.lastID });
                    }
                );
            }
        });
    },

    deleteProject: (id) => {
        return new Promise((resolve, reject) => {
            const intId = parseInt(id, 10);
            if (useJsonDb) {
                const data = readJsonDb();
                data.projects = (data.projects || []).filter(p => p.id !== intId);
                writeJsonDb(data);
                return resolve({ success: true });
            }
            dbInstance.run('DELETE FROM projects WHERE id = ?', [intId], (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    }
};

module.exports = db;
