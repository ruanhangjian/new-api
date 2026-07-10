import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PaginationControlsProps = {
  page: number
  pageSize?: number
  total?: number
  onPageChange: (page: number) => void
}

export function PaginationControls({
  page,
  pageSize = 20,
  total = 0,
  onPageChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className='flex items-center justify-end gap-2 text-sm'>
      <span className='text-muted-foreground'>
        第 {page} 页，共 {totalPages} 页
      </span>
      <Button
        variant='outline'
        size='sm'
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft />
        上一页
      </Button>
      <Button
        variant='outline'
        size='sm'
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        下一页
        <ChevronRight />
      </Button>
    </div>
  )
}
