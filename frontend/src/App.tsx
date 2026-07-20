import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Archive,
  FileText,
  HardDrive,
  Lock,
  LogIn,
  MessageSquare,
  Shield,
  Upload,
} from 'lucide-react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

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
  ram_gb: number
  disk_total_gb: number
  disk_free_gb: number
  recommended_profile: string
  gpu: string
}

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
      .catch((error) => setNotice(error.message))
  }, [])

  useEffect(() => {
    refreshProtectedData().catch(() => {
      localStorage.removeItem('cronos.token')
      setToken('')
    })
  }, [])

  async function handleSetup(event: FormEvent) {
    event.preventDefault()
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
    await refreshProtectedData(result.token)
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    const result = await api<{ token: string; owner: { name: string } }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, pin }),
    })
    localStorage.setItem('cronos.token', result.token)
    setToken(result.token)
    setNotice(`Sessao autenticada para ${result.owner.name}.`)
    await refreshProtectedData(result.token)
  }

  async function handleLock() {
    await api('/auth/lock', { method: 'POST', headers })
    localStorage.removeItem('cronos.token')
    setToken('')
    setMessages([])
    setNotice('CRONOS bloqueado.')
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault()
    const clean = message.trim()
    if (!clean) return
    setMessages((current) => [...current, { role: 'user', content: clean }])
    setMessage('')
    const response = await api<Message>('/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: clean }),
    })
    setMessages((current) => [...current, response])
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
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
  }

  async function handleAskDocument(event: FormEvent) {
    event.preventDefault()
    if (!selectedDocument) return
    const response = await api<{ answer: string; citations: string[] }>(`/documents/${selectedDocument}/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: documentQuestion }),
    })
    setDocumentAnswer(response)
  }

  async function handleBackup() {
    const result = await api<{ path: string; filename: string }>('/backup', { method: 'POST', headers })
    setNotice(`Backup criado: ${result.filename}`)
  }

  if (!setup) {
    return <main className="loading">Inicializando CRONOS...</main>
  }

  const authenticated = Boolean(token)

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Shield size={28} />
          <div>
            <strong>CRONOS</strong>
            <span>{authenticated ? 'Sessao ativa' : 'Bloqueado'}</span>
          </div>
        </div>
        <nav>
          <a href="#chat"><MessageSquare size={18} /> Chat</a>
          <a href="#docs"><FileText size={18} /> PDFs</a>
          <a href="#system"><HardDrive size={18} /> Sistema</a>
          <button type="button" onClick={handleBackup} disabled={!authenticated}>
            <Archive size={18} /> Backup
          </button>
          <button type="button" onClick={handleLock} disabled={!authenticated}>
            <Lock size={18} /> Bloquear
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>Proprietario</p>
            <h1>{setup.owner?.name || 'Configurar identidade'}</h1>
          </div>
          <span className={authenticated ? 'status ok' : 'status locked'}>
            {authenticated ? 'Autenticado' : 'Protegido'}
          </span>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {!authenticated ? (
          <section className="auth-panel">
            <form onSubmit={setup.configured ? handleLogin : handleSetup}>
              <h2>{setup.configured ? 'Entrar no CRONOS' : 'Primeira configuracao'}</h2>
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
                <LogIn size={18} /> {setup.configured ? 'Autenticar' : 'Criar proprietario'}
              </button>
            </form>
          </section>
        ) : (
          <div className="grid">
            <section id="chat" className="panel chat-panel">
              <h2>Chat local</h2>
              <div className="messages">
                {messages.map((item, index) => (
                  <article key={`${item.role}-${item.id || index}`} className={item.role}>
                    <strong>{item.role === 'user' ? 'Voce' : 'CRONOS'}</strong>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>
              <form className="composer" onSubmit={handleChat}>
                <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Digite um comando..." />
                <button type="submit">Enviar</button>
              </form>
            </section>

            <section id="docs" className="panel">
              <h2>Documentos PDF</h2>
              <label className="upload">
                <Upload size={18} /> Enviar PDF
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
                <button type="submit" disabled={!selectedDocument}>Perguntar</button>
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

            <section id="system" className="panel system-panel">
              <h2>Diagnostico</h2>
              {hardware && (
                <dl>
                  <div><dt>Sistema</dt><dd>{hardware.system} {hardware.release}</dd></div>
                  <div><dt>CPU</dt><dd>{hardware.cpu_count} nucleos logicos</dd></div>
                  <div><dt>RAM</dt><dd>{hardware.ram_gb} GB</dd></div>
                  <div><dt>Disco livre</dt><dd>{hardware.disk_free_gb} GB</dd></div>
                  <div><dt>Perfil</dt><dd>{hardware.recommended_profile}</dd></div>
                  <div><dt>GPU</dt><dd>{hardware.gpu}</dd></div>
                </dl>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
