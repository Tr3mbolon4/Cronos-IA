# Processo de release Windows

1. Confirmar branch `feature/windows-desktop-installer`.
2. Confirmar arvore limpa.
3. Criar backup em `data\project-backups`.
4. Criar tag de seguranca `before-windows-installer`.
5. Executar `.\scripts\build-installer.ps1 -Version 0.1.0`.
6. Executar `.\scripts\test-installer.ps1 -Version 0.1.0`.
7. Executar `.\scripts\test-update.ps1`.
8. Criar commit e tag anotada `v0.1.0`.
9. Enviar branch e tags ao GitHub.

Nao criar GitHub Release publico nesta fase.

