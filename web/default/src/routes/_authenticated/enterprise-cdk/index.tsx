import { createFileRoute } from '@tanstack/react-router'
import { EnterpriseCdkPage } from '@/features/enterprise-cdk'

export const Route = createFileRoute('/_authenticated/enterprise-cdk/')({
  component: EnterpriseCdkPage,
})
