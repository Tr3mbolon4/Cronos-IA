# Validacao visual autenticada

Este projeto possui um modo isolado para captura visual autenticada:

```powershell
$env:CRONOS_VISUAL_TEST_PASSWORD = "<senha-temporaria>"
$env:CRONOS_VISUAL_TEST_PIN = "<pin-temporario>"
.\scripts\visual-test.ps1
```

Garantias do modo:

- usa `CRONOS_ENV=visual-test`;
- usa dados em `data\visual-test`;
- nao acessa o banco normal;
- cria proprietario de teste somente quando as variaveis de ambiente existem;
- faz login pela interface real;
- nao grava senha ou PIN no codigo;
- gera capturas em `data\project-backups`.

Arquivos gerados:

- `cronos-layout-authenticated-1920.png`;
- `cronos-layout-authenticated-1600.png`;
- `cronos-layout-authenticated-1366.png`;
- `docs\diagnostics\authenticated-layout-visual-test.json`.

## Resultado executado em 2026-07-20

Capturas autenticadas criadas:

- `G:\Cronos-IA\data\project-backups\cronos-layout-authenticated-1920.png`
- `G:\Cronos-IA\data\project-backups\cronos-layout-authenticated-1600.png`
- `G:\Cronos-IA\data\project-backups\cronos-layout-authenticated-1366.png`

Validacoes funcionais realizadas pela automacao em 1920 x 1080:

- login pela interface real;
- dashboard autenticado visivel;
- menu de Seguranca navegando;
- nucleo mudando para estado ouvindo;
- nucleo mudando para estado processando;
- bloqueio de sessao;
- login novamente apos bloqueio.

## Comparacao com a referencia oficial

Correcoes realizadas durante esta validacao:

- menu lateral ampliado para proporcao mais proxima da composicao desktop;
- paineis inferiores limitados em largura para evitar esticamento excessivo em Full HD;
- espaco vertical entre botoes rapidos e paineis inferiores reduzido;
- composicao autenticada validada em 1920 x 1080, 1600 x 900 e 1366 x 768.

Diferencas que permanecem:

- a referencia contem textura visual mais rica no fundo e mais particulas finas ao redor do nucleo;
- o CRONOS atual usa CSS puro para o nucleo, sem imagem/asset bitmap dedicado;
- a janela principal em Full HD ocupa a tela inteira, enquanto a referencia mostra uma composicao visual apresentada dentro de uma montagem com outros modos;
- GPU, VRAM e temperatura ainda aparecem como pendentes ate a deteccao real por hardware ser implementada.

Seguranca:

- nao existe bypass de autenticacao;
- nao ha senha ou PIN commitados;
- o ambiente visual usa `CRONOS_ENV=visual-test`;
- o banco de teste fica em `data\visual-test`;
- o banco normal nao e acessado pelo teste visual.
