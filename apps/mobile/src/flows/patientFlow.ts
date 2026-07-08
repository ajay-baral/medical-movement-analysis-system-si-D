import type { MobileApi } from "../api/mobileApi";
import { debug, info, warn } from "../debug/logger";
import type { TokenStore } from "../storage/tokenStore";
import { computeRangeOfMotion, isAnalysisTerminal } from "../types/domain";
import type {
  AnalysisItem,
  Profile,
  ProfileUpdateRequest,
  RegisterRequest,
  VideoUploadRequest
} from "../types/contracts";

export interface PollOptions {
  maxAttempts?: number;
  delayMs?: number;
}

export class PatientFlowService {
  constructor(
    private readonly api: MobileApi,
    private readonly tokenStore: TokenStore
  ) {}

  async registerAndLogin(payload: RegisterRequest & { password: string }): Promise<void> {
    info("flow", "register:start", { email: payload.email });
    await this.api.register(payload);
    await this.login(payload.email, payload.password);
    info("flow", "register:complete", { email: payload.email });
  }

  async login(email: string, password: string): Promise<{ role: string; name: string; email: string; id: number }> {
    info("flow", "login:start", { email });
    // Use extended endpoint (returns user + refresh) via direct fetch.
    const { API_BASE_URL } = await import("../config/runtime");
    const resp = await fetch(`${API_BASE_URL}/api/v1/auth/login-extended`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      let msg = `Login failed (${resp.status})`;
      try {
        const p = await resp.json();
        msg = p?.error?.message ?? p?.detail ?? msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await resp.json();
    await this.tokenStore.setToken(data.access_token);
    info("flow", "login:complete", { email });
    return data.user;
  }

  async logout(): Promise<void> {
    await this.tokenStore.clearToken();
    info("flow", "logout:complete");
  }

  async getProfile(): Promise<Profile> {
    const token = await this.requireToken();
    return this.api.getProfile(token);
  }

  async updateProfile(payload: ProfileUpdateRequest): Promise<Profile> {
    const token = await this.requireToken();
    return this.api.updateProfile(token, payload);
  }

  async uploadRecordedVideo(
    payload: VideoUploadRequest
  ): Promise<{ videoId: number; status: AnalysisItem["status"] }> {
    if (payload.durationSeconds < 5 || payload.durationSeconds > 15) {
      throw new Error("INVALID_DURATION: Recording must be 5 to 15 seconds");
    }

    const token = await this.requireToken();
    info("flow", "upload:start", {
      durationSeconds: payload.durationSeconds,
      mimeType: payload.mimeType,
      fileName: payload.fileName
    });
    const upload = await this.api.uploadVideo(token, payload);
    info("flow", "upload:accepted", { videoId: upload.video_id, status: upload.status });
    return { videoId: upload.video_id, status: upload.status };
  }

  async pollAnalysis(videoId: number, options: PollOptions = {}): Promise<AnalysisItem> {
    const token = await this.requireToken();
    const maxAttempts = options.maxAttempts ?? 20;
    const delayMs = options.delayMs ?? 200;

    let latest: AnalysisItem | null = null;
    for (let index = 0; index < maxAttempts; index += 1) {
      latest = await this.api.getAnalysis(token, videoId);
      debug("flow", "analysis:poll", { videoId, attempt: index + 1, status: latest.status });
      if (isAnalysisTerminal(latest.status)) {
        if (
          latest.status === "SUCCEEDED" &&
          latest.min_angle !== null &&
          latest.max_angle !== null
        ) {
          latest.range_of_motion = computeRangeOfMotion(latest.min_angle, latest.max_angle);
        }
        info("flow", "analysis:terminal", { videoId, status: latest.status });
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (latest !== null) {
      warn("flow", "analysis:timeout-returning-latest", {
        videoId,
        status: latest.status
      });
      return latest;
    }

    throw new Error("ANALYSIS_TIMEOUT: analysis polling timed out");
  }

  async getHistory(): Promise<AnalysisItem[]> {
    const token = await this.requireToken();
    const response = await this.api.getAnalysisHistory(token);
    return response.items;
  }

  private async requireToken(): Promise<string> {
    const token = await this.tokenStore.getToken();
    if (!token) {
      throw new Error("AUTH_REQUIRED: Please login first");
    }
    return token;
  }
}
