"""Pydantic contracts for rehabilitation endpoints (exercises, assignments,
sessions, notifications, reports, dashboards, admin, auth extras)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- Exercises ----------

class ExerciseBase(BaseModel):
    slug: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    category: Literal['upper', 'lower', 'spine', 'facial']
    body_part: str
    joint: str
    target_rom: str
    duration_label: str
    reps: int = Field(ge=1, le=200)
    difficulty: Literal['Beginner', 'Intermediate', 'Advanced'] = 'Beginner'
    description: str
    instructions: list[str] = Field(default_factory=list)
    thumbnail_url: str = ''
    demo_video_url: str | None = None


class ExerciseCreateRequest(ExerciseBase):
    pass


class ExerciseUpdateRequest(BaseModel):
    name: str | None = None
    category: Literal['upper', 'lower', 'spine', 'facial'] | None = None
    body_part: str | None = None
    joint: str | None = None
    target_rom: str | None = None
    duration_label: str | None = None
    reps: int | None = None
    difficulty: Literal['Beginner', 'Intermediate', 'Advanced'] | None = None
    description: str | None = None
    instructions: list[str] | None = None
    thumbnail_url: str | None = None
    demo_video_url: str | None = None
    is_active: bool | None = None


class ExerciseResponse(ExerciseBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExerciseListResponse(BaseModel):
    items: list[ExerciseResponse]


# ---------- Assignments ----------

class AssignmentCreateRequest(BaseModel):
    patient_id: int
    exercise_id: int
    scheduled_for: datetime
    target_reps: int = Field(default=10, ge=1, le=200)
    notes: str | None = None


class AssignmentResponse(BaseModel):
    id: int
    doctor_id: int | None
    patient_id: int
    exercise_id: int
    exercise: ExerciseResponse
    scheduled_for: datetime
    target_reps: int
    status: str
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssignmentListResponse(BaseModel):
    items: list[AssignmentResponse]


class AssignmentUpdateRequest(BaseModel):
    status: Literal['pending', 'completed', 'missed', 'cancelled'] | None = None
    scheduled_for: datetime | None = None
    notes: str | None = None


# ---------- Rehab sessions (permanent) ----------

class RehabSessionCreateRequest(BaseModel):
    assignment_id: int | None = None
    exercise_id: int
    duration_seconds: int = Field(ge=0)
    min_angle: float | None = None
    max_angle: float | None = None
    accuracy: float | None = Field(default=None, ge=0, le=100)
    movement_score: float | None = Field(default=None, ge=0, le=100)
    symmetry: float | None = Field(default=None, ge=0, le=100)
    reps_completed: int = Field(default=0, ge=0)


class RehabSessionResponse(BaseModel):
    id: int
    patient_id: int
    assignment_id: int | None
    exercise_id: int
    exercise_name: str | None = None
    duration_seconds: int
    min_angle: float | None
    max_angle: float | None
    range_of_motion: float | None = None
    accuracy: float | None
    movement_score: float | None
    symmetry: float | None
    reps_completed: int
    doctor_feedback: str | None
    completed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RehabSessionListResponse(BaseModel):
    items: list[RehabSessionResponse]


# ---------- AI Coach practice (transient) ----------

class CoachPracticeRequest(BaseModel):
    exercise_id: int
    duration_seconds: int = Field(ge=0)
    min_angle: float | None = None
    max_angle: float | None = None
    accuracy: float | None = None
    movement_score: float | None = None
    symmetry: float | None = None
    reps_completed: int = 0


class CoachPracticeResponse(BaseModel):
    exercise_id: int
    exercise_name: str
    duration_seconds: int
    min_angle: float | None
    max_angle: float | None
    range_of_motion: float | None
    accuracy: float | None
    movement_score: float | None
    symmetry: float | None
    reps_completed: int
    persisted: bool = False
    note: str = 'AI Coach practice result is temporary and NOT stored in medical history.'


# ---------- Notifications ----------

class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str
    data: dict | None = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


# ---------- Reports ----------

class ReportResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int | None
    title: str
    period_start: datetime
    period_end: datetime
    generated_at: datetime
    summary: dict = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class ReportListResponse(BaseModel):
    items: list[ReportResponse]


class ReportGenerateRequest(BaseModel):
    patient_id: int | None = None  # doctor may specify, patient uses their own
    days: int = Field(default=7, ge=1, le=90)
    title: str | None = None


# ---------- Dashboards ----------

class KpiMetric(BaseModel):
    label: str
    value: str
    delta: str | None = None
    positive: bool | None = None


class WeeklyPoint(BaseModel):
    label: str
    rom: float
    accuracy: float
    compliance: float


class PatientDashboardResponse(BaseModel):
    patient_name: str
    recovery_percent: float
    streak_days: int
    week_number: int
    program_label: str
    metrics: dict  # today/{completed,total}, rom_avg, accuracy_avg, compliance_pct
    todays_assignments: list[AssignmentResponse]
    weekly: list[WeeklyPoint]
    last_session: RehabSessionResponse | None
    unread_notifications: int


class PatientRecordSummary(BaseModel):
    id: int
    name: str
    age: int | None
    gender: str | None
    condition: str | None
    body_part: str | None
    compliance: float
    recovery: float
    risk: Literal['low', 'medium', 'high']
    avatar_url: str | None = None
    last_session_label: str


class DoctorDashboardResponse(BaseModel):
    doctor_name: str
    active_patients: int
    avg_compliance: float
    avg_recovery: float
    risk_flags: int
    sessions_today: int
    reviews_pending: int
    weekly: list[WeeklyPoint]
    flagged_patients: list[PatientRecordSummary]


class ProgressResponse(BaseModel):
    weekly: list[WeeklyPoint]
    metrics: dict
    trend_summary: str


class ComplianceResponse(BaseModel):
    period_days: int
    compliance_percent: float
    assignments_completed: int
    assignments_total: int
    daily: list[dict]


# ---------- Auth extras ----------

class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'
    expires_in: int


class OtpRequestBody(BaseModel):
    email: EmailStr
    purpose: Literal['login', 'password_reset', 'verify_email'] = 'login'


class OtpVerifyBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)
    purpose: Literal['login', 'password_reset', 'verify_email'] = 'login'


class OtpResponse(BaseModel):
    delivered: bool
    dev_code: str | None = None  # only surfaced in non-prod environments
    ttl_seconds: int


class RegisterExtendedRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal['patient', 'doctor', 'admin'] = 'patient'


class LoginExtendedResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'
    expires_in: int
    user: dict


# ---------- Admin ----------

class UserAdminResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    status: Literal['Active', 'Suspended']
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserAdminListResponse(BaseModel):
    items: list[UserAdminResponse]


class UserAdminUpdateRequest(BaseModel):
    role: Literal['patient', 'doctor', 'admin'] | None = None
    status: Literal['Active', 'Suspended'] | None = None


class SystemMetricResponse(BaseModel):
    label: str
    value: str
    status: Literal['healthy', 'warning', 'critical']


class SystemHealthResponse(BaseModel):
    metrics: list[SystemMetricResponse]


# ---------- Doctor / Patient ----------

class PatientDetailResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    age: int | None
    gender: str | None
    affected_limb: str | None
    condition: str | None
    body_part: str | None
    compliance: float
    recovery: float
    risk: str
    weekly: list[WeeklyPoint]
    recent_sessions: list[RehabSessionResponse]
    assignments: list[AssignmentResponse]


class PatientListResponse(BaseModel):
    items: list[PatientRecordSummary]


class DoctorFeedbackRequest(BaseModel):
    session_id: int
    feedback: str
