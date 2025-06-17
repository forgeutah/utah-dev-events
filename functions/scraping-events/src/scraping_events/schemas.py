from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel


class ScrapeEventsRequest(BaseModel):
    url: str
    max_events: int = 3


class Event(BaseModel):
    url: str
    title: str
    description: str
    time: AwareDatetime
    venue_name: str | None
    venue_url: str | None
    venue_address: str | None
    image_url: str | None


class ScrapeEventsResponse(BaseModel):
    events: list[Event]


class ResponseError(BaseModel):
    type: Literal["error"] = "error"
    error_class: str
    detail: str | None

    @classmethod
    def from_exception(cls, exc: Exception) -> Self:
        exc_type = type(exc)
        exc_module = exc_type.__module__
        if exc_module == "builtins":
            class_qualifier = ""
        else:
            class_qualifier = f"{exc_module}."
        return cls(
            error_class=f"{class_qualifier}{exc_type.__name__}",
            detail=str(exc) or None,
        )
