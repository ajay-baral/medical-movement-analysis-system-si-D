"""Business logic for rehabilitation domain aggregations, notifications,
reports, assignments, sessions and analytics.

All statistics only reference completed doctor-assigned RehabSession rows —
AI Coach practice results are never persisted here, satisfying the source-of-
truth rule from the SRD.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Iterable

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.rehab import (
    Assignment,
    AuditLog,
    DoctorPatient,
    Exercise,
    Notification,
    OtpCode,
    RefreshToken,
    RehabSession,
    Report,
)
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

UTC = timezone.utc


def _week_bounds(now: datetime, weeks_back: int) -> tuple[datetime, datetime]:
    start_of_week = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end = start_of_week - timedelta(weeks=weeks_back) + timedelta(days=6, hours=23, minutes=59)
    start = start_of_week - timedelta(weeks=weeks_back)
    return start, end


def compliance_percent(assignments: Iterable[Assignment]) -> float:
    assignments = list(assignments)
    if not assignments:
        return 0.0
    completed = sum(1 for a in assignments if a.status == 'completed')
    return round(completed * 100.0 / len(assignments), 1)


def _recovery_percent(sessions: list[RehabSession]) -> float:
    if not sessions:
        return 0.0
    # Recovery = weighted blend of movement_score and accuracy across sessions.
    scores = [s.movement_score for s in sessions if s.movement_score is not None]
    accuracies = [s.accuracy for s in sessions if s.accuracy is not None]
    if not scores and not accuracies:
        return 0.0
    ms = mean(scores) if scores else 0.0
    ac = mean(accuracies) if accuracies else 0.0
    if scores and accuracies:
        return round(0.6 * ms + 0.4 * ac, 1)
    return round(ms or ac, 1)


def _streak_days(sessions: list[RehabSession]) -> int:
    if not sessions:
        return 0
    day_set = {s.completed_at.astimezone(UTC).date() for s in sessions}
    today = datetime.now(UTC).date()
    streak = 0
    for offset in range(0, 30):
        d = today - timedelta(days=offset)
        if d in day_set:
            streak += 1
        else:
            if offset == 0:  # today missing — check if yesterday still qualifies
                continue
            break
    return streak


def _risk_level(compliance: float, recovery: float) -> str:
    if compliance < 55 or recovery < 45:
        return 'high'
    if compliance < 75 or recovery < 65:
        return 'medium'
    return 'low'


def _relative_label(dt: datetime | None) -> str:
    if dt is None:
        return 'No sessions yet'
    now = datetime.now(UTC)
    delta = now - dt.astimezone(UTC)
    if delta.days == 0:
        return 'Today'
    if delta.days == 1:
        return 'Yesterday'
    if delta.days < 7:
        return f'{delta.days} days ago'
    if delta.days < 30:
        return f'{delta.days // 7} wk ago'
    return dt.astimezone(UTC).strftime('%b %d')


# ---------------------------------------------------------------------------
# Weekly progress aggregation (used by patient dashboard, progress, doctor
# cohort trend, reports).
# ---------------------------------------------------------------------------

def weekly_progress(
    db: Session,
    *,
    patient_ids: list[int] | None = None,
    weeks: int = 6,
) -> list[dict]:
    now = datetime.now(UTC)
    out: list[dict] = []
    for i in range(weeks - 1, -1, -1):
        start, end = _week_bounds(now, i)
        stmt = select(RehabSession).where(
            and_(
                RehabSession.completed_at >= start,
                RehabSession.completed_at <= end,
                RehabSession.source == 'medical',
            )
        )
        if patient_ids is not None:
            stmt = stmt.where(RehabSession.patient_id.in_(patient_ids))
        sessions = list(db.scalars(stmt).all())

        roms = [
            (s.max_angle - s.min_angle) for s in sessions
            if s.min_angle is not None and s.max_angle is not None
        ]
        accs = [s.accuracy for s in sessions if s.accuracy is not None]

        stmt_a = select(Assignment).where(
            and_(
                Assignment.scheduled_for >= start,
                Assignment.scheduled_for <= end,
            )
        )
        if patient_ids is not None:
            stmt_a = stmt_a.where(Assignment.patient_id.in_(patient_ids))
        assignments = list(db.scalars(stmt_a).all())

        label = f'W{weeks - i}'
        out.append(
            {
                'label': label,
                'rom': round(mean(roms), 1) if roms else 0.0,
                'accuracy': round(mean(accs), 1) if accs else 0.0,
                'compliance': compliance_percent(assignments),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data_json=json.dumps(data) if data else None,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def list_notifications(db: Session, user_id: int, limit: int = 50) -> tuple[list[Notification], int]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    items = list(db.scalars(stmt).all())
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            and_(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
    ) or 0
    return items, int(unread)


def mark_notification_read(db: Session, user_id: int, notif_id: int) -> Notification | None:
    n = db.scalar(
        select(Notification).where(
            and_(Notification.id == notif_id, Notification.user_id == user_id)
        )
    )
    if n is None:
        return None
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


def mark_all_read(db: Session, user_id: int) -> int:
    stmt = select(Notification).where(
        and_(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    unread = list(db.scalars(stmt).all())
    for n in unread:
        n.is_read = True
    db.commit()
    return len(unread)


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

def audit(
    db: Session,
    *,
    actor_user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    db.add(log)
    db.commit()


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------

def _hash_token(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def issue_refresh_token(db: Session, user_id: int, ttl_days: int = 30) -> str:
    token = secrets.token_urlsafe(48)
    entry = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
    )
    db.add(entry)
    db.commit()
    return token


def rotate_refresh_token(db: Session, refresh_token: str) -> int | None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(refresh_token)))
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at < datetime.now(UTC):
        return None
    row.revoked_at = datetime.now(UTC)
    db.commit()
    return row.user_id


def revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    stmt = select(RefreshToken).where(
        and_(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    )
    for row in db.scalars(stmt):
        row.revoked_at = datetime.now(UTC)
    db.commit()


# ---------------------------------------------------------------------------
# OTP
# ---------------------------------------------------------------------------

def issue_otp(db: Session, *, email: str, purpose: str = 'login', ttl_minutes: int = 10) -> tuple[str, int]:
    # 6-digit numeric OTP.
    code = f'{secrets.randbelow(1_000_000):06d}'
    entry = OtpCode(
        email=email.lower(),
        code_hash=_hash_token(code),
        purpose=purpose,
        expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
    )
    db.add(entry)
    db.commit()
    return code, ttl_minutes * 60


def verify_otp(db: Session, *, email: str, code: str, purpose: str = 'login') -> bool:
    stmt = (
        select(OtpCode)
        .where(
            and_(
                OtpCode.email == email.lower(),
                OtpCode.purpose == purpose,
                OtpCode.used_at.is_(None),
            )
        )
        .order_by(OtpCode.created_at.desc())
    )
    entry = db.scalar(stmt)
    if entry is None:
        return False
    if entry.expires_at < datetime.now(UTC):
        return False
    if entry.code_hash != _hash_token(code):
        return False
    entry.used_at = datetime.now(UTC)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Doctor / patient helpers
# ---------------------------------------------------------------------------

def get_doctor_patient_ids(db: Session, doctor_id: int) -> list[int]:
    stmt = select(DoctorPatient.patient_id).where(
        and_(DoctorPatient.doctor_id == doctor_id, DoctorPatient.released_at.is_(None))
    )
    return [row[0] for row in db.execute(stmt).all()]


def patient_summary(db: Session, patient: User) -> dict:
    now = datetime.now(UTC)
    since = now - timedelta(days=30)

    sessions_stmt = (
        select(RehabSession)
        .where(
            and_(
                RehabSession.patient_id == patient.id,
                RehabSession.source == 'medical',
                RehabSession.completed_at >= since,
            )
        )
        .order_by(RehabSession.completed_at.desc())
    )
    sessions = list(db.scalars(sessions_stmt).all())

    assignments_stmt = select(Assignment).where(
        and_(
            Assignment.patient_id == patient.id,
            Assignment.scheduled_for >= since,
        )
    )
    assignments = list(db.scalars(assignments_stmt).all())

    compliance = compliance_percent(assignments)
    recovery = _recovery_percent(sessions)
    risk = _risk_level(compliance, recovery)
    last_completed = sessions[0].completed_at if sessions else None

    dp = db.scalar(select(DoctorPatient).where(DoctorPatient.patient_id == patient.id))

    return {
        'id': patient.id,
        'name': patient.name,
        'age': patient.profile.age if patient.profile else None,
        'gender': patient.profile.gender if patient.profile else None,
        'condition': dp.condition if dp else None,
        'body_part': dp.body_part if dp else (patient.profile.affected_limb if patient.profile else None),
        'compliance': compliance,
        'recovery': recovery,
        'risk': risk,
        'avatar_url': None,
        'last_session_label': _relative_label(last_completed),
        '_last_session': last_completed,
        '_sessions_recent': sessions[:10],
        '_assignments_recent': assignments[-20:],
    }
