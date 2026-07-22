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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useAuthStore } from '@/stores/auth-store'

import {
  createImageWorkshopGeneration,
  deleteImageWorkshopTasks,
  deleteImageWorkshopTasksByScope,
  getImageWorkshopOptions,
  getImageWorkshopTasks,
  getImageWorkshopTokens,
  retryImageWorkshopTask,
} from './api'
import { InspirationStrip } from './components/inspiration-strip'
import {
  WorksGallery,
  type ImageWorkshopDeletionRequest,
} from './components/works-gallery'
import {
  WorkshopComposer,
  type WorkshopFormState,
} from './components/workshop-composer'
import { WorkshopScrollToTop } from './components/workshop-scroll-to-top'

import './image-workshop.css'
import { isImageWorkshopSizeSupported } from './lib/image-size'
import {
  loadHomepageInspirationCases,
  pickHomepageTemplates,
  takeWorkshopDraft,
} from './lib/inspiration-library'
import {
  deleteAllLocalWorks,
  deleteLocalWorks,
  deleteLocalWorksBefore,
  deleteLocalWorksForTasks,
  listLocalWorks,
  saveTaskImagesLocally,
} from './lib/local-gallery'
import type {
  ImageWorkshopGenerationRequest,
  ImageWorkshopTask,
  ImageWorkshopTaskPage,
} from './types'

const INITIAL_FORM: WorkshopFormState = {
  prompt: '',
  tokenId: 0,
  model: '',
  size: '',
  quality: '',
  outputFormat: '',
  count: 1,
  referenceImages: [],
}

const HOMEPAGE_TEMPLATE_COUNT = 5
const LOCAL_SAVE_MAX_ATTEMPTS = 4
const LOCAL_SAVE_RETRY_BASE_MS = 10_000

type WorkshopSubmission = ImageWorkshopGenerationRequest & {
  replaceTaskId?: string
}

function templatesFromOffset<T>(items: T[], offset: number, count: number) {
  if (!items.length) return []
  return Array.from(
    { length: Math.min(count, items.length) },
    (_, index) => items[(offset + index) % items.length]
  )
}

function preloadTemplateImages(
  items: Array<{ thumbnailUrl?: string }>
): Promise<void> {
  return Promise.allSettled(
    items.map(
      (item) =>
        new Promise<void>((resolve) => {
          if (!item.thumbnailUrl) {
            resolve()
            return
          }
          const image = new window.Image()
          const timeout = window.setTimeout(resolve, 5000)
          const settle = () => {
            window.clearTimeout(timeout)
            resolve()
          }
          image.addEventListener('load', settle, { once: true })
          image.addEventListener('error', settle, { once: true })
          image.src = item.thumbnailUrl
        })
    )
  ).then(() => undefined)
}

