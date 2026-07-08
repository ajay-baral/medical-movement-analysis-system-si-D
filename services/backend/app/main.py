import uuid
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import analysis, analyze, auth, profile, videos
from app.core.config import Settings, get_settings
from app.core.errors import DomainError
from app.core.logging import build_logger, log_event
from app.core.metrics import MetricsRegistry
from app.core.rate_limit import InMemoryRateLimiter
from app.db.base import build_engine, build_session_factory, init_db
from app.services.analysis_engine import MediaPipeAnalyzer, MovementAnalyzer
from app.services.storage_service import CloudinaryVideoStorage, LocalVideoStorage, VideoStorage
import app.models  # noqa: F401


def create_app(
    settings: Settings | None = None,
    video_storage: VideoStorage | None = None,
    analysis_engine: MovementAnalyzer | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    logger = build_logger(resolved_settings.app_name, resolved_settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = build_engine(resolved_settings.database_url)
        session_factory = build_session_factory(engine)
        init_db(engine)
        cloudinary_storage = CloudinaryVideoStorage(resolved_settings)
        if not cloudinary_storage._enabled:
            storage = video_storage or LocalVideoStorage(resolved_settings)
        else:
            storage = video_storage or cloudinary_storage
        analyzer = analysis_engine or MediaPipeAnalyzer()
        metrics = MetricsRegistry()
        rate_limiter = InMemoryRateLimiter()

        app.state.settings = resolved_settings
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.video_storage = storage
        app.state.analysis_engine = analyzer
        app.state.metrics = metrics
        app.state.rate_limiter = rate_limiter
        app.state.logger = logger

        # Seed default users, exercises, doctor-patient links, and demo data.
        try:
            from app.bootstrap import bootstrap_data
            bootstrap_data(app)
        except Exception as exc:  # noqa: BLE001
            log_event(logger, 'warning', 'bootstrap_failed', error=str(exc))

        yield
        engine.dispose()

    app = FastAPI(title=resolved_settings.app_name, version=resolved_settings.app_version, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=['GET', 'POST', 'PUT', 'OPTIONS'],
        allow_headers=['Authorization', 'Content-Type', 'X-Request-Id'],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=resolved_settings.allowed_hosts)

    @app.middleware('http')
    async def request_context_middleware(request: Request, call_next):
        request_id = request.headers.get('x-request-id') or uuid.uuid4().hex
        request.state.request_id = request_id
        started_at = perf_counter()

        content_length = request.headers.get('content-length')
        if content_length and content_length.isdigit():
            max_bytes = resolved_settings.request_body_limit_mb * 1024 * 1024
            if int(content_length) > max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        'error': {
                            'code': 'PAYLOAD_TOO_LARGE',
                            'message': f'Request body exceeds {resolved_settings.request_body_limit_mb}MB limit',
                            'request_id': request_id,
                        }
                    },
                )

        response = await call_next(request)
        response.headers['x-request-id'] = request_id
        duration_ms = round((perf_counter() - started_at) * 1000, 2)

        app.state.metrics.inc(f'http_requests_total.{request.method}.{response.status_code}')
        app.state.metrics.observe_ms('http_request_duration_ms', duration_ms)
        log_event(
            app.state.logger,
            'info',
            'http_request',
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                'error': {
                    'code': exc.code,
                    'message': exc.message,
                    'request_id': request.state.request_id,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        message = exc.detail if isinstance(exc.detail, str) else 'Request failed'
        return JSONResponse(
            status_code=exc.status_code,
            content={
                'error': {
                    'code': 'HTTP_ERROR',
                    'message': message,
                    'request_id': request.state.request_id,
                }
            },
        )

    @app.get('/health')
    def health() -> dict[str, str]:
        return {'status': 'ok'}

    @app.get('/ready')
    def ready() -> dict[str, str]:
        try:
            with app.state.engine.connect() as connection:
                connection.execute(text('SELECT 1'))
            return {'status': 'ready'}
        except Exception:
            raise HTTPException(status_code=503, detail='Service is not ready')

    @app.get('/metrics')
    def metrics() -> dict:
        return app.state.metrics.snapshot()

    app.include_router(auth.router)
    app.include_router(profile.router)
    app.include_router(videos.router)
    app.include_router(analysis.router)
    app.include_router(analyze.router)

    from app.api.rehab import register_routers as _register_rehab_routers
    _register_rehab_routers(app)

    return app


app = create_app()
