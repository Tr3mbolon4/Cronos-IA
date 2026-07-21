import type { AppRoute } from './types'

export const protectedRoutes: AppRoute[] = [
  '/dashboard',
  '/chat',
  '/memory',
  '/library',
  '/projects',
  '/learning',
  '/tools',
  '/system',
  '/settings',
  '/security',
]

export function normalizeRoute(pathname: string): AppRoute {
  const clean = pathname === '/' ? '/dashboard' : pathname
  if (protectedRoutes.includes(clean as AppRoute)) return clean as AppRoute
  return '/not-found'
}

export function routeTitle(route: AppRoute) {
  return {
    '/dashboard': 'Dashboard',
    '/chat': 'Conversas',
    '/memory': 'Memoria',
    '/library': 'Biblioteca',
    '/projects': 'Projetos',
    '/learning': 'Aprendizado',
    '/tools': 'Ferramentas',
    '/system': 'Sistema',
    '/settings': 'Configuracoes',
    '/security': 'Seguranca',
    '/not-found': 'Rota nao encontrada',
  }[route]
}
