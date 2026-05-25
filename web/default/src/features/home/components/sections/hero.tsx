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
import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { HOMEPAGE_ACTIONS, HERO_CHIPS } from '../../constants'
import { HeroVisual } from '../hero-visual'
import { HomeActionButton } from '../home-action-button'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { copyToClipboard } = useCopyToClipboard({
    notify: true,
    successMessage: t('Base URL 已复制'),
  })
  const primaryAction = props.isAuthenticated
    ? {
        label: '进入控制台',
        status: 'linked' as const,
        route: '/dashboard' as const,
      }
    : HOMEPAGE_ACTIONS[0]
  const keyRoute = props.isAuthenticated ? '/keys' : '/sign-up'
  const tutorialAction = HOMEPAGE_ACTIONS.find(
    (action) => action.label === '查看接入教程'
  )
  const docsLink =
    typeof status?.docs_link === 'string' && status.docs_link.trim()
      ? status.docs_link.trim()
      : 'https://docs.newapi.pro/getting-started/'
  const isExternalDocsLink = /^https?:\/\//.test(docsLink)
  const resolvedTutorialAction = tutorialAction
    ? {
        ...tutorialAction,
        href: docsLink,
        external: isExternalDocsLink,
      }
    : null
  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'https://api.newapi.pro'
    }
    return window.location.origin
  }, [])
  const endpointPaths = [
    '/v1/chat/completions',
    '/v1/responses',
    '/v1/responses/compact',
    '/v1/messages',
    '/v1beta/models',
    '/v1/embeddings',
    '/v1/rerank',
    '/v1/images/generations',
    '/v1/images/edits',
    '/v1/images/variations',
    '/v1/audio/speech',
    '/v1/audio/transcriptions',
    '/v1/audio/translations',
  ]

  return (
    <section className='relative z-10 overflow-hidden px-4 pt-24 pb-8 md:px-6 md:pt-28 md:pb-10'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_0%,rgba(37,99,235,0.11),transparent_30%),linear-gradient(90deg,var(--border)_1px,transparent_1px),linear-gradient(var(--border)_1px,transparent_1px)] bg-[size:auto,72px_72px,72px_72px] opacity-45 dark:opacity-20'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-[linear-gradient(180deg,var(--background)_0%,color-mix(in_oklch,var(--background)_68%,transparent)_48%,transparent_100%)]'
      />

      <div className='mx-auto grid max-w-[1280px] items-center gap-10 md:grid-cols-[minmax(0,610px)_minmax(0,560px)] md:gap-12 lg:gap-16'>
        <div className='min-w-0'>
          <h1
            className='landing-animate-fade-up text-[clamp(2.15rem,5vw,3.25rem)] leading-[1.12] font-bold tracking-tight opacity-0 md:whitespace-nowrap'
            style={{ animationDelay: '0ms' }}
          >
            <span className='block'>{t('只需一个 API Key')}</span>
            <span className='block'>{t('即可调用 OpenAI 系列模型')}</span>
          </h1>
          <p
            className='landing-animate-fade-up text-muted-foreground mt-5 max-w-[620px] text-base leading-[1.75] opacity-0 md:text-lg'
            style={{ animationDelay: '80ms' }}
          >
            {t(
              '兼容 OpenAI/Anthropic(Claude)API 调用方式，只需把 Base URL 替换为本站地址，再填入平台创建的 API Key，即可在 Codex、Claude 及常用 AI 工具中稳定调用 OpenAI 系列模型。'
            )}
          </p>
          <div
            className='landing-animate-fade-up mt-6 flex flex-col gap-3 opacity-0 sm:mt-7 sm:flex-row sm:items-center'
            style={{ animationDelay: '160ms' }}
          >
            <div className='relative flex h-12 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-transparent bg-[rgba(46,50,56,0.05)] py-1 pr-1.5 pl-4 text-slate-950 shadow-none backdrop-blur-xl transition-colors dark:border-white/12 dark:bg-white/[0.09] dark:text-white dark:shadow-[0_16px_36px_rgba(0,0,0,0.28)]'>
              <span className='min-w-0 flex-1 truncate text-[14px] font-medium text-slate-950/90 sm:text-[15px] dark:text-white/92'>
                {baseUrl}
              </span>
              <div
                aria-hidden
                className='h-8 w-[154px] shrink-0 overflow-hidden rounded-full bg-transparent px-2.5 sm:w-[184px] dark:bg-white/[0.08]'
              >
                <div className='hero-endpoint-track text-[13px] leading-none font-semibold text-blue-600 sm:text-[14px] dark:text-sky-300'>
                  {[...endpointPaths, ...endpointPaths].map((item, index) => (
                    <span key={`${item}-${index}`}>{item}</span>
                  ))}
                </div>
              </div>
              <button
                type='button'
                onClick={() => copyToClipboard(baseUrl)}
                className='inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(46,50,56,0.05)] text-blue-600 transition-colors hover:bg-[rgba(46,50,56,0.08)] focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:outline-none dark:bg-white/[0.12] dark:text-sky-300 dark:hover:bg-white/[0.18] dark:focus-visible:ring-sky-300/60'
                aria-label={t('复制接口地址 {{url}}', {
                  url: baseUrl,
                })}
              >
                <Copy className='size-4' />
              </button>
            </div>
            <Button
              className='h-12 rounded-xl bg-foreground px-6 text-sm font-semibold text-background shadow-[0_14px_32px_rgba(15,23,42,0.16)] hover:bg-foreground/90'
              render={<Link to={keyRoute} />}
            >
              {t('获取密钥')}
            </Button>
          </div>
          <div
            className='landing-animate-fade-up mt-3.5 flex flex-col gap-3 opacity-0 sm:mt-4 sm:flex-row sm:items-center'
            style={{ animationDelay: '200ms' }}
          >
            <HomeActionButton
              action={primaryAction}
              variant='primary'
              showArrow
              className='w-full sm:w-auto'
            />
            {resolvedTutorialAction && (
              <HomeActionButton
                action={resolvedTutorialAction}
                className='w-full sm:w-auto'
              />
            )}
            <p className='text-muted-foreground/90 self-start pt-0.5 text-xs sm:ml-1.5 sm:self-center sm:pt-0'>
              {t('官方用户交流群:1091543768')}
            </p>
          </div>
          <div
            className='landing-animate-fade-up mt-4 grid grid-cols-2 gap-2.5 opacity-0 sm:mt-5 sm:flex sm:flex-wrap md:mt-6'
            style={{ animationDelay: '240ms' }}
          >
            {HERO_CHIPS.map((chip) => (
              <span
                key={chip}
                className='border-border/80 bg-card/75 text-muted-foreground rounded-full border px-3 py-1.5 text-center text-xs font-semibold backdrop-blur sm:text-left sm:text-[13px]'
              >
                {t(chip)}
              </span>
            ))}
          </div>
        </div>

        <div
          className='landing-animate-fade-right min-w-0 opacity-0'
          style={{ animationDelay: '260ms' }}
        >
          <HeroVisual />
        </div>
      </div>
    </section>
  )
}
