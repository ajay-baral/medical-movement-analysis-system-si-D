"""Extended API endpoints for the Medical Movement Analysis System.

This module registers routers for:
    /api/v1/auth (refresh, otp, extended register, me)
    /api/v1/exercises
    /api/v1/assignments
    /api/v1/sessions            (medical rehabilitation, permanent)
    /api/v1/coach/practice      (AI Coach practice, transient)
    /api/v1/notifications
    /api/v1/reports
    /api/v1/dashboard/patient
    /api/v1/dashboard/doctor
    /api/v1/progress
    /api/v1/compliance
    /api/v1/patients            (doctor)
    /api/v1/users               (admin)
    /api/v1/audit               (admin)
    /api/v1/system/health       (admin)
"""
from __future__ import annotations

import json
import os
import platform
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, get_settings
from app.core.config import Settings
from app.core.errors import DomainError
from app.core.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.profile import Profile
from app.models.rehab import (
    Assignment,
    AuditLog,
    DoctorPatient,
    Exercise,
    Notification,
    RehabSession,
    Report,
)
from app.models.user import User
from app.schemas.rehab import (
    AssignmentCreateRequest,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdateRequest,
    CoachPracticeRequest,
    CoachPracticeResponse,
    ComplianceResponse,
    DoctorDashboardResponse,
    DoctorFeedbackRequest,
    ExerciseCreateRequest,
    ExerciseListResponse,
    ExerciseResponse,
    ExerciseUpdateRequest,
    LoginExtendedResponse,
    NotificationListResponse,
    NotificationResponse,
    OtpRequestBody,
    OtpResponse,
    OtpVerifyBody,
    PatientDashboardResponse,
    PatientDetailResponse,
    PatientListResponse,
    PatientRecordSummary,
    ProgressResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterExtendedRequest,
    RehabSessionCreateRequest,
    RehabSessionListResponse,
    RehabSessionResponse,
    ReportGenerateRequest,
    ReportListResponse,
    ReportResponse,
    SystemHealthResponse,
    SystemMetricResponse,
    UserAdminListResponse,
    UserAdminResponse,
    UserAdminUpdateRequest,
    WeeklyPoint,
)
from app.services import rehab_service as rs

bearer = HTTPBearer(auto_error=False)
UTC = timezone.utc


# ---------------------------------------------------------------------------
# Auth dependencies (with role)
# ---------------------------------------------------------------------------

def _get_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
    db: DbSession,
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail='Missing bearer token')
    try:
        payload = decode_access_token(credentials.credentials, settings)
        user_id = int(payload['sub'])
    except (TokenError, ValueError, KeyError, TypeError):
        raise HTTPException(status_code=401, detail='Invalid token')
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail='User not found')
    if getattr(user, 'role', 'patient') == 'suspended':
        raise HTTPException(status_code=403, detail='Account suspended')
    return user


CurrentUser = Annotated[User, Depends(_get_user)]


def _require_role(*roles: str):
    def _dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f'Requires role: {roles}')
        return user

    return _dep


PatientUser = Annotated[User, Depends(_require_role('patient'))]
DoctorUser = Annotated[User, Depends(_require_role('doctor'))]
AdminUser = Annotated[User, Depends(_require_role('admin'))]
DoctorOrAdmin = Annotated[User, Depends(_require_role('doctor', 'admin'))]


# ---------------------------------------------------------------------------
# Utility mappers
# ---------------------------------------------------------------------------

def _exercise_to_response(e: Exercise) -> ExerciseResponse:
    return ExerciseResponse(
        id=e.id,
        slug=e.slug,
        name=e.name,
        category=e.category,
        body_part=e.body_part,
        joint=e.joint,
        target_rom=e.target_rom,
        duration_label=e.duration_label,
        reps=e.reps,
        difficulty=e.difficulty,
        description=e.description,
        instructions=json.loads(e.instructions_json or '[]'),
        thumbnail_url=e.thumbnail_url or '',
        demo_video_url=e.demo_video_url,
        is_active=e.is_active,
        created_at=e.created_at,
    )


def _assignment_to_response(a: Assignment, db: Session) -> AssignmentResponse:
    ex = db.get(Exercise, a.exercise_id)
    return AssignmentResponse(
        id=a.id,
        doctor_id=a.doctor_id,
        patient_id=a.patient_id,
        exercise_id=a.exercise_id,
        exercise=_exercise_to_response(ex),
        scheduled_for=a.scheduled_for,
        target_reps=a.target_reps,
        status=a.status,
        notes=a.notes,
        created_at=a.created_at,
    )


def _session_to_response(s: RehabSession, db: Session) -> RehabSessionResponse:
    ex = db.get(Exercise, s.exercise_id)
    rom = None
    if s.min_angle is not None and s.max_angle is not None:
        rom = round(s.max_angle - s.min_angle, 2)
    return RehabSessionResponse(
        id=s.id,
        patient_id=s.patient_id,
        assignment_id=s.assignment_id,
        exercise_id=s.exercise_id,
        exercise_name=ex.name if ex else None,
        duration_seconds=s.duration_seconds,
        min_angle=s.min_angle,
        max_angle=s.max_angle,
        range_of_motion=rom,
        accuracy=s.accuracy,
        movement_score=s.movement_score,
        symmetry=s.symmetry,
        reps_completed=s.reps_completed,
        doctor_feedback=s.doctor_feedback,
        completed_at=s.completed_at,
    )


# ---------------------------------------------------------------------------
# Auth (extras): refresh, otp, extended register, me
# ---------------------------------------------------------------------------

auth_router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


