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
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'
import { USER_REVIEWS } from '../../constants'
import { SectionHeading } from '../section-heading'

export function Testimonials() {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 px-4 pt-20 md:px-6 md:pt-24'>
      <div className='mx-auto max-w-[1180px]'>
        <AnimateInView>
          <SectionHeading title='真实用户评价' />
        </AnimateInView>

        <div className='grid gap-4 lg:grid-cols-[1.3fr_0.7fr] xl:grid-cols-[1.45fr_0.55fr]'>
          <div className='grid gap-4 sm:grid-cols-3'>
            {USER_REVIEWS.map((review, i) => (
              <AnimateInView
                key={review.name}
                delay={i * 90}
                animation='fade-up'
                className='border-border/80 bg-card/85 flex min-h-[206px] flex-col rounded-[22px] border p-[22px] shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm'
              >
                <div className='text-lg tracking-[2px] text-amber-500'>
                  ★★★★★
                </div>
                <p className='mt-[18px] text-sm leading-7 text-foreground/85'>
                  “{t(review.quote)}”
                </p>
                <div className='mt-auto flex items-center gap-3 pt-[18px]'>
                  <div className='bg-foreground text-background flex size-[42px] items-center justify-center rounded-full font-bold'>
                    {review.avatar}
                  </div>
                  <div>
                    <strong className='block text-sm font-bold'>
                      {t(review.name)}
                    </strong>
                    <span className='text-muted-foreground text-xs'>
                      {t(review.role)}
                    </span>
                  </div>
                </div>
              </AnimateInView>
            ))}
          </div>

          <AnimateInView
            delay={160}
            animation='fade-left'
            className='border-border/80 bg-card/85 rounded-[22px] border p-[22px] shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-sm lg:self-start'
          >
            <h3 className='text-lg font-bold'>{t('使用提醒与排查建议')}</h3>
            <p className='text-muted-foreground mt-2.5 text-sm leading-7'>
              {t(
                'AI 生成内容可能存在不准确或不适合特定场景的情况，重要事项请结合实际情况核验。'
              )}
            </p>
            <div className='mt-4 grid gap-2.5'>
              {[
                '不同项目建议拆分独立令牌',
                '异常调用优先查看模型、时间和状态',
                '进 QQ 群反馈时带上错误信息，定位更快',
              ].map((item) => (
                <span
                  key={item}
                  className='bg-muted/55 text-muted-foreground rounded-xl px-3 py-2.5 text-[13px] font-semibold'
                >
                  {t(item)}
                </span>
              ))}
            </div>
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}
