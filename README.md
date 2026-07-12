# Orbenyx — Office Portal & Document Generator

> A fully featured, self-hosted office management and document generation system built for **Orbenyx**, a software studio based in Vadavalli, Coimbatore.

---

## 📋 Overview

The Orbenyx Office Portal is a **single-page web application** backed by a Node.js + Express server. It allows the team to create, preview, save, edit, reprint, and delete professional business documents — all rendered as pixel-perfect A4/slip previews directly in the browser.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 Admin Login | Password-protected access with session token management |
| 📄 8 Document Modules | Proposals, Invoices, Receipts, Vouchers, Developer Contracts, Project Handovers, Expense Memos, Letter Pads |
| 🖨️ Live A4 Preview | Real-time document preview that mirrors physical paper layout |
| 💾 Document Registry | Save, edit, reprint, and delete all documents from a searchable table |
| 🗄️ Dual Database | Auto-switches between SQLite (primary) and JSON file (fallback) |
| 📦 Backup & Restore | One-click database download and upload-based restore |
| 🏢 Orbenyx Branding | Company logo, violet/purple dark theme, digital signatures |

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite 3 (with automatic JSON file fallback)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no frameworks)
- **File Uploads:** Multer
- **Icons:** Font Awesome 6
- **Fonts:** Google Fonts (Outfit, Dancing Script)

---

## 📁 Project Structure

```
d:/CRM/
├── server.js              # Express server — routes, auth middleware, API endpoints
├── db.js                  # Database layer — SQLite/JSON CRUD, auto-numbering
├── package.json           # Dependencies
├── data/
│   ├── database.sqlite    # SQLite database (auto-created on first run)
│   └── db.json            # JSON fallback database (auto-created if SQLite fails)
└── public/
    ├── index.html         # SPA layout — dashboard, modules, modals, login overlay
    ├── index.css          # Styling — dark theme, A4 print rules, login card
    ├── index.js           # Client engine — auth, templates, API calls, preview renderers
    └── logo.png           # Orbenyx company logo
```

---

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### 2. Install Dependencies

```bash
cd d:/CRM
npm install
```

> **Note:** The `sqlite3` package requires native compilation. If it fails on Windows (missing C++ build tools), the system automatically falls back to the JSON file database with full functionality.

### 3. Start the Server

```bash
node server.js
```

The server starts on **port 3000** by default.

```
==================================================
Orbenyx Portal is running on port 3000
Database Mode: SQLite Database Connected
Access Portal locally at: http://localhost:3000
==================================================
```

### 4. Open the Portal

Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔐 Admin Login

The portal is protected by an admin login screen on every visit.

| Field | Default Value |
|---|---|
| **Username** | `admin` |
| **Password** | `` |

### Changing Credentials

You can override the defaults using **environment variables** before starting the server:

```bash
# Windows (PowerShell)
$env:ADMIN_USER="yourname"; $env:ADMIN_PASSWORD="yourpassword"; node server.js

# Linux / macOS
ADMIN_USER=yourname ADMIN_PASSWORD=yourpassword node server.js
```

### Session Behaviour

- On successful login, a session token is stored in the browser's `localStorage`.
- The session persists across page refreshes until the user clicks **Logout**.
- All API endpoints require the session token — an expired/missing token redirects back to the login screen.

---

## 📄 Document Modules

### A4 Full-Page Documents

| Module | Description | Default SAC |
|---|---|---|
| **Project Proposal / Quote** | Software project estimates with line items, specs, and IP transfer terms | — |
| **Billing Invoice** | GST-compliant tax invoice with CGST/SGST calculation | `998313` (IT Services) |
| **Developer Contract** | Freelancer/consultant agreement with milestone holdback & NDA clauses | — |
| **Project Handover** | Deployment sign-off letter with repo/platform references | — |
| **Letter Pad** | General-purpose company letterhead | — |

### 1/3 A4 Compact Slips

| Module | Description |
|---|---|
| **Cash Receipt** | Compact payment received slip |
| **Cash Voucher** | Petty cash/expense payment slip |
| **Office Expense** | Cloud/SaaS/hosting expense memo |

---

## 🗄️ API Endpoints

All endpoints (except `/api/login`) require the `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Authenticate and receive session token |
| `GET` | `/api/documents` | List all saved documents |
| `GET` | `/api/documents/:id` | Load a specific document by ID |
| `POST` | `/api/save` | Save or update a document |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `GET` | `/api/next_number/:docType` | Get the next auto-increment document number |
| `GET` | `/api/backup` | Download the database as a file |
| `POST` | `/api/restore` | Upload and restore a database backup |

---

## 🖨️ Printing Documents

1. Open any module from the dashboard or load a saved document from the registry.
2. The A4 preview panel on the right shows the print-ready layout.
3. Click **Print / PDF** from the module toolbar or the registry reprint icon.
4. The browser's native print dialog opens — select your printer or **Save as PDF**.

> Print rules automatically hide the UI, sidebar, and buttons, leaving only the document paper.

---

## 💾 Backup & Restore

### Download Backup
Click **Backup DB** in the topbar. A `.sqlite` or `.json` file is downloaded to your system.

### Restore Backup
Click **Restore DB** in the topbar, select your previously downloaded backup file, and the database will be restored and the page reloaded.

---

## 🎨 Branding & Theme

- **Primary Color:** `#a855f7` (Violet/Purple)
- **Accent Color:** `#7c3aed` (Indigo)
- **Background:** `#09090b` (Zinc Black)
- **Company:** Orbenyx, Vadavalli, Coimbatore – 641046
- **Email:** rturoxtechnology@gmail.com
- **Phone:** +91 63811 69124

---

## 📞 Support

For issues or customizations, contact the Orbenyx development team at [rturoxtechnology@gmail.com](mailto:rturoxtechnology@gmail.com).

---

*Built with ❤️ for Orbenyx — Coimbatore, Tamil Nadu.*
