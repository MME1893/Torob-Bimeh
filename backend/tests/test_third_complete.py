"""Evidence-backed full form branches; no live services or HAR credentials."""
from copy import deepcopy
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.domain.crosswalk import catalog
from app.domain.quotes import ThirdCarSearch
from app.domain.third_mapping import prepare, preview, resolve_car
from app.domain.normalizers import normalize
from app.domain.pricing import to_toman
from app.routers import search
from app.adapters.azki.contract import validate_price_params
from app.adapters.sabim.contract import validate_query
from app.adapters.bimebazar.contract import validate_offer_params
from app.adapters.bimeh.contract import validate_inquiry
from app.adapters.azki.client import _read_price_response
from tests.test_search import FORM

OLD = {**FORM, 'previous_policy': {
    'status': 'had_previous_policy', 'previous_insurer_key': 'آسیا',
    'previous_start_date_jalali': '1403/07/01', 'previous_expiry_date_jalali': '1404/07/01',
    'previous_duration_months': 12, 'no_claim_discount_percent': 30,
    'driver_discount_percent': 20, 'had_claim': False}}

def request(form=OLD):
    return ThirdCarSearch.model_validate(deepcopy(form))

def params(r, provider):
    result, status, message = prepare(r, provider, resolve_car(r))
    assert status is None, (provider, status, message)
    return result


def test_every_product_insurer_choice_previews_all_four_sources():
    choices = TestClient(app).get('/api/search/catalog').json()['insurers']
    for choice in choices:
        form = deepcopy(OLD)
        form['previous_policy']['previous_insurer_key'] = choice['key']
        statuses = [row['status'] for row in preview(request(form))['providers']]
        assert statuses == ['ready', 'ready', 'ready', 'ready'], (choice, statuses)

@pytest.mark.parametrize('provider', ['azki','sabim','bimebazar','bimeh'])
def test_complete_captured_response_preserves_all_fields(provider):
    raw = json.loads(gzip.decompress((Path(__file__).parent / 'fixtures' / (provider+'-third-response.json.gz')).read_bytes()))
    if provider == 'azki':
        row = next(p for group in ('top','bottom','others') for c in raw[group] for p in c['prices'])
        duration, coverage = row['durationID'], row['coverAmount']
    else: duration, coverage = 12, 70_000_000
    result = normalize(provider, raw, datetime.now(timezone.utc), 'third_car', duration, coverage)
    assert result.status == 'ok' and result.raw_response == raw
    for offer in result.offers:
        expected_unit = 'rial' if provider in ('sabim', 'bimeh') else 'toman'
        assert offer.premium.raw_unit == expected_unit
        assert offer.premium.amount_toman == to_toman(offer.premium.raw_amount, expected_unit)
        if provider == 'azki':
            assert offer.raw_offer['company'] in sum([raw[g] for g in ('top','bottom','others')], [])
            assert offer.raw_offer['price'] in offer.raw_offer['company']['prices']
        else:
            rows = raw['Inquiries'] if provider == 'bimeh' else raw['data']['offers'] if provider == 'bimebazar' else raw['data']
            assert offer.raw_offer in rows
    if provider == 'bimeh':
        assert result.offers[0].duration_months == 12 and result.offers[0].financial_coverage_toman == 70_000_000
    if provider in ('sabim','bimebazar'):
        assert all(o.duration_months is None and o.financial_coverage_toman is None for o in result.offers)
    if provider in ('azki', 'bimebazar', 'bimeh'):
        assert any(o.discount_amount_toman for o in result.offers)
        assert any(o.has_installments for o in result.offers)


