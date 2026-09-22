import { listMyboxMedia, type MyboxMedia } from './data'

const DB_NAME = 'amici-mybox-cache'
const STORE_NAME = 'snapshots'
const CACHE_KEY = 'global'

export interface MyboxCacheSnapshot {
  folders: Record<string, MyboxMedia[]>
  syncedAt: number
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readMyboxCache(): Promise<MyboxCacheSnapshot | null> {
  const db = await openCacheDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY)
    request.onsuccess = () => resolve((request.result as MyboxCacheSnapshot | undefined) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

async function replaceMyboxCache(snapshot: MyboxCacheSnapshot): Promise<void> {
  const db = await openCacheDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(snapshot, CACHE_KEY)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error) }
  })
}

async function fetchFolder(folderId: string): Promise<MyboxMedia[]> {
  const resources: MyboxMedia[] = []
  let cursor = ''
  do {
    const page = await listMyboxMedia(folderId, cursor)
    resources.push(...page.resources)
    cursor = page.nextCursor
  } while (cursor)
  return resources.sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder') || a.name.localeCompare(b.name, 'ko'))
}

/** 서버의 전체 폴더 트리를 받은 뒤에만 기존 영속 캐시를 원자적으로 교체한다. */
export async function syncMyboxCache(rootFolderId: string): Promise<MyboxCacheSnapshot> {
  const folders: Record<string, MyboxMedia[]> = {}
  const pending = [rootFolderId]
  const visited = new Set<string>()
  while (pending.length) {
    const folderId = pending.shift()!
    if (visited.has(folderId)) continue
    visited.add(folderId)
    const items = await fetchFolder(folderId)
    folders[folderId] = items
    items.forEach((item) => { if (item.type === 'folder' && !visited.has(item.id)) pending.push(item.id) })
  }
  const snapshot = { folders, syncedAt: Date.now() }
  await replaceMyboxCache(snapshot)
  return snapshot
}
