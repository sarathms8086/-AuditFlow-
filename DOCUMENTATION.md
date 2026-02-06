# AuditFlow – Technical Documentation

## Overview

**AuditFlow** is a production-ready, mobile-first Progressive Web App (PWA) for electrical site audits. It enables auditors to conduct inspections, capture photos, and automatically generate Google Sheet checklists and PowerPoint reports.

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.1 | React framework with App Router |
| **React** | 19.2.3 | UI library |
| **IndexedDB** | (idb 8.0.1) | Offline data storage |
| **Google APIs** | 144.0.0 | Drive, Sheets, Slides integration |
| **Supabase** | 2.89.0 | Checklist template storage |
| **CSS Modules** | - | Scoped styling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **Express.js** | 4.18.2 | API server |
| **Google APIs** | 128.0.0 | OAuth & Google services |
| **Multer** | 1.4.5 | File uploads |

### Deployment
| Service | Usage |
|---------|-------|
| **Vercel** | Frontend hosting (PWA) |
| **Google Cloud** | OAuth 2.0, Drive API, Sheets API, Slides API |
| **Supabase** | PostgreSQL for checklist templates |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUDITFLOW ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐
    │   Browser    │         │  Supabase    │
    │   (PWA)      │         │  (Templates) │
    └──────┬───────┘         └──────┬───────┘
           │                        │
           ▼                        ▼
    ┌──────────────────────────────────────┐
    │         Next.js Frontend             │
    │  ┌────────────┐ ┌─────────────────┐  │
    │  │ IndexedDB  │ │ API Routes      │  │
    │  │ (Offline)  │ │ /api/audit/*    │  │
    │  └────────────┘ │ /api/photos/*   │  │
    │                 └─────────────────┘  │
    └──────────────────┬───────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────┐
    │          Google Cloud APIs           │
    │  ┌────────┐ ┌────────┐ ┌──────────┐  │
    │  │ Drive  │ │ Sheets │ │  Slides  │  │
    │  └────────┘ └────────┘ └──────────┘  │
    └──────────────────────────────────────┘
```

---

## Core Features

### 1. Offline-First Design
- All audit data stored in **IndexedDB**
- Works without internet connection
- Syncs when back online

### 2. Google OAuth Authentication
- User signs in with Google account
- Tokens stored with auto-refresh
- Scopes: Drive, Sheets, Slides

### 3. Checklist Management
- Templates stored in Supabase
- Dynamic sections & subsections
- Y/N/NA responses with remarks

### 4. Photo Capture
- Uses device camera
- Background upload to Google Drive
- Auto-retry (3 attempts) on failure
- Storage cleanup after upload

### 5. Auto-Backup System
- Backs up audit data every 2 minutes
- Stores JSON in Drive folder
- Recovery banner if backup is newer

### 6. Report Generation
- **Google Sheet**: Checklist with all responses
- **PowerPoint**: Organized photos by section

---

## Folder Structure

```
auditflow/
├── backend/                    # Express.js API (optional)
│   └── src/
│       ├── index.js            # Server entry
│       ├── routes/             # API endpoints
│       └── services/           # Google API services
│
└── frontend/                   # Next.js PWA
    ├── app/
    │   ├── page.js             # Home/Login page
    │   ├── auth/               # OAuth callbacks
    │   ├── audit/
    │   │   ├── new/            # Create new audit
    │   │   └── [id]/           # Execute audit
    │   │       └── review/     # Review & submit
    │   └── api/                # Next.js API routes
    │       ├── audit/init/     # Initialize audit in Drive
    │       ├── audit/submit/   # Submit & generate reports
    │       ├── audit/backup/   # Auto-backup to Drive
    │       └── photos/upload/  # Photo upload to Drive
    │
    ├── components/
    │   ├── checklist/          # ChecklistItem, Section
    │   ├── camera/             # CameraModal
    │   └── ui/                 # Button, UploadBadge, etc.
    │
    ├── lib/
    │   ├── db.js               # IndexedDB operations
    │   ├── autoBackup.js       # Auto-backup service
    │   ├── backgroundUpload.js # Photo upload queue
    │   ├── tokenManager.js     # OAuth token management
    │   └── google/
    │       ├── auth.js         # OAuth helpers
    │       ├── drive.js        # Drive operations
    │       ├── sheets.js       # Sheet generation
    │       └── slides.js       # PPT generation
    │
    └── public/
        ├── manifest.json       # PWA manifest
        └── icons/              # App icons
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/callback` | GET | OAuth callback handler |
| `/api/audit/init` | POST | Create Drive folder & resources |
| `/api/audit/submit` | POST | Submit audit & generate reports |
| `/api/audit/backup` | POST/GET | Save/retrieve backup |
| `/api/photos/upload` | POST | Upload photo to Drive |

---

## Data Flow

### Creating an Audit
```
1. User enters site details
2. System creates Drive folder structure:
   └── AuditFlow/
       └── [SiteName]_[Date]/
           ├── Photos/
           └── _audit_backup_[id].json
3. Audit saved to IndexedDB
4. Redirect to audit execution
```

### Taking Photos
```
1. User captures photo
2. Saved to IndexedDB (instant)
3. Added to upload queue
4. Background upload to Drive/Photos/
5. On success → Blob deleted from IndexedDB
6. On failure → Auto-retry 3 times
```

### Submitting Audit
```
1. User clicks "Submit"
2. API organizes photos by section
3. Google Sheet generated with responses
4. PowerPoint created with photos
5. Audit marked as "synced"
```

---

## Key Files Explained

| File | Purpose |
|------|---------|
| `lib/db.js` | All IndexedDB CRUD operations for audits & photos |
| `lib/autoBackup.js` | Timer-based backup to Drive every 2 minutes |
| `lib/backgroundUpload.js` | Queue-based photo upload with retry logic |
| `lib/tokenManager.js` | OAuth token storage & auto-refresh |
| `lib/google/slides.js` | PowerPoint generation from template |
| `app/audit/[id]/page.js` | Main audit execution interface |

---

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Backend (.env) - if used
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
```

---

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://electrical-auditflow.vercel.app |
| Local Dev | http://localhost:3000 |
