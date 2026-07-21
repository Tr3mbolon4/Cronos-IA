import { BookOpen, Database, FileUp, Lock, MessageSquarePlus, Plus, ServerCog } from 'lucide-react'
import type { AppRoute } from '../../app/types'

export function QuickActions({
  onNavigate,
  onLock,
  onUnavailable,
}: {
  onNavigate: (route: AppRoute) => void
  onLock: () => void
  onUnavailable: (message: string) => void
}) {
  return (
    <section className="dashboard-actions" aria-label="Acoes rapidas">
      <button type="button" title="Abrir tela de conversas" onClick={() => onNavigate('/chat')}><MessageSquarePlus size={15} /> Nova conversa</button>
      <button type="button" title="Abrir tela de memoria" onClick={() => onNavigate('/memory')}><Plus size={15} /> Criar memoria</button>
      <button type="button" title="Abrir biblioteca" onClick={() => onNavigate('/library')}><Database size={15} /> Abrir biblioteca</button>
      <button type="button" title="Importacao disponivel na Biblioteca" onClick={() => onUnavailable('Importe documentos pela tela Biblioteca.') }><FileUp size={15} /> Importar documento</button>
      <button type="button" title="Abrir aprendizado" onClick={() => onNavigate('/learning')}><BookOpen size={15} /> Aprendizado</button>
      <button type="button" title="Abrir sistema" onClick={() => onNavigate('/system')}><ServerCog size={15} /> Sistema</button>
      <button type="button" className="danger" title="Bloquear sessao" onClick={onLock}><Lock size={15} /> Bloquear</button>
    </section>
  )
}
