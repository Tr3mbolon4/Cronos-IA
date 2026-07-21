# CRONOS 0.2.0-rc2

## Correcoes

- Corrige a ausencia do provider semantico no backend instalado.
- Formaliza o provider proprio `cronos-local-semantic` como implementacao oficial da v0.2.0.
- Inclui um artefato local de modelo semantico offline no pacote PyInstaller.
- Mantem fallback lexical quando o provider estiver indisponivel ou falhar.
- Expande o status do retrieval com modo atual, provider carregado, modelo, dimensao, contagens e ultimo erro seguro.
- Mantem dados do usuario em `%LOCALAPPDATA%\CRONOS`.

## Instrucao de atualizacao

1. Fechar completamente o CRONOS.
2. Criar backup de `%LOCALAPPDATA%\CRONOS`.
3. Executar `CronosSetup-0.2.0-rc2.exe`.
4. Instalar sobre a instalacao atual em `D:\CRONOS`.
5. Abrir o CRONOS e validar `/health`.
6. Fazer login manual.
7. Executar indexacao incremental da biblioteca.

## Observacao tecnica

O provider oficial da RC2 e local e offline. Ele nao realiza downloads automaticos, nao depende do Hugging Face e nao exige `sentence_transformers` como requisito obrigatorio. A arquitetura permanece baseada em `SemanticProvider`, permitindo providers futuros como Sentence Transformers, ONNX, GGUF, TensorRT, CUDA e outros providers locais sem alterar a API publica.
