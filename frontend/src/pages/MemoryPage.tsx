import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, Eye, GitBranch, History, MoreHorizontal, Plus, RefreshCw, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import type { ApiClient } from '../services/apiClient'
import { friendlyError } from '../utils/errors'
import { formatDate, percent } from '../utils/formatting'
import { useMemories } from '../hooks/useMemories'
import { useMemoryDetails } from '../hooks/useMemoryDetails'
import {
  activateMemory,
  archiveMemory,
  createMemory,
  createRelation,
  deleteMemory,
  deleteRelation,
  restoreMemory,
  updateMemory,
} from '../services/memoryApi'
import type { Memory, MemoryInput, MemoryRelationType, MemoryStatus } from '../types/memory'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState } from '../components/common/EmptyState'
import { InlineError } from '../components/common/InlineError'
import { LoadingState } from '../components/common/LoadingState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { memoryStatusLabels, relationTypeLabels } from '../components/memory/memoryLabels'

const defaultFilters = {
  search: '',
  category_id: '',
  status: '',
  source_type: '',
  minimum_confidence: '',
  minimum_importance: '',
  include_deleted: false,
  limit: 10,
  offset: 0,
  order_by: 'updated_at',
  order_direction: 'desc',
}

const initialInput: MemoryInput = {
  title: '',
  content: '',
  category_id: 0,
  confidence: 0.7,
  importance: 3,
  source_type: 'manual',
  source_reference: '',
  status: 'active',
}

