import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Archive,
  Bell,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  FileText,
  FolderOpen,
  Gauge,
  HardDrive,
  Home,
  KeyRound,
  Lock,
  LogIn,
  MemoryStick,
  MessageSquare,
  Mic,
  Network,
  Send,
  Settings,
  Shield,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'
const CRONOS_VERSION = 'v0.1.0'

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

function App() {
  const [setup, setSetup] = useState<SetupStatus | null>(null)
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

  const authenticated = Boolean(token)

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token],
  )

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, options)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: 'Erro inesperado.' }))
      throw new Error(payload.detail || 'Erro inesperado.')
    }
    return response.json()
  }

  async function refreshProtectedData(activeToken = token) {
    if (!activeToken) return
    const authHeaders = { Authorization: `Bearer ${activeToken}` }
    const [history, docs, diag] = await Promise.all([
      api<Message[]>('/chat/history', { headers: authHeaders }),
      api<DocumentItem[]>('/documents', { headers: authHeaders }),
      api<Hardware>('/diagnostics/hardware', { headers: authHeaders }),
    ])
    setMessages(history)
    setDocuments(docs)
    setHardware(diag)
  }

  useEffect(() => {
    api<SetupStatus>('/setup/status')
      .then(setSetup)
      .catch((error) => {
        setNotice(error.message)
        setCoreState('offline')
      })
  }, [])

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
  }, [authenticated, setup?.configured])

  async function handleSetup(event: FormEvent) {
    event.preventDefault()
    setCoreState('processing')
    const payload = { name: ownerName, password, pin }
    const result = await api<{ token: string; owner: { name: string } }>('/setup/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
    await fetch(`${API_URL}/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (response) => {
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

  const owner = setup?.owner?.name || ownerName || 'Alexandre'
  const tasks = [
    { name: documents.length ? 'Indexando documentos enviados' : 'Aguardando PDF para aprendizado', progress: documents.length ? 68 : 12 },
    { name: messages.length ? 'Atualizando memoria da conversa' : 'Memoria pronta para registrar conversa', progress: Math.min(96, messages.length * 8) },
    { name: 'Monitorando recursos locais', progress: Math.round(hardware?.ram_percent || 0) },
  ]
  const activities = [
    notice || 'Sistema inicializado.',
    `${messages.length} mensagens no historico local.`,
    `${documents.length} PDFs cadastrados.`,
    hardware ? `Perfil recomendado: ${hardware.recommended_profile}.` : 'Diagnostico aguardando sessao.',
  ]

  if (!setup) {
    return <main className="loading">Inicializando CRONOS...</main>
  }

  return (
    <main className="cronos-shell">
      <aside className="cronos-sidebar">
        <div className="brand">
          <div className="brand-core" />
          <div>
            <strong>CRONOS</strong>
            <span>{authenticated ? 'ONLINE' : 'BLOQUEADO'}</span>
          </div>
        </div>
        <nav>
          <a className="active" href="#inicio"><Home size={17} /> Inicio</a>
          <a href="#chat"><MessageSquare size={17} /> Conversar</a>
          <a href="#docs"><FolderOpen size={17} /> Projetos e PDFs</a>
          <a href="#programador"><Code2 size={17} /> Programador</a>
          <a href="#aprendizado"><BookOpen size={17} /> Aprendizado</a>
          <a href="#seguranca"><Shield size={17} /> Seguranca</a>
          <a href="#sistema"><Gauge size={17} /> Desempenho</a>
          <a href="#config"><Settings size={17} /> Configuracoes</a>
        </nav>
        <div className="owner-chip">
          <div className="avatar">AS</div>
          <div>
            <strong>{owner}</strong>
            <span>Proprietario</span>
          </div>
        </div>
      </aside>

      <section className="cronos-stage">
        <header className="top-metrics">
          <Metric label="IA local" value={authenticated ? 'Ativa' : 'Bloqueada'} />
          <Metric label="Modelo" value="Local MVP" />
          <Metric label="Resposta" value={lastResponseMs ? `${lastResponseMs} ms` : '--'} />
          <Metric label="Internet" value={internetOnline ? 'Online' : 'Offline'} icon={internetOnline ? <Wifi size={15} /> : <WifiOff size={15} />} />
          <Metric label="GPU" value={hardware?.gpu_temperature_c ? `${hardware.gpu_temperature_c}C` : 'Pendente'} />
          <Metric label="VRAM" value={hardware?.vram_gb ? `${hardware.vram_gb} GB` : '--'} />
          <Metric label="Versao" value={CRONOS_VERSION} />
        </header>

        {!authenticated ? (
          <section className="auth-screen">
            <CoreOrb state={coreState} />
            <form onSubmit={setup.configured ? handleLogin : handleSetup}>
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
              <button type="submit">
                <LogIn size={17} /> {setup.configured ? 'Entrar' : 'Criar proprietario'}
              </button>
            </form>
          </section>
        ) : (
          <div className="dashboard" id="inicio">
            <section className="hero-panel">
              <div className="hero-copy">
                <span>CRONOS</span>
                <h1>Boa tarde, {owner}.</h1>
                <p>Em que posso ajudar?</p>
              </div>
              <CoreOrb state={coreState} />
              <div className="quick-actions">
                <button type="button" onClick={() => setCoreState('listening')}><Mic size={16} /> Falar</button>
                <a href="#chat"><MessageSquare size={16} /> Conversar</a>
                <a href="#docs"><FolderOpen size={16} /> Abrir projeto</a>
                <a href="#aprendizado"><BookOpen size={16} /> Aprendizado</a>
                <a href="#programador"><Code2 size={16} /> Criar programa</a>
              </div>
            </section>

            <section className="panel chat-panel" id="chat">
              <PanelTitle icon={<MessageSquare size={18} />} title="Conversa com o CRONOS" />
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
                <button type="submit" aria-label="Enviar mensagem"><Send size={17} /></button>
              </form>
            </section>

            <section className="panel tasks-panel">
              <PanelTitle icon={<CheckCircle2 size={18} />} title="Tarefas em execucao" />
              {tasks.map((task) => (
                <ProgressRow key={task.name} label={task.name} value={task.progress} />
              ))}
            </section>

            <section className="panel resources-panel" id="sistema">
              <PanelTitle icon={<Cpu size={18} />} title="Recursos do computador" />
              <div className="resource-grid">
                <Resource label="CPU" value={hardware?.cpu_percent ?? 0} detail={`${hardware?.cpu_count || 0} nucleos`} />
                <Resource label="RAM" value={hardware?.ram_percent ?? 0} detail={`${hardware?.ram_gb || 0} GB`} />
                <Resource label="GPU" value={hardware?.gpu_percent ?? 0} detail={hardware?.gpu || 'pendente'} />
                <Resource label="Disco" value={hardware?.disk_percent ?? 0} detail={`${hardware?.disk_free_gb || 0} GB livres`} />
              </div>
            </section>

            <section className="panel activity-panel">
              <PanelTitle icon={<Bell size={18} />} title="Atividades recentes" />
              <ul>
                {activities.map((activity) => <li key={activity}>{activity}</li>)}
              </ul>
            </section>

            <section className="panel document-panel" id="docs">
              <PanelTitle icon={<FileText size={18} />} title="Aprendizado e PDFs" />
              <div className="learning-layout">
                <div className="book-cover"><BookOpen size={44} /><span>PDF</span></div>
                <div>
                  <strong>{documents.find((doc) => doc.id === selectedDocument)?.filename || 'Nenhum livro selecionado'}</strong>
                  <ProgressRow label="Progresso de leitura" value={documents.length ? 68 : 0} />
                  <div className="learning-stats">
                    <span>{documents.length} fontes</span>
                    <span>{Math.max(0, messages.length * 3)} conceitos</span>
                    <span>{documentAnswer?.citations.length || 0} citacoes</span>
                  </div>
                </div>
              </div>
              <label className="upload">
                <Upload size={17} /> Enviar PDF
                <input type="file" accept="application/pdf" onChange={handleUpload} />
              </label>
              <select value={selectedDocument || ''} onChange={(event) => setSelectedDocument(Number(event.target.value))}>
                <option value="">Selecione um PDF</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.filename}</option>
                ))}
              </select>
              <form className="ask-doc" onSubmit={handleAskDocument}>
                <textarea value={documentQuestion} onChange={(event) => setDocumentQuestion(event.target.value)} placeholder="Pergunte sobre o PDF selecionado" />
                <button type="submit" disabled={!selectedDocument}>Perguntar sobre o PDF</button>
              </form>
              {documentAnswer && (
                <div className="answer">
                  <p>{documentAnswer.answer}</p>
                  {documentAnswer.citations.map((citation, index) => (
                    <blockquote key={index}>{citation}</blockquote>
                  ))}
                </div>
              )}
            </section>

            <section className="panel developer-panel" id="programador">
              <PanelTitle icon={<Code2 size={18} />} title="Modo Programador" />
              <div className="developer-grid">
                <div className="file-tree">
                  <span>ARQUIVOS</span>
                  <p>backend / frontend / docs / scripts</p>
                </div>
                <pre>{`async function authorize(change) {\n  await runTests();\n  return requireOwnerApproval(change);\n}`}</pre>
                <div className="review-box">
                  <strong>Revisao por IA</strong>
                  <p>Alteracoes reais exigirao aprovacao antes de modificar arquivos.</p>
                  <button type="button" onClick={() => setCoreState('authorization')}><KeyRound size={16} /> Solicitar autorizacao</button>
                </div>
              </div>
            </section>

            <section className="panel security-panel" id="seguranca">
              <PanelTitle icon={<Shield size={18} />} title="Seguranca" />
              <div className="security-grid">
                <StatusItem label="Dispositivo" value="Autorizado" />
                <StatusItem label="Autenticacao" value="Sessao ativa" />
                <StatusItem label="Tentativas bloqueadas" value="0" />
                <StatusItem label="Auditoria" value="Ativa" />
                <StatusItem label="Backup" value="Manual disponivel" />
                <button type="button" onClick={handleBackup}><Archive size={16} /> Criar backup</button>
                <button type="button" className="danger" onClick={handleLock}><Lock size={16} /> Bloquear</button>
              </div>
            </section>
          </div>
        )}

        <footer className="bottom-status">
          <span><BrainCircuit size={14} /> {stateLabel(coreState)}</span>
          <span><Database size={14} /> SQLite</span>
          <span><MemoryStick size={14} /> RAM {hardware?.ram_percent ?? 0}%</span>
          <span><Cpu size={14} /> CPU {hardware?.cpu_percent ?? 0}%</span>
          <span><Network size={14} /> Vetorial pendente</span>
          <span><Mic size={14} /> Mic manual</span>
          <span><HardDrive size={14} /> {hardware?.disk_free_gb ?? 0} GB livres</span>
        </footer>
      </section>
    </main>
  )
}

function CoreOrb({ state }: { state: CoreState }) {
  return (
    <div className={`core-orb ${state}`} aria-label={`Estado do CRONOS: ${stateLabel(state)}`}>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="core-dot" />
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="metric"><span>{label}</span><strong>{icon}{value}</strong></div>
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="panel-title">{icon}<h2>{title}</h2></div>
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className="progress-row">
      <div><span>{label}</span><strong>{safeValue}%</strong></div>
      <meter min="0" max="100" value={safeValue} />
    </div>
  )
}

function Resource({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="resource">
      <span>{label}</span>
      <strong>{Math.round(value)}%</strong>
      <meter min="0" max="100" value={value} />
      <small>{detail}</small>
    </div>
  )
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return <div className="status-item"><span>{label}</span><strong>{value}</strong></div>
}

function stateLabel(state: CoreState) {
  return {
    available: 'Disponivel',
    listening: 'Ouvindo',
    authorization: 'Aguardando autorizacao',
    processing: 'Processando',
    alert: 'Alerta',
    offline: 'Offline',
  }[state]
}

export default App
