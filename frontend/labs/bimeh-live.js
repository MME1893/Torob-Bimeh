/* The lab's request and results live in bimeh.html; this file only connects them. */
(() => {
  const button = document.getElementById('fetchBimehPrices');
  const status = document.getElementById('bimehLiveStatus');
  const names = {thirdparty: 'third_car', body: 'body_car', motor: 'third_motor'};
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
      if (kind !== activeKind || inquiryUrl !== activeUrl) return;
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
      $('bimehResultBadge').textContent = 'پاسخ تازهٔ API';
      status.className = 'notice';
      status.textContent = `${importedResponse.offers.length.toLocaleString('fa-IR')} پیشنهاد تازه دریافت شد. مقدار قیمت، عدد خام API است.`;
      renderOffers();
    } catch (error) {
      if (kind !== activeKind || inquiryUrl !== activeUrl) return;
      status.className = 'notice error';
      status.textContent = `استعلام زنده ناموفق بود: ${error.message}`;
    } finally {
      if (kind === activeKind && inquiryUrl === activeUrl) button.disabled = false;
    }
  });
})();
