"""Distinguish successful HTTP responses that cannot be parsed from network failures."""

class InvalidProviderResponse(RuntimeError):
    def __init__(self, message, raw=None):
        super().__init__(message)
        self.raw_response = raw if isinstance(raw, (dict, list)) else None
