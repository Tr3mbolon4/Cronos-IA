import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone


def hash_secret(secret: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, 240_000)
    return f"pbkdf2_sha256${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_secret(secret: str, stored: str) -> bool:
    try:
        algorithm, encoded_salt, encoded_digest = stored.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    salt = base64.b64decode(encoded_salt)
    expected = base64.b64decode(encoded_digest)
    actual = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, 240_000)
    return hmac.compare_digest(actual, expected)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def expires_in(minutes: int) -> datetime:
    return utcnow() + timedelta(minutes=minutes)
