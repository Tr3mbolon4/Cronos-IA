# Auditoria de seguranca preliminar

Data: 2026-07-30

| Item | Severidade | Acao nesta branch |
|---|---:|---|
| Senha fixa em script de teste desktop | Media | Substituida por variavel de ambiente ou valor temporario gerado em runtime |
| Ausencia de `.env.example` | Media | Adicionado modelo sem segredos reais |
| `.gitignore` sem cobertura para bancos/credenciais comuns | Media | Reforcado |
| Repositorio publico com release binario versionado | Baixa | Mantido sem alteracao; requer decisao do mantenedor |

## Pendencias

- Decidir se o repositorio deve permanecer publico.
- Revisar historico Git antes de considerar o projeto saneado por completo.
- Validar se releases binarios devem continuar versionados no repositorio ou migrar para GitHub Releases.
- Rotacionar qualquer segredo real que possa ter sido usado fora de ambiente local.
