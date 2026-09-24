/* Verify all three lab tabs send offer URLs and link cards to comparison pages. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag='div') {this.tag=tag;this.children=[];this.listeners={};this.value='';this.hidden=false;}
  append(...children) {this.children.push(...children);}
  replaceChildren() {this.children=[];}
  addEventListener(name,callback) {this.listeners[name]=callback;}
  setAttribute(name,value) {this[name]=value;}
  insertAdjacentElement(_,element) {this.inserted=element;}
}
const ids = {};
for (const name of ['thirdPanel','bodyPanel','motorPanel','offerUrl','bodyOfferUrl',
  'motorOfferUrl','compareUrl','bodyCompareUrl','motorCompareUrl']) ids[name]=new Element();
for (const name of ['offerUrl','bodyOfferUrl','motorOfferUrl']) ids[name].nextElementSibling=new Element('small');
const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag)};
const html=fs.readFileSync(path.join(__dirname,'..','labs','bimebazar.html'),'utf8');
assert.match(html, /<script src="\.\/bimebazar-live\.js"><\/script>/);
const source=fs.readFileSync(path.join(__dirname,'..','labs','bimebazar-live.js'),'utf8');
let lastRequest;
const context={document,Intl,AbortController,
  fetch:async (url,options)=>{
    lastRequest={url,options};
    return {ok:true,headers:{get:()=> 'application/json'},
      json:async()=>({status:'ok',data:{offers:[{company_name:'نمونه',tariff:12345}]}})};
  },
};
context.window=context;
vm.runInNewContext(source,context);

async function check(product,offer,compare) {
  const endpoint=`https://bimebazar.com/${product==='third_car'?'thirdparty':product==='third_motor'?'thirdpartymotor':'carbody'}/api/offers/?${product}=test`;
  const dest=`https://bimebazar.com/compare/${product}/?sample=true`;
  ids[offer].value=endpoint;ids[compare].value=dest;
  const box=ids[offer].nextElementSibling.inserted;
  assert.ok(box);
  await box.children[1].listeners.click();
  assert.equal(lastRequest.url,'/api/bimebazar/offers');
  const sent=JSON.parse(lastRequest.options.body);
  assert.equal(sent.product,product);
  assert.equal(sent.url,endpoint);
  assert.equal(lastRequest.options.method,'POST');
  const card=box.children[3].children[0];
  assert.equal(card.href,dest);
  assert.equal(card.target,'_blank');
  assert.equal(card.children[1].textContent.includes('۱۲٬۳۴۵'),true);
  assert.equal(box.children[4].hidden,false);
}

(async()=>{
  await check('third_car','offerUrl','compareUrl');
  await check('body_car','bodyOfferUrl','bodyCompareUrl');
  await check('third_motor','motorOfferUrl','motorCompareUrl');
  console.log('Bimebazar three offer URLs -> local API -> cards with comparison links: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
