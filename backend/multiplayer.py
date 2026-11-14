"""Human-versus-human TrustLab matchmaking and game sessions.

Each participant has a separate prediction and behavioral history. Predictions
for round N are computed *before* either player can submit their round N move.
No one sees the opponent's move until both choices have been locked.

Single-process, in-memory implementation for live classroom demonstrations.
Production-scale deployments should use durable shared state and notifications.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import secrets
import threading
from uuid import uuid4

from trustlab_unsupervised.features import PAYOFF

ROOM_EXPIRY = timedelta(hours=4)
INACTIVE_TIMEOUT = timedelta(minutes=5)
MAX_ROOMS = 250


def utcnow():
    return datetime.now(timezone.utc)


@dataclass
class Participant:
    id: str
    token: str = field(repr=False)
    name: str = ''
    last_seen: datetime = field(default_factory=utcnow)
    choices: list[str] = field(default_factory=list)


@dataclass
class Room:
    id: str
    rounds: int
    feedback: str
    participants: list[Participant]
    created: datetime = field(default_factory=utcnow)
    status: str = 'waiting'
    history: list[dict] = field(default_factory=list)
    pending: dict[str, str] = field(default_factory=dict)
    guesses: dict[str, dict] = field(default_factory=dict)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)


class MultiplayerService:
    def __init__(self, models):
        self.models = models
        self.rooms: dict[str, Room] = {}
        self.tokens: dict[str, tuple[str,str]] = {}
        self.lock = threading.RLock()

    def _cleanup(self):
        # Called only while holding self.lock.
        now = utcnow()
        for room_id, room in list(self.rooms.items()):
            if now - room.created > ROOM_EXPIRY:
                for p in room.participants:
                    self.tokens.pop(p.token, None)
                del self.rooms[room_id]

    def _lookup(self, token: str) -> tuple[Room, Participant]:
        with self.lock:
            self._cleanup()
            pair = self.tokens.get(token)
            if pair is None:
                raise KeyError('Session not found or expired')
            room = self.rooms[pair[0]]
            player = next(p for p in room.participants if p.id == pair[1])
            return room, player

    def _prepare(self, room: Room):
        # Caller owns the room lock. No incoming move can be accepted until all
        # predictions have been stored for both participants.
        room.guesses.clear()
        for index, player in enumerate(room.participants):
            other = room.participants[1 - index]
            tokens = [r['moves'][player.id] + r['moves'][other.id] for r in room.history]
            room.guesses[player.id] = self.models.predict(','.join(tokens), 'fix')

    def join(self, name: str, rounds: int = 12, feedback: str = 'challenge'):
        name = ' '.join(name.strip().split())
        if not 1 <= len(name) <= 28 or not all(ch.isprintable() and ch not in '<>' for ch in name):
            raise ValueError('Enter a display name of 1–28 printable characters.')
        if rounds not in (12, 25) or feedback not in ('challenge', 'research'):
            raise ValueError('Invalid experiment settings')
        if not self.models.ready:
            raise RuntimeError('The trained AI models are not available')
        player = Participant(id=str(uuid4()),token=secrets.token_urlsafe(32),name=name)
        with self.lock:
            self._cleanup()
            waiting = [r for r in self.rooms.values() if r.status == 'waiting' and r.rounds == rounds and r.feedback == feedback and len(r.participants) == 1]
            if waiting:
                room = secrets.choice(waiting)
                with room.lock:
                    room.participants.append(player)
                    room.status = 'active'
                    try:
                        self._prepare(room)
                    except Exception:
                        room.participants.pop()
                        room.status = 'waiting'
                        raise
            else:
                if len(self.rooms) >= MAX_ROOMS:
                    raise RuntimeError('All multiplayer rooms are occupied. Please retry shortly.')
                room = Room(id=str(uuid4()),rounds=rounds,feedback=feedback,participants=[player])
                self.rooms[room.id] = room
            self.tokens[player.token] = (room.id, player.id)
        return {'token': player.token, 'state': self.public(room, player)}

    def public(self, room: Room, player: Participant):
        # Call while holding the room lock for a consistent snapshot.
        other = next((p for p in room.participants if p.id != player.id), None)
        history = []
        for rec in room.history:
            own = rec['moves'][player.id]
            opponent = rec['moves'][other.id]
            prediction = rec['predictions'][player.id]
            history.append({
                'round': rec['round'], 'player_move': own, 'opponent_move': opponent,
                'points_player': PAYOFF[(own, opponent)], 'points_opponent': PAYOFF[(opponent, own)],
                'total_player': rec['scores'][player.id], 'total_opponent': rec['scores'][other.id],
                'prediction_correct': prediction['move'] == own,
                **({'prediction': prediction} if room.feedback == 'challenge' or room.status == 'finished' else {}),
            })
        score = sum(r['points_player'] for r in history)
        other_score = sum(r['points_opponent'] for r in history)
        return {
            'id':room.id, 'mode':'multiplayer', 'status':room.status,
            'player_name':player.name, 'opponent_name':other.name if other else None,
            'rounds_limit':room.rounds, 'feedback':room.feedback,
            'round':min(len(room.history) + 1, room.rounds),
            'completed':len(room.history), 'finished':room.status == 'finished',
            'your_choice_locked':player.id in room.pending,
            'opponent_ready':bool(other and other.id in room.pending),
            'score_player':score, 'score_opponent':other_score,
            'history':history, 'prediction_prepared': player.id in room.guesses,
            'opponent_kind':'Real human player',
            'warning':'If either player leaves, the game waits for their return; inactive opponents may cause a match to close.',
        }

    def state(self, token: str):
        room, player = self._lookup(token)
        with room.lock:
            player.last_seen = utcnow()
            if room.status == 'active':
                other = next(p for p in room.participants if p.id != player.id)
                if utcnow() - other.last_seen > INACTIVE_TIMEOUT:
                    room.status = 'interrupted'
                    room.pending.clear()
            return self.public(room, player)

    def move(self, token: str, choice: str, expected_round: int):
        if choice not in ('C', 'D'):
            raise ValueError('Choose C or D')
        room, player = self._lookup(token)
        with room.lock:
            player.last_seen = utcnow()
            if room.status != 'active':
                raise ValueError('Match has not started or is no longer active')
            current = len(room.history) + 1
            if expected_round != current:
                raise ValueError('Round has already advanced; refresh before choosing')
            if player.id in room.pending:
                if room.pending[player.id] == choice:
                    return self.public(room, player)
                raise ValueError('Your choice is already locked for this round')
            room.pending[player.id] = choice
            if len(room.pending) == 2:
                # Both choices are now committed; only now are moves revealed.
                rec = {
                    'round':current, 'moves':dict(room.pending),
                    'predictions':{key: dict(value) for key,value in room.guesses.items()},
                    'scores':{},
                }
                for p in room.participants:
                    opponent = next(o for o in room.participants if o.id != p.id)
                    rec['scores'][p.id] = sum(PAYOFF[(r['moves'][p.id],r['moves'][opponent.id])] for r in room.history) + PAYOFF[(rec['moves'][p.id],rec['moves'][opponent.id])]
                room.history.append(rec)
                room.pending.clear()
                if len(room.history) == room.rounds:
                    room.status = 'finished'
                    room.guesses.clear()
                else:
                    self._prepare(room)
            return self.public(room, player)

    def leave(self, token: str):
        room, player = self._lookup(token)
        with self.lock:
            with room.lock:
                self.tokens.pop(token, None)
                if room.status == 'waiting':
                    self.rooms.pop(room.id, None)
                elif room.status == 'active':
                    room.status = 'interrupted'
                return {'left': True}

    def results(self, token: str):
        room, player = self._lookup(token)
        with room.lock:
            if room.status != 'finished':
                raise PermissionError('Complete all rounds to see the behavioral report')
            state = self.public(room, player)
            history = state['history']
            profile = self.models.describe([r['player_move']+r['opponent_move'] for r in history])
            coop = sum(r['player_move'] == 'C' for r in history)
            switches = sum(history[i]['player_move'] != history[i-1]['player_move'] for i in range(1,len(history)))
            betrayal_responses = [history[i]['player_move'] for i in range(1,len(history)) if history[i-1]['player_move']=='C' and history[i-1]['opponent_move']=='D']
            correct = sum(r['prediction_correct'] for r in history)
            return {
                'session':state, 'profile':profile,
                'stats':{
                    'cooperation_rate':round(coop / len(history),3),
                    'switch_rate':round(switches/max(len(history)-1,1),3),
                    'after_betrayal_cooperation_rate':round(betrayal_responses.count('C')/len(betrayal_responses),3) if betrayal_responses else None,
                    'prediction_accuracy':round(correct/len(history),3),
                    'correct_predictions':correct,
                    'prediction_rounds':len(history),
                    'score_player':state['score_player'], 'score_opponent':state['score_opponent'],
                },
                'note':'Opponent was a real human. Predictions were generated before both current-round decisions. Your behavioral profile is exploratory.',
            }
