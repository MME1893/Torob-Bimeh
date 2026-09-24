/* Exercise the real Sabim form builders, local POST, and motor-body exclusion. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'labs', 'sabim.html'), 'utf8');
const data = html.match(/<script id="sabim-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes = new Map([['sabim-data', {textContent: data}]]);
const handlers = {};
const document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {style: {}, innerHTML: '', textContent: '',
      addEventListener() {}});
    return nodes.get(id);
  },
  addEventListener(name, callback) { handlers[name] = callback; },
};
let request;
const context = {document, URLSearchParams, URL, Set, Date, AbortController,
  fetch: async (url, options) => {
    request = {url, options};
    return {ok: true, headers: {get: () => 'application/json'},
      json: async () => ({offers: [{company: 'نمونه', amount: 1234}]})};
  },
};
context.window = context;
vm.runInNewContext(script, context);

function output(product) {
  context.SabimLab.setProduct(product);
  if (product.startsWith('third')) {
    context.SabimLab.setValue('startDate', '2025-10-12');
    context.SabimLab.setValue('endDate', '2026-10-06');
  } else context.SabimLab.setValue('price', '2000000000');
  handlers.click({target: {closest: selector => selector === '[data-step]' ? {dataset: {step: '4'}} : null}});
  return context.SabimLab.buildRequest();
}
async function fetchPrice(product, query) {
  await handlers.click({target: {closest: selector => selector === '[data-fetch-price]' ? {} : null}});
  assert.equal(request.url, '/api/sabim/prices');
  assert.equal(request.options.method, 'POST');
  const sent = JSON.parse(request.options.body);
  assert.equal(sent.product, product);
  assert.equal(JSON.stringify(sent.query), JSON.stringify(query));
  assert.match(nodes.get('panel').innerHTML, /sabim-live-json/);
}

(async () => {
  const car = output('thirdCar');
  assert.equal(car.query.carmode_id, '1');
  assert.equal(Object.keys(car.query).length, 19);
  await fetchPrice('third_car', car.query);

  const motor = output('thirdMotor');
  assert.equal(motor.query.carmode_id, '4');
  await fetchPrice('third_motor', motor.query);

  const body = output('bodyCar');
  assert.equal(body.query.carmode_id, '1');
  assert.equal(body.query.bodycar_price, '2000000000');
  assert.equal(Object.keys(body.query).length, 19);
  await fetchPrice('body_car', body.query);

  const motorBody = output('bodyMotor');
  assert.equal(motorBody.verified, false);
  assert.doesNotMatch(nodes.get('panel').innerHTML, /data-fetch-price/);
  console.log('Sabim third car / third motor / body car POST: OK; motor body remains offline');
})().catch(error => {console.error(error);process.exitCode = 1;});
