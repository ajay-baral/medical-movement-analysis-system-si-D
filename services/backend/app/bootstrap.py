"""Bootstrap seed data — creates default users (patient/doctor/admin),
exercises catalogue, doctor-patient link, and a few starter assignments so
the mobile app has real content on first launch.

Runs on FastAPI startup. Idempotent: creates rows only if missing.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from sqlalchemy import select

from app.core.security import hash_password
from app.models.profile import Profile
from app.models.rehab import (
    Assignment,
    DoctorPatient,
    Exercise,
    Notification,
    RehabSession,
)
from app.models.user import User

UTC = timezone.utc


EXERCISE_SEED = [
    dict(
        slug='shoulder-flexion', name='Shoulder Flexion',
        category='upper', body_part='Shoulder', joint='shoulder',
        target_rom='0°–180°', duration_label='5 min', reps=10, difficulty='Beginner',
        description='Lift arm forward and upward to restore full shoulder mobility.',
        instructions=['Stand facing the camera', 'Keep elbow straight',
                      'Lift arm forward to overhead', 'Hold at top for 2 seconds',
                      'Lower with control'],
        thumbnail='https://images.unsplash.com/photo-1562771379-eafdca7a02f8?auto=format&fit=crop&w=940&q=80',
    ),
    dict(
        slug='shoulder-abduction', name='Shoulder Abduction',
        category='upper', body_part='Shoulder', joint='shoulder',
        target_rom='0°–180°', duration_label='4 min', reps=12, difficulty='Beginner',
        description='Raise arm sideways to restore lateral shoulder range.',
        instructions=['Stand tall, arms at sides', 'Raise arm sideways',
                      'Keep elbow straight', 'Stop at shoulder height first week'],
        thumbnail='https://images.pexels.com/photos/4498151/pexels-photo-4498151.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='elbow-flexion', name='Elbow Flexion',
        category='upper', body_part='Elbow', joint='elbow',
        target_rom='0°–150°', duration_label='3 min', reps=15, difficulty='Beginner',
        description='Bend and straighten elbow to recover full flexion.',
        instructions=['Sit upright in view of camera', 'Keep upper arm against your side',
                      'Bend elbow to touch shoulder', 'Extend slowly'],
        thumbnail='https://images.pexels.com/photos/4498283/pexels-photo-4498283.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='knee-flexion', name='Knee Flexion',
        category='lower', body_part='Knee', joint='knee',
        target_rom='0°–135°', duration_label='6 min', reps=12, difficulty='Intermediate',
        description='Bend knee to regain full flexion after surgery.',
        instructions=['Lie on back or sit', 'Slowly bend knee',
                      'Aim to touch heel toward glute', 'Hold 3 seconds at top'],
        thumbnail='https://images.pexels.com/photos/13538710/pexels-photo-13538710.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='knee-extension', name='Knee Extension',
        category='lower', body_part='Knee', joint='knee',
        target_rom='0°–10°', duration_label='5 min', reps=10, difficulty='Intermediate',
        description='Straighten knee to eliminate flexion contracture.',
        instructions=['Sit with leg supported', 'Slowly extend the knee',
                      'Tighten quadriceps at top', 'Hold 5 seconds'],
        thumbnail='https://images.pexels.com/photos/8657255/pexels-photo-8657255.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='hip-abduction', name='Hip Abduction',
        category='lower', body_part='Hip', joint='hip',
        target_rom='0°–45°', duration_label='4 min', reps=12, difficulty='Beginner',
        description='Strengthen hip abductors for stable gait.',
        instructions=['Stand sideways to camera', 'Lift leg outward',
                      'Keep torso upright', 'Lower with control'],
        thumbnail='https://images.pexels.com/photos/5384538/pexels-photo-5384538.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='lumbar-mobility', name='Lumbar Mobility',
        category='spine', body_part='Lower Back', joint='spine',
        target_rom='0°–60°', duration_label='5 min', reps=8, difficulty='Beginner',
        description='Improve flexion and extension of the lumbar spine.',
        instructions=['Stand with feet shoulder-width', 'Slowly bend forward',
                      'Return to neutral', 'Then extend gently backward'],
        thumbnail='https://images.unsplash.com/photo-1621691211095-fe4b38f21788?auto=format&fit=crop&w=940&q=80',
    ),
    dict(
        slug='neck-rotation', name='Neck Rotation',
        category='spine', body_part='Neck', joint='neck',
        target_rom='0°–80° each side', duration_label='3 min', reps=10, difficulty='Beginner',
        description='Restore cervical rotation range.',
        instructions=['Sit tall', 'Rotate head slowly left',
                      'Hold 2 seconds', 'Return and rotate right'],
        thumbnail='https://images.pexels.com/photos/3823039/pexels-photo-3823039.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='smile-symmetry', name='Smile Symmetry',
        category='facial', body_part='Face', joint='face',
        target_rom='Symmetry > 85%', duration_label='3 min', reps=15, difficulty='Beginner',
        description='Train symmetric smile for facial nerve recovery.',
        instructions=['Center your face in the oval', 'Slowly form a wide smile',
                      'Hold for 3 seconds', 'Relax and repeat'],
        thumbnail='https://images.pexels.com/photos/3768131/pexels-photo-3768131.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='eye-closure', name='Eye Closure',
        category='facial', body_part='Eyes', joint='face',
        target_rom='Full closure', duration_label='2 min', reps=20, difficulty='Beginner',
        description='Improve eye closure strength and symmetry.',
        instructions=['Place face in the oval guide', 'Slowly close both eyes',
                      'Hold 2 seconds', 'Open and repeat'],
        thumbnail='https://images.pexels.com/photos/3771089/pexels-photo-3771089.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='jaw-opening', name='Jaw Opening',
        category='facial', body_part='Jaw', joint='jaw',
        target_rom='0°–35°', duration_label='3 min', reps=12, difficulty='Intermediate',
        description='Restore jaw mobility for TMJ rehabilitation.',
        instructions=['Align face in guide', 'Slowly open mouth',
                      'Hold 3 seconds', 'Close with control'],
        thumbnail='https://images.pexels.com/photos/3760137/pexels-photo-3760137.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
    dict(
        slug='eyebrow-raise', name='Eyebrow Raise',
        category='facial', body_part='Forehead', joint='face',
        target_rom='Symmetric lift', duration_label='2 min', reps=15, difficulty='Beginner',
        description='Strengthen frontalis for symmetric brow lift.',
        instructions=['Face the camera', 'Lift both eyebrows together',
                      'Hold 2 seconds', 'Relax'],
        thumbnail='https://images.pexels.com/photos/3779662/pexels-photo-3779662.jpeg?auto=compress&cs=tinysrgb&w=940',
    ),
]


DEFAULT_USERS = [
    dict(email='aarav@medmove.ai', name='Aarav Sharma', password='PatientPass1!',
         role='patient', profile={'age': 34, 'gender': 'Male', 'affected_limb': 'Knee'}),
    dict(email='sara@medmove.ai', name='Sara Iyer', password='PatientPass1!',
         role='patient', profile={'age': 52, 'gender': 'Female', 'affected_limb': 'Face'}),
    dict(email='rohit@medmove.ai', name='Rohit Bansal', password='PatientPass1!',
         role='patient', profile={'age': 41, 'gender': 'Male', 'affected_limb': 'Shoulder'}),
    dict(email='meera@medmove.ai', name='Meera Pillai', password='PatientPass1!',
         role='patient', profile={'age': 67, 'gender': 'Female', 'affected_limb': 'Upper Limb'}),
    dict(email='karthik@medmove.ai', name='Karthik Nair', password='PatientPass1!',
         role='patient', profile={'age': 29, 'gender': 'Male', 'affected_limb': 'Spine'}),
    dict(email='neha@medmove.ai', name='Dr. Neha Verma', password='DoctorPass1!',
         role='doctor', profile={}),
    dict(email='arjun@medmove.ai', name='Dr. Arjun Mehta', password='DoctorPass1!',
         role='doctor', profile={}),
    dict(email='admin@medmove.ai', name='System Admin', password='AdminPass1!',
         role='admin', profile={}),
]


DOCTOR_PATIENT_LINKS = [
    ('neha@medmove.ai', 'aarav@medmove.ai', 'ACL Reconstruction', 'Knee'),
    ('neha@medmove.ai', 'sara@medmove.ai', "Bell's Palsy", 'Face'),
    ('neha@medmove.ai', 'meera@medmove.ai', 'Post-Stroke', 'Upper Limb'),
    ('arjun@medmove.ai', 'rohit@medmove.ai', 'Rotator Cuff Tear', 'Shoulder'),
    ('arjun@medmove.ai', 'karthik@medmove.ai', 'Lumbar Strain', 'Spine'),
]


def bootstrap_data(app: FastAPI) -> None:
    session_factory = app.state.session_factory
    with session_factory() as db:
        # ------------------ Users ------------------
        users_by_email: dict[str, User] = {}
        for u in DEFAULT_USERS:
            existing = db.scalar(select(User).where(User.email == u['email']))
            if existing is None:
                user = User(
                    name=u['name'], email=u['email'],
                    password_hash=hash_password(u['password']), role=u['role'],
                )
                db.add(user)
                db.flush()
                prof = Profile(user_id=user.id)
                if u['profile']:
                    prof.age = u['profile'].get('age')
                    prof.gender = u['profile'].get('gender')
                    prof.affected_limb = u['profile'].get('affected_limb')
                db.add(prof)
                users_by_email[u['email']] = user
            else:
                users_by_email[u['email']] = existing
        db.commit()

        # ------------------ Exercises ------------------
        for ex in EXERCISE_SEED:
            existing = db.scalar(select(Exercise).where(Exercise.slug == ex['slug']))
            if existing is not None:
                continue
            db.add(Exercise(
                slug=ex['slug'], name=ex['name'], category=ex['category'],
                body_part=ex['body_part'], joint=ex['joint'],
                target_rom=ex['target_rom'], duration_label=ex['duration_label'],
                reps=ex['reps'], difficulty=ex['difficulty'],
                description=ex['description'],
                instructions_json=json.dumps(ex['instructions']),
                thumbnail_url=ex['thumbnail'],
            ))
        db.commit()

        # ------------------ Doctor-Patient links ------------------
        for doc_email, pat_email, condition, body_part in DOCTOR_PATIENT_LINKS:
            doc = users_by_email.get(doc_email)
            pat = users_by_email.get(pat_email)
            if doc is None or pat is None:
                continue
            existing = db.scalar(select(DoctorPatient).where(
                (DoctorPatient.doctor_id == doc.id) & (DoctorPatient.patient_id == pat.id)
            ))
            if existing is None:
                db.add(DoctorPatient(
                    doctor_id=doc.id, patient_id=pat.id,
                    condition=condition, body_part=body_part,
                ))
        db.commit()

        # ------------------ Seed a few sessions/assignments for Aarav (demo patient) ------------------
        aarav = users_by_email.get('aarav@medmove.ai')
        neha = users_by_email.get('neha@medmove.ai')
        if aarav is not None and neha is not None:
            has_session = db.scalar(select(RehabSession).where(RehabSession.patient_id == aarav.id))
            if has_session is None:
                exercises = list(db.scalars(select(Exercise).order_by(Exercise.id)).all())
                slug_to_ex = {e.slug: e for e in exercises}
                # Historical sessions across last 6 weeks
                today = datetime.now(UTC)
                plan = [
                    ('shoulder-flexion', 5, 162, 92, 88, None),
                    ('knee-flexion', 3, 118, 84, 80, None),
                    ('smile-symmetry', 0, 0, 79, 76, 82),
                    ('lumbar-mobility', 2, 54, 88, 84, None),
                    ('shoulder-flexion', 8, 150, 86, 82, None),
                    ('eye-closure', 0, 0, 81, 78, 78),
                ]
                for i, (slug, mn, mx, acc, sc, sym) in enumerate(plan):
                    ex = slug_to_ex.get(slug)
                    if not ex:
                        continue
                    db.add(RehabSession(
                        patient_id=aarav.id, exercise_id=ex.id, source='medical',
                        duration_seconds=300 + i * 20,
                        min_angle=mn, max_angle=mx, accuracy=acc, movement_score=sc, symmetry=sym,
                        reps_completed=ex.reps,
                        completed_at=today - timedelta(days=i + 1, hours=i),
                    ))
                # Today's assignments — mix of pending and completed
                today_00 = today.replace(hour=0, minute=0, second=0, microsecond=0)
                todays_plan = [
                    ('shoulder-flexion', today_00 + timedelta(hours=8, minutes=30), 'completed'),
                    ('knee-flexion', today_00 + timedelta(hours=11), 'pending'),
                    ('smile-symmetry', today_00 + timedelta(hours=15), 'pending'),
                    ('lumbar-mobility', today_00 + timedelta(hours=18), 'pending'),
                ]
                for slug, when, st in todays_plan:
                    ex = slug_to_ex.get(slug)
                    if not ex:
                        continue
                    db.add(Assignment(
                        doctor_id=neha.id, patient_id=aarav.id, exercise_id=ex.id,
                        scheduled_for=when, target_reps=ex.reps, status=st,
                    ))
                # Historic assignments (last 14 days) — mostly completed for compliance
                for day_offset in range(1, 15):
                    d = today_00 - timedelta(days=day_offset)
                    for idx, slug in enumerate(['shoulder-flexion', 'knee-flexion', 'lumbar-mobility']):
                        ex = slug_to_ex.get(slug)
                        if not ex:
                            continue
                        st = 'completed' if (day_offset + idx) % 4 != 0 else 'missed'
                        db.add(Assignment(
                            doctor_id=neha.id, patient_id=aarav.id, exercise_id=ex.id,
                            scheduled_for=d + timedelta(hours=8 + idx * 3),
                            target_reps=ex.reps, status=st,
                        ))
                # A few notifications for Aarav
                db.add(Notification(user_id=aarav.id, type='reminder',
                                     title='Time for your exercise',
                                     body='Knee Flexion is scheduled for 11:00 AM', is_read=False))
                db.add(Notification(user_id=aarav.id, type='doctor',
                                     title='Dr. Verma reviewed your session',
                                     body='Great progress! Keep your pace steady.', is_read=False))
                db.add(Notification(user_id=aarav.id, type='report',
                                     title='Weekly report ready',
                                     body='Your Week 6 PDF report is available.', is_read=True))
                db.commit()
