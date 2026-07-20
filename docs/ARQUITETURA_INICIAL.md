# Arquitetura inicial do CRONOS Desktop

## Objetivo

Construir primeiro um CRONOS pessoal, local, instalavel, protegido e funcional para Windows. A versao inicial roda em um unico computador, mas separa interface, backend, dados, memoria, documentos e configuracoes para permitir migracao futura.

## Stack escolhida

- Aplicativo desktop: Tauri com React e TypeScript.
- Interface MVP: React/Vite, pronta para ser embutida no Tauri.
- Backend local planejado: Python com FastAPI.
- Backend MVP executavel neste ambiente: servidor HTTP leve em Python padrao, mantendo as mesmas rotas previstas para migracao ao FastAPI.
- Banco local: SQLite.
- Documentos: extracao inicial de PDF com `pypdf`.
- Diagnostico: chamadas do sistema e biblioteca padrao do Python.
- Backup: pacote `.zip` local com banco, documentos e configuracoes.

## Identidade visual oficial

O layout de referencia da versao 1.0 do CRONOS usa uma interface escura, densa e limpa, com detalhes em azul neon. O nucleo circular central passa a ser o sinal visual principal da IA pessoal e deve refletir o estado real do sistema:

- Azul: disponivel.
- Verde: ouvindo.
- Amarelo: aguardando autorizacao.
- Laranja: processando.
- Vermelho: erro ou alerta.
- Cinza: offline.

A tela inicial deve priorizar quatro areas funcionais:

- conversa com o CRONOS;
- tarefas em execucao;
- recursos do computador;
- atividades recentes.

Elementos visuais nao devem ser apenas decorativos. Graficos e indicadores precisam refletir dados reais sempre que houver fonte confiavel no backend. No MVP atual, CPU, RAM e armazenamento usam metricas locais reais; GPU, VRAM e temperatura ficam marcadas como pendentes ate a implementacao da deteccao por WMI/NVIDIA/DirectX.

## Forma de empacotamento

O caminho final recomendado e Tauri com backend Python empacotado e controlado pelo aplicativo. Nesta maquina, Rust/Cargo ainda nao estao instalados e o pip esta bloqueado por proxy para novas dependencias, entao o MVP roda em modo desenvolvimento com scripts locais e backend sem dependencias externas obrigatorias.

Para gerar `CronosSetup.exe`, os proximos passos sao:

1. Instalar Rust e dependencias do Tauri para Windows.
2. Adicionar `src-tauri`.
3. Empacotar o backend Python com PyInstaller ou Nuitka.
4. Configurar o Tauri para iniciar e monitorar o backend local.
5. Gerar instalador MSI/NSIS com atalhos, inicializacao opcional e desinstalacao segura.

## Comparacao de empacotamento

| Opcao | Vantagem | Risco | Decisao inicial |
| --- | --- | --- | --- |
| Tauri + backend empacotado | Instalador menor, boa UX, controle local | Exige Rust e pipeline de empacotamento | Preferida |
| Tauri + WSL2 | Ambiente Linux previsivel | Instala pesado e mais dificil para usuario comum | Evitar no MVP |
| Tauri + Docker Desktop | Isolamento forte | Docker visivel e pesado para usuario final | Evitar |
| App nativo + servicos Windows | Integra bem com Windows | Mais trabalho nativo e instalador mais complexo | Avaliar depois |
| Aplicacao portatil | Simples para teste | Menos integrada e atualizacoes mais frageis | Boa para pre-release |

## Estrutura de diretorios

```text
G:\Cronos-IA
  backend\          API local, banco, autenticacao, chat, PDF, backup
  frontend\         Interface React/TypeScript
  data\             Dados locais de desenvolvimento
  docs\             Arquitetura, fluxos e decisoes
  scripts\          Setup, execucao e verificacoes
```

## Fluxo de primeira configuracao

1. Backend inicia e verifica se existe proprietario cadastrado.
2. Se nao existir, a interface abre o cadastro inicial.
3. Proprietario informa nome, senha principal e PIN.
4. Backend cria identidade local com hash forte usando PBKDF2.
5. Sessao autenticada e criada.

## Fluxo de autenticacao

1. Usuario informa senha e PIN.
2. Backend valida contra hashes locais.
3. Sessao local recebe token temporario.
4. A interface usa o token em `Authorization: Bearer`.
5. Ao bloquear, o token e invalidado.

## Protecao contra comandos de outras pessoas

No MVP, comandos digitados so funcionam com sessao autenticada. A arquitetura reserva niveis de comando para exigir fatores adicionais em acoes administrativas e criticas.

Voz e biometria ficam preparados como modulos futuros. A voz nunca sera o unico fator para acoes criticas.

## Armazenamento

O MVP usa `data\cronos.db`, `data\documents` e `data\backups`. O caminho podera ser configurado no instalador e na primeira configuracao.

## Criptografia

Nesta primeira base, senha e PIN sao armazenados apenas como hash PBKDF2 com salt. A criptografia completa dos dados sensiveis sera adicionada antes da primeira versao instalavel.

## Backup e restauracao

O MVP gera backup `.zip` contendo banco e documentos. Restauracao existe como contrato de API e sera endurecida com validacao, rollback e criptografia.

## Adaptacao ao hardware

O backend coleta CPU, RAM, disco e sistema operacional. A selecao de perfil inicial segue estes criterios:

- Leve: menos de 8 GB RAM.
- Equilibrado: 8 GB a 23 GB RAM.
- Avancado: 24 GB RAM ou mais.

GPU/VRAM sera detalhada em etapa posterior com detecao WMI/NVIDIA/DirectX.

## Funcionamento sem GPU e sem internet

O CRONOS deve funcionar sem GPU usando CPU e, quando modelos locais nao estiverem disponiveis, indicar claramente quais funcoes dependem de modelo local ou internet. O MVP usa uma resposta local simples para validar o fluxo.

## Atualizacao e desinstalacao

Serao tratadas no instalador Tauri/Windows. O backend ja separa dados do codigo para permitir atualizacao sem apagar memoria.

## Plano de testes

- Testes de autenticacao.
- Testes de criacao de proprietario.
- Testes de chat e persistencia.
- Testes de upload/extracao de PDF.
- Testes de backup.
- Testes manuais da interface.
- Teste em maquina limpa antes de considerar a versao pronta.
