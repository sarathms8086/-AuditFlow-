# AuditFlow – Issues & Fixes Log

A chronological record of issues encountered during development and their resolutions.

---

## Phase 1: Core Infrastructure

### Issue #1: Vercel Payload Size Limit
**Problem:** Photos uploaded through API routes exceeded Vercel's 4.5MB body size limit, causing upload failures for high-resolution images.

**Solution:** Implemented background photo upload service that:
- Uploads photos directly to Google Drive (bypasses Vercel limits)
- Stores photos in IndexedDB first (instant save)
- Processes uploads in background queue
- Deletes blobs after successful upload to free device storage

**Files Modified:**
- `lib/backgroundUpload.js` (new)
- `app/api/photos/upload/route.js` (new)
- `lib/db.js` (added photo status tracking)

---

### Issue #2: Image Compression Quality Loss
**Problem:** Compressing images before upload resulted in poor quality photos in final reports.

**Solution:** Upload full-quality images directly to Drive instead of compressing. Background upload handles large files without blocking UI.

**Files Modified:**
- `lib/imageCompression.js` (kept for thumbnails only)
- Photo capture flow updated to use background upload

---

### Issue #3: OAuth Token Expiration
**Problem:** Google OAuth tokens expired after 1 hour, causing API calls to fail mid-audit.

**Solution:** Created `tokenManager.js` with automatic token refresh:
- Stores tokens in sessionStorage
- Tracks expiry time
- Auto-refreshes before expiration
- All API calls use `getValidAccessToken()`

**Files Modified:**
- `lib/tokenManager.js` (new)
- All API routes updated to use token manager

---

## Phase 2: Data Protection

### Issue #4: Data Loss on Phone Death
**Problem:** If phone dies or browser crashes during audit, all unsaved data in IndexedDB is lost.

**Solution:** Implemented auto-backup system:
- Backs up audit data to Google Drive every 2 minutes
- Stores as JSON file in audit folder
- Can recover from backup if local data is lost

**Files Modified:**
- `lib/autoBackup.js` (new)
- `app/api/audit/backup/route.js` (new)
- `app/audit/[id]/page.js` (integrated backup)

---

### Issue #5: BackupFileId Not Persisted
**Problem:** Each session created a new backup file instead of updating existing one, cluttering Drive.

**Solution:** Persist `backupFileId` to IndexedDB after first backup:
- Update `driveResources` in audit record
- Subsequent backups update same file
- Added callback for backup completion

**Files Modified:**
- `lib/autoBackup.js` (added `persistBackupId()`)

---

### Issue #6: No Recovery UI
**Problem:** Users couldn't see or use backup files to recover data.

**Solution:** Created RecoveryBanner component:
- Checks for backup on audit load
- Compares backup timestamp with local data
- Shows "Restore Backup" option if backup is newer

**Files Modified:**
- `components/ui/RecoveryBanner.js` (new)
- `app/audit/[id]/page.js` (integrated banner)

---

## Phase 3: Upload Reliability

### Issue #7: Failed Uploads Block Progress Visibility
**Problem:** When one photo upload failed, badge only showed "1 failed" - hiding progress of other successful uploads.

**Solution:** Redesigned UploadBadge to show combined status:
- Shows both "3/5 uploading" AND "1 failed" together
- Added retry button (tap to retry all failed)
- Better visual feedback for users

**Files Modified:**
- `components/ui/UploadBadge.js` (rewritten)
- `components/ui/UploadBadge.module.css` (updated)

---

### Issue #8: No Auto-Retry on Upload Failure
**Problem:** Failed uploads stayed failed forever unless user manually triggered retry.

**Solution:** Implemented auto-retry with 3 attempts:
- On failure, wait 2 seconds and retry
- Move to back of queue for retry
- Only mark as "failed" after 3 attempts
- Track retry count in photo metadata

**Files Modified:**
- `lib/backgroundUpload.js` (added retry logic)

---

### Issue #9: Offline Photos Not Retried
**Problem:** Photos taken offline stayed in "pending" status forever.

**Solution:** Added reconnection listener:
- Listens for `online` event
- Automatically retries all pending/failed photos
- 2 second delay to ensure stable connection

**Files Modified:**
- `lib/backgroundUpload.js` (added `retryAllPendingUploads()`)

---

## Phase 4: User Experience

### Issue #10: No Backup Status Indicator
**Problem:** Users didn't know when backups were happening or if they succeeded.

**Solution:** Created BackupStatus component:
- Shows "☁️ 2 min ago" after backup
- Shows "🔄 Backing up..." during backup
- Shows "📵 Offline" when offline
- Shows "⏳ Pending backup" before first backup

**Files Modified:**
- `components/ui/BackupStatus.js` (new)
- `app/audit/[id]/page.js` (integrated in header)

---

## Summary Table

| # | Issue | Root Cause | Solution |
|---|-------|------------|----------|
| 1 | Payload size limit | Vercel 4.5MB limit | Background upload to Drive |
| 2 | Image quality loss | Compression before upload | Upload full quality directly |
| 3 | Token expiration | 1 hour OAuth limit | Auto-refresh token manager |
| 4 | Data loss on crash | Only IndexedDB storage | Auto-backup to Drive |
| 5 | Multiple backup files | Not persisting file ID | Save backupFileId to IDB |
| 6 | Can't use backups | No recovery UI | RecoveryBanner component |
| 7 | Hidden upload progress | Badge only showed failed | Combined status badge |
| 8 | No auto-retry | Single attempt only | 3 retry attempts |
| 9 | Offline photos stuck | No reconnection handler | Online event listener |
| 10 | Unknown backup status | No indicator | BackupStatus component |

---

## Lessons Learned

1. **Offline-first is complex** - Managing sync state between IndexedDB and cloud requires careful design
2. **Always persist IDs** - Any cloud resource ID should be saved locally immediately
3. **Auto-retry is essential** - Network failures are common on mobile devices
4. **User feedback matters** - Show upload progress, backup status, and clear error messages
5. **Background processing works** - Queue-based uploads don't block UI and feel instant
