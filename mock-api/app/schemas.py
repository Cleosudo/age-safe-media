"""Pydantic request/response models for the JSON API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .seed import SENSITIVITY_CATEGORIES


class ParentUpdate(BaseModel):
    display_name: str = Field(default="", max_length=80)


class OutputPreferences(BaseModel):
    max_recommendations: int = Field(default=5, ge=1, le=10)
    display_mode: Literal["summary", "title"] = "summary"
    sort: Literal["relevance", "newest", "oldest"] = "relevance"
    show_explanations: bool = True


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    age: int = Field(ge=1, le=17)
    avatar: str = Field(default="🐣", max_length=8)
    blocked_categories: list[str] = Field(default_factory=list)
    age_band_depth: int = Field(default=2, ge=1, le=3)
    preferences: OutputPreferences | None = None

    @field_validator("blocked_categories")
    @classmethod
    def _known_categories(cls, value: list[str]) -> list[str]:
        allowed = {category.lower() for category in SENSITIVITY_CATEGORIES}
        cleaned = [item.strip().lower() for item in value if item and item.strip()]
        unknown = [item for item in cleaned if item not in allowed]
        if unknown:
            raise ValueError(f"Unknown sensitivity categories: {', '.join(unknown)}")
        return list(dict.fromkeys(cleaned))


class ChildUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=24)
    age: int | None = Field(default=None, ge=1, le=17)
    avatar: str | None = Field(default=None, max_length=8)
    blocked_categories: list[str] | None = None
    age_band_depth: int | None = Field(default=None, ge=1, le=3)
    preferences: OutputPreferences | None = None


class RestrictionsUpdate(BaseModel):
    blocked_categories: list[str] = Field(default_factory=list)
    age_band_depth: int = Field(default=2, ge=1, le=3)

    @field_validator("blocked_categories")
    @classmethod
    def _known_categories(cls, value: list[str]) -> list[str]:
        allowed = {category.lower() for category in SENSITIVITY_CATEGORIES}
        cleaned = [item.strip().lower() for item in value if item and item.strip()]
        unknown = [item for item in cleaned if item not in allowed]
        if unknown:
            raise ValueError(f"Unknown sensitivity categories: {', '.join(unknown)}")
        return list(dict.fromkeys(cleaned))


class ChatRequest(BaseModel):
    child_id: str
    message: str = Field(min_length=1, max_length=600)
    conversation_id: str | None = None
    preferences: OutputPreferences | None = None


class FavouriteRequest(BaseModel):
    child_id: str
    item_id: str


class FeedbackRequest(BaseModel):
    child_id: str
    item_id: str
    rating: Literal["up", "down"]
    reason: str = Field(default="", max_length=280)


class RetrainRequest(BaseModel):
    notes: str = Field(default="", max_length=280)


class CatalogueItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    type: Literal["book", "video"] = "book"
    category: str = Field(min_length=1, max_length=60)
    age_min: int = Field(ge=0, le=18)
    age_max: int = Field(ge=0, le=18)
    summary: str = Field(default="", max_length=600)
    tags: list[str] = Field(default_factory=list)
    year: int = Field(default=2024, ge=1900, le=2100)
    publisher: str = Field(default="", max_length=120)
    language: str = Field(default="English", max_length=40)
    sensitivity: list[str] = Field(default_factory=list)
    popularity: int = Field(default=50, ge=0, le=100)
    cover_emoji: str = Field(default="📘", max_length=8)
    external_links: dict[str, str] = Field(default_factory=dict)
    active: bool = True

    @field_validator("age_max")
    @classmethod
    def _age_order(cls, value: int, info) -> int:
        age_min = info.data.get("age_min")
        if age_min is not None and value < age_min:
            raise ValueError("age_max must be greater than or equal to age_min")
        return value
