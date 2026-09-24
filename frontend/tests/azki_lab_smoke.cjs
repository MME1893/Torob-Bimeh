/* Exercise the existing HTML builder and the new backend call without a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'labs', 'azki.html'), 'utf8');
const data = id => html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`))[1];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const elements = new Map([
  ['lab-data', {textContent: data('lab-data')}],
  ['lab-fixtures', {textContent: data('lab-fixtures')}],
]);
const handlers = {};
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {style: {}, innerHTML: '', textContent: '', value: ''});
    return elements.get(id);
  },
  addEventListener(name, callback) { handlers[name] = callback; },
};
let called;
const thirdResponse = {
  top: [], bottom: [], others: [
    {id: 1, title: 'نمونه', installments: [], prices: [{price: 12000000, discountedPrice: 11000000,
      durationID: 12, durationTitle: 'یک ساله', coverID: 47, coverAmount: 70000000}]},
  ], nonRevivablePrices: [{id: 2}], noPriceStatus: null,
};
const bodyResponse = {
  top: [], bottom: [], others: [
    {id: 2, title: 'بدنه نمونه', price: 20000000, discountedPrice: 19000000, installments: []},
  ], disablePrices: [{id: 3}], noPriceStatus: null,
};
const context = {
  document, URLSearchParams, URL, Intl, Date, AbortController, Set, console,
  fetch: async (url, options) => {
    called = {url, options};
    return {ok: true, headers: {get: () => 'application/json'},
      json: async () => url.endsWith('/body') ? bodyResponse : thirdResponse};
  },
};
context.window = context;
for (const script of scripts) vm.runInNewContext(script, context);
const fixtures = JSON.parse(data('lab-fixtures'));
const click = (id, dataset = {}) => handlers.click({target: {closest: () => ({id, dataset})}});
async function run(product, fixtureId, endpoint, expected) {
  const fixture = fixtures.find(item => item.id === fixtureId);
  click('', {product});
  Object.assign(context.AzkiLabTests.states[product], context.AzkiLabTests.stateForFixture(fixture));
  click('', {step: '3'});
  click('generate');
  click('fetch-quotes');
  await new Promise(setImmediate);
  assert.equal(called.url, endpoint);
  const body = JSON.parse(called.options.body);
  expected(body);
  assert.equal((elements.get('panel').innerHTML.match(/class="offer-card"/g) || []).length, 1);
}
(async () => {
  await run('third', 'third-04', '/api/azki/prices/third', body => {
    assert.equal(body.product, 'third_car');
    assert.match(body.url, /^https:\/\/www\.azki\.com\/api\/aggregator\/v1\/third\/prices\/compare\?/);
    assert.match(body.url, /vehicleModelID=161821/);
  });
  await run('motor', 'motor-16', '/api/azki/prices/third', body => {
    assert.equal(body.product, 'third_motor');
    assert.match(body.url, /vehicleTypeID=/);
  });
  await run('body', 'body-11', '/api/azki/prices/body', body => {
    assert.equal(typeof body.body.vehiclePrice, 'number');
    assert.equal(typeof body.body.zeroKilometer, 'boolean');
    assert.equal(body.body.locationSource, 'INCOMPLETE_ADDRESS');
    assert.equal(body.url, undefined);
  });
  console.log('Azki car third / motor third / car body -> local API -> quote card: OK');
})().catch(error => {console.error(error);process.exitCode = 1;});
