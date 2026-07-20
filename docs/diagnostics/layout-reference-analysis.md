# Analise da referencia visual oficial do CRONOS

Data: 2026-07-20
Branch: `feature/windows-desktop-installer`
Referencia: `C:\Users\alexandre_santos\Downloads\WhatsApp Image 2026-07-20 at 09.49.27.jpeg`

## Diferencas encontradas no layout atual

- Estrutura: o layout atual mostra muitos paineis na tela inicial; a referencia tem uma composicao principal mais controlada, com area central ampla e apenas dois paineis inferiores.
- Posicao: a saudacao atual fica dentro de um bloco hero mais alto; na referencia ela fica acima e levemente a esquerda do nucleo, dentro da area principal.
- Tamanho: o nucleo atual e grande demais em relacao aos paineis inferiores; a referencia usa um nucleo medio, centralizado e dominante sem ocupar a tela inteira.
- Espacamento: o layout atual tem mais espaco entre secoes e paineis; a referencia e mais compacta, com densidade de software desktop.
- Cores: o layout atual usa brilho azul correto, mas ainda tem paineis com contraste e gradientes mais evidentes; a referencia usa preto azulado quase uniforme e bordas discretas.
- Bordas: o layout atual tem paineis mais parecidos com cards modernos; a referencia usa bordas finas integradas a uma janela tecnica.
- Fontes: o layout atual usa titulos e textos um pouco maiores; a referencia tem tipografia compacta, com titulos pequenos em caixa alta nos paineis.
- Icones: o menu atual possui menos itens e espacamento mais largo; a referencia usa muitos itens compactos com icones pequenos.
- Proporcoes: a sidebar atual e proxima, mas precisa ficar mais estreita e com a composicao exata de itens. A barra superior atual tem metricas grandes demais; a referencia usa uma barra fina de janela.
- Hierarquia visual: o layout atual distribui atencao entre varios paineis; a referencia concentra a hierarquia no nucleo central e usa tarefas/sistema como suporte.
- Distribuicao dos paineis: o layout atual coloca chat, tarefas, recursos, atividades, aprendizado, programador e seguranca na mesma tela; a referencia da tela principal mostra nucleo, botoes, tarefas ativas e sistema.

## Correcoes planejadas

- Reduzir a tela inicial para a composicao obrigatoria: sidebar, barra superior fina, area central com nucleo, botoes rapidos, painel de tarefas e painel de sistema.
- Ajustar menu lateral para a ordem oficial completa e densidade compacta.
- Remover blocos grandes de metricas da barra superior, mantendo apenas informacoes compactas de janela.
- Reposicionar saudacao e nucleo conforme a referencia.
- Recriar o nucleo com aneis concentricos, brilho e linhas/particulas laterais em CSS.
- Transformar tarefas e sistema em paineis inferiores densos, sem cards individuais.
- Manter funcionalidades existentes acessiveis sem poluir a tela principal.
- Deixar modo programador, aprendizado e autorizacao com estrutura mais proxima da referencia em secoes abaixo da primeira dobra.
