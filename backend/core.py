"""TrustLab's real, pre-commit game engine and model interface.

All stored histories are from the visitor's perspective: own move first.
The opponent's simultaneous move and next-move model prediction are sealed
BEFORE the visitor submits the current round's choice.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import random
import secrets
import threading
from typing import Any
from uuid import uuid4
import warnings

import joblib
import numpy as np
import sklearn
import sklearn.compose._column_transformer as ct
from sklearn.exceptions import InconsistentVersionWarning

from trustlab_unsupervised.features import PAYOFF
from trustlab_unsupervised.integration import next_move_features
from trustlab_unsupervised.model import StrategyModel

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / 'models'
DATA_DIR = ROOT / 'data'
TTL = timedelta(hours=4)
STRATEGIES = ['Forgiving Cooperator', 'Reciprocator', 'Erratic', 'Defector']
COUNTS = [55, 29, 31, 73]

# Compatibility shim ONLY for preview under sklearn >=1.8. Published runtime pins 1.6.1.
# Legacy 1.6.1 ColumnTransformer pickles refer to this former list subtype.
if not hasattr(ct, '_RemainderColsList'):
    class _RemainderColsList(list):
        pass
    ct._RemainderColsList = _RemainderColsList


class Models:
    def __init__(self, model_dir: Path = MODEL_DIR):
        self.model_dir = model_dir
        self.error = None
        self.strategy = None
        self.bundle = None
        try:
            with warnings.catch_warnings(record=True) as observed:
                warnings.simplefilter('always', InconsistentVersionWarning)
                self.strategy = StrategyModel.load(model_dir / 'strategy_model.joblib')
                self.bundle = joblib.load(model_dir / 'next_move_lr.joblib')
                self.compatibility_warning = any(isinstance(w.message, InconsistentVersionWarning) for w in observed)
            self.cols = self.bundle['categorical'] + self.bundle['numeric']
            cls = list(self.bundle['pipeline'].classes_)
            # Supervised target from notebooks = own_c, i.e. 1 means Cooperate.
            if sorted(cls) != [0, 1]:
                raise ValueError(f'Unexpected model labels: {cls}')
            self.coop_index = cls.index(1)
            self.predict('', 'fix')  # fail during startup, never during a first visitor round
            self.predict('CC,CD,DD', 'rand')
        except Exception as exc:
            self.error = f'{type(exc).__name__}: {exc}'

    @property
    def ready(self):
        return self.error is None and self.strategy is not None and self.bundle is not None

    def predict(self, history: str, treatment: str) -> dict:
        if not self.ready and self.error:
            raise RuntimeError('ML model unavailable')
        x = next_move_features(history, treatment, self.strategy)
        scores = self.bundle['pipeline'].predict_proba(x[self.cols])[0]
        p = float(scores[self.coop_index])
        if not np.isfinite(p) or p < 0 or p > 1:
            raise ValueError('Invalid model output')
        return {'move': 'C' if p >= 0.5 else 'D', 'p_cooperate': round(p, 4)}

    def describe(self, history: list[str]) -> dict:
        result = self.strategy.predict_strategy(history)
        # 12 and 25 rounds have not been validated for stable 100-round profiles.
        result['reliable'] = False
        result['preliminary'] = True
        result['warning'] = 'Exploratory gameplay profile; short sessions can differ from 100-round histories.'
        return result


@dataclass
class Game:
    id: str
    treatment: str
    rounds_limit: int
    feedback: str
    rng: random.Random = field(repr=False)
    policy: str = ''
    history: list[dict] = field(default_factory=list)
    sealed: dict | None = None
    created: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    score_player: int = 0
    score_opp: int = 0
    responses: dict[str, dict] = field(default_factory=dict)
    lock: Any = field(default_factory=threading.RLock, repr=False)

    @property
    def finished(self):
        return len(self.history) >= self.rounds_limit


class GameService:
    def __init__(self, models: Models, seed: int | None = None):
        self.models = models
        self.sessions: dict[str, Game] = {}
        self.lock = threading.RLock()
        self.seed = seed
        self.profiles = models.strategy.profiles if models.ready else None
        self.name_to_cluster = {v: k for k, v in models.strategy.cluster_names.items()} if models.ready else {}

    def _pick_policy(self, rng):
        return rng.choices(STRATEGIES, weights=COUNTS, k=1)[0]

    def _opponent_probability(self, game: Game, policy: str) -> float:
        row = self.profiles.loc[self.name_to_cluster[policy]]
        if not game.history or game.treatment == 'rand':
            # A newly encountered simulated opponent has no prior history with this visitor.
            return float(row['coop_rate'])
        last = game.history[-1]
        # Opponent's previous own move FIRST, then visitor's previous move.
        opponent_prev_state = last['opponent_move'] + last['player_move']
        return float(row[f'p_c_after_{opponent_prev_state}'])

    def _prepare_next(self, game: Game):
        if game.finished:
            game.sealed = None
            return
        if game.treatment == 'rand':
            game.policy = self._pick_policy(game.rng)
        previous = ','.join(r['player_move'] + r['opponent_move'] for r in game.history)
        prediction = self.models.predict(previous, game.treatment)
        p_opponent = self._opponent_probability(game, game.policy)
        opp_move = 'C' if game.rng.random() < p_opponent else 'D'
        game.sealed = {
            'prediction': prediction,
            'opponent_move': opp_move,
            'policy': game.policy,
            'round': len(game.history) + 1,
        }

    def start(self, treatment: str, rounds: int, feedback: str) -> dict:
        if not self.models.ready:
            raise RuntimeError('ML models unavailable')
        if treatment not in ('fix','rand') or rounds not in (12,25) or feedback not in ('challenge','research'):
            raise ValueError('Invalid experiment options')
        rng = random.Random(self.seed if self.seed is not None else secrets.randbits(128))
        game = Game(str(uuid4()), treatment, rounds, feedback, rng)
        game.policy = self._pick_policy(rng)
        self._prepare_next(game)
        with self.lock:
            expired = [k for k,v in self.sessions.items() if datetime.now(timezone.utc) - v.created >= TTL]
            for k in expired:
                del self.sessions[k]
            if len(self.sessions) >= 1000:
                raise RuntimeError('Session capacity reached; try again later')
            self.sessions[game.id] = game
        return self.public(game)

    def get(self, gid: str) -> Game:
        with self.lock:
            g = self.sessions.get(gid)
            if g and datetime.now(timezone.utc) - g.created >= TTL:
                del self.sessions[gid]
                g = None
        if g is None:
            raise KeyError('Session not found or expired')
        return g

    def public(self, game: Game, reveal_predictions: bool = False) -> dict:
        return {
            'id':game.id, 'treatment':game.treatment, 'rounds_limit':game.rounds_limit,
            'feedback':game.feedback, 'round':len(game.history)+1 if not game.finished else game.rounds_limit,
            'completed':len(game.history), 'finished':game.finished,
            'score_player':game.score_player,'score_opponent':game.score_opp,
            'history':[self._public_round(r, game.feedback == 'challenge' or reveal_predictions) for r in game.history],
            'prediction_prepared':game.sealed is not None,
            'opponent_kind':'Simulated behavioral policy',
        }

    @staticmethod
    def _public_round(r: dict, show_prediction: bool):
        d = {k: v for k,v in r.items() if k not in ('prediction','policy')}
        if show_prediction:
            d['prediction'] = r['prediction']
        return d

    def move(self, gid: str, move: str, request_id: str) -> dict:
        game = self.get(gid)
        with game.lock:
            if request_id in game.responses:
                previous_action, previous_response = game.responses[request_id]
                if move != previous_action:
                    raise ValueError('This request ID was already used for another action')
                return previous_response
            if game.finished or game.sealed is None:
                raise ValueError('Game has already finished')
            if move not in ('C','D'):
                raise ValueError('Move must be C or D')
            # Both AI decisions were stored before receiving this move.
            sealed = game.sealed
            opponent = sealed['opponent_move']
            gain_player = PAYOFF[(move, opponent)]
            gain_opp = PAYOFF[(opponent, move)]
            game.score_player += gain_player
            game.score_opp += gain_opp
            r = {
                'round': len(game.history)+1,
                'player_move':move,'opponent_move':opponent,
                'points_player':gain_player,'points_opponent':gain_opp,
                'total_player':game.score_player,'total_opponent':game.score_opp,
                'prediction':sealed['prediction'],'policy':sealed['policy'],
                'prediction_correct':bool(sealed['prediction']['move'] == move),
            }
            game.history.append(r)
            self._prepare_next(game)
            response = {'round_result':self._public_round(r, game.feedback == 'challenge'),
                        'session':self.public(game)}
            game.responses[request_id] = (move, response)
            return response

    def results(self, gid: str):
        game = self.get(gid)
        with game.lock:
            if not game.finished:
                raise PermissionError('Finish all rounds first')
            tokens = [r['player_move'] + r['opponent_move'] for r in game.history]
            profile = self.models.describe(tokens)
            user_coop = sum(r['player_move']=='C' for r in game.history)
            switch_count = sum(game.history[i]['player_move'] != game.history[i-1]['player_move'] for i in range(1,len(game.history)))
            betrayal_contexts = [game.history[i]['player_move'] for i in range(1,len(game.history)) if game.history[i-1]['player_move']=='C' and game.history[i-1]['opponent_move']=='D']
            n_correct = sum(r['prediction_correct'] for r in game.history)
            return {
                'session':self.public(game, reveal_predictions=True),
                'profile':profile,
                'stats':{
                    'cooperation_rate':round(user_coop/len(game.history),3),
                    'switch_rate':round(switch_count / max(1,len(game.history)-1),3),
                    'after_betrayal_cooperation_rate':round(betrayal_contexts.count('C')/len(betrayal_contexts),3) if betrayal_contexts else None,
                    'prediction_accuracy':round(n_correct/len(game.history),3),
                    'correct_predictions':n_correct,
                    'prediction_rounds':len(game.history),
                    'score_player':game.score_player,
                    'score_opponent':game.score_opp,
                },
                'note':'These predictions were committed before each decision. Your profile is exploratory, not a psychological assessment.',
            }


def research_summary() -> dict:
    meta=json.loads((MODEL_DIR/'strategy_model.json').read_text())
    figures = [
        ('u02_strategy_profiles.png','Behavioral profiles'),
        ('u03_pca.png','Cluster visualization (PCA)'),
        ('u06_strategy_by_treatment.png','Strategies by partner condition'),
        ('u07_coop_over_rounds.png','Cooperation across rounds'),
        ('11_integration_auc.png','Integrated prediction comparison'),
    ]
    return {
        'source':'Dryad DOI: 10.5061/dryad.37pvmcvmk',
        'participants':188,'rounds_per_player':100,
        'treatments':[{'name':'Fixed','players':92,'cooperation_rate':0.561},
                      {'name':'Changing','players':96,'cooperation_rate':0.285}],
        'strategies':[{'name':name,'players':cnt,'profile':meta['profiles'][name]} for name,cnt in zip(STRATEGIES,COUNTS)],
        'cluster_metrics':{'algorithm':'K-Means','k':4,'silhouette':0.316,'stability_ari':0.79},
        'supervised':{'baseline_cv_auc':0.845,'integrated_cv_auc':0.898,'baseline_test_accuracy':0.838,'integrated_test_accuracy':0.857},
        'figures':[{'url':'/figures/'+fname,'alt':label} for fname,label in figures],
        'caveat':'Historical results refer to 188 research participants. Website opponents are simulated.',
    }
