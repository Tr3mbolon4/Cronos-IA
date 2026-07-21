import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import type { AppRoute, CoreState, DocumentItem, Hardware, MemorySummary, Message, RetrievalSummary, SetupStatus, StartupError, StartupPhase } from './app/types'
import { useAppRouter } from './app/useAppRouter'
import { coreStateMeta } from './app/coreState'
import { ApiClient } from './services/apiClient'
import { authHeaders, loadSetupStatus, loginFailureMessage, startupMessage } from './app/startup'
import { LockedScreen, StartupErrorScreen } from './app/AppScreens'
import { openRuntimeLogs, resolveRuntimeConnection, restartRuntimeConnection, shutdownCronos } from './services/runtimeConnection'
import { AppShell } from './layouts/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ChatPage } from './pages/ChatPage'
import { LibraryPage } from './pages/LibraryPage'
import { MemoryPage } from './pages/MemoryPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProjectsPage, LearningPage, NotFoundPage, ToolsPage } from './pages/StaticModulePages'
import { SystemPage } from './pages/SystemPage'

const DEFAULT_API_URL = import.meta.env.VITE_CRONOS_API_URL || 'http://127.0.0.1:8000'
const CRONOS_VERSION = 'v0.2.0'

function App() {
  const { route, navigate } = useAppRouter()
  const [visualCoreState, setVisualCoreState] = useState<CoreState | null>(() => readVisualCoreState())
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [startupPhase, setStartupPhase] = useState<StartupPhase>('initializing')
  const [startupError, setStartupError] = useState<StartupError | null>(null)
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_URL)
  const [runtimeToken, setRuntimeToken] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem('cronos.token') || '')
  const [ownerName, setOwnerName] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState('')
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [memories, setMemories] = useState<MemorySummary[]>([])
  const [hardware, setHardware] = useState<Hardware | null>(null)
  const [retrieval, setRetrieval] = useState<RetrievalSummary>({ mode: 'lexical', provider: 'lexical-only', loaded: false })
  const [notice, setNotice] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [commandSubmitting, setCommandSubmitting] = useState(false)
  const [coreState, setCoreState] = useState<CoreState>('offline')
  const [internetOnline, setInternetOnline] = useState(() => navigator.onLine)
  const [sidebarCompact, setSidebarCompact] = useState(() => localStorage.getItem('cronos.sidebar.compact') === 'true')
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('cronos.motion.reduced') === 'true')

  const authenticated = Boolean(token)
  const owner = setup?.owner?.name || ownerName || 'Alexandre'
  const apiClient = useMemo(() => new ApiClient({ baseUrl: apiBaseUrl, runtimeToken, authToken: token }), [apiBaseUrl, runtimeToken, token])
  const api = useCallback(<T,>(path: string, options: RequestInit = {}) => apiClient.request<T>(path, options), [apiClient])

  const refreshProtectedData = useCallback(async (activeToken = token) => {
    if (!activeToken) return
    const protectedClient = new ApiClient({ baseUrl: apiBaseUrl, runtimeToken, authToken: activeToken })
    const [history, docs, diag, indexStatus, memoryList] = await Promise.all([
      protectedClient.get<Message[]>('/chat/history'),
      protectedClient.get<DocumentItem[]>('/documents'),
      protectedClient.get<Hardware>('/diagnostics/hardware'),
      protectedClient.get<Record<string, unknown>>('/library/index/status').catch(() => null),
      protectedClient.get<{ items: MemorySummary[] }>('/memories?limit=4&offset=0&order_by=updated_at&order_direction=desc').catch(() => ({ items: [] })),
    ])
    setMessages(history)
    setDocuments(docs)
    setMemories(memoryList.items || [])
    setHardware(diag)
    if (indexStatus) {
      const providerInfo = typeof indexStatus.provider === 'object' && indexStatus.provider !== null ? indexStatus.provider as Record<string, unknown> : {}
      setRetrieval({
        mode: String(indexStatus.mode || 'lexical'),
        provider: String(providerInfo.provider || indexStatus.loaded_provider || indexStatus.configured_provider || 'cronos-local-semantic'),
        loaded: Boolean(indexStatus.provider_loaded || indexStatus.semantic_available || providerInfo.loaded || providerInfo.available),
      })
    }
  }, [apiBaseUrl, runtimeToken, token])

  const initializeStartup = useCallback(async (phase: StartupPhase = 'backend_starting') => {
    try {
      setStartupError(null)
      setSetup(null)
      setRuntimeReady(false)
      setStartupPhase(phase)
      setCoreState('offline')
      const connection = phase === 'retrying' ? await restartRuntimeConnection() : await resolveRuntimeConnection()
      setStartupPhase('backend_ready')
      setApiBaseUrl(connection.base_url)
      setRuntimeToken(connection.runtime_token)
      setRuntimeReady(true)
      setCoreState(connection.state === 'ready' || connection.state === 'web' ? 'locked' : 'offline')
      setStartupPhase('loading_identity')
      const setupStatus = await loadSetupStatus(connection.base_url, connection.runtime_token)
      setSetup(setupStatus)
      setStartupPhase(setupStatus.configured ? 'owner_exists' : 'owner_not_registered')
      setCoreState(setupStatus.configured ? 'locked' : 'offline')
      if (window.location.pathname === '/') navigate('/dashboard')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Backend local indisponivel.'
      setNotice(detail)
      setCoreState('offline')
      setStartupPhase('error')
      setStartupError({
        code: detail.toLowerCase().includes('timeout') ? 'CRONOS-STARTUP-002' : 'CRONOS-STARTUP-001',
        message: 'Nao foi possivel iniciar o nucleo local do CRONOS.',
        detail,
        phase,
      })
    }
  }, [navigate])

  useEffect(() => {
    initializeStartup('initializing').catch(() => undefined)
  }, [initializeStartup])

  useEffect(() => {
    const updateOnline = () => setInternetOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
    localStorage.setItem('cronos.motion.reduced', String(reducedMotion))
  }, [reducedMotion])

  useEffect(() => {
    localStorage.setItem('cronos.sidebar.compact', String(sidebarCompact))
  }, [sidebarCompact])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const updateVisualCoreState = () => setVisualCoreState(readVisualCoreState())
    window.addEventListener('popstate', updateVisualCoreState)
    return () => window.removeEventListener('popstate', updateVisualCoreState)
  }, [])

  useEffect(() => {
    if (!authenticated) {
      setCoreState(setup?.configured ? 'locked' : 'offline')
      return
    }
    if (visualCoreState) {
      setCoreState(visualCoreState)
      return
    }
    setCoreState('ready')
    refreshProtectedData().catch(() => {
      localStorage.removeItem('cronos.token')
      setToken('')
      setCoreState('error')
    })
    const timer = window.setInterval(() => {
      refreshProtectedData().catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [authenticated, setup?.configured, refreshProtectedData, visualCoreState])

  useEffect(() => {
    if (visualCoreState && authenticated) setCoreState(visualCoreState)
  }, [authenticated, visualCoreState])

  async function handleSetup(event: FormEvent) {
    event.preventDefault()
    setCoreState('processing')
    const result = await api<{ token: string; owner: { name: string } }>('/setup/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ownerName, password, pin }),
    })
    localStorage.setItem('cronos.token', result.token)
    setToken(result.token)
    setSetup({ configured: true, owner: { id: 1, name: result.owner.name } })
    setNotice('Identidade do proprietario criada.')
    setCoreState('ready')
    navigate('/dashboard')
    await refreshProtectedData(result.token)
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    if (loginSubmitting) return
    setLoginError('')
    setCoreState('locked')
    setLoginSubmitting(true)
    try {
      const result = await api<{ token: string; owner: { name: string } }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, pin }),
      })
      localStorage.setItem('cronos.token', result.token)
      setToken(result.token)
      setNotice(`Sessao autenticada para ${result.owner.name}.`)
      setCoreState('ready')
      navigate('/dashboard')
      await refreshProtectedData(result.token)
    } catch (error) {
      setCoreState('locked')
      setLoginError(loginFailureMessage(error))
    } finally {
      setLoginSubmitting(false)
    }
  }

  async function handleLock() {
    await api('/auth/lock', { method: 'POST', headers: authHeaders(token) })
    localStorage.removeItem('cronos.token')
    setToken('')
    setMessages([])
    setMemories([])
    setCoreState('locked')
    setNotice('CRONOS bloqueado.')
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault()
    const clean = message.trim()
    if (!clean) return
    setCoreState('processing')
    setMessages((current) => [...current, { role: 'user', content: clean }])
    setMessage('')
    try {
      const response = await api<Message>('/chat', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ message: clean }),
      })
      setMessages((current) => [...current, response])
      setCoreState('ready')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nao foi possivel enviar a mensagem.')
      setCoreState('error')
    }
  }

  async function handleDashboardCommand(event: FormEvent) {
    event.preventDefault()
    if (commandSubmitting) return
    const clean = message.trim()
    if (!clean) return
    setCommandSubmitting(true)
    setCoreState('thinking')
    try {
      await handleChat(event)
      navigate('/chat')
    } finally {
      setCommandSubmitting(false)
    }
  }

  function handleUnavailable(message: string) {
    setNotice(message)
    setCoreState('warning')
  }

  function clearCommand() {
    setMessage('')
  }

  async function handleBackup() {
    setCoreState('processing')
    const result = await api<{ filename: string }>('/backup', { method: 'POST', headers: authHeaders(token) })
    setNotice(`Backup criado: ${result.filename}`)
    setCoreState('success')
  }

  function renderRoute(activeRoute: AppRoute) {
    if (activeRoute === '/dashboard') {
      return (
        <DashboardPage
          owner={owner}
          notice={notice}
          coreState={coreState}
          hardware={hardware}
          messages={messages}
          memories={memories}
          documents={documents}
          retrieval={retrieval}
          command={message}
          backendReady={runtimeReady}
          online={internetOnline}
          version={CRONOS_VERSION}
          submitting={commandSubmitting}
          onCommandChange={setMessage}
          onSubmitCommand={handleDashboardCommand}
          onClearCommand={clearCommand}
          onNavigate={navigate}
          onLock={handleLock}
          onUnavailable={handleUnavailable}
        />
      )
    }
    if (activeRoute === '/chat') return <ChatPage messages={messages} draft={message} onDraftChange={setMessage} onSubmit={handleChat} />
    if (activeRoute === '/memory') return <MemoryPage client={apiClient} onNotice={setNotice} />
    if (activeRoute === '/library') return <LibraryPage client={apiClient} onNotice={setNotice} />
    if (activeRoute === '/projects') return <ProjectsPage />
    if (activeRoute === '/learning') return <LearningPage />
    if (activeRoute === '/tools') return <ToolsPage />
    if (activeRoute === '/system') return <SystemPage hardware={hardware} retrieval={retrieval} apiBaseUrl={apiBaseUrl} />
    if (activeRoute === '/settings') return <SettingsPage reducedMotion={reducedMotion} onReducedMotionChange={setReducedMotion} />
    if (activeRoute === '/security') return <SecurityPage owner={owner} onBackup={handleBackup} onLock={handleLock} />
    return <NotFoundPage />
  }

  if (startupError) {
    return (
      <StartupErrorScreen
        error={startupError}
        onRetry={() => initializeStartup('retrying')}
        onOpenLogs={() => openRuntimeLogs().catch((error) => setNotice(error instanceof Error ? error.message : 'Nao foi possivel abrir os logs.'))}
        onClose={() => shutdownCronos().catch(() => window.close())}
      />
    )
  }

  if (!runtimeReady || !setup) return <main className="loading">{startupMessage(startupPhase)}</main>

  if (!authenticated) {
    return (
      <LockedScreen
        setup={setup}
        ownerName={ownerName}
        password={password}
        pin={pin}
        loginError={loginError}
        submitting={loginSubmitting}
        onOwnerNameChange={setOwnerName}
        onPasswordChange={setPassword}
        onPinChange={setPin}
        onSubmit={setup.configured ? handleLogin : handleSetup}
      />
    )
  }

  return (
    <AppShell
      route={route}
      owner={owner}
      sidebarCompact={sidebarCompact}
      backendReady={runtimeReady}
      online={internetOnline}
      retrieval={retrieval}
      hardware={hardware}
      coreState={coreState}
      onNavigate={navigate}
      onToggleSidebar={() => setSidebarCompact((value) => !value)}
      onLock={handleLock}
      version={CRONOS_VERSION}
    >
      {renderRoute(route)}
    </AppShell>
  )
}

function readVisualCoreState(): CoreState | null {
  if (!import.meta.env.DEV) return null
  const forced = new URLSearchParams(window.location.search).get('visualCoreState') as CoreState | null
  return forced && forced in coreStateMeta ? forced : null
}

export default App
