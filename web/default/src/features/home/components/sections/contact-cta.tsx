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
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

export function ContactCTA() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard({
    notify: true,
    successMessage: t('QQ群号已复制'),
  })
  const qqGroupNumber = '1091543768'

  return (
    <section className='relative z-10 px-4 pt-14 pb-8 md:px-6 md:pt-18 md:pb-10'>
      <AnimateInView
        animation='scale-in'
        className='relative mx-auto grid max-w-[1180px] items-center gap-6 overflow-hidden rounded-[30px] border border-white/10 bg-[#101827] bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] px-8 py-7 text-white shadow-[0_26px_72px_rgba(15,23,42,0.24)] md:grid-cols-[minmax(0,1fr)_340px] md:px-10 md:py-7'
      >
        <div
          aria-hidden='true'
          className='absolute -top-28 -right-28 size-[300px] rounded-full bg-blue-500/30 blur-[10px]'
        />
        <div className='relative z-[1] max-w-[720px]'>
          <div className='text-[13px] font-bold tracking-[0.12em] text-blue-200/95'>
            {t('联系我们')}
          </div>
          <h2 className='mt-2 text-[clamp(1.72rem,2.45vw,2rem)] leading-[1.24] font-bold md:whitespace-nowrap'>
            {t('加入 QQ 交流群，获取问题解答与用户福利')}
          </h2>
          <p className='mt-2.5 max-w-[900px] text-[15px] leading-7 text-slate-100/82 md:text-base'>
            {t(
              '遇到模型配置、应用接入、计费疑问或使用问题，都可以在交流群里反馈。建议带上调用时间、模型名称、令牌名称和错误信息，方便快速定位。'
            )}
          </p>
        </div>

        <div className='relative z-[1] rounded-3xl border border-white/12 bg-white/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm md:p-3.5'>
          <div className='grid grid-cols-[minmax(0,1fr)_88px] items-start gap-x-3'>
            <div className='min-w-0'>
              <h3 className='text-[18px] leading-tight font-semibold whitespace-nowrap text-white/95'>
                {t('官方用户交流群')}
              </h3>
              <p className='mt-1.5 text-sm leading-6 text-slate-100/88'>
                {t('问题解决 / 福利活动 / 服务通知')}
              </p>
              <div className='mt-2 flex items-center gap-2 whitespace-nowrap'>
                <span className='inline-flex h-10 items-center rounded-xl border border-white/20 bg-white/8 px-3.5 font-mono text-sm font-medium tracking-[0.01em] text-white/92'>
                  {qqGroupNumber}
                </span>
                <button
                  type='button'
                  onClick={() => copyToClipboard(qqGroupNumber)}
                  className='inline-flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/8 text-white/90 transition-colors hover:bg-white/14 focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:outline-none'
                  aria-label={t('复制群号 {{number}}', { number: qqGroupNumber })}
                >
                  <Copy className='size-4' />
                </button>
              </div>
            </div>

            <div className='aspect-square w-[96px] justify-self-end rounded-2xl border border-white/24 bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.26)]'>
              <img
                src='/home/generated/qq-group-qrcode.png'
                alt={t('QQ群二维码')}
                className='size-full rounded-xl object-cover'
              />
            </div>
          </div>
        </div>
      </AnimateInView>
    </section>
  )
}
