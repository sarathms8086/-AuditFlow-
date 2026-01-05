# AuditFlow – Electrical Site Audit Web Application

A production-ready, mobile-first PWA for electrical site audits that automatically generates Google Sheet checklists and PPT reports.

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Google Cloud project with OAuth 2.0 credentials
- Enable these APIs in Google Cloud Console:
  - Google Drive API
  - Google Sheets API
  - Google Slides API

### 1. Setup Backend

```bash
cd backend
npm install

# Copy environment file and fill in your credentials
cp .env.example .env
# Edit .env with your Google OAuth credentials

npm run dev
```

### 2. Setup Frontend

```bash
cd frontend
npm install

# Create .env.local with:
# NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id

npm run dev
```

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web application type)
3. Add authorized redirect URI: `http://localhost:3001/auth/callback`
4. Copy Client ID and Secret to backend `.env`

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js PWA)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  Login Page │  │ Audit Pages │  │ IndexedDB Storage│   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                   Backend (Express.js)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │  Auth API   │  │  Audit API  │  │ Google API Services│ │
│  └─────────────┘  └─────────────┘  └────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                    Google APIs                             │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ Google Drive│  │Google Sheets│  │   Google Slides   │ │
│  └─────────────┘  └─────────────┘  └────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## Features

- ✅ Google OAuth authentication
- ✅ Offline-first audit execution
- ✅ Auto-save to IndexedDB
- ✅ Photo capture via device camera
- ✅ Automatic Google Drive folder creation
- ✅ Google Sheet checklist generation
- ✅ Google Slides report generation
- ✅ PWA installable on mobile
- ✅ Sync with retry on reconnection

## Folder Structure

```
auditflow/
├── backend/
│   ├── src/
│   │   ├── index.js           # Express server
│   │   ├── routes/
│   │   │   ├── auth.js        # OAuth routes
│   │   │   └── audit.js       # Audit submission
│   │   └── services/google/
│   │       ├── auth.js        # OAuth helpers
│   │       ├── drive.js       # Drive operations
│   │       ├── sheets.js      # Sheet generation
│   │       └── slides.js      # PPT generation
│   └── .env.example
│
├── frontend/
│   ├── app/
│   │   ├── page.js            # Login
│   │   ├── audit/new/         # Create audit
│   │   ├── audit/[id]/        # Execute audit
│   │   └── audit/[id]/review/ # Submit audit
│   ├── components/
│   │   ├── checklist/         # Checklist UI
│   │   └── camera/            # Photo capture
│   ├── lib/
│   │   ├── db.js              # IndexedDB
│   │   └── sync.js            # Sync logic
│   └── public/
│       ├── manifest.json      # PWA manifest
│       └── sw.js              # Service worker
│
└── README.md
```

## Environment Variables

### Backend (.env)

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
GOOGLE_DRIVE_PARENT_FOLDER_ID=optional-parent-folder-id
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id
```

## Deployment

### Frontend → Vercel

```bash
cd frontend
vercel
```

### Backend → Railway

```bash
cd backend
railway up
```

Remember to update environment variables with production URLs.

## License

MIT
