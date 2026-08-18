from datetime import datetime

from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    source_type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    source_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    chunks = relationship(
        "Chunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )
