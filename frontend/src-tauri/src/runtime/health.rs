use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

pub fn wait_for_health(port: u16, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    let mut last_error = String::new();
    while Instant::now() < deadline {
        match health_once(port) {
            Ok(true) => return Ok(()),
            Ok(false) => last_error = "health retornou resposta inesperada".to_string(),
            Err(error) => last_error = error,
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(last_error)
}

fn health_once(port: u16) -> Result<bool, String> {
    let mut stream =
        TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    Ok(response.contains("200 OK") && response.contains("\"readiness\": \"ready\""))
}
