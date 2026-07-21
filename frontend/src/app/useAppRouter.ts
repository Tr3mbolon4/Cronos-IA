import { useCallback, useEffect, useState } from 'react'
import type { AppRoute } from './types'
import { normalizeRoute } from './navigation'

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>(() => normalizeRoute(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setRoute(normalizeRoute(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((nextRoute: AppRoute) => {
    const target = nextRoute === '/not-found' ? '/dashboard' : nextRoute
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target)
    }
    setRoute(target)
  }, [])

  return { route, navigate }
}
