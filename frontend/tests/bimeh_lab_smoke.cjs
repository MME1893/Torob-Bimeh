/* Verify the three tabs forward their generated body and show fresh responses. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'labs', 'bimeh.html'), 'utf8');
assert.match(html, /<script src="\.\/bimeh-live\.js"><\/script>/);
const catalog = JSON.parse(html.match(/<script id="catalog" type="application\/json">(.*?)<\/script>/s)[1]);
assert.equal(catalog.meta.counts.bodyVerifiedModelPairs, 202);
assert.equal(catalog.meta.counts.bodyUnverifiedModelPairs, 0);
assert.equal(catalog.options.motor.motorTypes.find(x => x.Id === 11).Title, 'موتورسیکلت سه چرخ');
assert.equal(catalog.options.motor.motorTypes.find(x => x.Id === 12).Title, 'موتورسیکلت برقی');

const ids = {
  fetchBimehPrices: {disabled: false, addEventListener(_, cb) {this.click = cb;}},
  bimehLiveStatus: {textContent: '', className: ''},
  bimehResultBadge: {textContent: ''},
};
let sent, rendered;
const context = {
  document: {getElementById: id => ids[id]},
  fetch: async (url, options) => {
    sent = {url, options};
    return {ok: true, json: async () => ({
      Inquiries: [{CompanyId: 17, CashPrice: {FinalAmount: 1450000}}],
      Companies: [{Id: 17, Title: 'شرکت نمونه'}],
    })};
  },
};
vm.createContext(context);
vm.runInContext(`
  let kind = 'thirdparty', inquiryUrl = '', request = {}, importedResponse;
  const $ = id => document.getElementById(id);
  function makeRequest() { inquiryUrl = 'https://bimeh.com/' + kind + '/planlist?x=1'; request = {InquiryUrl: inquiryUrl}; }
  function renderOffers() { globalThis.rendered = importedResponse; }
`, context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'labs', 'bimeh-live.js'), 'utf8'), context);

(async () => {
  for (const [tab, product] of [['thirdparty', 'third_car'], ['body', 'body_car'], ['motor', 'third_motor']]) {
    vm.runInContext(`kind = '${tab}'`, context);
    await ids.fetchBimehPrices.click();
    assert.equal(sent.url, '/api/bimeh/prices');
    assert.equal(sent.options.method, 'POST');
    assert.equal(JSON.parse(sent.options.body).product, product);
    rendered = context.rendered;
    assert.equal(rendered.offers[0].cashPrice.FinalAmount, 1450000);
    assert.equal(rendered.offers[0].companyTitle, 'شرکت نمونه');
    assert.equal(ids.bimehResultBadge.textContent, 'پاسخ تازهٔ API');
    assert.equal(ids.fetchBimehPrices.disabled, false);
  }
  console.log('Bimeh three products -> backend -> fresh quote cards: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
