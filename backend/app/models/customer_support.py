from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CustomerSupport(Base):
    __tablename__ = "customer_support"
    __table_args__ = (
        UniqueConstraint("instruction", name="uq_customer_support_instruction"),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    intent: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    instruction: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    response: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )
