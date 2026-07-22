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
import {
  Check,
  Download,
  FileImage,
  HardDriveDownload,
  ListChecks,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  TriangleAlert,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { hasAllTaskImagesLocally } from '../lib/gallery-state'
import { aspectRatioForSize } from '../lib/image-size'
import type {
  ImageWorkshopDeleteScope,
  ImageWorkshopResultImage,
  ImageWorkshopTask,
  LocalImageWorkshopWork,
} from '../types'
import { GeneratingCard } from './generating-card'
import { ImagePreviewDialog } from './image-preview-dialog'
import { WorkshopSelect } from './workshop-select'

export type ImageWorkshopDeletionRequest =
  | {
      taskIds: string[]
      localKeys: string[]
    }
  | {
      scope: ImageWorkshopDeleteScope
    }

type DeletableWork = {
  id: string
  taskIds: string[]
  localKeys: string[]
}

type DeleteConfirmation = {
  title: string
  description: string
  request: ImageWorkshopDeletionRequest
}

type GalleryItem =
  | {
      kind: 'generating'
      id: string
      task: ImageWorkshopTask
      imageIndex: number
      sortTime: number
      sourceOrder: number
    }
  | {
      kind: 'completed'
      id: string
      task: ImageWorkshopTask
      image: ImageWorkshopResultImage
      imageIndex: number
      sortTime: number
      sourceOrder: number
    }
  | {
      kind: 'state'
      id: string
      task: ImageWorkshopTask
      sortTime: number
      sourceOrder: number
    }
  | {
      kind: 'local'
      id: string
      work: LocalImageWorkshopWork
      imageIndex: number
      sortTime: number
      sourceOrder: number
    }

type WorkControlsProps = {
  work: DeletableWork
  selectionMode: boolean
  selected: boolean
  onToggle: (id: string) => void
  onDelete: (work: DeletableWork) => void
}

type WorksGalleryProps = {
  tasks: ImageWorkshopTask[]
  localWorks: LocalImageWorkshopWork[]
  localSaveFailedImageKeys: Set<string>
  isLoading: boolean
  isDeleting: boolean
  limit: number
  onLimitChange: (limit: number) => void
  onRegenerate: (task: ImageWorkshopTask) => void
  onDelete: (request: ImageWorkshopDeletionRequest) => Promise<unknown>
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '刚刚'
  const difference = Math.max(0, Math.floor(Date.now() / 1000) - timestamp)
  if (difference < 60) return '刚刚'
  if (difference < 3600) return `${Math.floor(difference / 60)} 分钟前`
  if (difference < 86400) return `${Math.floor(difference / 3600)} 小时前`
  if (difference < 172800) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(timestamp * 1000))
}

async function downloadWorkImage(url: string, filename: string) {
  const target = new URL(url, window.location.href)
  const response = await fetch(target, {
    credentials: target.origin === window.location.origin ? 'include' : 'omit',
  })
  if (!response.ok) throw new Error('图片下载失败')

  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function useWorksMasonry() {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    let animationFrame = 0
    const observedItems = new Set<HTMLElement>()

    const measureItems = () => {
      animationFrame = 0
      const styles = window.getComputedStyle(grid)
      const rowHeight =
        Number.parseFloat(
          styles.getPropertyValue('--image-workshop-masonry-row-height')
        ) || 4
      const verticalGap =
        Number.parseFloat(
          styles.getPropertyValue('--image-workshop-masonry-gap')
        ) || 16

      observedItems.forEach((item) => {
        const height = item.getBoundingClientRect().height
        const rowSpan = Math.max(
          1,
          Math.ceil((height + verticalGap) / rowHeight)
        )
        const nextValue = `span ${rowSpan}`
        if (item.style.gridRowEnd !== nextValue) {
          item.style.gridRowEnd = nextValue
        }
      })
    }

    const scheduleMeasure = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(measureItems)
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure)

    const syncObservedItems = () => {
      const currentItems = new Set(
        [...grid.children].filter(
          (item): item is HTMLElement => item instanceof HTMLElement
        )
      )

      observedItems.forEach((item) => {
        if (currentItems.has(item)) return
        resizeObserver.unobserve(item)
        observedItems.delete(item)
      })
      currentItems.forEach((item) => {
        if (observedItems.has(item)) return
        observedItems.add(item)
        resizeObserver.observe(item)
      })
    }

    const mutationObserver = new MutationObserver(() => {
      syncObservedItems()
      scheduleMeasure()
    })

    resizeObserver.observe(grid)
    mutationObserver.observe(grid, { childList: true })
    syncObservedItems()
    scheduleMeasure()

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  return gridRef
}

