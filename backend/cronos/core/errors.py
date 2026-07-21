class CronosError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        *,
        code: str = "CRONOS_ERROR",
        details: dict | None = None,
        request_id: str | None = None,
    ):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.details = details or {}
        self.request_id = request_id
