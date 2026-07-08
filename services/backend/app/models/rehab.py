"""Domain models for rehabilitation flows extending the base data model.

All ORM models are registered on the same declarative Base as the original
core models, and imported through ``app.models`` so that ``init_db`` picks
them up.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Exercise(Base):
    __tablename__ = 'exercises'

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # upper/lower/spine/facial
    body_part: Mapped[str] = mapped_column(String(80), nullable=False)
    joint: Mapped[str] = mapped_column(String(40), nullable=False)
    target_rom: Mapped[str] = mapped_column(String(80), nullable=False)
    duration_label: Mapped[str] = mapped_column(String(30), nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default='Beginner')
    description: Mapped[str] = mapped_column(Text, nullable=False)
    instructions_json: Mapped[str] = mapped_column(Text, nullable=False, default='[]')
    thumbnail_url: Mapped[str] = mapped_column(String(500), nullable=False, default='')
    demo_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class DoctorPatient(Base):
    __tablename__ = 'doctor_patients'
    __table_args__ = (UniqueConstraint('doctor_id', 'patient_id', name='uq_doctor_patient'),)

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    condition: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_part: Mapped[str | None] = mapped_column(String(80), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Assignment(Base):
    """A doctor-prescribed exercise instance for a patient."""

    __tablename__ = 'assignments'

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey('exercises.id', ondelete='RESTRICT'), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    target_reps: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='pending')  # pending / completed / missed / cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RehabSession(Base):
    """A completed medical rehabilitation session (doctor-assigned).

    Only records with source='medical' feed into dashboards, reports and
    compliance. AI-Coach practice sessions are NOT persisted here.
    """

    __tablename__ = 'rehab_sessions'

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey('assignments.id', ondelete='SET NULL'), nullable=True, index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey('exercises.id', ondelete='RESTRICT'), nullable=False)
    video_id: Mapped[int | None] = mapped_column(ForeignKey('videos.id', ondelete='SET NULL'), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default='medical')  # medical / coach (coach never persisted, kept for parity)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_angle: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_angle: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-100
    movement_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-100
    symmetry: Mapped[float | None] = mapped_column(Float, nullable=True)
    reps_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    doctor_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Notification(Base):
    __tablename__ = 'notifications'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)  # reminder / doctor / report / system / assignment
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Report(Base):
    __tablename__ = 'reports'

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    summary_json: Mapped[str] = mapped_column(Text, nullable=False, default='{}')
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OtpCode(Base):
    __tablename__ = 'otp_codes'

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False, default='login')
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
