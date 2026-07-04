import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { EnterpriseCdkAdminPage } from '@/features/enterprise-cdk-admin'

export const Route = createFileRoute('/_authenticated/enterprise-cdk-admin/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: EnterpriseCdkAdminPage,
})
