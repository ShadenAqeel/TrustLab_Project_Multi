"""FastAPI entry point for the single-service TrustLab demonstration."""
from __future__ import annotations

from pathlib import Path
from uuid import UUID
from typing import Literal
import os

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .core import GameService, Models, ROOT, research_summary
from .multiplayer import MultiplayerService

app = FastAPI(title='TrustLab API', version='0.1.0')
models = Models()
service = GameService(models)
multiplayer = MultiplayerService(models)

class StartRequest(BaseModel):
    treatment: Literal['fix','rand']
    rounds: Literal[12,25]
    feedback: Literal['challenge','research']

class JoinMultiplayerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=28)
    rounds: Literal[12,25] = 12
    feedback: Literal['challenge','research'] = 'challenge'

class MultiplayerMoveRequest(BaseModel):
    move: Literal['C','D']
    round: int = Field(ge=1, le=25)


def _player_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith('Bearer ') or not authorization[7:]:
        raise HTTPException(401, 'Missing player session token')
    return authorization[7:]

@app.post('/api/multiplayer/join', status_code=201)
def join_multiplayer(data: JoinMultiplayerRequest):
    try:
        return multiplayer.join(data.name, data.rounds, data.feedback)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc

@app.get('/api/multiplayer/state')
def multiplayer_state(authorization: str | None = Header(default=None)):
    try:
        return multiplayer.state(_player_token(authorization))
    except KeyError:
        raise HTTPException(404, 'Player session expired')

@app.post('/api/multiplayer/move')
def multiplayer_move(data: MultiplayerMoveRequest, authorization: str | None = Header(default=None)):
    try:
        return multiplayer.move(_player_token(authorization), data.move, data.round)
    except KeyError:
        raise HTTPException(404, 'Player session expired')
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

@app.get('/api/multiplayer/results')
def multiplayer_results(authorization: str | None = Header(default=None)):
    try:
        return multiplayer.results(_player_token(authorization))
    except KeyError:
        raise HTTPException(404, 'Player session expired')
    except PermissionError as exc:
        raise HTTPException(409, str(exc)) from exc

@app.post('/api/multiplayer/leave')
def multiplayer_leave(authorization: str | None = Header(default=None)):
    try:
        return multiplayer.leave(_player_token(authorization))
    except KeyError:
        raise HTTPException(404, 'Player session expired')

class RoundRequest(BaseModel):
    move: Literal['C','D']
    request_id: UUID

@app.get('/api/health')
def health():
    if not models.ready:
        raise HTTPException(503, 'ML models are unavailable')
    return {'api':'ok','models_ready':models.ready, 'scikit_learn':models.strategy is not None and __import__('sklearn').__version__,
            'compatible_environment':not bool(models.compatibility_warning) if models.ready else False,
            'error':models.error if not models.ready else None}

@app.post('/api/game/start', status_code=201)
def start(data: StartRequest):
    if not models.ready:
        raise HTTPException(503,'Model artifacts are unavailable')
    try:
        return service.start(data.treatment, data.rounds, data.feedback)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(503,'Unable to create session') from e

@app.get('/api/game/{gid}')
def game(gid: UUID):
    try:
        return service.public(service.get(str(gid)))
    except KeyError:
        raise HTTPException(404,'Session not found or expired')

@app.post('/api/game/{gid}/round')
def round_action(gid: UUID, data: RoundRequest):
    try:
        return service.move(str(gid), data.move, str(data.request_id))
    except KeyError:
        raise HTTPException(404,'Session not found or expired')
    except ValueError as e:
        raise HTTPException(409,str(e))

@app.get('/api/game/{gid}/results')
def results(gid: UUID):
    try:
        return service.results(str(gid))
    except KeyError:
        raise HTTPException(404,'Session not found or expired')
    except PermissionError:
        raise HTTPException(409,'Complete all rounds to see the full report')

@app.get('/api/research/summary')
def research():
    return research_summary()

WEB = ROOT / 'web'
app.mount('/vendor', StaticFiles(directory=WEB/'vendor'), name='vendor')
app.mount('/figures', StaticFiles(directory=ROOT/'figures'), name='figures')
app.mount('/assets', StaticFiles(directory=WEB), name='assets')

@app.get('/{full_path:path}', include_in_schema=False)
def spa(full_path:str):
    # Do not turn missing API endpoints into successful HTML pages.
    if full_path.startswith('api/') or full_path.startswith('figures/'):
        raise HTTPException(404,'Not found')
    return FileResponse(WEB/'index.html')
