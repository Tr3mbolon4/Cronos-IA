from fastapi import Depends, Header, HTTPException, status

from cronos.services.auth import get_session


def require_session(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessao obrigatoria.")
    token = authorization.removeprefix("Bearer ").strip()
    return get_session(token)
