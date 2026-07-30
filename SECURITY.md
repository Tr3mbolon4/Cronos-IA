# Politica de seguranca

## Dados que nao devem ser versionados

- Arquivos `.env` reais.
- Bancos SQLite, backups e dados em `data/`.
- Logs de execucao.
- Tokens runtime, credenciais, PINs e senhas.
- Documentos pessoais importados pelo usuario.
- Artefatos de build gerados localmente.

## Recomendacoes

- Use `.env.example` apenas como modelo.
- Gere credenciais temporarias para testes locais quando possivel.
- Revise releases binarios antes de publicar novas versoes.
- Limpe o historico Git se alguma credencial real tiver sido versionada anteriormente.

## Reporte

Abra uma issue privada ou entre em contato com o mantenedor antes de divulgar detalhes sensiveis publicamente.
