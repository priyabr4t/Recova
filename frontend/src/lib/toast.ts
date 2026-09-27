import { toast as manager } from '@/components/ui/toast'

/** Typed helpers over the base-ui toast manager. */
export const toast = {
  success: (title: string, description?: string) =>
    manager.add({ type: 'success', title, description, timeout: 4000 }),
  error: (title: string, description?: string) =>
    manager.add({ type: 'error', title, description, timeout: 6000 }),
  info: (title: string, description?: string) =>
    manager.add({ type: 'info', title, description, timeout: 4000 }),
  warning: (title: string, description?: string) =>
    manager.add({ type: 'warning', title, description, timeout: 6000 }),
}
