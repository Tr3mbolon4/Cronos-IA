import type { FormEvent } from 'react'
import type { CoreState, DocumentItem, Message, RetrievalSummary } from '../../app/types'
import type { VoiceController } from '../voice/types'

export type ConversationFilter = 'active' | 'pinned' | 'archived'

export type ConversationSummary = {
  id: string
  title: string
  excerpt: string
  updatedAt: string
  messageCount: number
  pinned: boolean
  archived: boolean
  provisional?: boolean
}

export type AttachmentDraft = {
  id: string
  name: string
  size: number
  type: string
  status: 'ready' | 'blocked'
  reason?: string
}

export type ChatNotice = {
  id: string
  tone: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export type ChatAction =
  | 'copy'
  | 'reply'
  | 'quote'
  | 'edit'
  | 'retry'
  | 'regenerate'
  | 'helpful'
  | 'details'
  | 'citations'

export type ChatWorkspaceState = {
  messages: Message[]
  conversations: ConversationSummary[]
  activeConversationId: string
  draft: string
  filter: ConversationFilter
  searchTerm: string
  debouncedSearchTerm: string
  replyTarget: Message | null
  editingMessageId: number | string | null
  editingText: string
  attachments: AttachmentDraft[]
  notices: ChatNotice[]
  loading: boolean
  offline: boolean
  submitting: boolean
  cancelled: boolean
  contextOpen: boolean
  menuMessageId: number | string | null
}

export type ChatWorkspaceActions = {
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onNewConversation: () => void
  onCancelProvisional: () => void
  onSelectConversation: (id: string) => void
  onSearchChange: (value: string) => void
  onFilterChange: (filter: ConversationFilter) => void
  onTogglePin: (id: string) => void
  onRenameConversation: (id: string) => void
  onArchiveConversation: (id: string) => void
  onRestoreConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onMessageAction: (action: ChatAction, message: Message) => void
  onToggleContext: () => void
  onStopResponse: () => void
  onCancelReply: () => void
  onStartEdit: (message: Message) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditingTextChange: (value: string) => void
  onFilesSelected: (files: FileList | null) => void
  onRemoveAttachment: (id: string) => void
  onDismissNotice: (id: string) => void
  onMenuChange: (id: number | string | null) => void
}

export type ChatPageProps = ChatWorkspaceState & ChatWorkspaceActions & {
  coreState: CoreState
  owner: string
  backendReady: boolean
  retrieval: RetrievalSummary
  documents: DocumentItem[]
  voice: VoiceController
  onOpenLibrary: () => void
  onLock: () => void
}
