import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Database, FileText, RefreshCw, RotateCcw, Search, Trash2, Upload } from 'lucide-react'
import type { ApiClient } from '../services/apiClient'
import { ApiError } from '../services/apiClient'
import { friendlyError } from '../utils/errors'
import { fileSize, formatDate, percent, shortHash } from '../utils/formatting'
import { useDocuments } from '../hooks/useDocuments'
import { useDocumentDetails } from '../hooks/useDocumentDetails'
import { useLibrarySearch } from '../hooks/useLibrarySearch'
import { deleteDocument, importDocument, reindexDocument, restoreDocument } from '../services/libraryApi'
import { rebuildIndex } from '../services/retrievalApi'
import type { DocumentItem, DocumentSource } from '../types/library'
import { PageHeader } from '../components/common/PageHeader'
import { EmptyState } from '../components/common/EmptyState'
import { InlineError } from '../components/common/InlineError'
import { LoadingState } from '../components/common/LoadingState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { extractionStatusLabels, indexingStatusLabels } from '../components/library/libraryLabels'

export function LibraryPage({ client, onNotice }: { client: ApiClient; onNotice: (message: string) => void }) {
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const { documents, status, providers, loading, error, reload } = useDocuments(client, includeDeleted)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(8)
  const [pageFilter, setPageFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; action: () => Promise<void> } | null>(null)
  const [operationError, setOperationError] = useState('')
  const details = useDocumentDetails(client, selectedId)
  const search = useLibrarySearch(client)
  const selected = documents.find((document) => document.id === selectedId)
  const provider = status?.provider

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setOperationError('')
    try {
      const result = await importDocument(client, file)
      onNotice(`Documento importado: ${result.document.filename}`)
      setSelectedId(result.document.id)
      await reload()
      await details.reload()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DOCUMENT_DUPLICATE') {
        setOperationError(`Arquivo ja existe. Documento existente: ${String(error.details.filename || error.details.document_id || '--')}`)
      } else {
        setOperationError(friendlyError(error))
      }
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setOperationError('')
    try {
      await action()
      onNotice(success)
      await reload()
      await details.reload()
    } catch (error) {
      setOperationError(friendlyError(error))
    } finally {
      setConfirm(null)
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    await search.search(query, topK, {
      document_id: selectedId || undefined,
      page_number: pageFilter || undefined,
    })
  }

  return (
    <section className="workspace-page library-page" data-visual="library-page">
      <PageHeader
        title="Biblioteca"
        description="Importe documentos, acompanhe indexacao e recupere conhecimento com citacoes."
        actions={(
          <>
            <label className="upload action-upload">
              <Upload size={14} /> {uploading ? 'Importando...' : 'Importar documento'}
              <input type="file" accept="application/pdf" onChange={handleImport} disabled={uploading} />
            </label>
            <button type="button" onClick={reload}><RefreshCw size={14} /> Atualizar</button>
          </>
        )}
      />

      <section className="index-status-panel" data-visual="index-status">
        <div>
          <span>Modo atual</span>
          <strong>{provider?.available ? 'Busca hibrida' : 'Busca lexical'}</strong>
        </div>
        <div>
          <span>Provider</span>
          <strong>{provider?.provider || '--'}</strong>
        </div>
        <div>
          <span>Modelo</span>
          <strong>{provider?.model || '--'}</strong>
        </div>
        <div>
          <span>Dimensao</span>
          <strong>{provider?.dimension ?? 0}</strong>
        </div>
        <div>
          <span>Chunks</span>
          <strong>{status?.chunks ?? 0}</strong>
        </div>
        <div>
          <span>Indexados</span>
          <strong>{status?.embeddings ?? 0}</strong>
        </div>
        <div>
          <span>Pendentes</span>
          <strong>{status?.pending ?? 0}</strong>
        </div>
        <button
          type="button"
          onClick={() => setConfirm({
            title: 'Reconstruir indice',
            description: 'Os documentos nao serao apagados. Os chunks serao reindexados e pode haver consumo de CPU.',
            label: 'Reconstruir',
            action: () => runAction(() => rebuildIndex(client, { force: true }).then(() => undefined), 'Indice reconstruido.'),
          })}
        >
          <Database size={14} /> Reconstruir indice
        </button>
      </section>
      {providers.some((item) => !item.available && !item.fallback) && <p className="provider-warning">Modelo semantico indisponivel. A busca lexical continua ativa.</p>}
      <InlineError message={operationError || error} onRetry={reload} />

      <div className="workspace-split library-split">
        <section className="list-surface">
          <div className="workspace-toolbar compact-toolbar">
            <label className="checkbox-line">
              <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
              Incluir excluidos
            </label>
          </div>
          {loading && <LoadingState label="Carregando documentos..." />}
          {!loading && documents.length === 0 && <EmptyState title="Nenhum documento" description="Importe um PDF para iniciar a biblioteca." />}
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} selected={selectedId === document.id} onOpen={() => setSelectedId(document.id)} />
          ))}
        </section>

        <aside className="details-surface document-details" data-visual="document-details">
          {selected && details.details ? (
            <div className="details-stack">
              <div className="details-header">
                <div>
                  <span className={`status-pill ${details.details.source?.indexing_status || 'pending'}`}>{indexingStatusLabels[details.details.source?.indexing_status || 'pending'] || '--'}</span>
                  <h2>{selected.filename}</h2>
                </div>
                <div className="details-actions">
                  <button type="button" onClick={() => setConfirm({
                    title: 'Reindexar documento',
                    description: `O documento ${selected.filename} sera reprocessado sem apagar o arquivo original.`,
                    label: 'Reindexar',
                    action: () => runAction(() => reindexDocument(client, selected.id).then(() => undefined), 'Documento reindexado.'),
                  })}><RefreshCw size={14} /> Reindexar</button>
                  {selected.deleted_at ? (
                    <button type="button" onClick={() => runAction(() => restoreDocument(client, selected.id).then(() => undefined), 'Documento restaurado.')}><RotateCcw size={14} /> Restaurar</button>
                  ) : (
                    <button type="button" className="danger" onClick={() => setConfirm({
                      title: 'Remover documento',
                      description: 'A remocao sera logica. O arquivo fisico nao sera apagado nesta fase.',
                      label: 'Remover',
                      action: () => runAction(() => deleteDocument(client, selected.id).then(() => undefined), 'Documento removido.'),
                    })}><Trash2 size={14} /> Remover</button>
                  )}
                </div>
              </div>
              <DocumentOverview source={details.details.source} pages={details.pages.length} chunks={details.chunks.length} />
              <form className="retrieval-form" onSubmit={submitSearch} data-visual="retrieval-search">
                <label>Pesquisa na biblioteca<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pergunte sobre o documento ou biblioteca" /></label>
                <label>Resultados<input type="number" min="1" max="50" value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></label>
                <label>Pagina<input value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder="Opcional" /></label>
                <button type="submit" className="primary" disabled={!query.trim() || search.loading}><Search size={14} /> {search.loading ? 'Pesquisando...' : 'Buscar'}</button>
              </form>
              <InlineError message={search.error} />
              {search.result && (
                <section className="retrieval-results" data-visual="citations">
                  <h3>{search.result.provider.available ? 'Busca hibrida' : 'Busca lexical'} | {search.result.total} resultado(s)</h3>
                  {search.result.items.length === 0 ? <p className="muted-text">Nenhum resultado encontrado.</p> : search.result.items.map((item) => (
                    <article className="retrieval-result" key={item.chunk.id}>
                      <strong>{item.citation.citation_label}</strong>
                      <p>{item.excerpt}</p>
                      <div className="score-grid">
                        <span>Lexical {percent(item.score_lexical)}</span>
                        <span>Semantico {percent(item.score_semantic)}</span>
                        <span>Final {percent(item.score_final)}</span>
                        <span>Chunk {item.chunk.chunk_index}</span>
                        <span>{item.chunk.character_start}-{item.chunk.character_end}</span>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              <section className="document-tabs">
                <h3>Paginas</h3>
                {details.pages.slice(0, 12).map((page) => (
                  <article className="page-row" key={page.id}>
                    <strong>Pagina {page.page_number}</strong>
                    <span>{page.character_count} caracteres | {extractionStatusLabels[page.extraction_status] || page.extraction_status}</span>
                    <p>{page.text_content.slice(0, 220) || page.error_message || 'Sem texto extraivel.'}</p>
                  </article>
                ))}
                <h3>Chunks</h3>
                {details.chunks.slice(0, 20).map((chunk) => (
                  <article className="chunk-row" key={chunk.id}>
                    <strong>Chunk {chunk.chunk_index}</strong>
                    <span>Pagina #{chunk.page_id} | {chunk.character_start}-{chunk.character_end} | {chunk.token_estimate} tokens | {shortHash(chunk.content_hash)}</span>
                    <p>{chunk.text_content.slice(0, 180)}</p>
                  </article>
                ))}
              </section>
            </div>
          ) : details.loading ? (
            <LoadingState label="Carregando detalhes..." />
          ) : (
            <EmptyState title="Selecione um documento" description="Abra um documento para ver paginas, chunks, citacoes e pesquisa." />
          )}
        </aside>
      </div>
      {confirm && <ConfirmDialog title={confirm.title} description={confirm.description} confirmLabel={confirm.label} onCancel={() => setConfirm(null)} onConfirm={() => confirm.action()} />}
    </section>
  )
}

function DocumentCard({ document, selected, onOpen }: { document: DocumentItem; selected: boolean; onOpen: () => void }) {
  return (
    <article className={`memory-card document-card ${selected ? 'selected' : ''}`}>
      <button type="button" className="card-main" onClick={onOpen}>
        <span className={`status-pill ${document.deleted_at ? 'deleted' : 'active'}`}>{document.deleted_at ? 'Excluido' : 'Ativo'}</span>
        <strong><FileText size={14} /> {document.filename}</strong>
        <p>Documento registrado na biblioteca de conhecimento do CRONOS.</p>
        <div className="card-meta">
          <span>{formatDate(document.created_at)}</span>
          <span>{formatDate(document.updated_at)}</span>
        </div>
      </button>
    </article>
  )
}

function DocumentOverview({ source, pages, chunks }: { source: DocumentSource | null; pages: number; chunks: number }) {
  if (!source) return <EmptyState title="Fonte indisponivel" description="O documento nao possui fonte associada." />
  return (
    <div className="detail-grid">
      <span>Arquivo original<strong>{source.original_filename}</strong></span>
      <span>Tipo<strong>{source.source_type}</strong></span>
      <span>Tamanho<strong>{fileSize(source.file_size)}</strong></span>
      <span>Paginas<strong>{source.page_count || pages}</strong></span>
      <span>Chunks carregados<strong>{chunks}</strong></span>
      <span>MIME<strong>{source.mime_type || '--'}</strong></span>
      <span>Extracao<strong>{extractionStatusLabels[source.extraction_status] || source.extraction_status}</strong></span>
      <span>Indexacao<strong>{indexingStatusLabels[source.indexing_status] || source.indexing_status}</strong></span>
      <span>Hash<strong>{shortHash(source.file_hash)}</strong></span>
      <span>Idioma<strong>{source.language || '--'}</strong></span>
      <span>Indexado em<strong>{formatDate(source.indexed_at)}</strong></span>
      <span>Erro<strong>{source.error_message || source.error_code || '--'}</strong></span>
    </div>
  )
}
