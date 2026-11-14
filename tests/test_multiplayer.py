"""Human matchmaking: paired moves, privacy, predictions, and separate reports."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app import app, models, multiplayer
from backend.multiplayer import MultiplayerService


class FakeModels:
    ready = True
    def predict(self, history, treatment):
        assert treatment == 'fix'
        # This test model creates a traceable pre-commit prediction.
        return {'move': 'C' if not history else 'D', 'p_cooperate': 0.8 if not history else 0.2}
    def describe(self, tokens):
        return {'strategy':'Test cluster','description':'Only for tests','membership':{'Test cluster':1.0},'cluster':0,'preliminary':True}


def test_matching_privacy_and_score_independence():
    service = MultiplayerService(FakeModels())
    a = service.join('Alice', 12, 'challenge')
    sa = service.state(a['token'])
    assert sa['status'] == 'waiting'
    b = service.join('Bob', 12, 'challenge')
    assert a['state']['id'] == b['state']['id']
    assert service.state(a['token'])['opponent_name'] == 'Bob'
    assert service.state(b['token'])['opponent_name'] == 'Alice'
    first = service.move(a['token'],'C',1)
    assert first['completed'] == 0
    assert first['your_choice_locked'] and not first['opponent_ready']
    # Other player sees only ready status, never current choice or sealed prediction.
    other_view = service.state(b['token'])
    assert other_view['opponent_ready'] and not other_view['your_choice_locked']
    assert not other_view['history']
    assert 'guesses' not in str(other_view)
    with pytest.raises(ValueError,match='locked'):
        service.move(a['token'],'D',1)
    resolved = service.move(b['token'],'D',1)
    assert resolved['completed'] == 1
    assert resolved['score_player'] == 4
    assert resolved['score_opponent'] == 0
    alice = service.state(a['token'])
    assert alice['score_player'] == 0 and alice['score_opponent'] == 4
    assert alice['history'][0]['player_move'] == 'C'
    assert alice['history'][0]['opponent_move'] == 'D'
    assert alice['history'][0]['prediction']['move'] == 'C'
    assert resolved['history'][0]['prediction']['move'] == 'C'
    with pytest.raises(ValueError,match='advanced'):
        service.move(a['token'],'C',1)


def test_full_match_both_players_get_own_profiles():
    service = MultiplayerService(FakeModels())
    a=service.join(' A ',12,'research')
    b=service.join(' B ',12,'research')
    for rd in range(1,13):
        service.move(a['token'],'C' if rd%2 else 'D',rd)
        state=service.move(b['token'],'D' if rd%2 else 'C',rd)
        if rd<12:
            assert not state['finished']
            assert 'prediction' not in state['history'][-1]
    assert state['finished']
    assert len(state['history']) == 12
    x=service.results(a['token'])
    y=service.results(b['token'])
    assert x['session']['player_name']=='A'
    assert y['session']['player_name']=='B'
    assert x['session']['history'][0]['prediction']['move']=='C'
    assert x['stats']['score_player'] == 24
    assert y['stats']['score_player'] == 24
    assert x['stats']['prediction_rounds']==y['stats']['prediction_rounds']==12
    assert x['profile']['preliminary']


def test_matching_criteria_and_session_security():
    service=MultiplayerService(FakeModels())
    a=service.join('Anna',12,'challenge')
    b=service.join('Ben',25,'challenge')
    c=service.join('Cara',12,'research')
    assert len({a['state']['id'],b['state']['id'],c['state']['id']})==3
    d=service.join('Dan',25,'challenge')
    assert d['state']['id'] == b['state']['id']
    with pytest.raises(KeyError):
        service.state('bad-token')
    with pytest.raises(ValueError):
        service.join('<script>',12,'challenge')
    service.leave(a['token'])
    with pytest.raises(KeyError):
        service.state(a['token'])


def test_concurrent_submissions_and_idempotent_repeat():
    service=MultiplayerService(FakeModels())
    a=service.join('A',12)
    b=service.join('B',12)
    with ThreadPoolExecutor(max_workers=2) as ex:
        f1=ex.submit(service.move,a['token'],'C',1)
        f2=ex.submit(service.move,b['token'],'C',1)
        f1.result();f2.result()
    assert service.state(a['token'])['completed']==1
    with pytest.raises(ValueError):
        service.move(a['token'],'C',1)


def test_api_token_required_and_round_locking():
    api=TestClient(app)
    assert api.get('/api/multiplayer/state').status_code==401
    join1=api.post('/api/multiplayer/join',json={'name':'Alpha','rounds':12,'feedback':'challenge'})
    join2=api.post('/api/multiplayer/join',json={'name':'Beta','rounds':12,'feedback':'challenge'})
    assert join1.status_code==201 and join2.status_code==201
    aa=join1.json(); bb=join2.json()
    auth1={'Authorization':'Bearer '+aa['token']}
    auth2={'Authorization':'Bearer '+bb['token']}
    assert api.get('/api/multiplayer/state',headers=auth1).json()['opponent_name']=='Beta'
    assert api.post('/api/multiplayer/move',json={'move':'C','round':1},headers=auth1).status_code==200
    assert api.get('/api/multiplayer/state',headers=auth2).json()['history']==[]
    assert api.post('/api/multiplayer/move',json={'move':'D','round':1},headers=auth2).json()['completed']==1
    assert api.get('/api/multiplayer/results',headers=auth1).status_code==409
    api.post('/api/multiplayer/leave',headers=auth1)
    api.post('/api/multiplayer/leave',headers=auth2)