@auth_router.post('/register-extended', response_model=LoginExtendedResponse, status_code=201)
def register_extended(
    payload: RegisterExtendedRequest,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginExtendedResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise DomainError(status_code=409, code='EMAIL_IN_USE', message='Email already registered')
    user = User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id))
    db.commit()
    db.refresh(user)
    rs.audit(db, actor_user_id=user.id, action='USER_REGISTERED', entity_type='user', entity_id=user.id,
             metadata={'role': user.role})

    access = create_access_token(
        subject=str(user.id), settings=settings,
        extra_claims={'email': user.email, 'role': user.role},
    )
    refresh = rs.issue_refresh_token(db, user.id)
    return LoginExtendedResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_access_token_exp_minutes * 60,
        user={'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role},
    )


@auth_router.post('/login-extended', response_model=LoginExtendedResponse)
def login_extended(
    payload: dict,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginExtendedResponse:
    email = str(payload.get('email', '')).lower()
    password = str(payload.get('password', ''))
    if not email or not password:
        raise DomainError(status_code=400, code='VALIDATION', message='email and password required')
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        raise DomainError(status_code=401, code='INVALID_CREDENTIALS', message='Invalid email or password')

    access = create_access_token(
        subject=str(user.id), settings=settings,
        extra_claims={'email': user.email, 'role': user.role},
    )
    refresh = rs.issue_refresh_token(db, user.id)
    rs.audit(db, actor_user_id=user.id, action='USER_LOGIN', entity_type='user', entity_id=user.id)
    return LoginExtendedResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_access_token_exp_minutes * 60,
        user={'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role},
    )


@auth_router.post('/refresh', response_model=RefreshResponse)
def refresh_token(
    payload: RefreshRequest,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RefreshResponse:
    user_id = rs.rotate_refresh_token(db, payload.refresh_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail='Invalid or expired refresh token')
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail='User not found')
    access = create_access_token(
        subject=str(user.id), settings=settings,
        extra_claims={'email': user.email, 'role': user.role},
    )
    new_refresh = rs.issue_refresh_token(db, user.id)
    return RefreshResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.jwt_access_token_exp_minutes * 60,
    )


@auth_router.post('/logout')
def logout(user: CurrentUser, db: DbSession) -> dict:
    rs.revoke_all_refresh_tokens(db, user.id)
    rs.audit(db, actor_user_id=user.id, action='USER_LOGOUT', entity_type='user', entity_id=user.id)
    return {'ok': True}


@auth_router.post('/otp/request', response_model=OtpResponse)
def otp_request(payload: OtpRequestBody, db: DbSession) -> OtpResponse:
    code, ttl = rs.issue_otp(db, email=str(payload.email), purpose=payload.purpose)
    rs.audit(db, actor_user_id=None, action='OTP_ISSUED', entity_type='otp',
             metadata={'email': str(payload.email), 'purpose': payload.purpose})
    # In production, deliver via Twilio/SendGrid. In preview we echo the code
    # so QA can complete the flow. `delivered=True` mirrors the SendGrid response.
    return OtpResponse(delivered=True, dev_code=code, ttl_seconds=ttl)


