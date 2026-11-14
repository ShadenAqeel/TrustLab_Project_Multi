from uuid import uuid4
import math
import pytest
from fastapi.testclient import TestClient
from backend.app import app, models
from backend.core import GameService, PAYOFF

client=TestClient(app)

@pytest.fixture(scope='module',autouse=True)
def model_required():
 assert models.ready, models.error
 assert models.bundle['pipeline'].classes_.tolist() == [0, 1]

@pytest.mark.parametrize('mine,opp,my_points,their_points',[
 ('C','C',3,3),('C','D',0,4),('D','C',4,0),('D','D',1,1)
])
def test_payoff_matrix(mine,opp,my_points,their_points):
 assert PAYOFF[(mine,opp)]==my_points
 assert PAYOFF[(opp,mine)]==their_points

@pytest.mark.parametrize('treatment', ['fix','rand'])
@pytest.mark.parametrize('mode', ['challenge','research'])
@pytest.mark.parametrize('rounds', [12,25])
def test_complete_sessions(treatment,mode,rounds):
 response=client.post('/api/game/start',json={'treatment':treatment,'rounds':rounds,'feedback':mode})
 assert response.status_code==201,response.text
 s=response.json();gid=s['id']
 assert s['completed']==0 and s['prediction_prepared']
 assert s['history']==[]
 assert client.get(f'/api/game/{gid}/results').status_code==409
 total_mine=0;total_opp=0
 for index in range(rounds):
  action='D' if index%2 else 'C'
  token=str(uuid4())
  p=client.post(f'/api/game/{gid}/round',json={'move':action,'request_id':token})
  assert p.status_code==200,p.text
  result=p.json(); r=result['round_result'];s=result['session']
  assert r['player_move']==action
  assert s['completed']==index+1
  assert r['points_player']==PAYOFF[(action,r['opponent_move'])]
  assert r['points_opponent']==PAYOFF[(r['opponent_move'],action)]
  total_mine+=r['points_player']; total_opp+=r['points_opponent']
  assert s['score_player']==total_mine
  assert s['score_opponent']==total_opp
  if mode=='research':
   assert 'prediction' not in r
   assert all('prediction' not in item for item in s['history'])
  else:
   assert r['prediction']['move'] in ('C','D')
   assert 0 <= r['prediction']['p_cooperate'] <= 1
  if index==0:
   duplicate=client.post(f'/api/game/{gid}/round',json={'move':action,'request_id':token})
   assert duplicate.status_code==200
   assert duplicate.json()==result  # retry is idempotent, not a new scored round
 assert s['finished'] and not s['prediction_prepared']
 report=client.get(f'/api/game/{gid}/results')
 assert report.status_code==200,report.text
 report=report.json()
 assert report['profile']['preliminary'] is True
 assert report['profile']['reliable'] is False
 assert report['profile']['strategy'] in ['Defector','Forgiving Cooperator','Erratic','Reciprocator']
 assert len(report['session']['history'])==rounds
 assert all('prediction' in r for r in report['session']['history'])
 assert report['stats']['prediction_rounds']==rounds
 assert report['stats']['score_player']==total_mine
 assert report['stats']['score_opponent']==total_opp
 assert client.post(f'/api/game/{gid}/round',json={'move':'C','request_id':str(uuid4())}).status_code==409


def test_api_validations():
 assert client.get('/api/health').status_code==200
 assert client.get('/api/research/summary').json()['participants']==188
 assert client.post('/api/game/start',json={'treatment':'fake','rounds':12,'feedback':'challenge'}).status_code==422
 assert client.post('/api/game/start',json={'treatment':'fix','rounds':3,'feedback':'challenge'}).status_code==422
 assert client.get('/api/game/00000000-0000-4000-8000-000000000000').status_code==404
 s=client.post('/api/game/start',json={'treatment':'fix','rounds':12,'feedback':'research'}).json()
 assert client.post(f'/api/game/{s["id"]}/round',json={'move':'X','request_id':str(uuid4())}).status_code==422
 assert client.get('/').status_code==200
 assert client.get('/assets/app.js').status_code==200
 assert client.get('/assets/styles.css').status_code==200


def test_real_model_different_history():
 p_empty=models.predict('', 'fix')
 p_coop=models.predict('CC,CC,CC,CC', 'fix')
 p_def=models.predict('DD,DD,DD,DD', 'fix')
 assert p_empty!=p_coop!=p_def
 assert p_coop['p_cooperate']>p_def['p_cooperate']


def test_opponent_precommit_and_reversed_previous_state():
 gs=GameService(models,seed=12345)
 s=gs.start('fix',12,'research'); game=gs.get(s['id'])
 first_opp=game.sealed['opponent_move']; first_pred=game.sealed['prediction'].copy()
 result=gs.move(game.id,'C',str(uuid4()))
 assert result['round_result']['opponent_move']==first_opp
 assert result['round_result']['prediction_correct']==(first_pred['move']=='C')
 assert 'prediction' not in result['round_result']
 # For a fixed opponent, this is their *own* previous decision followed by ours.
 prev=game.history[-1]; state=prev['opponent_move']+prev['player_move']
 profile=gs.profiles.loc[gs.name_to_cluster[game.policy]]
 assert gs._opponent_probability(game,game.policy)==pytest.approx(profile['p_c_after_'+state])


def test_changing_opponent_has_no_history_with_visitor():
 gs=GameService(models,seed=19);s=gs.start('rand',12,'challenge');g=gs.get(s['id'])
 gs.move(g.id,'D',str(uuid4()))
 row=gs.profiles.loc[gs.name_to_cluster[g.policy]]
 assert gs._opponent_probability(g,g.policy)==pytest.approx(row['coop_rate'])
