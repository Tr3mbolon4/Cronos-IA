# Validacao real do instalador Windows CRONOS 0.1.0

Data: 2026-07-20

## Contexto

- Projeto: `G:\Cronos-IA`
- Branch: `feature/windows-desktop-installer`
- Commit validado: `0622c05 Generate Cronos Windows installer`
- Tag validada: `v0.1.0`
- Instalador: `G:\Cronos-IA\release\CRONOS-0.1.0\CronosSetup-0.1.0.exe`
- SHA-256 esperado e confirmado: `7818A5240488F41741C4D80CBE253446F6E173F050735E039E469EDE18DBAA63`
- Windows: Microsoft Windows 11 Pro `10.0.26200`, 64 bits
- Usuario: `cipodominio\alexandre_santos`

## Observacao sobre elevacao

O aplicativo Codex distribuido pela Microsoft Store executou comandos em um `powershell.exe` filho de `codex.exe` com token de integridade Medio (`IsInRole(Administrator)=False`). Em paralelo, a instalacao, desinstalacao e reinstalacao foram iniciadas manualmente em PowerShell elevado validado pelo usuario, com `IsInRole(Administrator)=True`, grupo Administradores ativado e nivel obrigatorio Alto.

Essa diferenca foi tratada como limitacao do ambiente de execucao do Codex, nao do sistema operacional nem do usuario.

## Protecao de dados

Antes da instalacao real, `%LOCALAPPDATA%\CRONOS` ja existia. A estrutura foi listada sem abrir conteudos sensiveis e foi criado backup completo em:

`G:\Cronos-IA\data\project-backups\cronos-localappdata-before-real-install-2026-07-20-1546.zip`

Estrutura final preservada:

| Diretorio | Itens |
| --- | ---: |
| backups | 0 |
| cache | 0 |
| configuration | 1 |
| database | 1 |
| documents | 1 |
| logs | 1 |
| models | 0 |
| pdf | 0 |
| runtime | 1 |
| security | 0 |
| temp | 0 |

## Instalacao

Resultado: aprovado.

- Instalacao concluida manualmente pelo PowerShell elevado.
- Diretorio escolhido no instalador: `D:\CRONOS`
- Registro em Aplicativos Instalados:
  - Nome: CRONOS
  - Versao: 0.1.0
  - Fabricante: Kalion Tecnologia
  - Local: `D:\CRONOS`
- Arquivos instalados:
  - `D:\CRONOS\cronos-desktop.exe`
  - `D:\CRONOS\cronos-backend.exe`
  - `D:\CRONOS\uninstall.exe`