export function MemoryPage({ client, onNotice }: { client: ApiClient; onNotice: (message: string) => void }) {
  const { filters, setFilters, items, categories, total, loading, error, reload } = useMemories(client, defaultFilters)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Memory | null>(null)
  const [input, setInput] = useState<MemoryInput>(initialInput)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => Promise<void>; label: string } | null>(null)
  const details = useMemoryDetails(client, selectedId)
  const selected = details.memory
  const page = Math.floor((filters.offset || 0) / (filters.limit || 10)) + 1
  const pages = Math.max(1, Math.ceil(total / (filters.limit || 10)))
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])

  function openCreate() {
    setEditing(null)
    setInput({ ...initialInput, category_id: categories[0]?.id || 0 })
    setShowForm(true)
    setFormError('')
  }

  function openEdit(memory: Memory) {
    setEditing(memory)
    setInput({
      title: memory.title,
      content: memory.content,
      category_id: memory.category_id,
      confidence: memory.confidence,
      importance: memory.importance,
      source_type: memory.source_type,
      source_reference: memory.source_reference || '',
      status: memory.status,
      change_reason: '',
    })
    setShowForm(true)
    setFormError('')
  }

  async function submitMemory(event: FormEvent) {
    event.preventDefault()
    if (!input.title.trim() || !input.content.trim() || !input.category_id) {
      setFormError('Titulo, conteudo e categoria sao obrigatorios.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = { ...input, source_reference: input.source_reference || undefined }
      const saved = editing ? await updateMemory(client, editing.id, changedFields(editing, payload)) : await createMemory(client, payload)
      setSelectedId(saved.id)
      setShowForm(false)
      onNotice(editing ? 'Memoria atualizada.' : 'Memoria criada.')
      await reload()
      await details.reload()
    } catch (error) {
      setFormError(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }

  async function runMemoryAction(action: () => Promise<void>, success: string) {
    setSaving(true)
    try {
      await action()
      onNotice(success)
      await reload()
      await details.reload()
    } catch (error) {
      onNotice(friendlyError(error))
    } finally {
      setSaving(false)
      setConfirm(null)
    }
  }

  function confirmAction(title: string, description: string, label: string, action: () => Promise<void>) {
    setConfirm({ title, description, label, action })
  }

  return (
    <section className="workspace-page memory-page" data-visual="memory-page">
      <PageHeader
        title="Memoria"
        description="Gerencie fatos, preferencias, procedimentos e conhecimento permanente do CRONOS."
        actions={<button type="button" className="primary" onClick={openCreate}><Plus size={14} /> Nova memoria</button>}
      />

      <section className="workspace-toolbar">
        <label>
          Buscar
          <div className="input-with-icon"><Search size={14} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value, offset: 0 })} placeholder="Titulo ou conteudo" /></div>
        </label>
        <label>
          Categoria
          <select value={filters.category_id} onChange={(event) => setFilters({ ...filters, category_id: event.target.value, offset: 0 })}>
            <option value="">Todas</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, offset: 0 })}>
            <option value="">Todos</option>
            {Object.entries(memoryStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
        <label>
          Origem
          <select value={filters.source_type} onChange={(event) => setFilters({ ...filters, source_type: event.target.value, offset: 0 })}>
            <option value="">Todas</option>
            <option value="manual">Manual</option>
            <option value="document">Documento</option>
            <option value="system">Sistema</option>
          </select>
        </label>
        <label>
          Confianca minima
          <input type="number" min="0" max="1" step="0.1" value={filters.minimum_confidence} onChange={(event) => setFilters({ ...filters, minimum_confidence: event.target.value, offset: 0 })} />
        </label>
        <label>
          Importancia minima
          <input type="number" min="1" max="5" value={filters.minimum_importance} onChange={(event) => setFilters({ ...filters, minimum_importance: event.target.value, offset: 0 })} />
        </label>
        <label>
          Ordenacao
          <select value={filters.order_by} onChange={(event) => setFilters({ ...filters, order_by: event.target.value })}>
            <option value="updated_at">Atualizacao</option>
            <option value="created_at">Criacao</option>
            <option value="importance">Importancia</option>
            <option value="confidence">Confianca</option>
            <option value="title">Titulo</option>
          </select>
        </label>
        <label>
          Direcao
          <select value={filters.order_direction} onChange={(event) => setFilters({ ...filters, order_direction: event.target.value })}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </label>
        <label className="checkbox-line">
          <input type="checkbox" checked={Boolean(filters.include_deleted)} onChange={(event) => setFilters({ ...filters, include_deleted: event.target.checked, offset: 0 })} />
          Incluir excluidas
        </label>
        <button type="button" onClick={reload}><RefreshCw size={14} /> Atualizar</button>
      </section>

      <div className="workspace-split">
        <section className="list-surface">
          <InlineError message={error} onRetry={reload} />
          {loading && <LoadingState label="Carregando memorias..." />}
          {!loading && !error && items.length === 0 && <EmptyState title="Nenhuma memoria encontrada" description="Crie uma memoria manual ou ajuste os filtros." action={<button type="button" onClick={openCreate}><Plus size={14} /> Nova memoria</button>} />}
          {items.map((memory) => (
            <article className={`memory-card ${selectedId === memory.id ? 'selected' : ''}`} key={memory.id}>
              <button type="button" className="card-main" onClick={() => setSelectedId(memory.id)}>
                <span className={`status-pill ${memory.status}`}>{memoryStatusLabels[memory.status]}</span>
                <strong>{memory.title}</strong>
                <p>{memory.content.slice(0, 180)}</p>
                <div className="card-meta">
                  <span>{categoryById.get(memory.category_id) || `Categoria ${memory.category_id}`}</span>
                  <span>{memory.source_type}</span>
                  <span>{percent(memory.confidence)}</span>
                  <span>Imp. {memory.importance}</span>
                  <span>{formatDate(memory.updated_at)}</span>
                  {memory.status === 'pending_review' && <span>Revisao pendente</span>}
                </div>
              </button>
              <div className="card-actions">
                <button type="button" aria-label="Visualizar memoria" onClick={() => setSelectedId(memory.id)}><Eye size={14} /></button>
                <button type="button" aria-label="Editar memoria" onClick={() => openEdit(memory)}><Save size={14} /></button>
                <button type="button" aria-label="Mais acoes"><MoreHorizontal size={14} /></button>
              </div>
            </article>
          ))}
          <footer className="pagination-row">
            <button type="button" disabled={page <= 1} onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 10)) })}>Anterior</button>
            <span>Pagina {page} de {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + (filters.limit || 10) })}>Proxima</button>
          </footer>
        </section>

        <aside className="details-surface" data-visual="memory-details">
          {showForm ? (
            <form className="workspace-form" onSubmit={submitMemory}>
              <h2>{editing ? 'Editar memoria' : 'Nova memoria'}</h2>
              <InlineError message={formError} />
              <label>Titulo<input value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} required /></label>
              <label>Conteudo<textarea value={input.content} onChange={(event) => setInput({ ...input, content: event.target.value })} required /></label>
              <div className="form-grid">
                <label>Categoria<select value={input.category_id} onChange={(event) => setInput({ ...input, category_id: Number(event.target.value) })} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label>Status<select value={input.status} onChange={(event) => setInput({ ...input, status: event.target.value as MemoryStatus })}>{Object.entries(memoryStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
                <label>Confianca<input type="number" min="0" max="1" step="0.05" value={input.confidence} onChange={(event) => setInput({ ...input, confidence: Number(event.target.value) })} /></label>
                <label>Importancia<input type="number" min="1" max="5" value={input.importance} onChange={(event) => setInput({ ...input, importance: Number(event.target.value) })} /></label>
                <label>Origem<input value={input.source_type} onChange={(event) => setInput({ ...input, source_type: event.target.value })} /></label>
                <label>Referencia<input value={input.source_reference || ''} onChange={(event) => setInput({ ...input, source_reference: event.target.value })} /></label>
              </div>
              {editing && <label>Motivo da alteracao<input value={input.change_reason || ''} onChange={(event) => setInput({ ...input, change_reason: event.target.value })} /></label>}
              <div className="form-actions">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar memoria'}</button>
              </div>
            </form>
          ) : selected ? (
            <MemoryDetails
              memory={selected}
              category={categoryById.get(selected.category_id) || '--'}
              details={details}
              memories={items}
              onEdit={() => openEdit(selected)}
              onArchive={() => confirmAction('Arquivar memoria', 'A memoria ficara preservada e podera ser ativada novamente.', 'Arquivar', () => runMemoryAction(() => archiveMemory(client, selected.id).then(() => undefined), 'Memoria arquivada.'))}
              onActivate={() => runMemoryAction(() => activateMemory(client, selected.id).then(() => undefined), 'Memoria ativada.')}
              onDelete={() => confirmAction('Remover memoria', 'A exclusao sera logica; revisoes e historico permanecem preservados.', 'Remover', () => runMemoryAction(() => deleteMemory(client, selected.id).then(() => undefined), 'Memoria removida.'))}
              onRestore={() => runMemoryAction(() => restoreMemory(client, selected.id).then(() => undefined), 'Memoria restaurada.')}
              onCreateRelation={async (targetId, relationType, strength, description) => {
                await runMemoryAction(() => createRelation(client, { source_memory_id: selected.id, target_memory_id: targetId, relation_type: relationType, strength, description }).then(() => undefined), 'Relacao criada.')
              }}
              onDeleteRelation={(id) => confirmAction('Excluir relacao', 'A relacao sera removida logicamente.', 'Excluir relacao', () => runMemoryAction(() => deleteRelation(client, id).then(() => undefined), 'Relacao excluida.'))}
            />
          ) : (
            <EmptyState title="Selecione uma memoria" description="Abra uma memoria para visualizar conteudo completo, revisoes e relacoes." />
          )}
        </aside>
      </div>
      {confirm && <ConfirmDialog title={confirm.title} description={confirm.description} confirmLabel={confirm.label} busy={saving} onCancel={() => setConfirm(null)} onConfirm={() => confirm.action()} />}
    </section>
  )
}

