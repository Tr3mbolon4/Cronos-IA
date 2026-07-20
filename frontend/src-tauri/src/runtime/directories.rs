use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct RuntimeDirectories {
    pub root: PathBuf,
    pub logs: PathBuf,
    pub runtime: PathBuf,
}

impl RuntimeDirectories {
    pub fn prepare() -> Result<Self, String> {
        let local_app_data =
            std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA nao esta definido.")?;
        let root = PathBuf::from(local_app_data).join("CRONOS");
        let directories = [
            "database",
            "documents",
            "pdf",
            "backups",
            "logs",
            "models",
            "cache",
            "temp",
            "configuration",
            "security",
            "runtime",
        ];
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        for directory in directories {
            fs::create_dir_all(root.join(directory)).map_err(|error| error.to_string())?;
        }
        Ok(Self {
            logs: root.join("logs"),
            runtime: root.join("runtime"),
            root,
        })
    }
}