- Total instalado: 3 arquivos, 25.847.214 bytes
- Atalho Menu Iniciar: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\CRONOS\CRONOS.lnk`
- Atalho Area de Trabalho publica: `C:\Users\Public\Desktop\CRONOS.lnk`

Hashes observados apos reinstalacao:

| Arquivo | SHA-256 |
| --- | --- |
| `D:\CRONOS\cronos-desktop.exe` | `8045C1D1E5787AB59D5643F9E5204C01628A4BE6E77738A63E113036AAD6A8B9` |
| `D:\CRONOS\cronos-backend.exe` | `5429105AB80344152B38A1EC709A6D801DE32BC81C98DFE37997FF0CB435B5AA` |

Observacao: o hash do `cronos-desktop.exe` instalado diverge do hash registrado para o executavel de build em `release-manifest.json`. Isso e consistente com a etapa de empacotamento Tauri/NSIS, que aplica informacao de bundle ao executavel. Recomenda-se ajustar o processo de release para registrar tambem o hash do executavel instalado/embutido no instalador.

## Primeira execucao

Resultado: aprovado.

- Aplicativo abriu a partir de `D:\CRONOS\cronos-desktop.exe`.
- Backend sidecar iniciou a partir de `D:\CRONOS\cronos-backend.exe`.
- Ambiente reportado por `/health`: `desktop`.
- Versao reportada por `/health`: `0.1.0`.
- Backend escutou somente em `127.0.0.1`.
- Porta dinamica observada na primeira execucao: `54177`.
- O estado inicial em `%LOCALAPPDATA%\CRONOS` nao tinha proprietario configurado; o fluxo de setup foi coerente.

## Funcionalidade

Resultado: aprovado.

- Criacao de proprietario de validacao: aprovado.
- Login: aprovado.
- Chat: aprovado.
- Upload de PDF sintetico de validacao: aprovado.
- Pergunta sobre PDF: aprovado.
- Bloqueio de sessao: aprovado, `/auth/session` retornou `401` apos bloqueio.
- Nenhuma senha, PIN, token ou conteudo privado foi registrado neste relatorio.

## Processos e rede

Resultado: aprovado.

Durante execucao:

- `cronos-desktop.exe` executado a partir de `D:\CRONOS`.
- `cronos-backend.exe` executado a partir de `D:\CRONOS`.
- Backend real escutou em `127.0.0.1`.
- Foi observado par pai/filho do backend por causa do empacotamento PyInstaller one-file; o processo filho foi o listener real.
- Porta fixa `8000` nao foi usada em producao.

Apos fechamento:

- Nenhum `cronos-desktop.exe` permaneceu ativo.
- Nenhum `cronos-backend.exe` permaneceu ativo.
- Listener da porta dinamica foi liberado.
- Conexoes temporarias `TIME_WAIT` sem processo dono foram observadas apos a primeira execucao e nao caracterizam processo orfao.

Verificacoes adicionais:

- Regras de firewall com nome/programa CRONOS: nenhuma encontrada.
- Servicos Windows CRONOS: nenhum encontrado.
- Tarefas agendadas CRONOS: nenhuma encontrada.

## Persistencia

Resultado: aprovado.

Reabertura antes da desinstalacao:

- Porta anterior: `54177`.
- Nova porta: `52323`.
- Novo `session_id`: confirmado.
- Proprietario preservado: sim.
- Login preservado: sim.
- PDF de validacao preservado: sim.
- Historico de chat preservado: sim.

## Desinstalacao

Resultado: aprovado.

Desinstalacao executada manualmente pelo PowerShell elevado.

Confirmado apos desinstalacao:

- `D:\CRONOS` removido.
- Entrada em Aplicativos Instalados removida.
- Atalhos do Menu Iniciar e Area de Trabalho removidos.
- Nenhum processo CRONOS ativo.
- `%LOCALAPPDATA%\CRONOS` preservado.

## Reinstalacao

Resultado: aprovado.

Reinstalacao executada manualmente pelo PowerShell elevado, novamente em `D:\CRONOS`.

Confirmado apos reinstalacao:

- `D:\CRONOS` recriado.
- Registro em Aplicativos Instalados recriado.
- Atalhos recriados.
- Aplicativo abriu normalmente.
- Backend iniciou normalmente.
- Porta dinamica apos reinstalacao: `52333`.
- Proprietario preservado: sim.
- Login preservado: sim.
- PDF de validacao preservado: sim.
- Historico preservado: sim.
- Novo chat apos reinstalacao: aprovado.
- Fechamento final: sem processos remanescentes e sem listener ativo.

## Itens aprovados

- Hash do instalador oficial confirmado.
- Instalacao real por maquina concluida em `D:\CRONOS`.
- Registro do Windows correto.
- Fabricante `Kalion Tecnologia` correto.
- Versao `0.1.0` correta.
- Atalhos criados e removidos corretamente.
- Backend sidecar iniciado automaticamente.
- Backend restrito a `127.0.0.1`.
- Porta dinamica confirmada.
- Login, chat, PDF, pergunta sobre PDF e bloqueio aprovados.
- Dados em `%LOCALAPPDATA%\CRONOS` preservados na desinstalacao.
- Reinstalacao reconheceu os dados preservados.
- Nenhum processo orfao ao final.
- Nenhuma regra de firewall, servico ou tarefa agendada CRONOS criada.

## Itens reprovados

Nenhum item funcional reprovado.

## Recomendacoes antes da publicacao da v0.1.0

1. Registrar explicitamente no manifesto de release que o hash do `cronos-desktop.exe` de build pode divergir do executavel instalado por causa do patch de bundle do Tauri/NSIS, ou passar a coletar o hash do executavel embutido/instalado.
2. Documentar que a primeira validacao administrativa via Codex pode exigir PowerShell elevado externo quando o Codex estiver instalado pela Microsoft Store e rodar com token Medio.
3. Assinar digitalmente o instalador em etapa futura para reduzir avisos de editor desconhecido/SmartScreen.
4. Repetir a validacao em uma conta Windows padrao separada antes de publicacao ampla.
5. Manter a politica atual de nao apagar `%LOCALAPPDATA%\CRONOS` na desinstalacao.

## Conclusao

A validacao real do instalador Windows CRONOS `0.1.0` foi aprovada. O instalador oficial foi executado, desinstalado e reinstalado sem alterar a tag `v0.1.0`, sem gerar versao `0.1.1` e sem modificar o artefato oficial. Os dados do usuario foram preservados corretamente e reconhecidos apos reinstalacao.

