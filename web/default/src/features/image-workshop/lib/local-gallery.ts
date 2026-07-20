/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ImageWorkshopTask, LocalImageWorkshopWork } from '../types'

const DATABASE_NAME = 'newapi-image-workshop'
const DATABASE_VERSION = 1
const WORKS_STORE = 'works'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains(WORKS_STORE)) return
      const store = database.createObjectStore(WORKS_STORE, { keyPath: 'key' })
      store.createIndex('userId', 'userId', { unique: false })
      store.createIndex('taskId', 'taskId', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listLocalWorks(
  userId: number
): Promise<LocalImageWorkshopWork[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKS_STORE, 'readonly')
    const index = transaction.objectStore(WORKS_STORE).index('userId')
    const works = await requestResult(index.getAll(IDBKeyRange.only(userId)))
    return works.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    database.close()
  }
}

export async function deleteLocalWork(key: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKS_STORE, 'readwrite')
    transaction.objectStore(WORKS_STORE).delete(key)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function saveTaskImagesLocally(
  userId: number,
  task: ImageWorkshopTask
): Promise<LocalImageWorkshopWork[]> {
  if (!task.result_available || !task.result?.data?.length) return []

  const database = await openDatabase()
  const saved: LocalImageWorkshopWork[] = []
  try {
    for (const [imageIndex, image] of task.result.data.entries()) {
      const key = `${userId}:${task.task_id}:${imageIndex}`
      const existing = await requestResult(
        database
          .transaction(WORKS_STORE, 'readonly')
          .objectStore(WORKS_STORE)
          .get(key)
      )
      if (existing) {
        saved.push(existing as LocalImageWorkshopWork)
        continue
      }

      const response = await fetch(image.url, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('生成结果暂时无法保存到当前浏览器')
      }
      const blob = await response.blob()
      const work: LocalImageWorkshopWork = {
        key,
        userId,
        taskId: task.task_id,
        imageIndex,
        blob,
        prompt: task.prompt || '',
        model: task.model || '',
        size: task.size || '',
        quality: task.quality || '',
        outputFormat: task.output_format || blob.type.split('/')[1] || 'png',
        createdAt:
          task.finish_time || task.submit_time || Math.floor(Date.now() / 1000),
        revisedPrompt: image.revised_prompt,
      }
      const transaction = database.transaction(WORKS_STORE, 'readwrite')
      transaction.objectStore(WORKS_STORE).put(work)
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      saved.push(work)
    }
    return saved
  } finally {
    database.close()
  }
}
