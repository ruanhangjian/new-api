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
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Download,
  FileImage,
  HardDriveDownload,
  ListChecks,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { aspectRatioForSize } from '../lib/image-size'
import type {
  ImageWorkshopDeleteScope,
  ImageWorkshopResultImage,
  ImageWorkshopTask,
  LocalImageWorkshopWork,
} from '../types'
import { GeneratingCard } from './generating-card'
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
  isLoading: boolean
  isDeleting: boolean
  limit: number
  onLimitChange: (limit: number) => void
  onRegenerate: (prompt: string) => void
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
  const [url] = useState(() => URL.createObjectURL(work.blob))
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])

  return (
    <CompletedWorkCard
      image={{ url, revised_prompt: work.revisedPrompt }}
      prompt={work.prompt}
      model={work.model}
      format={work.outputFormat}
      timestamp={work.createdAt}
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
}: {
  image: ImageWorkshopResultImage
  prompt: string
  model: string
  format?: string
  timestamp?: number
  controls: WorkControlsProps
  local?: boolean
}) {
  const extension = (format || 'png').toLowerCase()
  return (
    <article
      className='image-workshop-work-card'
      data-selected={controls.selected}
    >
      <div className='image-workshop-work-media image-workshop-work-media-completed'>
        <span className='image-workshop-work-type'>
          {local ? '本机' : '临时'}
        </span>
        <WorkSelectionControl {...controls} />
        <img src={image.url} alt={prompt || '生成图片'} loading='lazy' />
        {!controls.selectionMode && (
          <div className='image-workshop-work-actions'>
            <a
              href={image.url}
              download={`image-workshop-${timestamp || 'result'}.${extension}`}
              title='下载图片'
              aria-label='下载图片'
            >
              <Download aria-hidden='true' />
            </a>
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
  onRegenerate: (prompt: string) => void
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
          <button type='button' onClick={() => onRegenerate(task.prompt || '')}>
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
  isLoading,
  isDeleting,
  limit,
  onLimitChange,
  onRegenerate,
  onDelete,
}: WorksGalleryProps) {
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
        <div className='image-workshop-works-grid' aria-busy={isLoading}>
          {tasks.flatMap((task) => {
            if (task.status === 'queued' || task.status === 'running') {
              return Array.from(
                { length: Math.max(1, task.n || 1) },
                (_, index) => (
                  <GeneratingCard
                    key={`${task.task_id}:${index}`}
                    model={task.model || ''}
                    size={task.size}
                    phraseOffset={index}
                  />
                )
              )
            }

            if (task.status === 'completed' && task.result_available) {
              return (task.result?.data || [])
                .map((image, index) => ({ image, index }))
                .filter(
                  ({ index }) => !localImageKeys.has(`${task.task_id}:${index}`)
                )
                .map(({ image, index }) => {
                  const work = deletableWorkMap.get(
                    `task:${task.task_id}:${index}`
                  )
                  if (!work) return null
                  return (
                    <CompletedWorkCard
                      key={`${task.task_id}:${index}`}
                      image={image}
                      prompt={task.prompt || ''}
                      model={task.model || ''}
                      format={task.output_format}
                      timestamp={task.finish_time || task.submit_time}
                      controls={controlsFor(work)}
                    />
                  )
                })
            }

            const work = deletableWorkMap.get(`task:${task.task_id}`)
            if (!work) return []
            return (
              <TaskStateCard
                key={task.task_id}
                task={task}
                controls={controlsFor(work)}
                onRegenerate={onRegenerate}
              />
            )
          })}

          {visibleLocalWorks.map((work) => {
            const deletable = deletableWorkMap.get(`local:${work.key}`)
            if (!deletable) return null
            return (
              <LocalWorkCard
                key={work.key}
                work={work}
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
