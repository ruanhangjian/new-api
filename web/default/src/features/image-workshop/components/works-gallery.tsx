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
import { Download, FileImage, HardDriveDownload, RefreshCw } from 'lucide-react'
import { aspectRatioForSize } from '../lib/image-size'
import type {
  ImageWorkshopResultImage,
  ImageWorkshopTask,
  LocalImageWorkshopWork,
} from '../types'
import { GeneratingCard } from './generating-card'
import { WorkshopSelect } from './workshop-select'

type WorksGalleryProps = {
  tasks: ImageWorkshopTask[]
  localWorks: LocalImageWorkshopWork[]
  isLoading: boolean
  limit: number
  onLimitChange: (limit: number) => void
  onRegenerate: (prompt: string) => void
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

function LocalWorkCard({ work }: { work: LocalImageWorkshopWork }) {
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
    />
  )
}

function CompletedWorkCard({
  image,
  prompt,
  model,
  format,
  timestamp,
  local = false,
}: {
  image: ImageWorkshopResultImage
  prompt: string
  model: string
  format?: string
  timestamp?: number
  local?: boolean
}) {
  const extension = (format || 'png').toLowerCase()
  return (
    <article className='image-workshop-work-card'>
      <div className='image-workshop-work-media image-workshop-work-media-completed'>
        <span className='image-workshop-work-type'>
          {local ? '本机' : '临时'}
        </span>
        <img src={image.url} alt={prompt || '生成图片'} loading='lazy' />
        <div className='image-workshop-work-actions'>
          <a
            href={image.url}
            download={`image-workshop-${timestamp || 'result'}.${extension}`}
            title='下载图片'
            aria-label='下载图片'
          >
            <Download aria-hidden='true' />
          </a>
        </div>
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
}: {
  task: ImageWorkshopTask
  onRegenerate: (prompt: string) => void
}) {
  const failed = task.status === 'failed'
  return (
    <article className='image-workshop-work-card'>
      <div
        className='image-workshop-work-media image-workshop-work-state'
        style={{ aspectRatio: aspectRatioForSize(task.size) }}
      >
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

export function WorksGallery({
  tasks,
  localWorks,
  isLoading,
  limit,
  onLimitChange,
  onRegenerate,
}: WorksGalleryProps) {
  const localImageKeys = useMemo(
    () =>
      new Set(localWorks.map((work) => `${work.taskId}:${work.imageIndex}`)),
    [localWorks]
  )

  const hasWorks = tasks.length > 0 || localWorks.length > 0

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
                .map(({ image, index }) => (
                  <CompletedWorkCard
                    key={`${task.task_id}:${index}`}
                    image={image}
                    prompt={task.prompt || ''}
                    model={task.model || ''}
                    format={task.output_format}
                    timestamp={task.finish_time || task.submit_time}
                  />
                ))
            }

            return (
              <TaskStateCard
                key={task.task_id}
                task={task}
                onRegenerate={onRegenerate}
              />
            )
          })}

          {localWorks.slice(0, limit).map((work) => (
            <LocalWorkCard key={work.key} work={work} />
          ))}
        </div>
      )}
    </section>
  )
}
