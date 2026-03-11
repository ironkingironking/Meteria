from __future__ import annotations

from abc import ABC, abstractmethod
from logging import Logger
from typing import Any, Dict, List

from ..models import NormalizedReading


class Adapter(ABC):
    def __init__(self, name: str, options: Dict[str, Any], logger: Logger) -> None:
        self.name = name
        self.options = options
        self.logger = logger

    def start(self) -> None:
        self.logger.info("adapter started", extra={"adapter": self.name})

    def stop(self) -> None:
        self.logger.info("adapter stopped", extra={"adapter": self.name})

    @abstractmethod
    def fetch(self) -> List[NormalizedReading]:
        """Return normalized readings collected since last call."""
        raise NotImplementedError