def test_installment_plans_and_extra_details_come_from_captured_responses():
    when = datetime.now(timezone.utc)
    results = {}
    for provider in ('azki', 'sabim', 'bimebazar', 'bimeh'):
        raw = json.loads(gzip.decompress(
            (Path(__file__).parent / 'fixtures' / f'{provider}-third-response.json.gz').read_bytes()))
        results[provider] = normalize(provider, raw, when, 'third_car', 12, 70_000_000)

    azki = next(offer for offer in results['azki'].offers if offer.installment_plans)
    azki_plan = azki.installment_plans[0]
    assert azki_plan.installment_count == 11
    assert azki_plan.down_payment_toman == azki_plan.payments[0].amount_toman
    assert azki_plan.total_payable_toman == sum(payment.amount_toman for payment in azki_plan.payments)
    assert azki_plan.operation_cost_toman and azki_plan.payments[-1].due_date
    assert azki.penalty.days is not None and azki.insurer_metrics.satisfaction is not None
    assert azki.benefits and azki.badges

    bazaar = next(offer for offer in results['bimebazar'].offers if offer.installment_plans)
    bazaar_plan = bazaar.installment_plans[0]
    assert bazaar_plan.plan_type == 'bb_bnpl' and bazaar_plan.is_credit is True
    assert bazaar_plan.installment_count == len(bazaar_plan.payments) - 1
    assert bazaar_plan.total_payable_toman and bazaar_plan.operation_cost_toman
    assert 'بدون چک' in bazaar.payment_methods
    assert {item.label for item in bazaar.price_breakdown} >= {'نرخ پایه', 'مالیات'}
    assert bazaar.discount_breakdown and bazaar.insurer_metrics.mobile_compensation is True

    bimeh = next(offer for offer in results['bimeh'].offers if offer.has_installments)
    assert bimeh.installment_plans == []  # The response has flags, not payment amounts.
    assert {'اقساط', 'اقساط اعتباری'} <= set(bimeh.payment_methods)
    assert bimeh.penalty.total_toman is not None and bimeh.sale_rank is not None
    assert bimeh.badges and bimeh.insurer_metrics.financial_strength is not None

    sabim = results['sabim'].offers[0]
    assert sabim.has_installments is None and sabim.installment_plans == []
    assert sabim.payment_methods == []
    assert sabim.penalty is not None and sabim.price_breakdown
    assert sabim.insurer_metrics.claim_centers_count is not None


def test_bimeh_returns_only_the_selected_duration_and_coverage():
    raw = json.loads(gzip.decompress((Path(__file__).parent / 'fixtures' / 'bimeh-third-response.json.gz').read_bytes()))
    result = normalize('bimeh', raw, datetime.now(timezone.utc), 'third_car', 12, 70_000_000)
    assert len(result.offers) == sum(
        row.get('DurationId') == 2 and (row.get('Details') or {}).get('CoverageId') == 188
        for row in raw['Inquiries'])
    assert all(offer.duration_months == 12 and offer.financial_coverage_toman == 70_000_000
               for offer in result.offers)


def test_azki_accepts_omitted_empty_groups_and_price_fallback():
    raw = {'others': [{'id': 1, 'title': 'آسیا', 'prices': [
        {'durationID': 12, 'coverAmount': 70_000_000,
         'discountedPrice': None, 'price': 12_345_678}]}]}
    parsed = _read_price_response(httpx.Response(200, json=raw))
    result = normalize('azki', parsed, datetime.now(timezone.utc), 'third_car', 12, 70_000_000)
    assert result.status == 'ok' and result.offers[0].premium.raw_amount == 12_345_678

@pytest.mark.parametrize('mode,azki,bazar', [
    ('unchanged',None,None), ('no_discount','1','no_another_thirdparty_discount'),
    ('same_plate','2','has_discount_with_plate'), ('other_plate','3','new_plate_with_discount')])
def test_ownership_branches_match_laboratory_fields(mode,azki,bazar):
    r=request(); h=r.previous_policy;h.ownership_mode=mode
    h.transfer_plate='test-plate';h.transfer_plate_part1='12';h.transfer_plate_part2='ب'
    h.transfer_plate_part3='345';h.transfer_plate_serial='67'
    h.transfer_national_id='0000000000';h.transfer_inquiry_id='synthetic-inquiry';h.transfer_relationship='self'
    a=params(r,'azki');b=params(r,'bimebazar')
    assert a.get('vehicleChangedOwner')==azki and b.get('change_ownership_status')==bazar
    assert b['has_ownership_change']==str(mode!='unchanged').lower()
    if mode=='no_discount':
        assert a['thirdDiscountID']=='1' and a['driverDiscountID']=='1' and a['oldInsureUsed']=='0'
        assert 'no_damage_factor' not in b and 'has_damage' not in b
    if mode=='other_plate':
        assert a['unAttachedPlateNumber']=='test-plate' and b['dis_plk2']=='ب' and b['sb_id_pre']=='synthetic-inquiry'
    validate_price_params(a);validate_offer_params(b,'third_car')
    validate_query('third_car',params(r,'sabim'));validate_inquiry('third_car',params(r,'bimeh'))