function WorkSelectionControl({
  work,
  selectionMode,
  selected,
  onToggle,
}: Omit<WorkControlsProps, 'onDelete'>) {
  if (!selectionMode) return null
  return (
    <button
      type='button'
      className='image-workshop-work-select'
      data-selected={selected}
      role='checkbox'
      aria-checked={selected}
      aria-label={selected ? '取消选择作品' : '选择作品'}
      onClick={() => onToggle(work.id)}
    >
      {selected && <Check aria-hidden='true' />}
    </button>
  )
}

function LocalWorkCard({
  work,
  controls,
}: {
  work: LocalImageWorkshopWork
  controls: WorkControlsProps
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const objectUrl = URL.createObjectURL(work.blob)
    // Strict Mode remounts effects, so the URL must be recreated here before cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [work.blob])

  if (!url) return null

  return (
    <CompletedWorkCard
      image={{ url, revised_prompt: work.revisedPrompt }}
      prompt={work.prompt}
      model={work.model}
      format={work.outputFormat}
      timestamp={work.createdAt}
      transparentOutput={work.transparentOutput}
      transparentProcessingFailed={work.transparentProcessingFailed}
      originalBlob={work.originalBlob}
      local
      controls={controls}
    />
  )
}

function CompletedWorkCard({
  image,
  prompt,
  model,
  format,
  timestamp,
  controls,
  local = false,
  localSaveFailed = false,
  transparentOutput = false,
  transparentProcessingFailed = false,
  originalBlob,
}: {
  image: ImageWorkshopResultImage
  prompt: string
  model: string
  format?: string
  timestamp?: number
  controls: WorkControlsProps
  local?: boolean
  localSaveFailed?: boolean
  transparentOutput?: boolean
  transparentProcessingFailed?: boolean
  originalBlob?: Blob
}) {
  const extension = (format || 'png').toLowerCase()
  const imageAlt = prompt || model || '生成图片'
  const filename = `image-workshop-${timestamp || 'result'}.${extension}`
  const download = () => {
    void downloadWorkImage(image.url, filename).catch(() => {
      toast.error('图片下载失败，请稍后重试')
    })
  }
  const downloadOriginal = () => {
    if (!originalBlob) return
    downloadBlob(
      originalBlob,
      `image-workshop-${timestamp || 'original'}-original.png`
    )
  }
  const typeLabel = transparentProcessingFailed
    ? '透明失败 · 原图'
    : transparentOutput
      ? local
        ? '透明 · 本机'
        : '透明处理中'
      : local
        ? '本机'
        : '临时'
  const imageElement = <img src={image.url} alt={imageAlt} loading='lazy' />
  return (
    <article
      className='image-workshop-work-card'
      data-selected={controls.selected}
    >
      <div className='image-workshop-work-media image-workshop-work-media-completed'>
        <span className='image-workshop-work-type'>{typeLabel}</span>
        <WorkSelectionControl {...controls} />
        {controls.selectionMode ? (
          <button
            type='button'
            className='image-workshop-work-preview-trigger is-selecting'
            aria-label={`选择作品：${imageAlt}`}
            onClick={() => controls.onToggle(controls.work.id)}
          >
            {imageElement}
          </button>
        ) : (
          <ImagePreviewDialog
            src={image.url}
            alt={imageAlt}
            className='image-workshop-work-preview-trigger'
            trigger={imageElement}
          />
        )}
        {!controls.selectionMode && (
          <div className='image-workshop-work-actions'>
            <button
              type='button'
              title='下载图片'
              aria-label='下载图片'
              onClick={download}
            >
              <Download aria-hidden='true' />
            </button>
            {originalBlob && (
              <button
                type='button'
                title='下载原始图片'
                aria-label='下载原始图片'
                onClick={downloadOriginal}
              >
                <FileImage aria-hidden='true' />
              </button>
            )}
            <button
              type='button'
              title='删除作品'
              aria-label='删除作品'
              onClick={() => controls.onDelete(controls.work)}
            >
              <Trash2 aria-hidden='true' />
            </button>
          </div>
        )}
        {!local && localSaveFailed && !controls.selectionMode && (
          <button
            type='button'
            className='image-workshop-local-save-warning'
            title='图片尚未保存到当前浏览器，请及时下载'
            onClick={download}
          >
            <TriangleAlert aria-hidden='true' />
            <span>未保存到本机，请及时下载</span>
            <Download aria-hidden='true' />
          </button>
        )}
      </div>
      <div className='image-workshop-work-caption'>
        <time>{formatTime(timestamp)}</time>
        <span title={prompt}>{prompt || model || '生成图片'}</span>
      </div>
    </article>
  )
}

function TaskStateCard({
  task,
  onRegenerate,
  controls,
}: {
  task: ImageWorkshopTask
  onRegenerate: (task: ImageWorkshopTask) => void
  controls: WorkControlsProps
}) {
  const failed = task.status === 'failed'
  return (
    <article
      className='image-workshop-work-card'
      data-selected={controls.selected}
    >
      <div
        className='image-workshop-work-media image-workshop-work-state'
        style={{ aspectRatio: aspectRatioForSize(task.size) }}
      >
        <WorkSelectionControl {...controls} />
        {!controls.selectionMode && (
          <button
            className='image-workshop-work-state-delete'
            type='button'
            title='删除作品'
            aria-label='删除作品'
            onClick={() => controls.onDelete(controls.work)}
          >
            <Trash2 aria-hidden='true' />
          </button>
        )}
        <FileImage aria-hidden='true' />
        <strong>{failed ? '生成失败' : '图片已过期'}</strong>
        <p>
          {failed
            ? task.error?.message || '这次生成没有完成'
            : '服务器上的临时图片已清理，本机也没有找到副本'}
        </p>
        {task.prompt && (
          <button type='button' onClick={() => onRegenerate(task)}>
            <RefreshCw aria-hidden='true' />
            再次生成
          </button>
        )}
      </div>
      <div className='image-workshop-work-caption'>
        <time>{formatTime(task.finish_time || task.submit_time)}</time>
        <span title={task.prompt}>
          {task.prompt || task.model || '生成任务'}
        </span>
      </div>
    </article>
  )
}

function unique(values: string[]) {
  return [...new Set(values)]
}

export function WorksGallery({
  tasks,
  localWorks,
  localSaveFailedImageKeys,
  isLoading,
  isDeleting,
  limit,
  onLimitChange,
  onRegenerate,
  onDelete,
}: WorksGalleryProps) {
  const masonryGridRef = useWorksMasonry()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(new Set())
  const [confirmation, setConfirmation] = useState<DeleteConfirmation | null>(
    null
  )
  const visibleLocalWorks = localWorks.slice(0, limit)
  const localImageKeys = useMemo(
    () =>
      new Set(localWorks.map((work) => `${work.taskId}:${work.imageIndex}`)),
    [localWorks]
  )

  const galleryItems = useMemo(() => {
    const items: GalleryItem[] = []
    const taskOrder = new Map(
      tasks.map((task, index) => [task.task_id, index] as const)
    )

    tasks.forEach((task, sourceOrder) => {
      const sortTime = task.submit_time || task.start_time || 0
      if (task.status === 'queued' || task.status === 'running') {
        Array.from({ length: Math.max(1, task.n || 1) }, (_, imageIndex) => {
          items.push({
            kind: 'generating',
            id: `${task.task_id}:${imageIndex}`,
            task,
            imageIndex,
            sortTime,
            sourceOrder,
          })
        })
        return
      }

      if (task.status === 'completed' && task.result_available) {
        ;(task.result?.data || []).forEach((image, imageIndex) => {
          if (localImageKeys.has(`${task.task_id}:${imageIndex}`)) return
          items.push({
            kind: 'completed',
            id: `${task.task_id}:${imageIndex}`,
            task,
            image,
            imageIndex,
            sortTime,
            sourceOrder,
          })
        })
        return
      }

      if (
        task.status === 'completed' &&
        hasAllTaskImagesLocally(task, localImageKeys)
      ) {
        return
      }

      items.push({
        kind: 'state',
        id: task.task_id,
        task,
        sortTime,
        sourceOrder,
      })
    })

    visibleLocalWorks.forEach((work, localIndex) => {
      items.push({
        kind: 'local',
        id: work.key,
        work,
        imageIndex: work.imageIndex,
        sortTime: work.submittedAt || work.createdAt,
        sourceOrder: taskOrder.get(work.taskId) ?? tasks.length + localIndex,
      })
    })

    return items.sort(
      (left, right) =>
        right.sortTime - left.sortTime ||
        left.sourceOrder - right.sourceOrder ||
        ('imageIndex' in left ? left.imageIndex : 0) -
          ('imageIndex' in right ? right.imageIndex : 0) ||
        left.id.localeCompare(right.id)
    )
  }, [localImageKeys, tasks, visibleLocalWorks])

  const deletableWorks = useMemo(() => {
    const items: DeletableWork[] = []
    tasks.forEach((task) => {
      if (task.status === 'queued' || task.status === 'running') return
      if (task.status === 'completed' && task.result_available) {
        ;(task.result?.data || []).forEach((_image, index) => {
          if (localImageKeys.has(`${task.task_id}:${index}`)) return
          items.push({
            id: `task:${task.task_id}:${index}`,
            taskIds: [task.task_id],
            localKeys: [],
          })
        })
        return
      }
      if (
        task.status === 'completed' &&
        hasAllTaskImagesLocally(task, localImageKeys)
      ) {
        return
      }
      items.push({
        id: `task:${task.task_id}`,
        taskIds: [task.task_id],
        localKeys: [],
      })
    })
    visibleLocalWorks.forEach((work) => {
      items.push({
        id: `local:${work.key}`,
        taskIds: [work.taskId],
        localKeys: [work.key],
      })
    })
    return items
  }, [localImageKeys, tasks, visibleLocalWorks])

  const deletableWorkMap = useMemo(
    () => new Map(deletableWorks.map((work) => [work.id, work])),
    [deletableWorks]
  )
  const selectedVisibleIDs = useMemo(
    () => new Set([...selectedIDs].filter((id) => deletableWorkMap.has(id))),
    [deletableWorkMap, selectedIDs]
  )

  const hasWorks = tasks.length > 0 || localWorks.length > 0
  const allSelected =
    deletableWorks.length > 0 &&
    selectedVisibleIDs.size === deletableWorks.length

  function toggleSelection(id: string) {
    setSelectedIDs((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function controlsFor(work: DeletableWork): WorkControlsProps {
    return {
      work,
      selectionMode,
      selected: selectedVisibleIDs.has(work.id),
      onToggle: toggleSelection,
      onDelete: requestSingleDelete,
    }
  }

  function requestSingleDelete(work: DeletableWork) {
    setConfirmation({
      title: '删除这张作品？',
      description: '删除后，服务器任务记录和当前浏览器中的对应副本都无法恢复。',
      request: {
        taskIds: work.taskIds,
        localKeys: work.localKeys,
      },
    })
  }

  function requestSelectedDelete() {
    const selected = [...selectedVisibleIDs]
      .map((id) => deletableWorkMap.get(id))
      .filter((work): work is DeletableWork => Boolean(work))
    if (!selected.length) return
    setConfirmation({
      title: `删除选中的 ${selected.length} 张作品？`,
      description: '删除后，服务器任务记录和当前浏览器中的对应副本都无法恢复。',
      request: {
        taskIds: unique(selected.flatMap((work) => work.taskIds)),
        localKeys: unique(selected.flatMap((work) => work.localKeys)),
      },
    })
  }

  function requestScopeDelete(scope: ImageWorkshopDeleteScope) {
    const labels: Record<ImageWorkshopDeleteScope, string> = {
      before_3d: '3 天前的作品',
      before_7d: '7 天前的作品',
      all: '全部作品历史',
    }
    setConfirmation({
      title: `删除${labels[scope]}？`,
      description:
        '已完成和失败的作品会从服务器及当前浏览器中删除，正在生成的任务会保留。此操作无法恢复。',
      request: { scope },
    })
  }

  async function confirmDelete() {
    if (!confirmation) return
    await onDelete(confirmation.request)
    setConfirmation(null)
    setSelectedIDs(new Set())
    setSelectionMode(false)
  }

  return (
    <section className='image-workshop-works' id='image-workshop-works'>
      <div className='image-workshop-works-head'>
        <div>
          <h2>我的作品</h2>
          <p className='image-workshop-storage-note'>
            <HardDriveDownload aria-hidden='true' />
            服务器只短期保留图片；生成完成后会自动在当前浏览器保存一份。更换设备或清理浏览器数据后不会同步，请及时下载重要作品。
          </p>
        </div>
        <div className='image-workshop-works-toolbar'>
          <WorkshopSelect
            value={String(limit)}
            options={[
              { value: '20', label: '20 个' },
              { value: '50', label: '50 个' },
              { value: '100', label: '100 个' },
            ]}
            ariaLabel='显示作品数量'
            className='image-workshop-works-limit-select'
            onChange={(value) => onLimitChange(Number(value))}
          />

          {selectionMode ? (
            <>
              <button
                type='button'
                disabled={!deletableWorks.length || isDeleting}
                onClick={() =>
                  setSelectedIDs(
                    allSelected
                      ? new Set()
                      : new Set(deletableWorks.map((work) => work.id))
                  )
                }
              >
                <Check aria-hidden='true' />
                {allSelected ? '取消全选' : '全选'}
              </button>
              <span>{selectedVisibleIDs.size} 项</span>
              <button
                className='is-destructive'
                type='button'
                disabled={!selectedVisibleIDs.size || isDeleting}
                onClick={requestSelectedDelete}
              >
                <Trash2 aria-hidden='true' />
                删除
              </button>
              <button
                className='is-icon'
                type='button'
                title='退出多选'
                aria-label='退出多选'
                disabled={isDeleting}
                onClick={() => {
                  setSelectionMode(false)
                  setSelectedIDs(new Set())
                }}
              >
                <X aria-hidden='true' />
              </button>
            </>
          ) : (
            <>
              <button
                type='button'
                disabled={!deletableWorks.length || isDeleting}
                onClick={() => setSelectionMode(true)}
              >
                <ListChecks aria-hidden='true' />
                多选
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type='button'
                      disabled={!deletableWorks.length || isDeleting}
                    />
                  }
                >
                  <MoreHorizontal aria-hidden='true' />
                  管理
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-40'>
                  <DropdownMenuItem
                    onClick={() => requestScopeDelete('before_3d')}
                  >
                    删除 3 天前
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => requestScopeDelete('before_7d')}
                  >
                    删除 7 天前
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => requestScopeDelete('all')}
                  >
                    删除全部
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {!hasWorks && !isLoading ? (
        <div className='image-workshop-empty'>
          <FileImage aria-hidden='true' />
          <p>生成图片后，作品会显示在这里</p>
        </div>
      ) : (
        <div
          ref={masonryGridRef}
          className='image-workshop-works-grid'
          aria-busy={isLoading}
        >
          {galleryItems.map((item) => {
            if (item.kind === 'generating') {
              return (
                <GeneratingCard
                  key={item.id}
                  model={item.task.model || ''}
                  size={item.task.size}
                  phraseOffset={item.imageIndex}
                />
              )
            }

            if (item.kind === 'completed') {
              const work = deletableWorkMap.get(
                `task:${item.task.task_id}:${item.imageIndex}`
              )
              if (!work) return null
              return (
                <CompletedWorkCard
                  key={item.id}
                  image={item.image}
                  prompt={item.task.prompt || ''}
                  model={item.task.model || ''}
                  format={item.task.output_format}
                  transparentOutput={item.task.transparent_output}
                  timestamp={item.task.finish_time || item.task.submit_time}
                  localSaveFailed={localSaveFailedImageKeys.has(item.id)}
                  controls={controlsFor(work)}
                />
              )
            }

            if (item.kind === 'state') {
              const work = deletableWorkMap.get(`task:${item.task.task_id}`)
              if (!work) return null
              return (
                <TaskStateCard
                  key={item.id}
                  task={item.task}
                  controls={controlsFor(work)}
                  onRegenerate={onRegenerate}
                />
              )
            }

            const deletable = deletableWorkMap.get(`local:${item.work.key}`)
            if (!deletable) return null
            return (
              <LocalWorkCard
                key={item.id}
                work={item.work}
                controls={controlsFor(deletable)}
              />
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => !open && !isDeleting && setConfirmation(null)}
        title={confirmation?.title || '删除作品？'}
        desc={confirmation?.description || '此操作无法恢复。'}
        confirmText={
          isDeleting ? (
            <>
              <LoaderCircle className='animate-spin' aria-hidden='true' />
              正在删除
            </>
          ) : (
            '确认删除'
          )
        }
        destructive
        isLoading={isDeleting}
        handleConfirm={confirmDelete}
      />
    </section>
  )
}
