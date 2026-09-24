/* The lab's request and results live in bimeh.html; this file only connects them. */
(() => {
  const button = document.getElementById('fetchBimehPrices');
  const status = document.getElementById('bimehLiveStatus');
  const panel = document.getElementById('bimehLiveResults');
  const cards = document.getElementById('bimehLiveCards');
  const details = document.getElementById('bimehJsonDetails');
  const json = document.getElementById('bimehLiveJson');
  const names = {thirdparty: 'third_car', body: 'body_car', motor: 'third_motor'};
  let rawResponse = null;
  let revision = 0;

  function clearLiveResults() {
    revision += 1;
    rawResponse = null;
    panel.classList.add('hidden');
    cards.innerHTML = '';
    details.open = false;
    json.textContent = '';
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    clearLiveResults();
    status.textContent = 'ابتدا پیش‌نمایش درخواست را بساز.';
  }));
  document.getElementById('reset').addEventListener('click', clearLiveResults);
  for (const id of ['fixtureSelect', 'responseImport']) {
    document.getElementById(id).addEventListener('change', () => {
      clearLiveResults();
      button.disabled = !Object.keys(request).length;
    });
  }
  document.getElementById('bimehAllOffers').addEventListener('click', () => {
    const allOffers = document.getElementById('offers');
    allOffers.scrollTop = 0;
    allOffers.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  details.addEventListener('toggle', () => {
    json.textContent = details.open && rawResponse ? JSON.stringify(rawResponse, null, 2) : '';
  });
  document.getElementById('bimehDownloadJson').addEventListener('click', () => {
    if (rawResponse) saveJson(rawResponse, 'bimeh_live_response.json');
  });

  button.addEventListener('click', async () => {
    try {
      // Regenerate the preview so edits after the last preview are reflected.
      makeRequest();
    } catch (error) {
      status.className = 'notice error';
      status.textContent = error.message;
      return;
    }
    const activeKind = kind;
    const activeUrl = inquiryUrl;
    clearLiveResults();
    const activeRevision = revision;
    button.disabled = true;
    status.className = 'notice';
    status.textContent = 'در حال دریافت پیشنهادهای تازه از بیمه‌دات‌کام…';
    try {
      const response = await fetch('/api/bimeh/prices', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({product: names[activeKind], body: request}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `خطای HTTP ${response.status}`);
      if (!Array.isArray(data.Inquiries) || !Array.isArray(data.Companies))
        throw new Error('پاسخ استعلام فاقد Inquiries یا Companies است.');
      // The user may switch products while the network request is in flight.
      if (kind !== activeKind || inquiryUrl !== activeUrl || revision !== activeRevision) return;
      const companies = new Map(data.Companies.map(company => [company.Id, company.Title]));
      importedResponse = {
        offers: data.Inquiries.map(offer => ({
          companyId: offer.CompanyId,
          companyTitle: companies.get(offer.CompanyId) || 'شرکت نامشخص',
          durationId: offer.DurationId,
          duration: offer.Duration,
          coverageId: offer.Details?.CoverageId,
          cashPrice: {FinalAmount: offer.CashPrice?.FinalAmount},
        })),
        companies: data.Companies,
        coverages: data.Coverages || [],
        durations: data.Durations || [],
      };
      rawResponse = data;
      const first = importedResponse.offers.slice(0, 8);
      cards.innerHTML = first.length ? first.map(offer => {
        const amount = offer.cashPrice.FinalAmount;
        const price = amount == null || !Number.isFinite(Number(amount))
          ? 'قیمت نامشخص' : Number(amount).toLocaleString('fa-IR');
        return `<div class="offer"><div><strong>${escapeHTML(offer.companyTitle)}</strong>` +
          `<div class="meta">${escapeHTML(duration[offer.durationId] || offer.duration || 'مدت نامشخص')}</div></div>` +
          `<div><div class="price">${price}</div><div class="meta">عدد خام API</div></div></div>`;
      }).join('') : '<div class="notice warning">API برای این استعلام پیشنهادی برنگرداند؛ JSON پاسخ را بررسی کن.</div>';
      panel.classList.remove('hidden');
      document.getElementById('bimehAllOffers').textContent =
        `نمایش همهٔ ${importedResponse.offers.length.toLocaleString('fa-IR')} پیشنهاد در فهرست پایین`;
      $('bimehResultBadge').textContent = 'پاسخ تازهٔ API';
      $('companySearch').value = '';
      $('sortOffers').value = 'original';
      status.className = 'notice';
      status.textContent = `${importedResponse.offers.length.toLocaleString('fa-IR')} پیشنهاد تازه دریافت شد. کارت‌های اول و JSON کامل همین پایین قرار دارند.`;
      renderOffers();
      panel.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (error) {
      if (kind !== activeKind || inquiryUrl !== activeUrl || revision !== activeRevision) return;
      status.className = 'notice error';
      status.textContent = `استعلام زنده ناموفق بود: ${error.message}`;
    } finally {
      if (kind === activeKind && inquiryUrl === activeUrl && revision === activeRevision) button.disabled = false;
    }
  });
})();
