import { createFileRoute } from '@tanstack/react-router'
import { EnterpriseCdkBatchDetailPage } from '@/features/enterprise-cdk'

export const Route = createFileRoute(
  '/_authenticated/enterprise-cdk/batches/$id'
)({
  component: BatchDetailRoute,
})

function BatchDetailRoute() {
  const { id } = Route.useParams()
  return <EnterpriseCdkBatchDetailPage batchId={Number(id)} />
}
