import { BookOpen, FolderOpen, Wrench } from 'lucide-react'
import { BaseModulePage, PlaceholderPanel } from './BaseModulePage'

export function ProjectsPage() {
  return (
    <BaseModulePage title="Projetos" description="Area reservada para trabalhos, codigo e arquivos controlados pelo proprietario." icon={<FolderOpen size={24} />}>
      <PlaceholderPanel title="Projetos recentes">A estrutura de projetos sera conectada nas proximas fases.</PlaceholderPanel>
      <PlaceholderPanel title="Aprovacao">Alteracoes em arquivos continuarao exigindo autorizacao explicita.</PlaceholderPanel>
    </BaseModulePage>
  )
}

export function LearningPage() {
  return (
    <BaseModulePage title="Aprendizado" description="Visao inicial de indexacao, documentos, chunks, embeddings e memoria." icon={<BookOpen size={24} />}>
      <PlaceholderPanel title="Indexacao">Indexacao nao significa treinamento do modelo principal.</PlaceholderPanel>
      <PlaceholderPanel title="Fila">Fila de processamento sera detalhada apos a estabilizacao do shell.</PlaceholderPanel>
    </BaseModulePage>
  )
}

export function ToolsPage() {
  return (
    <BaseModulePage title="Ferramentas" description="Espaco para acoes futuras com aprovacao, logs seguros e estados claros." icon={<Wrench size={24} />}>
      <PlaceholderPanel title="Ferramentas locais">Nenhuma ferramenta autonoma foi ativada nesta fase.</PlaceholderPanel>
      <PlaceholderPanel title="Seguranca">Acoes criticas devem continuar exigindo confirmacao.</PlaceholderPanel>
    </BaseModulePage>
  )
}

export function NotFoundPage() {
  return (
    <BaseModulePage title="Rota nao encontrada" description="Esta area ainda nao existe no CRONOS." icon={<Wrench size={24} />}>
      <PlaceholderPanel title="Navegacao">Use o menu lateral para voltar a uma tela protegida.</PlaceholderPanel>
    </BaseModulePage>
  )
}