def test_transfer_needs_details_only_for_sources_that_use_them():
    r=request();r.previous_policy.ownership_mode='other_plate'
    assert [p['status'] for p in preview(r)['providers']] == ['needs_input','ready','needs_input','ready']

@pytest.mark.parametrize('owner,status', [('current',2),('previous',3),('transfer',4)])
def test_bimeh_owner_and_independent_previous_duration(owner,status):
    r=request();r.duration_months=6;r.previous_policy.previous_duration_months=3
    r.previous_policy.policy_owner=owner;r.previous_policy.supplement_discounts=True
    p=params(r,'bimeh')
    assert p['PreviousInsuranceStatusId']==status and p['DurationId']==1 and p['PreviousDurationId']==0
    assert p['LifeLossId'] is None
    assert ('PreviousCompanyId' in p)==(owner!='transfer') and ('supplementDiscounts' in p)==(owner=='transfer')
    validate_inquiry('third_car',p)

def test_new_dates_are_not_interchangeable_and_no_sabim_history_is_invented():
    r=request({**FORM,'previous_policy':{'status':'new_vehicle','first_use_date_jalali':'1405/07/01'}})
    assert params(r,'azki')['oldInsureExpireDate']=='1405-07-01' and params(r,'bimeh')['ReleaseDate']=='2026-09-23'
    assert prepare(r,'bimebazar',resolve_car(r))[1]=='needs_input' and prepare(r,'sabim',resolve_car(r))[1]=='needs_input'
    r.previous_policy.new_vehicle_expiry_jalali='1406/07/01'
    assert params(r,'bimebazar')['last_policy_exp_date']=='1406/07/01'

def test_explicit_sabim_base_data_and_zero_km_catalog_option():
    r=request({**FORM,'sabim_history':{'insurer_key':'آسیا','start_date_jalali':'1403/07/01','expiry_date_jalali':'1404/07/01'},
               'sabim_transition':True,'sabim_yadak':True,'sabim_zero_km_third_discount':True,'sabim_zero_km_driver_discount':True})
    p=params(r,'sabim')
    assert p['thirdparty_last_date_end']=='2025-09-23'
    assert p['thirdparty_discnt_thirdparty_id']=='16' and p['thirdparty_discnt_driver_id']=='16'
    assert p['transition']=='true' and p['thirdparty_yadak']=='true' and p['prev_damage']=='nadarad'
    validate_query('third_car',p)
    assert min(TestClient(app).get('/api/search/catalog').json()['discounts'])==0


def test_complete_single_form_previews_four_provider_requests():
    common_insurer = next(row for row in catalog()['insurers'] if len(row['providers']) == 4)
    form = {**FORM, 'sabim_history': {
        'insurer_key': common_insurer['key'],
        'start_date_jalali': '1403/07/01',
        'expiry_date_jalali': '1404/07/01',
    }}
    providers = TestClient(app).post('/api/search/preview', json=form).json()['providers']
    assert [row['status'] for row in providers] == ['ready'] * 4
    assert all(set(row) == {'provider', 'status'} for row in providers)


def test_catalog_exposes_cascading_vehicle_dimensions_and_source_coverage():
    models = TestClient(app).get('/api/search/catalog').json()['models']
    pars = next(model for model in models if model['key'] == 'peugeot_pars')
    assert (pars['category'], pars['brand'], pars['model']) == ('سواری', 'پژو', 'پارس')
    assert not {'provider', 'providers', 'source_count', 'sources'} & pars.keys()
    assert pars['imported'] is False

def test_source_model_override_is_scoped_and_can_complete_an_unmapped_model():
    r=request({**FORM,'vehicle':{**FORM['vehicle'],'model_key':'peugeot_206_type2'}})
    row=next(m for m in catalog()['models'] if m['provider']=='bimeh')
    form=r.model_dump();form['provider_selections']={'bimeh':{'model_key':row['key'],'usage_key':row['usages'][0]['key']}}
    r=request(form)
    assert params(r,'bimeh')['ModelId']==int(row['mapping']['model'])
    form['provider_selections']['bimeh']['model_key']='azki:1:18:182341'
    assert prepare(request(form),'bimeh',resolve_car(request(form)))[1]=='unmapped'


