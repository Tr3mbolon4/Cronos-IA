# Diretorios Windows

Em producao desktop, o CRONOS usa:

```text
%LOCALAPPDATA%\CRONOS\
  database\
  documents\
  pdf\
  backups\
  logs\
  models\
  cache\
  temp\
  configuration\
  security\
  runtime\
```

O arquivo `configuration\installation.json` e criado sem segredos e contem:

- `installation_id`
- `schema_version`
- `created_at`
- `app_version`

O aplicativo nao grava em `Program Files`, nao grava ao lado do executavel e nao depende da unidade `G:`.
