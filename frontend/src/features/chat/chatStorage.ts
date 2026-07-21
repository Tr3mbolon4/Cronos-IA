import type { ConversationSummary } from './types'

const CONVERSATION_META_KEY = 'cronos.chat.conversationMeta.v1'
const ACTIVE_CONVERSATION_KEY = 'cronos.chat.activeConversation.v1'
const DRAFT_KEY = 'cronos.chat.drafts.v1'

export type StoredConversationMeta = Record<string, { title?: string; pinned?: boolean; archived?: boolean }>

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export function loadConversationMeta(): StoredConversationMeta {
  return readJson<StoredConversationMeta>(CONVERSATION_META_KEY, {})
}

export function saveConversationMeta(meta: StoredConversationMeta) {
  localStorage.setItem(CONVERSATION_META_KEY, JSON.stringify(meta))
}

export function updateConversationMeta(id: string, patch: StoredConversationMeta[string]) {
  const meta = loadConversationMeta()
  meta[id] = { ...meta[id], ...patch }
  saveConversationMeta(meta)
  return meta
}

export function loadActiveConversation() {
  return localStorage.getItem(ACTIVE_CONVERSATION_KEY) || 'principal'
}

export function saveActiveConversation(id: string) {
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
}

export function loadDrafts(): Record<string, string> {
  return readJson<Record<string, string>>(DRAFT_KEY, {})
}

export function saveDraft(id: string, value: string) {
  const drafts = loadDrafts()
  drafts[id] = value
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
}

export function summarizeConversation(base: ConversationSummary, meta: StoredConversationMeta): ConversationSummary {
  const saved = meta[base.id] || {}
  return {
    ...base,
    title: saved.title || base.title,
    pinned: Boolean(saved.pinned),
    archived: Boolean(saved.archived),
  }
}