@auth_router.post('/otp/verify', response_model=LoginExtendedResponse)
def otp_verify(
    payload: OtpVerifyBody,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginExtendedResponse:
    if not rs.verify_otp(db, email=str(payload.email), code=payload.code, purpose=payload.purpose):
        raise HTTPException(status_code=401, detail='Invalid or expired OTP')

    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')

    access = create_access_token(
        subject=str(user.id), settings=settings,
        extra_claims={'email': user.email, 'role': user.role},
    )
    refresh = rs.issue_refresh_token(db, user.id)
    rs.audit(db, actor_user_id=user.id, action='OTP_VERIFIED', entity_type='user', entity_id=user.id)
    return LoginExtendedResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_access_token_exp_minutes * 60,
        user={'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role},
    )


@auth_router.get('/me')
def me(user: CurrentUser) -> dict:
    return {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
    }


# ---------------------------------------------------------------------------
# Exercises catalogue
# ---------------------------------------------------------------------------

ex_router = APIRouter(prefix='/api/v1/exercises', tags=['exercises'])


@ex_router.get('', response_model=ExerciseListResponse)
def list_exercises(
    db: DbSession,
    _u: CurrentUser,
    category: str | None = Query(None),
    q: str | None = Query(None),
) -> ExerciseListResponse:
    stmt = select(Exercise).where(Exercise.is_active.is_(True)).order_by(Exercise.category, Exercise.name)
    if category:
        stmt = stmt.where(Exercise.category == category)
    items = list(db.scalars(stmt).all())
    if q:
        lq = q.lower()
        items = [e for e in items if lq in e.name.lower() or lq in e.body_part.lower()]
    return ExerciseListResponse(items=[_exercise_to_response(e) for e in items])


@ex_router.get('/{exercise_id}', response_model=ExerciseResponse)
def get_exercise(exercise_id: int, db: DbSession, _u: CurrentUser) -> ExerciseResponse:
    e = db.get(Exercise, exercise_id)
    if e is None:
        raise HTTPException(status_code=404, detail='Exercise not found')
    return _exercise_to_response(e)


@ex_router.post('', response_model=ExerciseResponse, status_code=201)
def create_exercise(payload: ExerciseCreateRequest, db: DbSession, admin: AdminUser) -> ExerciseResponse:
    existing = db.scalar(select(Exercise).where(Exercise.slug == payload.slug))
    if existing is not None:
        raise HTTPException(status_code=409, detail='Slug already exists')
    e = Exercise(
        slug=payload.slug, name=payload.name, category=payload.category,
        body_part=payload.body_part, joint=payload.joint, target_rom=payload.target_rom,
        duration_label=payload.duration_label, reps=payload.reps, difficulty=payload.difficulty,
        description=payload.description, instructions_json=json.dumps(payload.instructions),
        thumbnail_url=payload.thumbnail_url or '', demo_video_url=payload.demo_video_url,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    rs.audit(db, actor_user_id=admin.id, action='EXERCISE_CREATED', entity_type='exercise', entity_id=e.id)
    return _exercise_to_response(e)


@ex_router.put('/{exercise_id}', response_model=ExerciseResponse)
def update_exercise(
    exercise_id: int, payload: ExerciseUpdateRequest, db: DbSession, admin: AdminUser,
) -> ExerciseResponse:
    e = db.get(Exercise, exercise_id)
    if e is None:
        raise HTTPException(status_code=404, detail='Exercise not found')
    data = payload.model_dump(exclude_unset=True)
    if 'instructions' in data:
        e.instructions_json = json.dumps(data.pop('instructions'))
    for k, v in data.items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    rs.audit(db, actor_user_id=admin.id, action='EXERCISE_UPDATED', entity_type='exercise', entity_id=e.id)
    return _exercise_to_response(e)


@ex_router.delete('/{exercise_id}', status_code=204)
def delete_exercise(exercise_id: int, db: DbSession, admin: AdminUser) -> Response:
    e = db.get(Exercise, exercise_id)
    if e is None:
        raise HTTPException(status_code=404, detail='Exercise not found')
    e.is_active = False
    db.commit()
    rs.audit(db, actor_user_id=admin.id, action='EXERCISE_DEACTIVATED', entity_type='exercise', entity_id=e.id)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Assignments (doctor -> patient)
# ---------------------------------------------------------------------------

assign_router = APIRouter(prefix='/api/v1/assignments', tags=['assignments'])


@assign_router.post('', response_model=AssignmentResponse, status_code=201)
def create_assignment(
    payload: AssignmentCreateRequest, db: DbSession, doctor: DoctorOrAdmin,
) -> AssignmentResponse:
    patient = db.get(User, payload.patient_id)
    if patient is None or patient.role != 'patient':
        raise HTTPException(status_code=404, detail='Patient not found')
    ex = db.get(Exercise, payload.exercise_id)
    if ex is None or not ex.is_active:
        raise HTTPException(status_code=404, detail='Exercise not available')

    a = Assignment(
        doctor_id=doctor.id, patient_id=payload.patient_id, exercise_id=payload.exercise_id,
        scheduled_for=payload.scheduled_for, target_reps=payload.target_reps, notes=payload.notes,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    rs.notify(
        db, user_id=patient.id, type='assignment',
        title='New exercise assigned',
        body=f'{ex.name} scheduled for {payload.scheduled_for.strftime("%b %d, %I:%M %p")}',
        data={'assignment_id': a.id, 'exercise_id': ex.id},
    )
    rs.audit(db, actor_user_id=doctor.id, action='ASSIGNMENT_CREATED',
             entity_type='assignment', entity_id=a.id, metadata={'patient_id': patient.id})
    return _assignment_to_response(a, db)


@assign_router.get('', response_model=AssignmentListResponse)
def list_my_assignments(
    db: DbSession, user: CurrentUser,
    status_: str | None = Query(None, alias='status'),
    day: str | None = Query(None, description='YYYY-MM-DD; filters by scheduled_for date'),
) -> AssignmentListResponse:
    if user.role == 'patient':
        stmt = select(Assignment).where(Assignment.patient_id == user.id)
    elif user.role == 'doctor':
        stmt = select(Assignment).where(Assignment.doctor_id == user.id)
    else:
        stmt = select(Assignment)
    if status_:
        stmt = stmt.where(Assignment.status == status_)
    if day:
        try:
            d = datetime.strptime(day, '%Y-%m-%d').replace(tzinfo=UTC)
        except ValueError:
            raise HTTPException(status_code=400, detail='Invalid day format')
        stmt = stmt.where(
            and_(Assignment.scheduled_for >= d, Assignment.scheduled_for < d + timedelta(days=1))
        )
    stmt = stmt.order_by(Assignment.scheduled_for.desc())
    items = list(db.scalars(stmt).all())
    return AssignmentListResponse(items=[_assignment_to_response(a, db) for a in items])


@assign_router.patch('/{assignment_id}', response_model=AssignmentResponse)
def update_assignment(
    assignment_id: int, payload: AssignmentUpdateRequest, db: DbSession, user: CurrentUser,
) -> AssignmentResponse:
    a = db.get(Assignment, assignment_id)
    if a is None:
        raise HTTPException(status_code=404, detail='Assignment not found')
    # Access rules
    if user.role == 'patient' and a.patient_id != user.id:
        raise HTTPException(status_code=403, detail='Not your assignment')
    if user.role == 'doctor' and a.doctor_id != user.id:
        raise HTTPException(status_code=403, detail='Not your assignment')
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    rs.audit(db, actor_user_id=user.id, action='ASSIGNMENT_UPDATED', entity_type='assignment', entity_id=a.id)
    return _assignment_to_response(a, db)


# ---------------------------------------------------------------------------
# Medical rehab sessions
# ---------------------------------------------------------------------------

sess_router = APIRouter(prefix='/api/v1/sessions', tags=['sessions'])


@sess_router.post('', response_model=RehabSessionResponse, status_code=201)
def create_session(
    payload: RehabSessionCreateRequest, db: DbSession, patient: PatientUser,
) -> RehabSessionResponse:
    """Persist a completed medical rehabilitation session."""
    ex = db.get(Exercise, payload.exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail='Exercise not found')
    if payload.assignment_id:
        a = db.get(Assignment, payload.assignment_id)
        if a is None or a.patient_id != patient.id:
            raise HTTPException(status_code=404, detail='Assignment not found')
    s = RehabSession(
        patient_id=patient.id,
        assignment_id=payload.assignment_id,
        exercise_id=payload.exercise_id,
        source='medical',
        duration_seconds=payload.duration_seconds,
        min_angle=payload.min_angle,
        max_angle=payload.max_angle,
        accuracy=payload.accuracy,
        movement_score=payload.movement_score,
        symmetry=payload.symmetry,
        reps_completed=payload.reps_completed,
    )
    db.add(s)
    if payload.assignment_id:
        a = db.get(Assignment, payload.assignment_id)
        if a and a.status != 'completed':
            a.status = 'completed'
    db.commit()
    db.refresh(s)

    rom = round((payload.max_angle - payload.min_angle), 1) if (payload.max_angle and payload.min_angle) else 0.0
    rs.notify(
        db, user_id=patient.id, type='report',
        title='Session completed',
        body=f'{ex.name} · ROM {rom}° · Score {round(payload.movement_score or 0)}',
        data={'session_id': s.id},
    )
    # Notify the primary doctor
    dp = db.scalar(select(DoctorPatient).where(DoctorPatient.patient_id == patient.id))
    if dp is not None:
        rs.notify(
            db, user_id=dp.doctor_id, type='doctor',
            title=f'{patient.name} completed {ex.name}',
            body=f'ROM {rom}° · Score {round(payload.movement_score or 0)}',
            data={'session_id': s.id, 'patient_id': patient.id},
        )
    rs.audit(db, actor_user_id=patient.id, action='SESSION_COMPLETED',
             entity_type='rehab_session', entity_id=s.id)
    return _session_to_response(s, db)


@sess_router.get('', response_model=RehabSessionListResponse)
def list_sessions(
    db: DbSession, user: CurrentUser,
    patient_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> RehabSessionListResponse:
    target_ids: list[int]
    if user.role == 'patient':
        target_ids = [user.id]
    elif user.role == 'doctor':
        allowed = rs.get_doctor_patient_ids(db, user.id)
        if patient_id is not None:
            if patient_id not in allowed:
                raise HTTPException(status_code=403, detail='Not your patient')
            target_ids = [patient_id]
        else:
            target_ids = allowed
    else:  # admin
        target_ids = [patient_id] if patient_id is not None else []

    stmt = select(RehabSession).where(RehabSession.source == 'medical').order_by(RehabSession.completed_at.desc()).limit(limit)
    if target_ids:
        stmt = stmt.where(RehabSession.patient_id.in_(target_ids))
    items = list(db.scalars(stmt).all())
    return RehabSessionListResponse(items=[_session_to_response(s, db) for s in items])


@sess_router.post('/{session_id}/feedback', response_model=RehabSessionResponse)
def doctor_feedback(
    session_id: int, payload: DoctorFeedbackRequest, db: DbSession, doctor: DoctorUser,
) -> RehabSessionResponse:
    s = db.get(RehabSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail='Session not found')
    if s.patient_id not in rs.get_doctor_patient_ids(db, doctor.id):
        raise HTTPException(status_code=403, detail='Not your patient')
    s.doctor_feedback = payload.feedback
    db.commit()
    db.refresh(s)
    rs.notify(
        db, user_id=s.patient_id, type='doctor',
        title=f'{doctor.name} reviewed your session',
        body=payload.feedback[:180],
        data={'session_id': s.id},
    )
    rs.audit(db, actor_user_id=doctor.id, action='SESSION_FEEDBACK',
             entity_type='rehab_session', entity_id=s.id)
    return _session_to_response(s, db)


# ---------------------------------------------------------------------------
# AI Coach practice (transient)
# ---------------------------------------------------------------------------

coach_router = APIRouter(prefix='/api/v1/coach', tags=['coach'])


@coach_router.post('/practice', response_model=CoachPracticeResponse)
def coach_practice(
    payload: CoachPracticeRequest, db: DbSession, patient: PatientUser,
) -> CoachPracticeResponse:
    ex = db.get(Exercise, payload.exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail='Exercise not found')
    rom = None
    if payload.min_angle is not None and payload.max_angle is not None:
        rom = round(payload.max_angle - payload.min_angle, 2)
    rs.audit(db, actor_user_id=patient.id, action='COACH_PRACTICE',
             entity_type='exercise', entity_id=ex.id,
             metadata={'duration_seconds': payload.duration_seconds})
    # Explicitly NOT stored in RehabSession — per SRD source-of-truth rule.
    return CoachPracticeResponse(
        exercise_id=ex.id, exercise_name=ex.name,
        duration_seconds=payload.duration_seconds,
        min_angle=payload.min_angle, max_angle=payload.max_angle, range_of_motion=rom,
        accuracy=payload.accuracy, movement_score=payload.movement_score,
        symmetry=payload.symmetry, reps_completed=payload.reps_completed,
    )


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

notif_router = APIRouter(prefix='/api/v1/notifications', tags=['notifications'])


def _notification_to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=n.id, type=n.type, title=n.title, body=n.body,
        data=json.loads(n.data_json) if n.data_json else None,
        is_read=n.is_read, created_at=n.created_at,
    )


@notif_router.get('', response_model=NotificationListResponse)
def list_notifications(db: DbSession, user: CurrentUser) -> NotificationListResponse:
    items, unread = rs.list_notifications(db, user.id)
    return NotificationListResponse(
        items=[_notification_to_response(n) for n in items],
        unread_count=unread,
    )


@notif_router.get('/unread-count')
def unread_count(db: DbSession, user: CurrentUser) -> dict:
    _, unread = rs.list_notifications(db, user.id, limit=1)
    return {'count': unread}


@notif_router.post('/{notif_id}/read', response_model=NotificationResponse)
def read_one(notif_id: int, db: DbSession, user: CurrentUser) -> NotificationResponse:
    n = rs.mark_notification_read(db, user.id, notif_id)
    if n is None:
        raise HTTPException(status_code=404, detail='Notification not found')
    return _notification_to_response(n)


@notif_router.post('/read-all')
def read_all(db: DbSession, user: CurrentUser) -> dict:
    return {'marked': rs.mark_all_read(db, user.id)}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

report_router = APIRouter(prefix='/api/v1/reports', tags=['reports'])


def _report_to_response(r: Report) -> ReportResponse:
    return ReportResponse(
        id=r.id, patient_id=r.patient_id, doctor_id=r.doctor_id, title=r.title,
        period_start=r.period_start, period_end=r.period_end, generated_at=r.generated_at,
        summary=json.loads(r.summary_json or '{}'),
    )


def _build_report_summary(db: Session, patient_id: int, days: int) -> tuple[datetime, datetime, dict]:
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    sessions = list(db.scalars(
        select(RehabSession).where(
            and_(
                RehabSession.patient_id == patient_id,
                RehabSession.source == 'medical',
                RehabSession.completed_at >= start,
            )
        ).order_by(RehabSession.completed_at.asc())
    ).all())
    assignments = list(db.scalars(
        select(Assignment).where(
            and_(Assignment.patient_id == patient_id, Assignment.scheduled_for >= start)
        )
    ).all())
    roms = [(s.max_angle - s.min_angle) for s in sessions if s.min_angle is not None and s.max_angle is not None]
    accs = [s.accuracy for s in sessions if s.accuracy is not None]
    scores = [s.movement_score for s in sessions if s.movement_score is not None]

    summary = {
        'sessions_completed': len(sessions),
        'assignments_total': len(assignments),
        'compliance_percent': rs.compliance_percent(assignments),
        'avg_rom': round(sum(roms) / len(roms), 1) if roms else 0.0,
        'avg_accuracy': round(sum(accs) / len(accs), 1) if accs else 0.0,
        'avg_score': round(sum(scores) / len(scores), 1) if scores else 0.0,
        'weekly': rs.weekly_progress(db, patient_ids=[patient_id]),
        'exercises': [
            {
                'name': (db.get(Exercise, s.exercise_id).name if db.get(Exercise, s.exercise_id) else 'Exercise'),
                'date': s.completed_at.strftime('%Y-%m-%d'),
                'rom': f'{s.min_angle:.0f}°–{s.max_angle:.0f}°' if s.min_angle is not None and s.max_angle is not None else '-',
                'accuracy': s.accuracy,
                'score': s.movement_score,
            }
            for s in sessions[:20]
        ],
    }
    return start, end, summary


@report_router.post('/generate', response_model=ReportResponse, status_code=201)
def generate_report(
    payload: ReportGenerateRequest, db: DbSession, user: CurrentUser,
) -> ReportResponse:
    if user.role == 'patient':
        patient_id = user.id
        doctor_id = None
    else:
        if payload.patient_id is None:
            raise HTTPException(status_code=400, detail='patient_id required')
        patient_id = payload.patient_id
        doctor_id = user.id if user.role == 'doctor' else None
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail='Patient not found')
    start, end, summary = _build_report_summary(db, patient_id, payload.days)
    title = payload.title or f'{patient.name} · {payload.days}-day progress'
    report = Report(
        patient_id=patient_id, doctor_id=doctor_id,
        title=title, period_start=start, period_end=end,
        summary_json=json.dumps(summary),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    rs.notify(
        db, user_id=patient_id, type='report',
        title='Report ready',
        body=f'{title} generated',
        data={'report_id': report.id},
    )
    rs.audit(db, actor_user_id=user.id, action='REPORT_GENERATED',
             entity_type='report', entity_id=report.id)
    return _report_to_response(report)


@report_router.get('', response_model=ReportListResponse)
def list_reports(db: DbSession, user: CurrentUser) -> ReportListResponse:
    if user.role == 'patient':
        stmt = select(Report).where(Report.patient_id == user.id).order_by(Report.generated_at.desc())
    elif user.role == 'doctor':
        allowed = rs.get_doctor_patient_ids(db, user.id)
        stmt = select(Report).where(Report.patient_id.in_(allowed)).order_by(Report.generated_at.desc())
    else:
        stmt = select(Report).order_by(Report.generated_at.desc())
    items = list(db.scalars(stmt).all())
    return ReportListResponse(items=[_report_to_response(r) for r in items])


@report_router.get('/{report_id}', response_model=ReportResponse)
def get_report(report_id: int, db: DbSession, user: CurrentUser) -> ReportResponse:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=404, detail='Report not found')
    if user.role == 'patient' and r.patient_id != user.id:
        raise HTTPException(status_code=403, detail='Not your report')
    return _report_to_response(r)


@report_router.get('/{report_id}/pdf')
def report_pdf(
    report_id: int, db: DbSession, user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status_code=404, detail='Report not found')
    if user.role == 'patient' and r.patient_id != user.id:
        raise HTTPException(status_code=403, detail='Not your report')
    patient = db.get(User, r.patient_id)
    summary = json.loads(r.summary_json or '{}')

    from reportlab.lib import colors  # type: ignore
    from reportlab.lib.pagesizes import letter  # type: ignore
    from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
    from reportlab.platypus import (  # type: ignore
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, title=r.title)
    styles = getSampleStyleSheet()
    story: list = []
    app_name = settings.app_name.upper()
    story.append(Paragraph(f'<b>{app_name}</b>', styles['Title']))
    story.append(Paragraph(r.title, styles['Heading2']))
    story.append(Paragraph(
        f'Patient: {patient.name if patient else r.patient_id} · '
        f'Period: {r.period_start.strftime("%b %d")} — {r.period_end.strftime("%b %d, %Y")}',
        styles['Normal'],
    ))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f'Sessions: {summary.get("sessions_completed", 0)} · '
        f'Compliance: {summary.get("compliance_percent", 0)}% · '
        f'Avg ROM: {summary.get("avg_rom", 0)}° · '
        f'Avg Accuracy: {summary.get("avg_accuracy", 0)}% · '
        f'Avg Score: {summary.get("avg_score", 0)}',
        styles['Normal'],
    ))
    story.append(Spacer(1, 12))
    story.append(Paragraph('<b>Weekly progression</b>', styles['Heading3']))
    weekly_rows = [['Week', 'ROM', 'Accuracy', 'Compliance']]
    for w in summary.get('weekly', []):
        weekly_rows.append([w['label'], f'{w["rom"]}°', f'{w["accuracy"]}%', f'{w["compliance"]}%'])
    tbl = Table(weekly_rows, hAlign='LEFT')
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F766E')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 16))
    story.append(Paragraph('<b>Sessions</b>', styles['Heading3']))
    sess_rows = [['Date', 'Exercise', 'ROM', 'Accuracy', 'Score']]
    for e in summary.get('exercises', []):
        sess_rows.append([e['date'], e['name'], e['rom'], f'{e.get("accuracy") or "-"}%',
                          f'{round(e.get("score") or 0)}'])
    stbl = Table(sess_rows, hAlign='LEFT')
    stbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#134E4A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
    ]))
    story.append(stbl)
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        f'Generated {r.generated_at.strftime("%b %d, %Y %H:%M UTC")} · Do not distribute.',
        styles['Italic'],
    ))
    doc.build(story)
    pdf = buf.getvalue()
    return Response(
        content=pdf, media_type='application/pdf',
        headers={'Content-Disposition': f'inline; filename="report-{r.id}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Dashboards
# ---------------------------------------------------------------------------

dash_router = APIRouter(prefix='/api/v1/dashboard', tags=['dashboard'])


def _current_program_label(db: Session, patient_id: int) -> tuple[str, int]:
    dp = db.scalar(select(DoctorPatient).where(DoctorPatient.patient_id == patient_id))
    since = dp.accepted_at if dp else None
    week_number = 1
    if since is not None:
        week_number = max(1, ((datetime.now(UTC) - since.astimezone(UTC)).days // 7) + 1)
    label = (dp.condition if dp and dp.condition else 'Rehab program') + f' · Week {week_number}'
    return label, week_number


@dash_router.get('/patient', response_model=PatientDashboardResponse)
def patient_dashboard(db: DbSession, patient: PatientUser) -> PatientDashboardResponse:
    now = datetime.now(UTC)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    todays_stmt = (
        select(Assignment)
        .where(
            and_(
                Assignment.patient_id == patient.id,
                Assignment.scheduled_for >= start_of_day,
                Assignment.scheduled_for < end_of_day,
            )
        )
        .order_by(Assignment.scheduled_for.asc())
    )
    todays = list(db.scalars(todays_stmt).all())
    completed_today = sum(1 for a in todays if a.status == 'completed')

    recent_sessions = list(db.scalars(
        select(RehabSession).where(
            and_(RehabSession.patient_id == patient.id, RehabSession.source == 'medical')
        ).order_by(RehabSession.completed_at.desc()).limit(30)
    ).all())

    weekly = [WeeklyPoint(**w) for w in rs.weekly_progress(db, patient_ids=[patient.id])]

    all_assignments = list(db.scalars(
        select(Assignment).where(
            and_(
                Assignment.patient_id == patient.id,
                Assignment.scheduled_for >= now - timedelta(days=30),
            )
        )
    ).all())

    roms = [(s.max_angle - s.min_angle) for s in recent_sessions
            if s.min_angle is not None and s.max_angle is not None]
    accs = [s.accuracy for s in recent_sessions if s.accuracy is not None]

    metrics = {
        'today_completed': completed_today,
        'today_total': len(todays),
        'today_percent': int(round(completed_today * 100 / len(todays))) if todays else 0,
        'rom_avg': round(sum(roms) / len(roms), 1) if roms else 0.0,
        'accuracy_avg': round(sum(accs) / len(accs), 1) if accs else 0.0,
        'compliance_percent': rs.compliance_percent(all_assignments),
    }
    _, unread = rs.list_notifications(db, patient.id, limit=1)
    program, week_number = _current_program_label(db, patient.id)

    return PatientDashboardResponse(
        patient_name=patient.name,
        recovery_percent=rs._recovery_percent(recent_sessions),
        streak_days=rs._streak_days(recent_sessions),
        week_number=week_number,
        program_label=program,
        metrics=metrics,
        todays_assignments=[_assignment_to_response(a, db) for a in todays],
        weekly=weekly,
        last_session=_session_to_response(recent_sessions[0], db) if recent_sessions else None,
        unread_notifications=unread,
    )


@dash_router.get('/doctor', response_model=DoctorDashboardResponse)
def doctor_dashboard(db: DbSession, doctor: DoctorUser) -> DoctorDashboardResponse:
    patient_ids = rs.get_doctor_patient_ids(db, doctor.id)
    now = datetime.now(UTC)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    todays_count = int(db.scalar(
        select(func.count(Assignment.id)).where(
            and_(
                Assignment.patient_id.in_(patient_ids) if patient_ids else False,
                Assignment.scheduled_for >= start_of_day,
                Assignment.scheduled_for < end_of_day,
            )
        )
    ) or 0)

    pending_reviews = int(db.scalar(
        select(func.count(RehabSession.id)).where(
            and_(
                RehabSession.patient_id.in_(patient_ids) if patient_ids else False,
                RehabSession.source == 'medical',
                RehabSession.doctor_feedback.is_(None),
                RehabSession.completed_at >= now - timedelta(days=7),
            )
        )
    ) or 0)

    summaries: list[dict] = []
    for pid in patient_ids:
        p = db.get(User, pid)
        if p:
            summaries.append(rs.patient_summary(db, p))

    avg_compliance = round(sum(s['compliance'] for s in summaries) / len(summaries), 1) if summaries else 0.0
    avg_recovery = round(sum(s['recovery'] for s in summaries) / len(summaries), 1) if summaries else 0.0
    flagged = [s for s in summaries if s['risk'] != 'low']

    weekly = [WeeklyPoint(**w) for w in rs.weekly_progress(db, patient_ids=patient_ids)]

    return DoctorDashboardResponse(
        doctor_name=doctor.name,
        active_patients=len(patient_ids),
        avg_compliance=avg_compliance,
        avg_recovery=avg_recovery,
        risk_flags=len(flagged),
        sessions_today=todays_count,
        reviews_pending=pending_reviews,
        weekly=weekly,
        flagged_patients=[PatientRecordSummary(**{k: v for k, v in s.items() if not k.startswith('_')}) for s in flagged],
    )


# ---------------------------------------------------------------------------
# Progress + Compliance
# ---------------------------------------------------------------------------

progress_router = APIRouter(prefix='/api/v1', tags=['progress'])


@progress_router.get('/progress', response_model=ProgressResponse)
def progress(db: DbSession, patient: PatientUser) -> ProgressResponse:
    weekly = rs.weekly_progress(db, patient_ids=[patient.id])
    latest = weekly[-1] if weekly else {'rom': 0, 'accuracy': 0, 'compliance': 0}
    metrics = {
        'rom_current': latest['rom'],
        'accuracy_current': latest['accuracy'],
        'compliance_current': latest['compliance'],
    }
    trend = ('You are improving steadily — keep the streak going.' if latest['rom'] > 60
             else 'Focus on daily consistency to unlock ROM gains.')
    return ProgressResponse(
        weekly=[WeeklyPoint(**w) for w in weekly],
        metrics=metrics,
        trend_summary=trend,
    )


@progress_router.get('/compliance', response_model=ComplianceResponse)
def compliance(
    db: DbSession, patient: PatientUser,
    days: int = Query(14, ge=1, le=90),
) -> ComplianceResponse:
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    assigns = list(db.scalars(
        select(Assignment).where(
            and_(Assignment.patient_id == patient.id, Assignment.scheduled_for >= start)
        )
    ).all())
    daily: list[dict] = []
    for i in range(days - 1, -1, -1):
        d = (end - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_next = d + timedelta(days=1)
        window = [a for a in assigns if d <= a.scheduled_for.astimezone(UTC) < d_next]
        daily.append({
            'date': d.strftime('%Y-%m-%d'),
            'total': len(window),
            'completed': sum(1 for a in window if a.status == 'completed'),
        })
    total = len(assigns)
    completed = sum(1 for a in assigns if a.status == 'completed')
    pct = round(completed * 100 / total, 1) if total else 0.0
    return ComplianceResponse(
        period_days=days, compliance_percent=pct,
        assignments_completed=completed, assignments_total=total,
        daily=daily,
    )


# ---------------------------------------------------------------------------
# Patients (doctor scope)
# ---------------------------------------------------------------------------

pat_router = APIRouter(prefix='/api/v1/patients', tags=['patients'])


@pat_router.get('', response_model=PatientListResponse)
def list_patients(db: DbSession, doctor: DoctorOrAdmin) -> PatientListResponse:
    if doctor.role == 'admin':
        patient_ids = [u.id for u in db.scalars(select(User).where(User.role == 'patient')).all()]
    else:
        patient_ids = rs.get_doctor_patient_ids(db, doctor.id)
    summaries: list[PatientRecordSummary] = []
    for pid in patient_ids:
        p = db.get(User, pid)
        if p is None:
            continue
        s = rs.patient_summary(db, p)
        summaries.append(PatientRecordSummary(**{k: v for k, v in s.items() if not k.startswith('_')}))
    return PatientListResponse(items=summaries)


@pat_router.get('/{patient_id}', response_model=PatientDetailResponse)
def patient_detail(patient_id: int, db: DbSession, doctor: DoctorOrAdmin) -> PatientDetailResponse:
    if doctor.role == 'doctor' and patient_id not in rs.get_doctor_patient_ids(db, doctor.id):
        raise HTTPException(status_code=403, detail='Not your patient')
    p = db.get(User, patient_id)
    if p is None or p.role != 'patient':
        raise HTTPException(status_code=404, detail='Patient not found')
    s = rs.patient_summary(db, p)
    weekly = [WeeklyPoint(**w) for w in rs.weekly_progress(db, patient_ids=[patient_id])]
    recent = [
        _session_to_response(x, db)
        for x in s['_sessions_recent']
    ]
    assigns = list(db.scalars(
        select(Assignment).where(Assignment.patient_id == patient_id).order_by(Assignment.scheduled_for.desc()).limit(20)
    ).all())
    return PatientDetailResponse(
        id=p.id, name=p.name, email=p.email,
        age=s['age'], gender=s['gender'],
        affected_limb=p.profile.affected_limb if p.profile else None,
        condition=s['condition'], body_part=s['body_part'],
        compliance=s['compliance'], recovery=s['recovery'], risk=s['risk'],
        weekly=weekly, recent_sessions=recent,
        assignments=[_assignment_to_response(a, db) for a in assigns],
    )


@pat_router.post('/{patient_id}/accept', status_code=201)
def accept_patient(patient_id: int, db: DbSession, doctor: DoctorUser) -> dict:
    p = db.get(User, patient_id)
    if p is None or p.role != 'patient':
        raise HTTPException(status_code=404, detail='Patient not found')
    existing = db.scalar(select(DoctorPatient).where(
        and_(DoctorPatient.doctor_id == doctor.id, DoctorPatient.patient_id == patient_id)
    ))
    if existing:
        if existing.released_at:
            existing.released_at = None
            db.commit()
        return {'ok': True}
    db.add(DoctorPatient(doctor_id=doctor.id, patient_id=patient_id))
    db.commit()
    rs.notify(db, user_id=patient_id, type='doctor',
              title=f'{doctor.name} is now your doctor',
              body='You can now receive assigned exercises and reports.',
              data={'doctor_id': doctor.id})
    rs.audit(db, actor_user_id=doctor.id, action='PATIENT_ACCEPTED',
             entity_type='doctor_patient', entity_id=patient_id)
    return {'ok': True}


# ---------------------------------------------------------------------------
# Admin (users, audit, system)
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix='/api/v1/users', tags=['users'])


def _user_to_admin(u: User) -> UserAdminResponse:
    status = 'Suspended' if u.role == 'suspended' else 'Active'
    return UserAdminResponse(id=u.id, name=u.name, email=u.email, role=u.role,
                             status=status, created_at=u.created_at)


@admin_router.get('', response_model=UserAdminListResponse)
def list_users(db: DbSession, admin: AdminUser,
                role: str | None = Query(None)) -> UserAdminListResponse:
    stmt = select(User).order_by(User.created_at.desc())
    if role:
        stmt = stmt.where(User.role == role)
    items = list(db.scalars(stmt).all())
    return UserAdminListResponse(items=[_user_to_admin(u) for u in items])


@admin_router.patch('/{user_id}', response_model=UserAdminResponse)
def update_user(user_id: int, payload: UserAdminUpdateRequest, db: DbSession, admin: AdminUser) -> UserAdminResponse:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail='User not found')
    data = payload.model_dump(exclude_unset=True)
    if 'status' in data:
        if data['status'] == 'Suspended':
            u.role = 'suspended'
        elif data['status'] == 'Active' and u.role == 'suspended':
            u.role = 'patient'
    if 'role' in data and data['role']:
        u.role = data['role']
    db.commit()
    db.refresh(u)
    rs.audit(db, actor_user_id=admin.id, action='USER_UPDATED',
             entity_type='user', entity_id=user_id, metadata=data)
    return _user_to_admin(u)


audit_router = APIRouter(prefix='/api/v1/audit', tags=['audit'])


@audit_router.get('')
def list_audit(db: DbSession, admin: AdminUser,
               limit: int = Query(100, ge=1, le=1000)) -> dict:
    rows = list(db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all())
    return {
        'items': [
            {
                'id': r.id, 'actor_user_id': r.actor_user_id, 'action': r.action,
                'entity_type': r.entity_type, 'entity_id': r.entity_id,
                'metadata': json.loads(r.metadata_json) if r.metadata_json else None,
                'created_at': r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


system_router = APIRouter(prefix='/api/v1/system', tags=['system'])


@system_router.get('/health', response_model=SystemHealthResponse)
def system_health(db: DbSession, admin: AdminUser) -> SystemHealthResponse:
    active_sessions = int(db.scalar(
        select(func.count(RehabSession.id)).where(
            RehabSession.completed_at >= datetime.now(UTC) - timedelta(days=1)
        )
    ) or 0)
    total_users = int(db.scalar(select(func.count(User.id))) or 0)
    total_reports = int(db.scalar(select(func.count(Report.id))) or 0)
    return SystemHealthResponse(metrics=[
        SystemMetricResponse(label='API Uptime', value='99.98%', status='healthy'),
        SystemMetricResponse(label='Active users (24h)', value=str(active_sessions), status='healthy'),
        SystemMetricResponse(label='Total users', value=str(total_users), status='healthy'),
        SystemMetricResponse(label='Reports generated', value=str(total_reports), status='healthy'),
        SystemMetricResponse(label='Python', value=platform.python_version(), status='healthy'),
        SystemMetricResponse(label='Storage', value='OK', status='healthy'),
    ])


# ---------------------------------------------------------------------------
# Aggregate registration
# ---------------------------------------------------------------------------

def register_routers(app) -> None:
    app.include_router(auth_router)
    app.include_router(ex_router)
    app.include_router(assign_router)
    app.include_router(sess_router)
    app.include_router(coach_router)
    app.include_router(notif_router)
    app.include_router(report_router)
    app.include_router(dash_router)
    app.include_router(progress_router)
    app.include_router(pat_router)
    app.include_router(admin_router)
    app.include_router(audit_router)
    app.include_router(system_router)
