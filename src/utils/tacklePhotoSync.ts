// Tackle photo upload/retry logic — keeps Tackle.tsx and googleDrive.ts decoupled
import { uploadTacklePhoto, downloadDrivePhoto, getDriveStatus } from '../api/googleDrive'
import { getAllOwnedLures, saveOwnedLure } from '../db/database'
import type { OwnedLure } from '../types'

const MAX_ATTEMPTS = 3

export interface PhotoSyncResult {
  uploaded: number   // newly uploaded this run
  failed:   number   // hit MAX_ATTEMPTS and still failing
  migrated: number   // legacy records (had photoDataUrl, no drivePhotoFileId) that were successfully migrated
}

// ── Single-item upload (called immediately after save in LureForm / HookForm) ──
// Returns true if upload succeeded; caller does NOT need to await — fire-and-forget is fine.
export async function attemptTacklePhotoUpload(item: OwnedLure): Promise<boolean> {
  if (!item.photoDataUrl) return false
  const status = getDriveStatus()
  if (status === 'disconnected') {
    // Drive never connected — just keep local copy; do not set pending
    return false
  }
  try {
    const fileId = await uploadTacklePhoto(item.id, item.photoDataUrl, item.drivePhotoFileId)
    await saveOwnedLure({
      ...item,
      drivePhotoFileId:    fileId,
      photoDataUrl:        undefined,   // clear local copy after confirmed upload
      photoPendingUpload:  undefined,
      photoUploadAttempts: undefined,
    })
    return true
  } catch {
    // Upload failed — mark pending so the next sync retries
    await saveOwnedLure({
      ...item,
      photoPendingUpload:  true,
      photoUploadAttempts: (item.photoUploadAttempts ?? 0) + 1,
    })
    return false
  }
}

// ── Batch retry (called after each successful JSON Drive sync) ─────────────────
export async function processPendingTacklePhotoUploads(): Promise<PhotoSyncResult> {
  const result: PhotoSyncResult = { uploaded: 0, failed: 0, migrated: 0 }

  const status = getDriveStatus()
  if (status === 'disconnected' || status === 'expired') return result

  const all = await getAllOwnedLures()

  // Include:
  //  a) Records explicitly marked pending (photoPendingUpload)
  //  b) Legacy migration: has photoDataUrl but no drivePhotoFileId and not already pending-failed
  const queue = all.filter(l => {
    if (effectiveCategory(l) === 'spoon') return false  // not applicable
    if (!l.photoDataUrl) return false                   // nothing to upload
    if (l.drivePhotoFileId) return false                // already uploaded
    const attempts = l.photoUploadAttempts ?? 0
    if (attempts >= MAX_ATTEMPTS) return false          // give up
    return true                                         // pending or legacy
  })

  // Process in batches of 10
  const BATCH = 10
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH)
    await Promise.allSettled(batch.map(async item => {
      const wasLegacy = !item.photoPendingUpload
      try {
        const fileId = await uploadTacklePhoto(item.id, item.photoDataUrl!, item.drivePhotoFileId)
        await saveOwnedLure({
          ...item,
          drivePhotoFileId:    fileId,
          photoDataUrl:        undefined,
          photoPendingUpload:  undefined,
          photoUploadAttempts: undefined,
        })
        if (wasLegacy) result.migrated++
        else           result.uploaded++
      } catch {
        const newAttempts = (item.photoUploadAttempts ?? 0) + 1
        await saveOwnedLure({
          ...item,
          photoPendingUpload:  true,
          photoUploadAttempts: newAttempts,
        })
        if (newAttempts >= MAX_ATTEMPTS) result.failed++
      }
    }))
  }

  return result
}

// Re-export for use in useTacklePhoto hook (Tackle.tsx)
export { downloadDrivePhoto }

// ── Tiny helper duplicated here to avoid importing all of Tackle.tsx ───────────
function effectiveCategory(item: OwnedLure): string {
  if (item.category) return item.category
  return 'lure'
}
