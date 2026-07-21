import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  Archive,
  Bell,
  BookOpen,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Code2,
  Cpu,
  Database,
  FileCode2,
  FolderOpen,
  Gauge,
  HardDrive,
  Home,
  KeyRound,
  Keyboard,
  Layers3,
  Library,
  Lock,
  LogIn,
  Maximize2,
  MemoryStick,
  MessageSquare,
  Mic,
  Minimize2,
  Network,
  Paperclip,
  Power,
  Radio,
  Send,
  Settings,
  Shield,
  Upload,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import './App.css'
import { ApiClient, mergeHeaders } from './services/apiClient'
import {
  openRuntimeLogs,
  resolveRuntimeConnection,
  restartRuntimeConnection,
  shutdownCronos,
} from './services/runtimeConnection'
import { MemoryPage } from './pages/MemoryPage'
import { LibraryPage } from './pages/LibraryPage'

const DEFAULT_API_URL = import.meta.env.VITE_CRONOS_API_URL || 'http://127.0.0.1:8000'
const CRONOS_VERSION = 'v0.1.2'

type SetupStatus = {
  configured: boolean
  owner: { id: number; name: string } | null
}

type Message = {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

type DocumentItem = {
  id: number
  filename: string
  created_at: string
}

type Hardware = {
  system: string
  release: string
  processor: string
  cpu_count: number
  cpu_percent: number
  ram_gb: number
  ram_percent: number
  disk_total_gb: number
  disk_free_gb: number
  disk_percent: number
  recommended_profile: string
  gpu: string
  gpu_percent: number | null
  vram_gb: number | null
  gpu_temperature_c: number | null
}

type CoreState = 'available' | 'listening' | 'authorization' | 'processing' | 'alert' | 'offline'
type ActiveModule = 'dashboard' | 'memory' | 'library'
type StartupPhase =
  | 'initializing'
  | 'backend_starting'
  | 'backend_ready'
  | 'loading_identity'
  | 'owner_exists'
  | 'owner_not_registered'
  | 'authentication_required'
  | 'error'
  | 'retrying'

type StartupError = {
  code: string
  message: string
  detail?: string
  phase: StartupPhase
}

const menuItems = [
  ['Inicio', Home],
  ['Conversar', MessageSquare],
  ['Projetos', FolderOpen],
  ['Programador', Code2],
  ['Biblioteca', Library],
  ['Aprendizado', BookOpen],
  ['Outras IAs', Boxes],
  ['Memoria', BrainCircuit],
  ['Tarefas', CheckCircle2],
  ['Autorizacoes', KeyRound],
  ['Dispositivos', Radio],
  ['Seguranca', Shield],
  ['Armazenamento', HardDrive],
  ['Desempenho', Gauge],
  ['Versoes', Layers3],
  ['Configuracoes', Settings],
] as const

function App() {
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
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null)
  const [documentQuestion, setDocumentQuestion] = useState('')
  const [documentAnswer, setDocumentAnswer] = useState<{ answer: string; citations: string[] } | null>(null)
  const [hardware, setHardware] = useState<Hardware | null>(null)
  const [notice, setNotice] = useState('')
  const [coreState, setCoreState] = useState<CoreState>('offline')
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null)
  const [internetOnline, setInternetOnline] = useState(() => navigator.onLine)
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard')

  const authenticated = Boolean(token)
  const owner = setup?.owner?.name || ownerName || 'Alexandre'

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token],
  )

  const apiClient = useMemo(() => new ApiClient({ baseUrl: apiBaseUrl, runtimeToken, authToken: token }), [apiBaseUrl, runtimeToken, token])

  const api = useCallback(<T,>(path: string, options: RequestInit = {}) => apiClient.request<T>(path, options), [apiClient])

  const refreshProtectedData = useCallback(async (activeToken = token) => {
    if (!activeToken) return
    const protectedClient = new ApiClient({ baseUrl: apiBaseUrl, runtimeToken, authToken: activeToken })
    const [history, docs, diag] = await Promise.all([
      protectedClient.get<Message[]>('/chat/history'),
      protectedClient.get<DocumentItem[]>('/documents'),
      protectedClient.get<Hardware>('/diagnostics/hardware'),
    ])
    setMessages(history)
    setDocuments(docs)
    setHardware(diag)
  }, [apiBaseUrl, runtimeToken, token])

  useEffect(() => {
    initializeStartup('initializing').catch(() => undefined)
  }, [])

  async function initializeStartup(phase: StartupPhase = 'backend_starting') {
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
      setCoreState(connection.state === 'ready' || connection.state === 'web' ? 'authorization' : 'offline')
      setStartupPhase('loading_identity')
      const setupStatus = await loadSetupStatus(connection.base_url, connection.runtime_token)
      setSetup(setupStatus)
      setStartupPhase(setupStatus.configured ? 'owner_exists' : 'owner_not_registered')
      setCoreState(setupStatus.configured ? 'authorization' : 'offline')
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
  }

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
    if (!authenticated) {
      setCoreState(setup?.configured ? 'authorization' : 'offline')
      return
    }
    setCoreState('available')
    refreshProtectedData().catch(() => {
      localStorage.removeItem('cronos.token')
      setToken('')
      setCoreState('alert')
    })
    const timer = window.setInterval(() => {
      refreshProtectedData().catch(() => undefined)
    }, 5000)
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
    setCoreState('available')
    await refreshProtectedData(result.token)
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setCoreState('authorization')
    const result = await api<{ token: string; owner: { name: string } }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, pin }),
    })
    localStorage.setItem('cronos.token', result.token)
    setToken(result.token)
    setNotice(`Sessao autenticada para ${result.owner.name}.`)
    setCoreState('available')
    await refreshProtectedData(result.token)
  }

  async function handleLock() {
    await api('/auth/lock', { method: 'POST', headers })
    localStorage.removeItem('cronos.token')
    setToken('')
    setMessages([])
    setCoreState('authorization')
    setNotice('CRONOS bloqueado.')
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault()
    const clean = message.trim()
    if (!clean) return
    const start = performance.now()
    setCoreState('processing')
    setMessages((current) => [...current, { role: 'user', content: clean }])
    setMessage('')
    const response = await api<Message>('/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: clean }),
    })
    setLastResponseMs(Math.round(performance.now() - start))
    setMessages((current) => [...current, response])
    setCoreState('available')
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setCoreState('processing')
    const formData = new FormData()
    formData.append('file', file)
    await fetchWithTimeout(`${apiBaseUrl}/documents/upload`, {
      method: 'POST',
      headers: mergeHeaders({ Authorization: `Bearer ${token}` }, runtimeToken),
      body: formData,
    }, 15000).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).detail)
    })
    setNotice('PDF enviado e processado.')
    setDocuments(await api<DocumentItem[]>('/documents', { headers: { Authorization: `Bearer ${token}` } }))
    setCoreState('available')
  }

  async function handleAskDocument(event: FormEvent) {
    event.preventDefault()
    if (!selectedDocument) return
    setCoreState('processing')
    const start = performance.now()
    const response = await api<{ answer: string; citations: string[] }>(`/documents/${selectedDocument}/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: documentQuestion }),
    })
    setLastResponseMs(Math.round(performance.now() - start))
    setDocumentAnswer(response)
    setCoreState('available')
  }

  async function handleBackup() {
    setCoreState('processing')
    const result = await api<{ path: string; filename: string }>('/backup', { method: 'POST', headers })
    setNotice(`Backup criado: ${result.filename}`)
    setCoreState('available')
  }

  const taskRows = [
    { label: 'Analisando projeto Kalion Connect', value: documents.length ? 68 : 18, tone: 'green' },
    { label: 'Indexando livro Redes de Computadores', value: documents.length ? 31 : 0, tone: 'blue' },
    { label: 'Gerando documentacao', value: Math.min(92, Math.max(8, messages.length * 9)), tone: 'violet' },
  ]

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

  if (!runtimeReady || !setup) {
    return <main className="loading">{startupMessage(startupPhase)}</main>
  }

  return (
    <main className="desktop-frame">
      <aside className="left-rail">
        <div className="rail-brand">
          <div className="mini-core" />
          <strong>CRONOS</strong>
        </div>
        <nav className="rail-nav">
          {menuItems.map(([label, Icon], index) => (
            <button
              type="button"
              className={activeClass(label, activeModule, index)}
              onClick={() => navigateMenu(label, setActiveModule)}
              key={label}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="owner-profile">
          <div className="owner-avatar"><UserRound size={16} /></div>
          <div>
            <strong>Alexandre</strong>
            <span>Proprietario</span>
          </div>
          <ChevronDown size={14} />
        </div>
      </aside>

      <section className="main-window">
        <header className="window-bar">
          <div className="window-title"><div className="tiny-core" /> <span>CRONOS</span></div>
          <div className="window-controls">
            <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            {internetOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            <CircleHelp size={13} />
            <Minimize2 size={13} />
            <Maximize2 size={13} />
            <X size={13} />
          </div>
        </header>

        {!authenticated ? (
          <section className="locked-main">
            <div className="main-status">
              <span>CRONOS</span>
              <strong>{setup.configured ? 'AGUARDANDO AUTORIZACAO' : 'OFFLINE'}</strong>
            </div>
            <CoreVisual state={coreState} />
            <form className="auth-panel" onSubmit={setup.configured ? handleLogin : handleSetup}>
              <h1>{setup.configured ? 'Autorizacao do proprietario' : 'Primeira configuracao'}</h1>
              {!setup.configured && (
                <label>
                  Nome do proprietario
                  <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
                </label>
              )}
              <label>
                Senha principal
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <label>
                PIN
                <input inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} required />
              </label>
              <button type="submit"><LogIn size={14} /> {setup.configured ? 'Entrar' : 'Criar proprietario'}</button>
            </form>
          </section>
        ) : (
          <>
            {activeModule === 'memory' && <MemoryPage client={apiClient} onNotice={setNotice} />}
            {activeModule === 'library' && <LibraryPage client={apiClient} onNotice={setNotice} />}
            {activeModule === 'dashboard' && <section className="home-composition" id="inicio">
              {notice && <div className="notice-line">{notice}</div>}
              <div className="main-status">
                <span>CRONOS</span>
                <strong>ONLINE</strong>
              </div>
              <div className="greeting">
                <h1>Boa tarde, {owner}.</h1>
                <p>Em que posso ajudar?</p>
              </div>
              <CoreVisual state={coreState} />
              <div className="quick-strip">
                <button type="button" onClick={() => setCoreState('listening')}><Mic size={14} /> Falar</button>
                <a href="#conversar"><MessageSquare size={14} /> Conversar</a>
                <a href="#projetos"><FolderOpen size={14} /> Abrir projeto</a>
                <button type="button" onClick={() => setCoreState('processing')}><BookOpen size={14} /> Ensinar</button>
                <a href="#aprendizado"><Library size={14} /> Aprendizado</a>
                <a href="#programador"><FileCode2 size={14} /> Criar programa</a>
              </div>
              <div className="lower-panels">
                <section className="tech-panel tasks-panel" id="tarefas">
                  <h2>TAREFAS ATIVAS</h2>
                  {taskRows.map((task) => <TaskLine key={task.label} {...task} />)}
                </section>
                <section className="tech-panel system-panel" id="desempenho">
                  <h2>SISTEMA</h2>
                  <SystemLine label="CPU" value={`${Math.round(hardware?.cpu_percent ?? 0)}%`} percent={hardware?.cpu_percent ?? 0} />
                  <SystemLine label="RAM" value={`${Math.round(hardware?.ram_percent ?? 0)}%`} percent={hardware?.ram_percent ?? 0} />
                  <SystemLine label="GPU" value={hardware?.gpu_percent == null ? 'pendente' : `${hardware.gpu_percent}%`} percent={hardware?.gpu_percent ?? 0} />
                  <SystemLine label="VRAM" value={hardware?.vram_gb ? `${hardware.vram_gb} GB` : '--'} percent={hardware?.vram_gb ? 50 : 0} />
                  <InfoLine icon={<HardDrive size={13} />} label="Armazenamento" value={`${hardware?.disk_free_gb ?? 0} GB livres`} />
                  <InfoLine icon={<Network size={13} />} label="Clientes conectados" value="1" />
                  <InfoLine icon={<Layers3 size={13} />} label="Versao" value={CRONOS_VERSION} />
                </section>
              </div>
            </section>}

            {activeModule === 'dashboard' && <section className="module-grid" aria-label="Modulos funcionais">
              <section className="module-panel conversation-module" id="conversar">
                <PanelHeader icon={<MessageSquare size={15} />} title="CONVERSAR" />
                <div className="messages">
                  {messages.map((item, index) => (
                    <article key={`${item.role}-${item.id || index}`} className={item.role}>
                      <strong>{item.role === 'user' ? 'Voce' : 'CRONOS'}</strong>
                      <p>{item.content}</p>
                    </article>
                  ))}
                </div>
                <form className="composer" onSubmit={handleChat}>
                  <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Digite uma mensagem..." />
                  <button type="submit" aria-label="Enviar mensagem"><Send size={15} /></button>
                </form>
              </section>

              <section className="module-panel learning-module" id="aprendizado">
                <PanelHeader icon={<BookOpen size={15} />} title="CRONOS — APRENDIZADO" />
                <div className="learning-layout">
                  <div className="source-cover"><BookOpen size={34} /><span>FONTE</span></div>
                  <div className="learning-detail">
                    <span>FONTE ATUAL</span>
                    <strong>{documents.find((doc) => doc.id === selectedDocument)?.filename || 'Nenhum documento selecionado'}</strong>
                    <TaskLine label="Progresso" value={documents.length ? 68 : 0} tone="blue" />
                    <div className="processed-grid">
                      <span>{documents.length} fontes</span>
                      <span>{Math.max(0, messages.length * 3)} conceitos</span>
                      <span>{documentAnswer?.citations.length || 0} citacoes</span>
                      <span>{Math.max(0, documents.length * 12)} perguntas geradas</span>
                    </div>
                  </div>
                </div>
                <label className="upload">
                  <Upload size={14} /> Enviar PDF
                  <input type="file" accept="application/pdf" onChange={handleUpload} />
                </label>
                <select value={selectedDocument || ''} onChange={(event) => setSelectedDocument(Number(event.target.value))}>
                  <option value="">Selecione um PDF</option>
                  {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename}</option>)}
                </select>
                <form className="ask-doc" onSubmit={handleAskDocument}>
                  <textarea value={documentQuestion} onChange={(event) => setDocumentQuestion(event.target.value)} placeholder="Pergunte sobre o PDF selecionado" />
                  <button type="submit" disabled={!selectedDocument}>Conversar sobre a fonte</button>
                </form>
                {documentAnswer && (
                  <div className="answer">
                    <p>{documentAnswer.answer}</p>
                    {documentAnswer.citations.map((citation, index) => <blockquote key={index}>{citation}</blockquote>)}
                  </div>
                )}
              </section>

              <section className="module-panel developer-module" id="programador">
                <PanelHeader icon={<Code2 size={15} />} title="CRONOS DEVELOPER — PROJETO" />
                <div className="developer-layout">
                  <div className="dev-files"><span>ARQUIVOS</span><p>backend<br />frontend<br />docs<br />scripts</p></div>
                  <div className="dev-editor">
                    <div className="tabs"><span>auth.service.ts</span><span>document.controller.ts</span><span>process.py</span></div>
                    <pre>{`async function processDocument(file) {\n  const text = await extractText(file);\n  const tokens = tokenize(text);\n  const analysis = await analyze(tokens);\n  return analysis;\n}`}</pre>
                    <div className="terminal">14:32:21 &gt; Executando testes...<br />14:32:25 &gt; Testes aprovados<br />14:32:25 &gt; Concluido com sucesso.</div>
                  </div>
                  <div className="dev-cronos">
                    <strong>CRONOS</strong>
                    <p>Alteracoes reais exigem revisao e autorizacao antes de modificar arquivos.</p>
                    <button type="button" onClick={() => setCoreState('authorization')}>Ver alteracoes</button>
                    <button type="button" className="primary" onClick={() => setCoreState('authorization')}>Autorizar</button>
                    <button type="button" className="danger">Recusar</button>
                  </div>
                </div>
              </section>

              <section className="authorization-band" id="autorizacoes">
                <Lock size={34} />
                <div>
                  <h2>CRONOS SOLICITA AUTORIZACAO</h2>
                  <p>Acao: atualizar modulo de leitura de documentos. Esta acao requer confirmacao do proprietario.</p>
                </div>
                <div><span>ALTERACOES</span><strong>8 arquivos modificados</strong></div>
                <div><span>TESTES</span><strong>128 de 128 aprovados</strong></div>
                <div><span>RISCO</span><strong>Baixo</strong></div>
                <div className="auth-actions">
                  <button type="button">Autorizar com identidade</button>
                  <button type="button">Ver detalhes</button>
                  <button type="button" className="danger">Recusar</button>
                </div>
              </section>

              <section className="quick-window module-panel">
                <PanelHeader icon={<Power size={15} />} title="JANELA RAPIDA" />
                <div className="quick-window-body">
                  <div className="quick-window-core"><CoreVisual state={coreState} compact /></div>
                  <p>Alexandre, estou pronto.</p>
                  <div className="quick-buttons"><button><Mic size={14} /></button><button><Paperclip size={14} /></button><button><Keyboard size={14} /></button><button><Radio size={14} /></button></div>
                  <div className="mini-input">Digite uma mensagem... <Send size={14} /></div>
                  <TaskLine label="Analisando projeto Kalion Connect" value={68} tone="blue" />
                  <p className="pending-auth">Autorizacao pendente</p>
                </div>
              </section>

              <section className="module-panel security-module" id="seguranca">
                <PanelHeader icon={<Shield size={15} />} title="SEGURANCA" />
                <InfoLine icon={<UserRound size={13} />} label="Dispositivo" value="Autorizado" />
                <InfoLine icon={<Lock size={13} />} label="Autenticacao" value="Sessao ativa" />
                <InfoLine icon={<Bell size={13} />} label="Tentativas bloqueadas" value="0" />
                <InfoLine icon={<Archive size={13} />} label="Backup" value="Manual disponivel" />
                <button type="button" onClick={handleBackup}><Archive size={14} /> Criar backup</button>
                <button type="button" className="danger" onClick={handleLock}><Lock size={14} /> Bloquear</button>
              </section>
            </section>}
          </>
        )}

        <footer className="status-bar">
          <span><BrainCircuit size={12} /> {stateLabel(coreState)}</span>
          <span><Database size={12} /> SQLite</span>
          <span><Cpu size={12} /> CPU {Math.round(hardware?.cpu_percent ?? 0)}%</span>
          <span><MemoryStick size={12} /> RAM {Math.round(hardware?.ram_percent ?? 0)}%</span>
          <span><HardDrive size={12} /> {hardware?.disk_free_gb ?? 0} GB</span>
          <span><Network size={12} /> Vetorial pendente</span>
          <span><Mic size={12} /> Mic manual</span>
          <span>{lastResponseMs ? `${lastResponseMs} ms` : 'Resposta --'}</span>
        </footer>
      </section>
    </main>
  )
}

function navigateMenu(label: string, setActiveModule: (module: ActiveModule) => void) {
  if (label === 'Memoria') {
    setActiveModule('memory')
    return
  }
  if (label === 'Biblioteca') {
    setActiveModule('library')
    return
  }
  setActiveModule('dashboard')
  window.requestAnimationFrame(() => {
    document.querySelector(hrefForDashboard(label))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function activeClass(label: string, activeModule: ActiveModule, index: number) {
  if (label === 'Memoria') return activeModule === 'memory' ? 'active' : ''
  if (label === 'Biblioteca') return activeModule === 'library' ? 'active' : ''
  return activeModule === 'dashboard' && index === 0 ? 'active' : ''
}

function hrefForDashboard(label: string) {
  const map: Record<string, string> = {
    Inicio: '#inicio',
    Conversar: '#conversar',
    Projetos: '#projetos',
    Programador: '#programador',
    Aprendizado: '#aprendizado',
    'Outras IAs': '#inicio',
    Tarefas: '#tarefas',
    Autorizacoes: '#autorizacoes',
    Dispositivos: '#seguranca',
    Seguranca: '#seguranca',
    Armazenamento: '#desempenho',
    Desempenho: '#desempenho',
    Versoes: '#desempenho',
    Configuracoes: '#seguranca',
  }
  return map[label] || '#inicio'
}

function CoreVisual({ state, compact = false }: { state: CoreState; compact?: boolean }) {
  return (
    <div className={`cronos-core ${state} ${compact ? 'compact' : ''}`} aria-label={`Estado do CRONOS: ${stateLabel(state)}`}>
      <div className="signal left" />
      <div className="signal right" />
      <div className="ring outer" />
      <div className="ring middle" />
      <div className="ring inner" />
      <div className="core-center" />
    </div>
  )
}

function TaskLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="task-line">
      <div className={`dot ${tone}`} />
      <div className="task-content">
        <div><span>{label}</span><strong>{safeValue}%</strong></div>
        <meter min="0" max="100" value={safeValue} />
      </div>
    </div>
  )
}

function SystemLine({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="system-line">
      <div><span>{label}</span><strong>{value}</strong></div>
      <meter min="0" max="100" value={Math.max(0, Math.min(100, percent))} />
    </div>
  )
}

function InfoLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="info-line">
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="panel-header">{icon}<h2>{title}</h2></div>
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
        <div className="mini-core alert-core" />
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

function stateLabel(state: CoreState) {
  return {
    available: 'Disponivel',
    listening: 'Ouvindo',
    authorization: 'Autorizacao',
    processing: 'Processando',
    alert: 'Alerta',
    offline: 'Offline',
  }[state]
}

export default App