def test_bimeh_transfer_status_always_sets_ownership_change():
    r=request();r.previous_policy.policy_owner='transfer';r.previous_policy.ownership_mode='unchanged'
    p=params(r,'bimeh')
    assert p['PreviousInsuranceStatusId']==4 and p['ownershipChange'] is True
    assert 'PreviousCompanyId' not in p and p['supplementDiscounts'] is False

def test_preview_and_search_use_identical_builders_without_preview_network(monkeypatch):
    seen={}
    async def azki(p,product):seen['azki']=p;return {'top':[],'bottom':[],'others':[]}
    async def sabim(product,p):seen['sabim']=p;return {'result':'ok','data':[]}
    async def bazar(product,p):seen['bimebazar']=p;return {'status':'ok','data':{'offers':[]}}
    async def bimeh(product,p):seen['bimeh']=p;return {'Companies':[],'Inquiries':[]}
    for name,fn in [('get_third_prices',azki),('get_sabim_prices',sabim),('get_offers',bazar),('get_prices',bimeh)]:monkeypatch.setattr(search,name,fn)
    client=TestClient(app);public_preview=client.post('/api/search/preview',json=OLD)
    assert public_preview.status_code==200 and seen=={}
    full_preview=preview(request(OLD))
    assert all(p['status']=='empty' for p in client.post('/api/search',json=OLD).json()['providers'])
    for source in full_preview['providers']:assert seen[source['provider']]==(source['body'] if source['provider']=='bimeh' else source['query'])

@pytest.mark.parametrize('content', [b'<html>not json</html>', b'{"unexpected": [1]}'])
def test_client_parse_failure_is_invalid_response_not_network_or_empty(monkeypatch,content):
    async def invalid(*args):return _read_price_response(httpx.Response(200,content=content))
    monkeypatch.setattr(search,'get_third_prices',invalid)
    monkeypatch.setattr(search,'get_offers',AsyncMock(return_value={'status':'ok','data':{'offers':[]}}))
    monkeypatch.setattr(search,'get_prices',AsyncMock(return_value={'Companies':[],'Inquiries':[]}))
    result=TestClient(app).post('/api/search',json=FORM).json()['providers']
    assert [p['status'] for p in result]==['invalid_response','needs_input','empty','empty']
    assert result[0]['raw_response']==({'unexpected':[1]} if content.startswith(b'{') else None)

def test_mapping_failure_remains_isolated(monkeypatch):
    original=search._prepare
    def broken(r,p,c):
        if p=='azki':raise KeyError('broken catalog')
        return original(r,p,c)
    monkeypatch.setattr(search,'_prepare',broken)
    monkeypatch.setattr(search,'get_offers',AsyncMock(return_value={'status':'ok','data':{'offers':[]}}))
    monkeypatch.setattr(search,'get_prices',AsyncMock(return_value={'Companies':[],'Inquiries':[]}))
    assert [p['status'] for p in TestClient(app).post('/api/search',json=FORM).json()['providers']]==['unmapped','needs_input','empty','empty']


@pytest.mark.parametrize('count,identifier', [(1,2),(2,3),(3,4),(5,4)])
def test_damage_count_buckets_are_translated_for_each_source(count,identifier):
    r=request();h=r.previous_policy;h.had_claim=True
    h.property_claim_count=count;h.bodily_claim_count=0;h.driver_claim_count=0
    assert params(r,'azki')['thirdFinancialDamageID']==str(identifier)
    assert params(r,'sabim')['thirdparty_damage_financial_id']==str(identifier)
    assert params(r,'bimebazar')['property_damage_count']==str(min(count,3))
    assert params(r,'bimeh')['PropertyLossId']==identifier


def test_missing_offer_array_is_not_silently_empty():
    with pytest.raises(ValueError):
        normalize('azki',{'top':{},'bottom':[],'others':[]},datetime.now(timezone.utc),'third_car',12,70_000_000)
