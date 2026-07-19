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
import type {
  InspirationCase,
  InspirationLibrary,
  InspirationTemplate,
  InspirationTemplateGroup,
} from '../types'

type CaseRecord = {
  id?: string | number
  title?: string
  category?: string
  styles?: string[]
  scenes?: string[]
  prompt?: string
  sourceLabel?: string
  sourceUrl?: string
  remoteImageUrl?: string
  thumbnailSrc?: string
  featured?: boolean
}

type TrendingRecord = {
  id?: string | number
  rank?: number
  prompt?: string
  author?: string
  author_name?: string
  image?: string
  images?: string[]
  categories?: string[]
  source_url?: string
}

type TemplateGroupRecord = {
  id?: string
  title?: string
  coverSrc?: string
  tags?: string[]
  entries?: Array<{
    id?: string
    title?: string
    kind?: string
    content?: string
  }>
}

const LIBRARY_BASE_PATH = `${import.meta.env.BASE_URL}prompt-library/`

// These featured cases were checked against their real source images.
// Every image is portrait or near-portrait, so homepage cards avoid harsh crops.
export const HOMEPAGE_TEMPLATE_IDS = [
  '362',
  '359',
  '350',
  '376',
  '377',
  '353',
  '375',
  '2',
  '346',
  '6',
  '1',
  '17',
  '370',
  '361',
]

const CATEGORY_LABELS: Record<string, string> = {
  'UI & Interfaces': 'UI 与界面',
  'Posters & Typography': '海报与排版',
  'Products & E-commerce': '商品与电商',
  'Brand & Logos': '品牌与标志',
  'Photography & Realism': '摄影与写实',
  'Characters & People': '人物与角色',
  'Scenes & Storytelling': '场景与叙事',
  'Charts & Infographics': '图表与信息',
  'Illustration & Art': '插画与艺术',
  'Architecture & Spaces': '建筑与空间',
  'History & Classical Themes': '历史与古风',
  'Documents & Publishing': '文档与出版物',
  'Other Use Cases': '其他场景',
  'UI & Graphic': 'UI 与图形',
  'Product & Brand': '商品与品牌',
  Photography: '摄影',
  Character: '人物与角色',
  Creative: '创意视觉',
  Architecture: '建筑与空间',
  Fashion: '时尚',
  Food: '美食',
  Education: '教育',
}

function resolveAsset(source?: string) {
  if (!source) return undefined
  if (/^https?:\/\//i.test(source)) return source
  return `${LIBRARY_BASE_PATH}${source.replace(/^\/+/, '')}`
}

function categoryLabel(value?: string) {
  if (!value) return '其他场景'
  return CATEGORY_LABELS[value] || value
}

function normalizeCase(record: CaseRecord): InspirationCase | null {
  const id = String(record.id ?? '')
  const title = record.title?.trim() || ''
  const prompt = record.prompt?.trim() || ''
  if (!id || !title || !prompt) return null
  return {
    id,
    title,
    category: categoryLabel(record.category),
    tags: [...(record.styles || []), ...(record.scenes || [])].slice(0, 4),
    prompt,
    thumbnailUrl: record.remoteImageUrl || resolveAsset(record.thumbnailSrc),
    sourceLabel: record.sourceLabel,
    sourceUrl: record.sourceUrl,
    featured: Boolean(record.featured),
    kind: 'case',
  }
}

function normalizeTrending(record: TrendingRecord): InspirationCase | null {
  const id = String(record.id ?? record.rank ?? '')
  const prompt = record.prompt?.trim() || ''
  if (!id || !prompt) return null
  const summary = prompt.replace(/\s+/g, ' ').slice(0, 36)
  const author = record.author_name || record.author
  return {
    id: `trending-${id}`,
    title: `${summary}${prompt.length > 36 ? '...' : ''}`,
    category: categoryLabel(record.categories?.[0]),
    tags: (record.categories || []).map(categoryLabel).slice(0, 3),
    prompt,
    thumbnailUrl: record.image || record.images?.[0],
    sourceLabel: author ? `@${author}` : 'MeiGen.ai',
    sourceUrl: record.source_url,
    featured: typeof record.rank === 'number' && record.rank <= 24,
    kind: 'trending',
  }
}

function normalizeTemplateGroup(
  record: TemplateGroupRecord
): InspirationTemplateGroup | null {
  const id = record.id?.trim() || ''
  const title = record.title?.trim() || ''
  if (!id || !title) return null
  const entries = (record.entries || [])
    .map((entry): InspirationTemplate => {
      const kind: InspirationTemplate['kind'] =
        entry.kind === 'json' || entry.kind === 'tips' ? entry.kind : 'text'
      return {
        id: entry.id || `${id}-${entry.title}`,
        title: entry.title?.trim() || '',
        kind,
        content: entry.content?.trim() || '',
      }
    })
    .filter((entry) => entry.title && entry.content)
  if (!entries.length) return null
  return {
    id,
    title,
    coverUrl: resolveAsset(record.coverSrc),
    tags: record.tags || [],
    entries,
  }
}

async function loadJson<T>(fileName: string): Promise<T> {
  const response = await fetch(`${LIBRARY_BASE_PATH}${fileName}`)
  if (!response.ok) throw new Error(`灵感库加载失败：${fileName}`)
  return response.json() as Promise<T>
}

export async function loadInspirationLibrary(): Promise<InspirationLibrary> {
  const [caseRecords, trendingRecords, templateRecords] = await Promise.all([
    loadJson<CaseRecord[]>('cases.json'),
    loadJson<TrendingRecord[]>('trending-prompts.json'),
    loadJson<TemplateGroupRecord[]>('templates.json'),
  ])

  return {
    cases: caseRecords.map(normalizeCase).filter(Boolean) as InspirationCase[],
    trending: trendingRecords
      .map(normalizeTrending)
      .filter(Boolean) as InspirationCase[],
    templateGroups: templateRecords
      .map(normalizeTemplateGroup)
      .filter(Boolean) as InspirationTemplateGroup[],
  }
}

export async function loadHomepageInspirationCases() {
  const caseRecords = await loadJson<CaseRecord[]>('cases.json')
  return caseRecords.map(normalizeCase).filter(Boolean) as InspirationCase[]
}

export function pickHomepageTemplates(
  cases: InspirationCase[],
  count = 5
): InspirationCase[] {
  const curated = HOMEPAGE_TEMPLATE_IDS.map((id) =>
    cases.find((item) => item.id === id)
  ).filter(Boolean) as InspirationCase[]
  return [...curated].sort(() => Math.random() - 0.5).slice(0, count)
}

const DRAFT_KEY = 'image-workshop:draft-prompt'

export function saveWorkshopDraft(prompt: string) {
  window.sessionStorage.setItem(DRAFT_KEY, prompt)
}

export function takeWorkshopDraft() {
  const prompt = window.sessionStorage.getItem(DRAFT_KEY) || ''
  window.sessionStorage.removeItem(DRAFT_KEY)
  return prompt
}
