import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import './App.css'
import type { AppRoute, CoreState, DocumentItem, Hardware, Message, RetrievalSummary, SetupStatus, StartupError, StartupPhase } from './app/types'
import { useAppRouter } from './app/useAppRouter'
import { ApiClient, ApiError, mergeHeaders } from './services/apiClient'
import { openRuntimeLogs, resolveRuntimeConnection, restartRuntimeConnection, shutdownCronos } from './services/runtimeConnection'
import { AppShell } from './layouts/AppShell'
import { CronosCore } from './components/core/CronosCore'
import { DashboardPage } from './pages/DashboardPage'
import { ChatPage } from './pages/ChatPage'
import { LibraryPage } from './pages/LibraryPage'
import { MemoryPage } from './pages/MemoryPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProjectsPage, LearningPage, NotFoundPage, ToolsPage } from './pages/StaticModulePages'
import { SystemPage } from './pages/SystemPage'

const DEFAULT_API_URL = import.meta.env.VITE_CRONOS_API_URL || 'http://127.0.0.1:8000'
const CRONOS_VERSION = 'v0.2.0'
const LOGIN_INVALID_MESSAGE = 'Senha ou PIN invalido. Verifique os dados e tente novamente.'
const LOGIN_BACKEND_UNAVAILABLE_MESSAGE = 'Nao foi possivel acessar o nucleo do CRONOS. Tente novamente.'
const LOGIN_UNKNOWN_MESSAGE = 'Nao foi possivel concluir o login.'

function App() {
  const { route, navigate } = useAppRouter()
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
  const [hardware, setHardware] = useState<Hardware | null>(null)
  const [retrieval, setRetrieval] = useState<RetrievalSummary>({ mode: 'lexical', provider: 'lexical-only', loaded: false })
  const [notice, setNotice] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
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
    const [history, docs, diag, indexStatus] = await Promise.all([
      protectedClient.get<Message[]>('/chat/history'),
      protectedClient.get<DocumentItem[]>('/documents'),
      protectedClient.get<Hardware>('/diagnostics/hardware'),
      protectedClient.get<Record<string, unknown>>('/library/index/status').catch(() => null),
    ])
    setMessages(history)
    setDocuments(docs)
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
    if (!authenticated) {
      setCoreState(setup?.configured ? 'locked' : 'offline')
      return
    }
    setCoreState('idle')
    refreshProtectedData().catch(() => {
      localStorage.removeItem('cronos.token')
      setToken('')
      setCoreState('error')
    })
    const timer = window.setInterval(() => {
      refreshProtectedData().catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [authenticated, setup?.configured, refreshProtectedData])

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
    setCoreState('idle')
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
      setCoreState('idle')
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
    const response = await api<Message>('/chat', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ message: clean }),
    })
    setMessages((current) => [...current, response])
    setCoreState('idle')
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
          documents={documents}
          retrieval={retrieval}
          command={message}
          onCommandChange={setMessage}
          onSubmitCommand={handleChat}
          onNavigate={navigate}
          onSetCoreState={setCoreState}
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

function LockedScreen({
  setup,
  ownerName,
  password,
  pin,
  loginError,
  submitting,
  onOwnerNameChange,
  onPasswordChange,
  onPinChange,
  onSubmit,
}: {
  setup: SetupStatus
  ownerName: string
  password: string
  pin: string
  loginError: string
  submitting: boolean
  onOwnerNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPinChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <main className="auth-screen">
      <section className="auth-core-panel">
        <CronosCore state={setup.configured ? 'locked' : 'offline'} />
        <form className="auth-panel-v3" onSubmit={onSubmit}>
          <span>CRONOS</span>
          <h1>{setup.configured ? 'Autorizacao do proprietario' : 'Primeira configuracao'}</h1>
          {!setup.configured && (
            <label>
              Nome do proprietario
              <input value={ownerName} onChange={(event) => onOwnerNameChange(event.target.value)} required />
            </label>
          )}
          <label>
            Senha principal
            <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required />
          </label>
          <label>
            PIN
            <input inputMode="numeric" value={pin} onChange={(event) => onPinChange(event.target.value)} required />
          </label>
          {setup.configured && loginError && <p className="auth-error" role="alert">{loginError}</p>}
          <button type="submit" className="primary" disabled={setup.configured && submitting}>
            <LogIn size={14} /> {setup.configured ? (submitting ? 'Entrando...' : 'Entrar') : 'Criar proprietario'}
          </button>
        </form>
      </section>
    </main>
  )
}

function StartupErrorScreen({
  error,
  onRetry,
  onOpenLogs,
  onClose,
}: {
  error: StartupError
  onRetry: () => void
  onOpenLogs: () => void
  onClose: () => void
}) {
  return (
    <main className="startup-error">
      <section className="startup-error-panel">
        <div className="brand-mark alert-core" />
        <span>{error.code}</span>
        <h1>Nao foi possivel iniciar o CRONOS</h1>
        <p>O nucleo local nao respondeu dentro do tempo esperado.</p>
        <details>
          <summary>Mostrar detalhes tecnicos</summary>
          <code>{error.detail || startupMessage(error.phase)}</code>
        </details>
        <div className="startup-actions">
          <button type="button" className="primary" onClick={onRetry}>Tentar novamente</button>
          <button type="button" onClick={onOpenLogs}>Abrir pasta de logs</button>
          <button type="button" className="danger" onClick={onClose}>Fechar CRONOS</button>
        </div>
      </section>
    </main>
  )
}

function loginFailureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return LOGIN_INVALID_MESSAGE
    if (error.status === 408 || error.code === 'CRONOS_TIMEOUT') return LOGIN_BACKEND_UNAVAILABLE_MESSAGE
    return LOGIN_UNKNOWN_MESSAGE
  }
  if (error instanceof TypeError) return LOGIN_BACKEND_UNAVAILABLE_MESSAGE
  return LOGIN_UNKNOWN_MESSAGE
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Timeout apos ${timeoutMs} ms.`)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

async function loadSetupStatus(baseUrl: string, runtimeToken: string): Promise<SetupStatus> {
  const response = await fetchWithTimeout(`${baseUrl}/setup/status`, {
    headers: mergeHeaders(undefined, runtimeToken),
  }, 15000)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Falha ao carregar identidade.' }))
    throw new Error(payload.detail || 'Falha ao carregar identidade.')
  }
  return response.json()
}

function startupMessage(phase: StartupPhase) {
  return {
    initializing: 'Iniciando nucleo local...',
    backend_starting: 'Iniciando nucleo local...',
    backend_ready: 'Nucleo local pronto...',
    loading_identity: 'Carregando identidade...',
    owner_exists: 'Identidade carregada...',
    owner_not_registered: 'Preparando primeiro cadastro...',
    authentication_required: 'Aguardando autorizacao...',
    error: 'Falha na inicializacao.',
    retrying: 'Tentando reiniciar o nucleo local...',
  }[phase]
}

export default App
