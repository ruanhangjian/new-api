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
import { useEffect, useState } from 'react'
import { aspectRatioForSize } from '../lib/image-size'

const PHRASES = [
  '正在为你设计中...',
  '灵感正在慢慢成形',
  '细节正在被认真打磨',
  '画面很快就会出现',
]

export function GeneratingCard({
  model,
  size,
  phraseOffset = 0,
}: {
  model: string
  size?: string
  phraseOffset?: number
}) {
  const [phraseIndex, setPhraseIndex] = useState(phraseOffset % PHRASES.length)

  useEffect(() => {
    const timer = window.setInterval(
      () => setPhraseIndex((current) => (current + 1) % PHRASES.length),
      1800
    )
    return () => window.clearInterval(timer)
  }, [])

  return (
    <article className='image-workshop-work-card'>
      <div
        className='image-workshop-work-media'
        style={{ aspectRatio: aspectRatioForSize(size) }}
      >
        <span className='image-workshop-work-type'>图片</span>
        <div className='image-workshop-generating'>
          <span key={phraseIndex}>{PHRASES[phraseIndex]}</span>
        </div>
      </div>
      <div className='image-workshop-work-caption'>
        <time>刚刚</time>
        <span>正在生成 · {model || '图片模型'}</span>
      </div>
    </article>
  )
}
