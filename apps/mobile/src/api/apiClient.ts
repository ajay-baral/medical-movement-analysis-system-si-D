// Extended API client for the Medical Movement Analysis System.
// Wraps the FastAPI endpoints under /api/v1 with a small typed surface used
// across the mobile app screens.

import { API_BASE_URL } from "../config/runtime";
import { tokenStore } from "../runtime/client";

export type Role = "patient" | "doctor" | "admin";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: AuthUser;
}

export interface Exercise {
  id: number;
  slug: string;
  name: string;
  category: "upper" | "lower" | "spine" | "facial";
  body_part: string;
  joint: string;
  target_rom: string;
  duration_label: string;
  reps: number;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  description: string;
  instructions: string[];
  thumbnail_url: string;
  demo_video_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Assignment {
  id: number;
  doctor_id: number | null;
  patient_id: number;
  exercise_id: number;
  exercise: Exercise;
  scheduled_for: string;
  target_reps: number;
  status: "pending" | "completed" | "missed" | "cancelled";
  notes: string | null;
  created_at: string;
}

export interface RehabSession {
  id: number;
  patient_id: number;
  assignment_id: number | null;
  exercise_id: number;
  exercise_name: string | null;
  duration_seconds: number;
  min_angle: number | null;
  max_angle: number | null;
  range_of_motion: number | null;
  accuracy: number | null;
  movement_score: number | null;
  symmetry: number | null;
  reps_completed: number;
  doctor_feedback: string | null;
  completed_at: string;
}

export interface WeeklyPoint {
  label: string;
  rom: number;
  accuracy: number;
  compliance: number;
}

export interface PatientDashboard {
  patient_name: string;
  recovery_percent: number;
  streak_days: number;
  week_number: number;
  program_label: string;
  metrics: {
    today_completed: number;
    today_total: number;
    today_percent: number;
    rom_avg: number;
    accuracy_avg: number;
    compliance_percent: number;
  };
  todays_assignments: Assignment[];
  weekly: WeeklyPoint[];
  last_session: RehabSession | null;
  unread_notifications: number;
}

export interface PatientRecordSummary {
  id: number;
  name: string;
  age: number | null;
  gender: string | null;
  condition: string | null;
  body_part: string | null;
  compliance: number;
  recovery: number;
  risk: "low" | "medium" | "high";
  avatar_url: string | null;
  last_session_label: string;
}

export interface DoctorDashboard {
  doctor_name: string;
  active_patients: number;
  avg_compliance: number;
  avg_recovery: number;
  risk_flags: number;
  sessions_today: number;
  reviews_pending: number;
  weekly: WeeklyPoint[];
  flagged_patients: PatientRecordSummary[];
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: Notification[];
  unread_count: number;
}

export interface Report {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  title: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  summary: Record<string, any>;
}

export interface PatientDetail {
  id: number;
  name: string;
  email: string;
  age: number | null;
  gender: string | null;
  affected_limb: string | null;
  condition: string | null;
  body_part: string | null;
  compliance: number;
  recovery: number;
  risk: string;
  weekly: WeeklyPoint[];
  recent_sessions: RehabSession[];
  assignments: Assignment[];
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Suspended";
  created_at: string;
}

export interface SystemMetric {
  label: string;
  value: string;
  status: "healthy" | "warning" | "critical";
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean; multipart?: boolean } = { auth: true },
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!opts.multipart) headers.set("content-type", "application/json");
  if (opts.auth !== false) {
    const token = await tokenStore.getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code = "HTTP_ERROR";
    try {
      const p = await response.json();
      message = p?.error?.message ?? p?.detail ?? message;
      code = p?.error?.code ?? code;
    } catch {
      /* keep fallback */
    }
    throw new Error(`${code}: ${message}`);
  }
  // 204 No Content
  if (response.status === 204) return undefined as unknown as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  async register(payload: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }): Promise<AuthResponse> {
    return request("/api/v1/auth/register-extended", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { auth: false });
  },
  async login(email: string, password: string): Promise<AuthResponse> {
    return request("/api/v1/auth/login-extended", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, { auth: false });
  },
  async me(): Promise<AuthUser> {
    return request("/api/v1/auth/me");
  },
  async refresh(refreshToken: string): Promise<AuthResponse> {
    return request("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, { auth: false });
  },
  async logout(): Promise<void> {
    try {
      await request("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
  },
  async otpRequest(email: string): Promise<{ delivered: boolean; dev_code: string | null }> {
    return request("/api/v1/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ email, purpose: "password_reset" }),
    }, { auth: false });
  },
  async otpVerify(email: string, code: string): Promise<AuthResponse> {
    return request("/api/v1/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ email, code, purpose: "password_reset" }),
    }, { auth: false });
  },
};

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export const exercisesApi = {
  async list(params: { category?: string; q?: string } = {}): Promise<Exercise[]> {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    const r = await request<{ items: Exercise[] }>(
      `/api/v1/exercises${qs.toString() ? `?${qs}` : ""}`,
    );
    return r.items;
  },
  async get(id: number): Promise<Exercise> {
    return request(`/api/v1/exercises/${id}`);
  },
  async create(payload: Partial<Exercise>): Promise<Exercise> {
    return request("/api/v1/exercises", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async update(id: number, payload: Partial<Exercise>): Promise<Exercise> {
    return request(`/api/v1/exercises/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  async remove(id: number): Promise<void> {
    return request(`/api/v1/exercises/${id}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const assignmentsApi = {
  async list(params: { status?: string; day?: string } = {}): Promise<Assignment[]> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.day) qs.set("day", params.day);
    const r = await request<{ items: Assignment[] }>(
      `/api/v1/assignments${qs.toString() ? `?${qs}` : ""}`,
    );
    return r.items;
  },
  async create(payload: {
    patient_id: number;
    exercise_id: number;
    scheduled_for: string;
    target_reps?: number;
    notes?: string;
  }): Promise<Assignment> {
    return request("/api/v1/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async update(id: number, payload: {
    status?: string;
    scheduled_for?: string;
    notes?: string;
  }): Promise<Assignment> {
    return request(`/api/v1/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};

// ---------------------------------------------------------------------------
// Rehab sessions (permanent, only for medical rehab)
// ---------------------------------------------------------------------------

export const sessionsApi = {
  async list(params: { patient_id?: number; limit?: number } = {}): Promise<RehabSession[]> {
    const qs = new URLSearchParams();
    if (params.patient_id) qs.set("patient_id", String(params.patient_id));
    if (params.limit) qs.set("limit", String(params.limit));
    const r = await request<{ items: RehabSession[] }>(
      `/api/v1/sessions${qs.toString() ? `?${qs}` : ""}`,
    );
    return r.items;
  },
  async create(payload: {
    assignment_id?: number | null;
    exercise_id: number;
    duration_seconds: number;
    min_angle?: number | null;
    max_angle?: number | null;
    accuracy?: number | null;
    movement_score?: number | null;
    symmetry?: number | null;
    reps_completed?: number;
  }): Promise<RehabSession> {
    return request("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async feedback(sessionId: number, feedback: string): Promise<RehabSession> {
    return request(`/api/v1/sessions/${sessionId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, feedback }),
    });
  },
};

// ---------------------------------------------------------------------------
// AI Coach practice (transient)
// ---------------------------------------------------------------------------

export const coachApi = {
  async practice(payload: {
    exercise_id: number;
    duration_seconds: number;
    min_angle?: number | null;
    max_angle?: number | null;
    accuracy?: number | null;
    movement_score?: number | null;
    symmetry?: number | null;
    reps_completed?: number;
  }) {
    return request("/api/v1/coach/practice", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Promise<{
      exercise_id: number;
      exercise_name: string;
      duration_seconds: number;
      min_angle: number | null;
      max_angle: number | null;
      range_of_motion: number | null;
      accuracy: number | null;
      movement_score: number | null;
      symmetry: number | null;
      reps_completed: number;
      persisted: false;
      note: string;
    }>;
  },
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsApi = {
  async list(): Promise<NotificationList> {
    return request("/api/v1/notifications");
  },
  async unreadCount(): Promise<{ count: number }> {
    return request("/api/v1/notifications/unread-count");
  },
  async markRead(id: number): Promise<Notification> {
    return request(`/api/v1/notifications/${id}/read`, { method: "POST" });
  },
  async markAllRead(): Promise<{ marked: number }> {
    return request("/api/v1/notifications/read-all", { method: "POST" });
  },
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reportsApi = {
  async list(): Promise<Report[]> {
    const r = await request<{ items: Report[] }>("/api/v1/reports");
    return r.items;
  },
  async get(id: number): Promise<Report> {
    return request(`/api/v1/reports/${id}`);
  },
  async generate(payload: {
    patient_id?: number;
    days?: number;
    title?: string;
  }): Promise<Report> {
    return request("/api/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  pdfUrl(id: number): string {
    return `${API_BASE_URL}/api/v1/reports/${id}/pdf`;
  },
};

// ---------------------------------------------------------------------------
// Dashboards / Progress
// ---------------------------------------------------------------------------

export const dashboardsApi = {
  async patient(): Promise<PatientDashboard> {
    return request("/api/v1/dashboard/patient");
  },
  async doctor(): Promise<DoctorDashboard> {
    return request("/api/v1/dashboard/doctor");
  },
};

export const progressApi = {
  async progress(): Promise<{ weekly: WeeklyPoint[]; metrics: any; trend_summary: string }> {
    return request("/api/v1/progress");
  },
  async compliance(days = 14): Promise<{
    period_days: number;
    compliance_percent: number;
    assignments_completed: number;
    assignments_total: number;
    daily: Array<{ date: string; total: number; completed: number }>;
  }> {
    return request(`/api/v1/compliance?days=${days}`);
  },
};

// ---------------------------------------------------------------------------
// Patients / Users
// ---------------------------------------------------------------------------

export const patientsApi = {
  async list(): Promise<PatientRecordSummary[]> {
    const r = await request<{ items: PatientRecordSummary[] }>("/api/v1/patients");
    return r.items;
  },
  async detail(id: number): Promise<PatientDetail> {
    return request(`/api/v1/patients/${id}`);
  },
  async accept(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/patients/${id}/accept`, { method: "POST" });
  },
};

export const usersApi = {
  async list(role?: string): Promise<AdminUser[]> {
    const qs = role ? `?role=${role}` : "";
    const r = await request<{ items: AdminUser[] }>(`/api/v1/users${qs}`);
    return r.items;
  },
  async update(id: number, payload: { role?: string; status?: "Active" | "Suspended" }): Promise<AdminUser> {
    return request(`/api/v1/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};

export const systemApi = {
  async health(): Promise<{ metrics: SystemMetric[] }> {
    return request("/api/v1/system/health");
  },
  async audit(limit = 50): Promise<{ items: Array<{
    id: number; actor_user_id: number | null; action: string;
    entity_type: string | null; entity_id: string | null;
    metadata: any; created_at: string;
  }> }> {
    return request(`/api/v1/audit?limit=${limit}`);
  },
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profileApi = {
  async get(): Promise<{ name: string; email: string; age: number | null; gender: string | null; affected_limb: string | null }> {
    return request("/api/v1/profile");
  },
  async update(payload: { age: number; gender: string; affected_limb: string }) {
    return request("/api/v1/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};
