# Diagnostico Microsoft Build Tools

Data: 2026-07-20

Instalacao iniciada via:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget --accept-source-agreements --accept-package-agreements --silent --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --includeRecommended"
```

Resultado detectado por `vswhere`:

```text
Produto: Microsoft.VisualStudio.Product.BuildTools
Display: Ferramentas de Build do Visual Studio 2022
Versao: 17.14.37502.11
Caminho: C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools
Windows SDK: 10.0.26100.0
MSVC x64: C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe
isComplete: false
isLaunchable: false
isRebootRequired: true
```

Status:

```text
BLOQUEADO: o instalador terminou, mas a reinicializacao do Windows ainda e necessaria antes de continuar.
```

Proxima acao:

1. Reiniciar o Windows.
2. Abrir novo terminal.
3. Rodar novamente `vswhere`.
4. Confirmar `isComplete: true`, `isLaunchable: true`, `isRebootRequired: false`.
5. Validar MSVC x64 e Windows SDK antes de iniciar Tauri.
