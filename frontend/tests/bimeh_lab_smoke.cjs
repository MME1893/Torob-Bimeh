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

class Element {
  constructor() {
    this.listeners = {};
    this.classList = {
      hidden: true,
      add: () => {this.classList.hidden = true;},
      remove: () => {this.classList.hidden = false;},
    };
  }
  addEventListener(name, cb) {this.listeners[name] = cb;}
  scrollIntoView() {this.scrolled = true;}
}
const ids = Object.fromEntries(['fetchBimehPrices', 'bimehLiveStatus', 'bimehResultBadge',
  'bimehLiveResults', 'bimehLiveCards', 'bimehJsonDetails', 'bimehLiveJson',
  'bimehAllOffers', 'bimehDownloadJson', 'reset', 'fixtureSelect',
  'responseImport', 'companySearch', 'sortOffers', 'offers'].map(id => [id, new Element()]));
const tab = new Element();
let sent, rendered, downloaded;
const context = {
  document: {getElementById: id => ids[id], querySelectorAll: () => [tab]},
  fetch: async (url, options) => {
    sent = {url, options};
    return {ok: true, json: async () => ({
      Inquiries: [{CompanyId: 17, CashPrice: {FinalAmount: 1450000}},
        {CompanyId: 18, CashPrice: {FinalAmount: 1660000}}],
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
  const escapeHTML = value => String(value);
  const duration = {2: 'یک ساله'};
  function saveJson(body, filename) { globalThis.downloaded = {body, filename}; }
`, context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'labs', 'bimeh-live.js'), 'utf8'), context);

(async () => {
  for (const [tab, product] of [['thirdparty', 'third_car'], ['body', 'body_car'], ['motor', 'third_motor']]) {
    vm.runInContext(`kind = '${tab}'`, context);
    await ids.fetchBimehPrices.listeners.click();
    assert.equal(sent.url, '/api/bimeh/prices');
    assert.equal(sent.options.method, 'POST');
    assert.equal(JSON.parse(sent.options.body).product, product);
    rendered = context.rendered;
    assert.equal(rendered.offers[0].cashPrice.FinalAmount, 1450000);
    assert.equal(rendered.offers[0].companyTitle, 'شرکت نمونه');
    assert.equal(rendered.offers.length, 2);
    assert.equal(ids.bimehResultBadge.textContent, 'پاسخ تازهٔ API');
    assert.equal(ids.bimehLiveResults.classList.hidden, false);
    assert.match(ids.bimehLiveCards.innerHTML, /شرکت نمونه/);
    assert.match(ids.bimehLiveCards.innerHTML, /۱٬۴۵۰٬۰۰۰/);
    assert.equal(ids.bimehLiveResults.scrolled, true);
    ids.bimehJsonDetails.open = true;
    ids.bimehJsonDetails.listeners.toggle();
    assert.match(ids.bimehLiveJson.textContent, /"Inquiries"/);
    assert.match(ids.bimehLiveJson.textContent, /1660000/);
    ids.bimehDownloadJson.listeners.click();
    downloaded = context.downloaded;
    assert.equal(downloaded.filename, 'bimeh_live_response.json');
    assert.equal(downloaded.body.Inquiries.length, 2);
    assert.equal(ids.fetchBimehPrices.disabled, false);
  }
  ids.bimehAllOffers.listeners.click();
  assert.equal(ids.offers.scrolled, true);
  tab.listeners.click();
  assert.equal(ids.bimehLiveResults.classList.hidden, true);
  console.log('Bimeh three products -> immediate cards + complete JSON + download: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
