const DB_NAME = "file-cache"
const DB_VERSION = 1
const STORE_NAME = "files"

interface CachedFile {
  id: string
  blob: Blob
  originalName: string
  mimeType: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function cacheFile(id: string, blob: Blob, originalName: string, mimeType: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put({ id, blob, originalName, mimeType } satisfies CachedFile)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedFile(id: string): Promise<CachedFile | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

const urlMap = new Map<string, string>()

export async function getFileUrl(id: string): Promise<string | null> {
  if (urlMap.has(id)) return urlMap.get(id)!
  const cached = await getCachedFile(id)
  if (!cached) return null
  const url = URL.createObjectURL(cached.blob)
  urlMap.set(id, url)
  return url
}

export function getFileUrlSync(id: string): string | null {
  return urlMap.get(id) ?? null
}

export async function cacheFileFromUpload(id: string, file: File): Promise<string> {
  await cacheFile(id, file, file.name, file.type)
  const url = URL.createObjectURL(file)
  urlMap.set(id, url)
  return url
}

export async function warmUrlCache(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => getFileUrl(id)))
}