export function ImageWorkshop() {
  const queryClient = useQueryClient()
  const authUser = useAuthStore((state) => state.auth.user)
  const userId = authUser?.id || 0
  const [tokenCheckTime] = useState(() => Math.floor(Date.now() / 1000))
  const [form, setForm] = useState(INITIAL_FORM)
  const [workLimit, setWorkLimit] = useState(20)
  const [localWorks, setLocalWorks] = useState<
    Awaited<ReturnType<typeof listLocalWorks>>
  >([])
  const [homepageOffset, setHomepageOffset] = useState(0)
  const [isSwitchingTemplates, setIsSwitchingTemplates] = useState(false)
  const [isRetryingService, setIsRetryingService] = useState(false)
  const [isRetryingOptions, setIsRetryingOptions] = useState(false)
  const [localSaveFailedImageKeys, setLocalSaveFailedImageKeys] = useState<
    Set<string>
  >(new Set())
  const [localSaveRetryTick, setLocalSaveRetryTick] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const templateSwitchId = useRef(0)
  const localSaveAttempts = useRef(new Map<string, number>())
  const localSaveInProgress = useRef(new Set<string>())
  const localSaveRetryTimers = useRef(new Map<string, number>())

  const tokensQuery = useQuery({
    queryKey: ['image-workshop', 'tokens'],
    queryFn: getImageWorkshopTokens,
  })

  const usableTokens = useMemo(() => {
    return (tokensQuery.data || []).filter(
      (token) =>
        token.status === 1 &&
        (token.expired_time === -1 || token.expired_time > tokenCheckTime) &&
        (token.unlimited_quota || token.remain_quota > 0)
    )
  }, [tokenCheckTime, tokensQuery.data])

  useEffect(() => {
    if (!usableTokens.length) return
    if (!usableTokens.some((token) => token.id === form.tokenId)) {
      setForm((current) => ({ ...current, tokenId: usableTokens[0].id }))
    }
  }, [form.tokenId, usableTokens])

  const optionsQuery = useQuery({
    queryKey: ['image-workshop', 'options', form.tokenId],
    queryFn: () => getImageWorkshopOptions(form.tokenId),
    enabled: form.tokenId > 0,
  })

  const capabilities = useMemo(
    () => optionsQuery.data?.models || [],
    [optionsQuery.data?.models]
  )
  const capability = capabilities.find((item) => item.model === form.model)

  useEffect(() => {
    if (!capabilities.length) {
      setForm((current) => ({ ...current, model: '' }))
      return
    }
    const nextCapability =
      capabilities.find((item) => item.model === form.model) || capabilities[0]
    setForm((current) => ({
      ...current,
      model: nextCapability.model,
      size: isImageWorkshopSizeSupported(nextCapability, current.size)
        ? current.size
        : nextCapability.default_size,
      quality: nextCapability.qualities.includes(current.quality)
        ? current.quality
        : nextCapability.default_quality,
      outputFormat: nextCapability.output_formats.includes(current.outputFormat)
        ? current.outputFormat
        : nextCapability.default_output_format || '',
      count: Math.min(Math.max(1, current.count), nextCapability.max_images),
    }))
  }, [capabilities, form.model])

  const tasksQuery = useQuery({
    queryKey: ['image-workshop', 'tasks', workLimit],
    queryFn: () => getImageWorkshopTasks(workLimit),
    refetchInterval: (query) => {
      const hasActiveTasks = query.state.data?.items.some(
        (task) => task.status === 'queued' || task.status === 'running'
      )
      return hasActiveTasks ? 2500 : 15000
    },
    refetchIntervalInBackground: false,
  })

  const tasks = useMemo(
    () => tasksQuery.data?.items || [],
    [tasksQuery.data?.items]
  )

  useEffect(() => {
    if (!userId) return
    listLocalWorks(userId)
      .then(setLocalWorks)
      .catch(() => toast.warning('无法读取当前浏览器中的本机作品'))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const localImageKeys = new Set(
      localWorks.map((work) => `${work.taskId}:${work.imageIndex}`)
    )
    const completed = tasks.filter((task) => {
      if (
        task.status !== 'completed' ||
        !task.result_available ||
        !task.result?.data?.length
      ) {
        return false
      }
      return task.result.data.some(
        (_image, imageIndex) =>
          !localImageKeys.has(`${task.task_id}:${imageIndex}`)
      )
    })

    completed.forEach((task) => {
      if (
        localSaveInProgress.current.has(task.task_id) ||
        localSaveRetryTimers.current.has(task.task_id)
      ) {
        return
      }
      const attempt = (localSaveAttempts.current.get(task.task_id) || 0) + 1
      if (attempt > LOCAL_SAVE_MAX_ATTEMPTS) return

      const scheduleRetry = () => {
        if (attempt >= LOCAL_SAVE_MAX_ATTEMPTS) return
        const delay = LOCAL_SAVE_RETRY_BASE_MS * 3 ** (attempt - 1)
        const timer = window.setTimeout(() => {
          localSaveRetryTimers.current.delete(task.task_id)
          setLocalSaveRetryTick((current) => current + 1)
        }, delay)
        localSaveRetryTimers.current.set(task.task_id, timer)
      }

      localSaveAttempts.current.set(task.task_id, attempt)
      localSaveInProgress.current.add(task.task_id)
      void saveTaskImagesLocally(userId, task)
        .then(async ({ failedImageIndexes }) => {
          const nextLocalWorks = await listLocalWorks(userId)
          setLocalWorks(nextLocalWorks)
          setLocalSaveFailedImageKeys((current) => {
            const next = new Set(current)
            task.result?.data.forEach((_image, imageIndex) => {
              next.delete(`${task.task_id}:${imageIndex}`)
            })
            failedImageIndexes.forEach((imageIndex) => {
              next.add(`${task.task_id}:${imageIndex}`)
            })
            return next
          })

          if (!failedImageIndexes.length) {
            localSaveAttempts.current.delete(task.task_id)
            return
          }
          scheduleRetry()
        })
        .catch(() => {
          setLocalSaveFailedImageKeys((current) => {
            const next = new Set(current)
            task.result?.data.forEach((_image, imageIndex) => {
              if (!localImageKeys.has(`${task.task_id}:${imageIndex}`)) {
                next.add(`${task.task_id}:${imageIndex}`)
              }
            })
            return next
          })
          scheduleRetry()
        })
        .finally(() => {
          localSaveInProgress.current.delete(task.task_id)
        })
    })
  }, [localSaveRetryTick, localWorks, tasks, userId])

  useEffect(() => {
    const timers = localSaveRetryTimers.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const inspirationQuery = useQuery({
    queryKey: ['image-workshop', 'inspiration-cases'],
    queryFn: loadHomepageInspirationCases,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const homepageCandidates = useMemo(
    () =>
      pickHomepageTemplates(
        inspirationQuery.data || [],
        Number.POSITIVE_INFINITY
      ),
    [inspirationQuery.data]
  )
  const homepageTemplates = useMemo(
    () =>
      templatesFromOffset(
        homepageCandidates,
        homepageOffset,
        HOMEPAGE_TEMPLATE_COUNT
      ),
    [homepageCandidates, homepageOffset]
  )

  async function switchHomepageTemplates(
    direction: 'previous' | 'next' | 'random'
  ) {
    if (!homepageCandidates.length || isSwitchingTemplates) return
    const length = homepageCandidates.length
    let nextOffset = homepageOffset
    if (direction === 'previous') {
      nextOffset = (homepageOffset - HOMEPAGE_TEMPLATE_COUNT + length) % length
    } else if (direction === 'next') {
      nextOffset = (homepageOffset + HOMEPAGE_TEMPLATE_COUNT) % length
    } else if (length > HOMEPAGE_TEMPLATE_COUNT) {
      do {
        nextOffset = Math.floor(Math.random() * length)
      } while (nextOffset === homepageOffset)
    }

    const nextItems = templatesFromOffset(
      homepageCandidates,
      nextOffset,
      HOMEPAGE_TEMPLATE_COUNT
    )
    const switchId = ++templateSwitchId.current
    setIsSwitchingTemplates(true)
    await preloadTemplateImages(nextItems)
    if (templateSwitchId.current !== switchId) return
    setHomepageOffset(nextOffset)
    setIsSwitchingTemplates(false)
  }

  useEffect(() => {
    const draft = takeWorkshopDraft()
    if (draft) setForm((current) => ({ ...current, prompt: draft }))
  }, [])

  const createMutation = useMutation({
    mutationFn: ({
      replaceTaskId: _replaceTaskId,
      ...request
    }: WorkshopSubmission) => createImageWorkshopGeneration(request),
    onSuccess: async (_response, variables) => {
      if (variables.replaceTaskId) {
        try {
          await deleteImageWorkshopTasks([variables.replaceTaskId])
        } catch {
          toast.warning('新任务已提交，但旧失败记录未能自动删除')
        }
      }
      toast.success('任务已提交，正在生成图片')
      await queryClient.invalidateQueries({
        queryKey: ['image-workshop', 'tasks'],
      })
      window.requestAnimationFrame(() => {
        document
          .querySelector('#image-workshop-works')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : '任务提交失败，请稍后重试'
      )
    },
  })

  const retryMutation = useMutation({
    mutationFn: (task: ImageWorkshopTask) =>
      retryImageWorkshopTask(task.task_id),
    onMutate: async (task) => {
      await queryClient.cancelQueries({
        queryKey: ['image-workshop', 'tasks'],
      })
      const previousTasks = queryClient.getQueriesData<ImageWorkshopTaskPage>({
        queryKey: ['image-workshop', 'tasks'],
      })
      const now = Math.floor(Date.now() / 1000)
      queryClient.setQueriesData<ImageWorkshopTaskPage>(
        { queryKey: ['image-workshop', 'tasks'] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.task_id === task.task_id
                    ? {
                        ...item,
                        status: 'queued',
                        progress: '0%',
                        n: 1,
                        submit_time: now,
                        start_time: undefined,
                        finish_time: undefined,
                        result_available: false,
                        result: undefined,
                        error: undefined,
                        output_sizes: [],
                      }
                    : item
                ),
              }
            : current
      )
      return { previousTasks }
    },
    onSuccess: async (response) => {
      queryClient.setQueriesData<ImageWorkshopTaskPage>(
        { queryKey: ['image-workshop', 'tasks'] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.task_id === response.task_id ? response : item
                ),
              }
            : current
      )
      toast.success('已在原作品上重新生成')
      await queryClient.invalidateQueries({
        queryKey: ['image-workshop', 'tasks'],
      })
    },
    onError: (error, _task, context) => {
      context?.previousTasks.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      toast.error(
        error instanceof Error ? error.message : '重新生成失败，请稍后重试'
      )
    },
  })

  const deleteWorksMutation = useMutation({
    mutationFn: async (request: ImageWorkshopDeletionRequest) => {
      if ('scope' in request) {
        const response = await deleteImageWorkshopTasksByScope(request.scope)
        if (request.scope === 'all') {
          await deleteAllLocalWorks(userId)
        } else {
          const days = request.scope === 'before_3d' ? 3 : 7
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - days)
          await deleteLocalWorksBefore(
            userId,
            Math.floor(cutoff.getTime() / 1000)
          )
        }
        await deleteLocalWorksForTasks(userId, response.task_ids)
        return response
      }

      const response = await deleteImageWorkshopTasks(request.taskIds)
      await deleteLocalWorks(request.localKeys)
      await deleteLocalWorksForTasks(userId, response.task_ids)
      return response
    },
    onSuccess: async (response) => {
      setLocalWorks(await listLocalWorks(userId))
      await queryClient.invalidateQueries({
        queryKey: ['image-workshop', 'tasks'],
      })
      toast.success(`已删除 ${response.deleted} 条服务器作品记录`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '删除作品失败，请稍后重试'
      )
    },
  })

  function submit() {
    const prompt = form.prompt.trim()
    if (!capability || !prompt) return
    if (
      form.referenceImages.length > 0 &&
      !capability.supports_reference_images
    ) {
      toast.warning('当前模型不支持参考图，请切换模型或移除参考图')
      return
    }
    createMutation.mutate({
      token_id: form.tokenId,
      model: form.model,
      prompt,
      n: form.count,
      size: form.size,
      quality: form.quality,
      ...(form.outputFormat ? { output_format: form.outputFormat } : {}),
      ...(form.referenceImages.length
        ? { reference_images: form.referenceImages }
        : {}),
    })
  }

  function applyPrompt(prompt: string) {
    setForm((current) => ({ ...current, prompt }))
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function regenerate(task: ImageWorkshopTask) {
    if (task.status === 'failed') {
      retryMutation.mutate(task)
      return
    }
    if ((task.reference_image_count || 0) > 0) {
      toast.info('原参考图已在任务完成后清理，请重新上传参考图后生成')
      return
    }
    if (!form.tokenId || !task.prompt?.trim() || !task.model) return
    createMutation.mutate({
      token_id: form.tokenId,
      model: task.model,
      prompt: task.prompt.trim(),
      n: 1,
      size: task.size || 'auto',
      quality: task.quality || 'auto',
      ...(task.output_format ? { output_format: task.output_format } : {}),
      replaceTaskId: task.task_id,
    })
  }

  async function retryServiceQueries() {
    if (isRetryingService) return
    setIsRetryingService(true)
    try {
      await Promise.all([tokensQuery.refetch(), tasksQuery.refetch()])
    } finally {
      setIsRetryingService(false)
    }
  }

  async function retryOptionsQuery() {
    if (isRetryingOptions) return
    setIsRetryingOptions(true)
    try {
      await optionsQuery.refetch()
    } finally {
      setIsRetryingOptions(false)
    }
  }

  const showTokensError = tokensQuery.isError || isRetryingService
  const showOptionsError = optionsQuery.isError || isRetryingOptions

  return (
    <div className='image-workshop-page' ref={scrollContainerRef}>
      <div className='image-workshop-inner'>
        <WorkshopComposer
          value={form}
          tokens={usableTokens}
          capabilities={capabilities}
          capability={capability}
          isLoading={
            (tokensQuery.isLoading && !isRetryingService) ||
            (optionsQuery.isLoading && !isRetryingOptions)
          }
          isSubmitting={createMutation.isPending}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
          onSubmit={submit}
        />

        {showTokensError && (
          <div
            className='image-workshop-token-notice is-error'
            aria-live='polite'
          >
            <KeyRound aria-hidden='true' />
            <span>图工坊服务接口暂不可用，请确认后端已更新并重新加载。</span>
            <button
              type='button'
              disabled={isRetryingService}
              aria-busy={isRetryingService}
              onClick={retryServiceQueries}
            >
              {isRetryingService && (
                <LoaderCircle className='animate-spin' aria-hidden='true' />
              )}
              {isRetryingService ? '正在加载' : '重新加载'}
            </button>
          </div>
        )}

        {!tokensQuery.isLoading && !showTokensError && !usableTokens.length && (
          <div className='image-workshop-token-notice'>
            <KeyRound aria-hidden='true' />
            <span>创建图片前，需要先准备一个可用的 API 令牌。</span>
            <Link to='/keys'>前往令牌管理</Link>
          </div>
        )}

        {showOptionsError && form.tokenId > 0 && (
          <div
            className='image-workshop-token-notice is-error'
            aria-live='polite'
          >
            <KeyRound aria-hidden='true' />
            <span>无法读取当前 Key 的生图模型能力。</span>
            <button
              type='button'
              disabled={isRetryingOptions}
              aria-busy={isRetryingOptions}
              onClick={retryOptionsQuery}
            >
              {isRetryingOptions && (
                <LoaderCircle className='animate-spin' aria-hidden='true' />
              )}
              {isRetryingOptions ? '正在加载' : '重试'}
            </button>
          </div>
        )}

        {!optionsQuery.isLoading &&
          !showOptionsError &&
          form.tokenId > 0 &&
          !capabilities.length && (
            <div className='image-workshop-token-notice'>
              <KeyRound aria-hidden='true' />
              <span>
                当前 Key
                所在分组没有已启用的生图模型，请检查渠道模型与分组配置。
              </span>
              {authUser?.role === 100 && (
                <Link to='/channels'>前往渠道管理</Link>
              )}
            </div>
          )}

        <InspirationStrip
          items={homepageTemplates}
          isLoading={inspirationQuery.isLoading}
          isSwitching={isSwitchingTemplates}
          onUse={(item) => applyPrompt(item.prompt)}
          onPrevious={() => switchHomepageTemplates('previous')}
          onNext={() => switchHomepageTemplates('next')}
          onRandom={() => switchHomepageTemplates('random')}
        />

        <WorksGallery
          tasks={tasks}
          localWorks={localWorks}
          localSaveFailedImageKeys={localSaveFailedImageKeys}
          isLoading={tasksQuery.isLoading && !isRetryingService}
          limit={workLimit}
          onLimitChange={setWorkLimit}
          onRegenerate={regenerate}
          onDelete={deleteWorksMutation.mutateAsync}
          isDeleting={deleteWorksMutation.isPending}
        />
      </div>
      <WorkshopScrollToTop containerRef={scrollContainerRef} />
    </div>
  )
}
