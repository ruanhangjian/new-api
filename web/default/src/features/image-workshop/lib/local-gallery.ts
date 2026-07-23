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
import { removeKeyedBackgroundFromBlob } from './transparent-image'

const DATABASE_NAME = 'newapi-image-workshop'
const DATABASE_VERSION = 1
const WORKS_STORE = 'works'
const TRANSPARENT_PROCESSING_VERSION = 2

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (database.objectStoreNames.contains(WORKS_STORE)) return
      const store = database.createObjectStore(WORKS_STORE, { keyPath: 'key' })
      store.createIndex('userId', 'userId', { unique: false })
      store.createIndex('taskId', 'taskId', { unique: false })
    })
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    })
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    })
  })
}

export async function listLocalWorks(
  userId: number
): Promise<LocalImageWorkshopWork[]> {
  const database = await openDatabase()
  try {
    let transaction = database.transaction(WORKS_STORE, 'readonly')
    const index = transaction.objectStore(WORKS_STORE).index('userId')
    const works = (await requestResult(
      index.getAll(IDBKeyRange.only(userId))
    )) as LocalImageWorkshopWork[]
    const staleTransparentWorks = works.filter(
      (work) =>
        work.transparentOutput &&
        !work.transparentProcessingFailed &&
        (work.transparentProcessingVersion || 0) <
          TRANSPARENT_PROCESSING_VERSION
    )
    if (staleTransparentWorks.length) {
      for (const work of staleTransparentWorks) {
        const originalBlob = work.originalBlob || work.blob
        try {
          work.blob = await removeKeyedBackgroundFromBlob(originalBlob)
          work.transparentProcessingFailed = false
        } catch {
          work.blob = originalBlob
          work.transparentProcessingFailed = true
        }
        work.transparentProcessingVersion = TRANSPARENT_PROCESSING_VERSION
      }
      transaction = database.transaction(WORKS_STORE, 'readwrite')
      const store = transaction.objectStore(WORKS_STORE)
      staleTransparentWorks.forEach((work) => {
        store.put(work)
      })
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), {
          once: true,
        })
        transaction.addEventListener('error', () => reject(transaction.error), {
          once: true,
        })
        transaction.addEventListener('abort', () => reject(transaction.error), {
          once: true,
        })
      })
    }
    return works.sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    database.close()
  }
}

export async function deleteLocalWork(key: string): Promise<void> {
  await deleteLocalWorks([key])
}

export async function deleteLocalWorks(keys: string[]): Promise<number> {
  const uniqueKeys = [...new Set(keys)]
  if (!uniqueKeys.length) return 0
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKS_STORE, 'readwrite')
    const store = transaction.objectStore(WORKS_STORE)
    uniqueKeys.forEach((key) => store.delete(key))
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true })
      transaction.addEventListener('error', () => reject(transaction.error), {
        once: true,
      })
      transaction.addEventListener('abort', () => reject(transaction.error), {
        once: true,
      })
    })
  } finally {
    database.close()
  }
  return uniqueKeys.length
}

export async function deleteLocalWorksForTasks(
  userId: number,
  taskIds: string[]
): Promise<number> {
  if (!taskIds.length) return 0
  const taskIDSet = new Set(taskIds)
  const works = (await listLocalWorks(userId)).filter((work) =>
    taskIDSet.has(work.taskId)
  )
  return deleteLocalWorks(works.map((work) => work.key))
}

export async function deleteLocalWorksBefore(
  userId: number,
  beforeUnix: number
): Promise<number> {
  const works = (await listLocalWorks(userId)).filter(
    (work) => work.createdAt < beforeUnix
  )
  return deleteLocalWorks(works.map((work) => work.key))
}

export async function deleteAllLocalWorks(userId: number): Promise<number> {
  const works = await listLocalWorks(userId)
  return deleteLocalWorks(works.map((work) => work.key))
}

export async function saveTaskImagesLocally(
  userId: number,
  task: ImageWorkshopTask
): Promise<{
  saved: LocalImageWorkshopWork[]
  failedImageIndexes: number[]
}> {
  if (!task.result_available || !task.result?.data?.length) {
    return { saved: [], failedImageIndexes: [] }
  }

  const database = await openDatabase()
  const saved: LocalImageWorkshopWork[] = []
  const failedImageIndexes: number[] = []
  try {
    for (const [imageIndex, image] of task.result.data.entries()) {
      try {
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
        const originalBlob = await response.blob()
        let blob = originalBlob
        let transparentProcessingFailed = false
        if (task.transparent_output) {
          try {
            blob = await removeKeyedBackgroundFromBlob(originalBlob)
          } catch {
            transparentProcessingFailed = true
          }
        }
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
          transparentOutput: Boolean(task.transparent_output),
          transparentProcessingFailed,
          transparentProcessingVersion: task.transparent_output
            ? TRANSPARENT_PROCESSING_VERSION
            : undefined,
          originalBlob: task.transparent_output ? originalBlob : undefined,
          createdAt:
            task.finish_time ||
            task.submit_time ||
            Math.floor(Date.now() / 1000),
          submittedAt: task.submit_time,
          revisedPrompt: image.revised_prompt,
        }
        const transaction = database.transaction(WORKS_STORE, 'readwrite')
        transaction.objectStore(WORKS_STORE).put(work)
        await new Promise<void>((resolve, reject) => {
          transaction.addEventListener('complete', () => resolve(), {
            once: true,
          })
          transaction.addEventListener(
            'error',
            () => reject(transaction.error),
            { once: true }
          )
          transaction.addEventListener(
            'abort',
            () => reject(transaction.error),
            { once: true }
          )
        })
        saved.push(work)
      } catch {
        failedImageIndexes.push(imageIndex)
      }
    }
    return { saved, failedImageIndexes }
  } finally {
    database.close()
  }
}
