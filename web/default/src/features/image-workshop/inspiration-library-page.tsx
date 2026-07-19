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
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, Search } from 'lucide-react'
import { ImagePreviewDialog } from './components/image-preview-dialog'
import { WorkshopSelect } from './components/workshop-select'
import './image-workshop.css'
import {
  loadInspirationLibrary,
  saveWorkshopDraft,
} from './lib/inspiration-library'
import type { InspirationCase, InspirationTemplateGroup } from './types'

type LibraryView = 'cases' | 'trending' | 'templates'

export function InspirationLibraryPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<LibraryView>('cases')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')

  const libraryQuery = useQuery({
    queryKey: ['image-workshop', 'inspiration-library'],
    queryFn: loadInspirationLibrary,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const cases = useMemo(
    () =>
      view === 'trending'
        ? libraryQuery.data?.trending || []
        : libraryQuery.data?.cases || [],
    [libraryQuery.data?.cases, libraryQuery.data?.trending, view]
  )
  const categories = useMemo(
    () => ['全部', ...new Set(cases.map((item) => item.category))],
    [cases]
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCases = cases.filter(
    (item) =>
      (category === '全部' || item.category === category) &&
      (!normalizedQuery ||
        `${item.title} ${item.prompt} ${item.tags.join(' ')}`
          .toLowerCase()
          .includes(normalizedQuery))
  )
  const filteredGroups = (libraryQuery.data?.templateGroups || []).filter(
    (group) =>
      !normalizedQuery ||
      `${group.title} ${group.tags.join(' ')} ${group.entries.map((entry) => entry.title).join(' ')}`
        .toLowerCase()
        .includes(normalizedQuery)
  )

  function usePrompt(prompt: string) {
    saveWorkshopDraft(prompt)
    navigate({ to: '/image-workshop' })
  }

  return (
    <div className='image-workshop-library-page'>
      <div className='image-workshop-library-inner'>
        <header className='image-workshop-library-head'>
          <div>
            <h1>灵感库</h1>
            <p>浏览真实案例和可复用模板，选中后直接带回图片创建页。</p>
          </div>
          <button
            type='button'
            onClick={() => navigate({ to: '/image-workshop' })}
          >
            <ArrowLeft aria-hidden='true' />
            返回创建
          </button>
        </header>

        <div className='image-workshop-library-toolbar'>
          <div className='image-workshop-library-tabs' aria-label='灵感库类型'>
            {(
              [
                ['cases', '精选案例'],
                ['trending', '热门灵感'],
                ['templates', '提示词模板'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type='button'
                className={view === value ? 'is-active' : ''}
                onClick={() => {
                  setView(value)
                  setCategory('全部')
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className='image-workshop-library-search'>
            <Search aria-hidden='true' />
            <span className='sr-only'>搜索灵感</span>
            <input
              value={query}
              placeholder='搜索标题、提示词或标签'
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {view !== 'templates' && (
          <div className='image-workshop-library-filters'>
            {categories.map((item) => (
              <button
                type='button'
                key={item}
                className={category === item ? 'is-active' : ''}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {libraryQuery.isLoading ? (
          <div className='image-workshop-library-loading'>
            正在载入灵感库...
          </div>
        ) : view === 'templates' ? (
          <div className='image-workshop-template-library-grid'>
            {filteredGroups.map((group) => (
              <TemplateGroupCard
                key={group.id}
                group={group}
                onUse={usePrompt}
              />
            ))}
          </div>
        ) : (
          <div className='image-workshop-library-grid'>
            {filteredCases.map((item) => (
              <CaseCard
                key={`${item.kind}:${item.id}`}
                item={item}
                onUse={usePrompt}
              />
            ))}
          </div>
        )}

        {!libraryQuery.isLoading &&
          ((view === 'templates' && !filteredGroups.length) ||
            (view !== 'templates' && !filteredCases.length)) && (
            <div className='image-workshop-library-empty'>
              没有找到匹配的内容
            </div>
          )}

        <footer className='image-workshop-library-attribution'>
          <span>开源数据来源：</span>
          <a
            href='https://github.com/freestylefly/awesome-gpt-image-2'
            target='_blank'
            rel='noreferrer'
          >
            awesome-gpt-image-2 · MIT
            <ExternalLink aria-hidden='true' />
          </a>
          <a
            href='https://github.com/jau123/nanobanana-trending-prompts'
            target='_blank'
            rel='noreferrer'
          >
            NanoBanana Trending Prompts · CC BY 4.0
            <ExternalLink aria-hidden='true' />
          </a>
        </footer>
      </div>
    </div>
  )
}

function CaseCard({
  item,
  onUse,
}: {
  item: InspirationCase
  onUse: (prompt: string) => void
}) {
  return (
    <article className='image-workshop-library-card'>
      <div className='image-workshop-library-card-media'>
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.title} loading='lazy' />
        ) : null}
        <span>{item.category}</span>
        <ImagePreviewDialog src={item.thumbnailUrl} alt={item.title} />
      </div>
      <div className='image-workshop-library-card-body'>
        <h2>{item.title}</h2>
        <p>{item.prompt}</p>
        <div>
          <small>{item.sourceLabel || '开源案例'}</small>
          <button type='button' onClick={() => onUse(item.prompt)}>
            使用提示词
          </button>
        </div>
      </div>
    </article>
  )
}

function TemplateGroupCard({
  group,
  onUse,
}: {
  group: InspirationTemplateGroup
  onUse: (prompt: string) => void
}) {
  const usableEntries = group.entries.filter((entry) => entry.kind !== 'tips')
  const [entryId, setEntryId] = useState(
    usableEntries[0]?.id || group.entries[0]?.id
  )
  const entry =
    group.entries.find((item) => item.id === entryId) || group.entries[0]

  return (
    <article className='image-workshop-template-library-card'>
      {group.coverUrl && (
        <div className='image-workshop-template-library-media'>
          <img src={group.coverUrl} alt={group.title} loading='lazy' />
          <ImagePreviewDialog src={group.coverUrl} alt={group.title} />
        </div>
      )}
      <div className='image-workshop-template-library-body'>
        <h2>{group.title}</h2>
        <div className='image-workshop-template-tags'>
          {group.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <WorkshopSelect
          value={entry?.id || ''}
          options={group.entries.map((item) => ({
            value: item.id,
            label: item.title,
          }))}
          ariaLabel={`选择${group.title}模板`}
          className='image-workshop-template-entry-select'
          contentClassName='image-workshop-template-entry-select-content'
          onChange={setEntryId}
        />
        <p>{entry?.content}</p>
        <button
          type='button'
          disabled={!entry || entry.kind === 'tips'}
          onClick={() => entry && onUse(entry.content)}
        >
          {entry?.kind === 'tips' ? '这是使用说明' : '使用模板'}
        </button>
      </div>
    </article>
  )
}
