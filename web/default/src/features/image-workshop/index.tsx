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
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  createImageWorkshopGeneration,
  getImageWorkshopTask,
  imageWorkshopTokensQueryKey,
  listImageWorkshopTokens,
} from './api'
import type {
  ImageWorkshopTaskRecord,
  ImageWorkshopToken,
} from './types'
import {
  buildImageWorkshopGenerationPayload,
  extractImageWorkshopResultImages,
  isImageWorkshopTaskTerminal,
} from './utils'

const modelPresets = [
  'gpt-image-1',
  'gpt-image-2',
  'chatgpt-image-latest',
  'nano-banana',
]

const sizeOptions = ['1024x1024', '1024x1536', '1536x1024']
const qualityOptions = ['auto', 'low', 'medium', 'high']

function isUsableToken(token: ImageWorkshopToken, nowSeconds: number) {
  return (
    token.status === 1 &&
    (token.expired_time < 0 || token.expired_time > nowSeconds)
  )
}

function statusBadgeVariant(status: string) {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

function statusText(status: string) {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '生成中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

export function ImageWorkshopPage() {
  const [selectedTokenId, setSelectedTokenId] = useState('')
  const [model, setModel] = useState(modelPresets[0])
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(sizeOptions[0])
  const [quality, setQuality] = useState(qualityOptions[0])
  const [count, setCount] = useState('1')
  const [tasks, setTasks] = useState<ImageWorkshopTaskRecord[]>([])

  const nowSeconds = Math.floor(Date.now() / 1000)
  const tokensQuery = useQuery({
    queryKey: imageWorkshopTokensQueryKey,
    queryFn: listImageWorkshopTokens,
  })

  const usableTokens = useMemo(() => {
    return (tokensQuery.data?.data ?? []).filter((token) =>
      isUsableToken(token, nowSeconds)
    )
  }, [nowSeconds, tokensQuery.data?.data])

  useEffect(() => {
    if (!selectedTokenId && usableTokens.length > 0) {
      setSelectedTokenId(String(usableTokens[0].id))
    }
  }, [selectedTokenId, usableTokens])

  const createMutation = useMutation({
    mutationFn: createImageWorkshopGeneration,
  })

  const activeTaskIds = useMemo(() => {
    return tasks
      .filter((task) => !isImageWorkshopTaskTerminal(task.status))
      .map((task) => task.taskId)
      .join('|')
  }, [tasks])

  useEffect(() => {
    if (!activeTaskIds) {
      return
    }

    let cancelled = false
    const ids = activeTaskIds.split('|').filter(Boolean)

    const poll = async () => {
      const settled = await Promise.allSettled(
        ids.map((taskId) => getImageWorkshopTask(taskId))
      )
      if (cancelled) return

      setTasks((current) =>
        current.map((record) => {
          const index = ids.indexOf(record.taskId)
          if (index < 0) return record
          const result = settled[index]
          if (result.status !== 'fulfilled' || !result.value.success) {
            return record
          }

          const task = result.value.data
          return {
            ...record,
            status: task.status,
            images: extractImageWorkshopResultImages(task.result),
            errorMessage: task.error?.message ?? '',
          }
        })
      )
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeTaskIds])

  const handleSubmit = async () => {
    const tokenId = Number(selectedTokenId)
    if (!tokenId) {
      toast.error('请选择 API Key')
      return
    }
    if (!prompt.trim()) {
      toast.error('请输入提示词')
      return
    }
    if (!model.trim()) {
      toast.error('请输入模型')
      return
    }

    const payload = buildImageWorkshopGenerationPayload({
      tokenId,
      prompt,
      model,
      size,
      quality,
      count,
    })
    const response = await createMutation.mutateAsync(payload)
    if (!response.success) {
      toast.error(response.message || '提交失败')
      return
    }

    setTasks((current) => [
      {
        taskId: response.data.task_id,
        prompt: payload.prompt,
        model: payload.model,
        size: payload.size,
        quality: payload.quality,
        count: payload.n,
        status: response.data.status || 'queued',
        createdAt: Date.now(),
        images: [],
        errorMessage: '',
      },
      ...current,
    ])
    toast.success('任务已提交')
  }

  const selectedToken = usableTokens.find(
    (token) => String(token.id) === selectedTokenId
  )
  const activeCount = tasks.filter(
    (task) => !isImageWorkshopTaskTerminal(task.status)
  ).length

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>图工坊</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          onClick={() => void tokensQuery.refetch()}
          disabled={tokensQuery.isFetching}
        >
          <RefreshCw
            className={cn('size-4', tokensQuery.isFetching && 'animate-spin')}
          />
          刷新 Key
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='grid min-h-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]'>
          <Card className='h-fit'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <ImagePlus className='size-4' />
                新建生图任务
              </CardTitle>
              <CardDescription>
                使用登录态桥接接口提交异步任务，浏览器不会保存真实 API Key。
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {usableTokens.length === 0 && !tokensQuery.isLoading && (
                <Alert variant='destructive'>
                  <AlertDescription>
                    当前没有可用 API Key。请先创建或启用一个未过期的 Key。
                  </AlertDescription>
                </Alert>
              )}

              <div className='space-y-2'>
                <Label htmlFor='image-workshop-token'>API Key</Label>
                <Select
                  value={selectedTokenId}
                  onValueChange={(value) => value && setSelectedTokenId(value)}
                >
                  <SelectTrigger id='image-workshop-token' className='w-full'>
                    <SelectValue placeholder='选择 API Key' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {usableTokens.map((token) => (
                        <SelectItem key={token.id} value={String(token.id)}>
                          {token.name || `Key #${token.id}`} · {token.key}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {selectedToken && (
                  <p className='text-muted-foreground text-xs'>
                    分组 {selectedToken.group || 'default'}，剩余额度{' '}
                    {selectedToken.unlimited_quota
                      ? '无限'
                      : selectedToken.remain_quota}
                  </p>
                )}
              </div>

              <div className='space-y-2'>
                <Label htmlFor='image-workshop-model'>模型</Label>
                <Input
                  id='image-workshop-model'
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  list='image-workshop-model-presets'
                />
                <datalist id='image-workshop-model-presets'>
                  {modelPresets.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label htmlFor='image-workshop-size'>尺寸</Label>
                  <Select
                    value={size}
                    onValueChange={(value) => value && setSize(value)}
                  >
                    <SelectTrigger id='image-workshop-size' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sizeOptions.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='image-workshop-quality'>质量</Label>
                  <Select
                    value={quality}
                    onValueChange={(value) => value && setQuality(value)}
                  >
                    <SelectTrigger
                      id='image-workshop-quality'
                      className='w-full'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {qualityOptions.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='image-workshop-count'>数量</Label>
                <Input
                  id='image-workshop-count'
                  type='number'
                  min={1}
                  max={10}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='image-workshop-prompt'>提示词</Label>
                <Textarea
                  id='image-workshop-prompt'
                  className='min-h-36 resize-y'
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder='描述你想生成的画面、风格、镜头、光线和细节'
                />
              </div>

              <Button
                className='w-full'
                onClick={() => void handleSubmit()}
                disabled={createMutation.isPending || usableTokens.length === 0}
              >
                {createMutation.isPending ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Sparkles className='size-4' />
                )}
                提交生成
              </Button>
            </CardContent>
          </Card>

          <div className='min-w-0 space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h3 className='text-sm font-medium'>任务与结果</h3>
                <p className='text-muted-foreground text-xs'>
                  {activeCount > 0
                    ? `${activeCount} 个任务正在轮询`
                    : '任务完成后会在这里显示签名图片 URL'}
                </p>
              </div>
              <Badge variant='outline'>{tasks.length} 个任务</Badge>
            </div>

            {tasks.length === 0 ? (
              <div className='border-border bg-card text-muted-foreground flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center'>
                <ImagePlus className='mb-3 size-8' />
                <div className='text-sm font-medium'>还没有生图任务</div>
                <div className='mt-1 max-w-sm text-xs'>
                  选择 Key，填写提示词并提交后，图工坊会自动轮询任务状态。
                </div>
              </div>
            ) : (
              <div className='grid gap-4'>
                {tasks.map((task) => (
                  <ImageWorkshopTaskCard key={task.taskId} task={task} />
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function ImageWorkshopTaskCard({ task }: { task: ImageWorkshopTaskRecord }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <CardTitle className='truncate'>{task.prompt}</CardTitle>
            <CardDescription>
              {task.model} · {task.size} · {task.quality} · {task.count} 张
            </CardDescription>
          </div>
          <Badge variant={statusBadgeVariant(task.status)}>
            {statusText(task.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {task.status === 'failed' && (
          <Alert variant='destructive' className='mb-4'>
            <AlertDescription>
              {task.errorMessage || '任务失败，请查看日志或调整参数后重试。'}
            </AlertDescription>
          </Alert>
        )}

        {task.images.length > 0 ? (
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {task.images.map((image, index) => (
              <div
                key={`${task.taskId}-${image.src}`}
                className='bg-muted/30 overflow-hidden rounded-lg border'
              >
                <div className='bg-muted flex aspect-square items-center justify-center overflow-hidden'>
                  <img
                    src={image.src}
                    alt={`图工坊生成结果 ${index + 1}`}
                    className='size-full object-contain'
                    loading='lazy'
                  />
                </div>
                <div className='flex items-center justify-between gap-2 p-2'>
                  <div className='text-muted-foreground min-w-0 truncate text-xs'>
                    {image.revisedPrompt || `结果 ${index + 1}`}
                  </div>
                  <a
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    href={image.src}
                    download
                    target='_blank'
                    rel='noreferrer'
                  >
                    <Download className='size-3.5' />
                    下载
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className='text-muted-foreground flex min-h-28 items-center justify-center rounded-lg border border-dashed text-sm'>
            {isImageWorkshopTaskTerminal(task.status)
              ? '任务没有返回可展示图片'
              : '等待生成结果...'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
