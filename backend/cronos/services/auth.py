from datetime import datetime

from cronos.core.config import settings
from cronos.core.db import connect
from cronos.core.errors import CronosError
from cronos.core.security import expires_in, hash_secret, new_token, utcnow, verify_secret
from cronos.services.audit import record


def setup_status() -> dict:
    with connect() as db:
        owner = db.execute("SELECT id, name FROM owner WHERE id = 1").fetchone()
    return {"configured": owner is not None, "owner": dict(owner) if owner else None}


def create_owner(name: str, password: str, pin: str) -> dict:
    if len(password) < 8:
        raise CronosError(400, "A senha principal deve ter pelo menos 8 caracteres.")
    if len(pin) < 4 or not pin.isdigit():
        raise CronosError(400, "O PIN deve ter pelo menos 4 numeros.")

    with connect() as db:
        existing = db.execute("SELECT id FROM owner WHERE id = 1").fetchone()
        if existing:
            raise CronosError(409, "O proprietario ja foi configurado.")
        db.execute(
            """
            INSERT INTO owner (id, name, password_hash, pin_hash, created_at)
            VALUES (1, ?, ?, ?, ?)
            """,
            (name.strip(), hash_secret(password), hash_secret(pin), utcnow().isoformat()),
        )
    record("owner.created", name.strip())
    return login(password, pin)


def login(password: str, pin: str) -> dict:
    with connect() as db:
        owner = db.execute("SELECT * FROM owner WHERE id = 1").fetchone()
        if owner is None:
            raise CronosError(404, "O proprietario ainda nao foi configurado.")
        if not verify_secret(password, owner["password_hash"]) or not verify_secret(pin, owner["pin_hash"]):
            record("auth.failed", "Senha ou PIN invalido")
            raise CronosError(401, "Senha ou PIN invalido.")

        token = new_token()
        created = utcnow()
        expiration = expires_in(settings.session_minutes)
        db.execute(
            """
            INSERT INTO sessions (token, owner_id, created_at, expires_at, locked_at)
            VALUES (?, 1, ?, ?, NULL)
            """,
            (token, created.isoformat(), expiration.isoformat()),
        )
    record("auth.login", owner["name"])
    return {"token": token, "owner": {"id": 1, "name": owner["name"]}, "expires_at": expiration.isoformat()}


def get_session(token: str) -> dict:
    with connect() as db:
        session = db.execute(
            """
            SELECT s.*, o.name
            FROM sessions s
            JOIN owner o ON o.id = s.owner_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    if session is None or session["locked_at"]:
        raise CronosError(401, "Sessao bloqueada ou inexistente.")
    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at <= utcnow():
        raise CronosError(401, "Sessao expirada.")
    return {"token": token, "owner": {"id": 1, "name": session["name"]}, "expires_at": session["expires_at"]}


def lock_session(token: str) -> dict:
    with connect() as db:
        db.execute("UPDATE sessions SET locked_at = ? WHERE token = ?", (utcnow().isoformat(), token))
    record("auth.locked")
    return {"locked": True}
