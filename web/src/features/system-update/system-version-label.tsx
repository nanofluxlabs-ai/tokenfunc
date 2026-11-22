import { useStatus } from '@/hooks/use-status'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

// 顶栏只展示当前版本号；上游更新检查仅保留在 系统设置 › 运营设置 › 系统维护
export function SystemVersionLabel() {
  const isAdmin = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.ADMIN
  )
  const { status } = useStatus()
  const version = status?.version?.trim()
  if (!isAdmin || !version || version === 'v0.0.0' || version === '0.0.0') {
    return null
  }

  return (
    <span
      title={version}
      className='text-muted-foreground hidden max-w-32 truncate px-1.5 font-mono text-xs @min-[22rem]/system-brand:inline'
    >
      {version}
    </span>
  )
}
