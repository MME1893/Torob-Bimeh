/* Read the URLs produced by the original three form builders. Never send the
   comparison page URL to the backend; only the product's /api/offers/ URL. */
(() => {
  'use strict';
  const products = [
    {product:'third_car',panel:'thirdPanel',offer:'offerUrl',compare:'compareUrl'},
    {product:'body_car',panel:'bodyPanel',offer:'bodyOfferUrl',compare:'bodyCompareUrl'},
    {product:'third_motor',panel:'motorPanel',offer:'motorOfferUrl',compare:'motorCompareUrl'},
  ];
  const byId = id => document.getElementById(id);
  const formatter = new Intl.NumberFormat('fa-IR');

  function normalizeOffers(json) {
    if (!json || json.status !== 'ok' || !Array.isArray(json.data?.offers))
      throw Error('ساختار پاسخ پیشنهادهای بیمه‌بازار شناخته‌شده نیست.');
    return json.data.offers.flatMap(row => {
      if (!row || typeof row !== 'object' ||
          typeof row.tariff !== 'number' || !Number.isFinite(row.tariff) || row.tariff < 0)
        return [];
      return [{company:String(row.company_name || 'شرکت بیمه'),
        tariff:row.tariff, installments:row.has_installment_payment === true}];
    });
  }

  for (const item of products) {
    const panel = byId(item.panel), offer = byId(item.offer), compare = byId(item.compare);
    if (!panel || !offer || !compare) continue;
    const box = document.createElement('section');box.className = 'live-offers';
    const title = document.createElement('h3');title.textContent = 'دریافت پیشنهادهای زنده';
    const button = document.createElement('button');button.className = 'action';
    button.type = 'button';button.textContent = 'دریافت قیمت از بیمه‌بازار';
    const status = document.createElement('div');status.className = 'live-status';
    status.setAttribute('role', 'status');
    const grid = document.createElement('div');grid.className = 'live-grid';
    const raw = document.createElement('details');
    const summary = document.createElement('summary');summary.textContent = 'نمایش JSON خام همین درخواست';
    const pre = document.createElement('pre');raw.append(summary,pre);raw.hidden = true;
    box.append(title,button,status,grid,raw);
    const hint = offer.nextElementSibling;
    (hint || offer).insertAdjacentElement('afterend',box);
    let controller = null;

    function reset() {
      if (controller) controller.abort();
      controller = null;button.disabled = false;button.textContent = 'دریافت قیمت از بیمه‌بازار';
      status.textContent = '';status.className = 'live-status';
      grid.replaceChildren();raw.hidden = true;pre.textContent = '';
    }
    panel.addEventListener('input',reset);
    panel.addEventListener('change',reset);
    button.addEventListener('click',async () => {
      const url = offer.value, destination = compare.value;
      if (!url || !destination) {
        status.textContent = 'ابتدا فیلدهای فرم را تکمیل کنید تا هر دو URL ساخته شوند.';
        status.className = 'live-status error';return;
      }
      reset();controller = new AbortController();const request = controller;
      button.disabled = true;button.textContent = 'در حال دریافت…';
      status.textContent = 'در حال درخواست پیشنهادهای همین فرم…';
      try {
        const response = await fetch('/api/bimebazar/offers', {
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({product:item.product,url}),signal:request.signal,
        });
        if (!response.ok) {
          let detail = '';
          try {const body = await response.json();if (typeof body.detail === 'string') detail = body.detail;} catch {}
          throw Error('Backend کد HTTP '+response.status+' برگرداند. '+detail);
        }
        if (!(response.headers.get('content-type') || '').toLowerCase().includes('json'))
          throw Error('پاسخ پیشنهادها JSON نیست.');
        const json = await response.json(), rows = normalizeOffers(json);
        if (request.signal.aborted || offer.value !== url || compare.value !== destination) return;
        pre.textContent = JSON.stringify(json,null,2);raw.hidden = false;
        status.textContent = formatter.format(rows.length)+' پیشنهاد از پاسخ همین درخواست دریافت شد.';
        if (!rows.length)status.textContent += ' قیمت قابل نمایش پیدا نشد؛ JSON خام را ببینید.';
        for (const row of rows) {
          const card = document.createElement('a');card.className = 'live-card';
          card.href = destination;card.target = '_blank';card.rel = 'noopener noreferrer';
          const name = document.createElement('span');name.textContent = row.company;
          const price = document.createElement('strong');price.textContent = formatter.format(row.tariff)+' تومان';
          const label = document.createElement('small');label.textContent = 'تعرفهٔ خام پاسخ API'+
            (row.installments ? ' · امکان پرداخت اقساطی' : '');
          card.append(name,price,label);grid.append(card);
        }
      } catch (error) {
        if (request.signal.aborted || offer.value !== url) return;
        status.className = 'live-status error';
        status.textContent = error?.name === 'TypeError'
          ? 'اتصال به Backend برقرار نشد. آزمایشگاه را از http://127.0.0.1:8000/labs/bimebazar.html باز کنید.'
          : String(error.message || error);
      } finally {
        if (controller === request) {
          controller = null;button.disabled = false;button.textContent = 'دریافت قیمت از بیمه‌بازار';
        }
      }
    });
  }
  window.BimebazarLive = {normalizeOffers};
})();