function MemoryDetails({
  memory,
  category,
  details,
  memories,
  onEdit,
  onArchive,
  onActivate,
  onDelete,
  onRestore,
  onCreateRelation,
  onDeleteRelation,
}: {
  memory: Memory
  category: string
  details: ReturnType<typeof useMemoryDetails>
  memories: Memory[]
  onEdit: () => void
  onArchive: () => void
  onActivate: () => void
  onDelete: () => void
  onRestore: () => void
  onCreateRelation: (targetId: number, type: MemoryRelationType, strength: number, description: string) => Promise<void>
  onDeleteRelation: (id: number) => void
}) {
  const [targetId, setTargetId] = useState('')
  const [relationType, setRelationType] = useState<MemoryRelationType>('related_to')
  const [strength, setStrength] = useState(0.7)
  const [description, setDescription] = useState('')
  const [relationError, setRelationError] = useState('')

  async function submitRelation(event: FormEvent) {
    event.preventDefault()
    const target = Number(targetId)
    if (!target || target === memory.id) {
      setRelationError('Selecione uma memoria de destino diferente da atual.')
      return
    }
    try {
      setRelationError('')
      await onCreateRelation(target, relationType, strength, description)
      setTargetId('')
      setDescription('')
    } catch (error) {
      setRelationError(friendlyError(error))
    }
  }

  return (
    <div className="details-stack">
      {details.loading && <LoadingState label="Carregando detalhes..." />}
      <div className="details-header">
        <div>
          <span className={`status-pill ${memory.status}`}>{memoryStatusLabels[memory.status]}</span>
          <h2>{memory.title}</h2>
        </div>
        <div className="details-actions">
          <button type="button" onClick={onEdit}><Save size={14} /> Editar</button>
          {memory.status === 'archived' || memory.status === 'pending_review' ? <button type="button" onClick={onActivate}>Ativar</button> : <button type="button" onClick={onArchive}><Archive size={14} /> Arquivar</button>}
          {memory.deleted_at ? <button type="button" onClick={onRestore}><RotateCcw size={14} /> Restaurar</button> : <button type="button" className="danger" onClick={onDelete}><Trash2 size={14} /> Remover</button>}
        </div>
      </div>
      <p className="full-content">{memory.content}</p>
      <div className="detail-grid">
        <span>Categoria<strong>{category}</strong></span>
        <span>Origem<strong>{memory.source_type}</strong></span>
        <span>Referencia<strong>{memory.source_reference || '--'}</strong></span>
        <span>Confianca<strong>{percent(memory.confidence)}</strong></span>
        <span>Importancia<strong>{memory.importance}</strong></span>
        <span>Criada<strong>{formatDate(memory.created_at)}</strong></span>
        <span>Atualizada<strong>{formatDate(memory.updated_at)}</strong></span>
        <span>Acessos<strong>{memory.access_count}</strong></span>
      </div>
      <section className="subsection" data-visual="memory-revisions">
        <h3><History size={14} /> Revisoes</h3>
        {details.revisions.length === 0 ? <p className="muted-text">Nenhuma revisao registrada.</p> : details.revisions.map((revision) => (
          <article className="revision-row" key={revision.id}>
            <strong>Revisao {revision.revision_number}</strong>
            <span>{formatDate(revision.created_at)}</span>
            <p>Campos alterados: {parseChangedFields(revision.changed_fields).join(', ') || '--'}</p>
            <p>Motivo: {revision.change_reason || '--'}</p>
            <small>Titulo anterior: {revision.previous_title}</small>
            <small>Status anterior: {memoryStatusLabels[revision.previous_status]}</small>
          </article>
        ))}
      </section>
      <section className="subsection" data-visual="memory-relations">
        <h3><GitBranch size={14} /> Relacoes</h3>
        <InlineError message={relationError} />
        <form className="relation-form" onSubmit={submitRelation}>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label="Memoria de destino">
            <option value="">Memoria de destino</option>
            {memories.filter((item) => item.id !== memory.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <select value={relationType} onChange={(event) => setRelationType(event.target.value as MemoryRelationType)} aria-label="Tipo da relacao">
            {Object.entries(relationTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
          <input type="number" min="0" max="1" step="0.05" value={strength} onChange={(event) => setStrength(Number(event.target.value))} aria-label="Forca da relacao" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao opcional" />
          <button type="submit"><Plus size={14} /> Relacionar</button>
        </form>
        {details.relations.length === 0 ? <p className="muted-text">Nenhuma relacao ativa.</p> : details.relations.map((relation) => (
          <article className="relation-row" key={relation.id}>
            <div>
              <strong>{relationTypeLabels[relation.relation_type]}</strong>
              <span>Destino #{relation.target_memory_id} | Forca {percent(relation.strength)}</span>
              {relation.description && <p>{relation.description}</p>}
            </div>
            <button type="button" className="danger" aria-label="Excluir relacao" onClick={() => onDeleteRelation(relation.id)}><Trash2 size={14} /></button>
          </article>
        ))}
      </section>
    </div>
  )
}

function parseChangedFields(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function changedFields(current: Memory, next: MemoryInput) {
  const payload: Partial<MemoryInput> = {}
  if (current.title !== next.title) payload.title = next.title
  if (current.content !== next.content) payload.content = next.content
  if (current.category_id !== next.category_id) payload.category_id = next.category_id
  if (current.confidence !== next.confidence) payload.confidence = next.confidence
  if (current.importance !== next.importance) payload.importance = next.importance
  if (current.source_type !== next.source_type) payload.source_type = next.source_type
  if ((current.source_reference || '') !== (next.source_reference || '')) payload.source_reference = next.source_reference
  if (current.status !== next.status) payload.status = next.status
  if (next.change_reason) payload.change_reason = next.change_reason
  return payload
}
