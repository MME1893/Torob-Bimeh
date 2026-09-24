# ترب بیمه — آزمایشگاه اتصال API

نقشهٔ راه رابط واحد، قرارداد داده، وضعیت واقعی چهار منبع و برنامهٔ AI در [docs/mvp-roadmap.md](docs/mvp-roadmap.md) و جهت بصری در [docs/ui-concepts.md](docs/ui-concepts.md) آمده است. مدل‌های ورودی و خروجی در `backend/app/domain/quotes.py` و نخستین برش جست‌وجوی واحد در `backend/app/routers/search.py` هستند. JSON کامل پاسخ هر منبع در `ProviderResult.raw_response` حفظ می‌شود.

**برش قابل اجرا:** فرم جدید فعلاً ثالث خودروی پژو پارسِ شخصی، بدون بیمهٔ قبلی، دورهٔ یک‌ساله و تعهد مالی ۷۰ میلیون تومان را می‌پذیرد. سال ساخت ۱۳۹۰ تا ۱۴۰۵ قابل انتخاب است. آداپتورهای ازکی، بیمه‌بازار و بیمه‌دات‌کام برای این ورودی به‌طور مستقل اجرا می‌شوند؛ سابیم `needs_input` می‌دهد چون تاریخ اجباری برای شاخهٔ بدون بیمهٔ قبلی تأیید نشده است. بدنهٔ خودرو و ثالث موتور در فرم واحد هنوز فعال نیستند؛ آزمایشگاه‌های مستقل آن‌ها باقی‌اند. عدد خام پیشنهادها بدون تبدیل و بدون رتبه‌بندی قیمت نمایش داده می‌شود زیرا واحد پول هر سه منبع هنوز تأیید نشده است.

آزمایشگاه‌های ازکی، سابیم، بیمه‌بازار و بیمه‌دات‌کام در `frontend/labs` نگهداری می‌شوند. رابط اصلی React/TypeScript در `frontend/src` است. Backend برای هر سایت یک آداپتور مستقل دارد و پاسخ تازهٔ همان درخواست را برمی‌گرداند. بدنهٔ موتور سابیم همچنان پیش‌نمایش دارد ولی درخواست زنده ندارد.

```text
frontend/labs/                         آزمایشگاه‌های HTML چهار سایت
frontend/src/                          صفحهٔ اصلی، پرسش‌ها و نتایج
frontend/labs/bimebazar-live.js        اتصال سه تب بیمه‌بازار و نمایش پیشنهادها
frontend/labs/bimeh-live.js            اتصال سه تب بیمه‌دات‌کام و نمایش نتایج تازه
backend/app/adapters/azki/             قرارداد و کلاینت ازکی
backend/app/adapters/sabim/            قرارداد و کلاینت سابیم
backend/app/adapters/bimebazar/        قرارداد و کلاینت بیمه‌بازار
backend/app/adapters/bimeh/            قرارداد و کلاینت بیمه‌دات‌کام
backend/app/routers/                   روتر مستقل هر سایت
backend/app/domain/crosswalk.py        شناسه‌های بررسی‌شدهٔ نخستین مدل مشترک
backend/app/domain/normalizers.py      استخراج پیشنهاد همراه پاسخ خام
backend/tests/                         آزمون قرارداد و پاسخ آزمایشی سرور
```

## اجرای محلی

با Python 3.11 یا جدیدتر و `uv`:

```bash
cd backend
uv sync --extra test
cp .env.example .env
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

برای ساخت و اجرای رابط جدید در پنجرهٔ دیگری:

```bash
cd frontend
npm install
npm run dev
```

آدرس توسعهٔ رابط `http://127.0.0.1:5173/` است؛ Vite درخواست‌های `/api` را به Backend محلی می‌فرستد. با `npm run build` رابط ساخته می‌شود و سپس همان Backend آن را در `http://127.0.0.1:8000/` همراه API از یک مبدأ سرو می‌کند. نسخهٔ کوچک‌شدهٔ لوگوی بارگذاری‌شده، با طرح و نوشتار اصلی، در `frontend/public/logo.png` قرار دارد.

در Windows PowerShell به‌جای `cp` می‌توان `Copy-Item .env.example .env` را اجرا کرد. اگر درخواست بدون احراز هویت جواب نداد، **مقدار کامل هدر `Authorization`** را در `backend/.env` زیر `AZKI_AUTHORIZATION` قرار دهید. این فایل در `.gitignore` است و به مرورگر فرستاده نمی‌شود. `Deviceid` با `AZKI_DEVICE_ID` قابل تغییر است. مقدار `Baggage` فقط در صورت نیاز با `AZKI_BAGGAGE` تنظیم می‌شود. برای بیمه‌دات‌کام، **مقدار واقعی هدر `token` از نشست فعلی مرورگر** را در `BIMEH_TOKEN` قرار دهید؛ UUID تصادفی تولید نمی‌شود و نبود توکن خطای `503` می‌دهد. توکن و Cookie نمونه داخل مخزن نیست.

سپس این نشانی‌ها را باز کنید:

- [آزمایشگاه ازکی](http://127.0.0.1:8000/labs/azki.html) — فرم ثالث خودرو/موتور و بدنهٔ خودرو و فراخوانی API از طریق Backend.
- [مستندات API](http://127.0.0.1:8000/docs)
- [آزمایشگاه سابیم](http://127.0.0.1:8000/labs/sabim.html) — ثالث خودرو، ثالث موتور و بدنهٔ خودرو به Backend وصل‌اند؛ بدنهٔ موتور فقط پیش‌نمایش Query دارد.
- [آزمایشگاه بیمه‌بازار](http://127.0.0.1:8000/labs/bimebazar.html) — ثالث خودرو، ثالث موتور و بدنهٔ خودرو به API محلی وصل‌اند؛ کارت‌ها از پاسخ زنده ساخته می‌شوند.
- [بیمه‌دات‌کام](http://127.0.0.1:8000/labs/bimeh.html) — هر سه فرم به بک‌اند وصل است؛ پس از ساخت پیش‌نمایش، «گرفتن قیمت زنده» را بزنید. چند کارت نخست کنار دکمه، تمام کارت‌ها در بخش پایین و JSON کامل پاسخ برای نمایش و دانلود در دسترس است. نمونه‌های HAR جدا از پاسخ تازه نمایش داده می‌شوند.

صفحهٔ ازکی را از نشانی `127.0.0.1:8000/labs/azki.html` باز کنید، نه با دوبار کلیک روی فایل HTML. صفحه و API محلی در این حالت هم‌مبدأ هستند.

## قرارداد API فعلی

`POST /api/search` یک `SearchInput` دریافت می‌کند و همیشه وضعیت هر چهار منبع را جداگانه برمی‌گرداند. برای محصولات یا مدل‌های نگاشت‌نشده درخواست بالادستی فرستاده نمی‌شود. هر `Offer` ردیف خام خودش و هر `ProviderResult` تمام JSON پاسخ همان منبع را نگه می‌دارد. این endpoint هنوز فقط برش محدود توضیح‌داده‌شده در بالاست، نه جست‌وجوی سراسری تمام خودروها.

`POST /api/azki/prices/third` برای ثالث خودرو و ثالث موتور، ازکی را با GET صدا می‌زند. `POST /api/azki/prices/body` بدنهٔ JSON را بی‌تغییر نوع عددی و boolean، با POST به `/api/aggregator/v1/body/prices/compare` می‌فرستد. هر دو endpoint پاسخ JSON خام ازکی را به آزمایشگاه می‌دهند و خطای سرویس را با کد `502` اعلام می‌کنند.

`POST /api/azki/prices/third` دقیقاً یکی از `url` یا `params` را می‌پذیرد. `product` برابر `third_car` یا `third_motor` است. URL ورودی فقط وقتی پذیرفته می‌شود که HTTPS، میزبان `www.azki.com` و مسیر `/api/aggregator/v1/third/prices/compare` باشد. با `params` هم Backend همین میزبان و مسیر ثابت را صدا می‌زند.

```json
{
  "product": "third_car",
  "params": {
    "vehicleTypeID": "1",
    "vehicleModelID": "161821",
    "vehicleBrandID": "16",
    "vehicleConstructionYear": "1404",
    "vehicleUsageID": "1",
    "withoutInsure": "true",
    "zeroKilometer": "false",
    "durationID": "12",
    "coverID": "47",
    "orig_cover_amount": "70000000"
  }
}
```

این مثال فقط **شکل درخواست** را نشان می‌دهد و باید با مقادیر فرم همان جست‌وجو کامل شود. Backend پاسخ قیمت ساختگی یا HAR را به‌عنوان قیمت روز برنمی‌گرداند. در صورت خطای ارتباط، احراز هویت یا تغییر ساختار پاسخ، `502` به فرانت برمی‌گردد.

درخواست بدنه به شکل `{"body": { ... }}` است؛ شیء `body` همان ۲۷ کلید یا کلیدهای شاخهٔ فعال فرم آزکی را دارد. تاریخ‌های `clearanceDate` و `oldInsureExpireDate` در POST به فرمت میلادی `YYYY-MM-DD` هستند. مقدار `vehiclePrice` در بدنه، مبلغ خامی است که آزکی برای ارزش خودرو انتظار دارد. برای دیدن نمونهٔ واقعی همان فرم، بخش «خروجی» آزمایشگاه بدنه را باز کنید. پیشنهادهای بدنه در پاسخ ازکی قیمت را روی خود رکورد شرکت دارند؛ پیشنهادهای ثالث `company.prices[]` دارند.

### سابیم

`POST /api/sabim/prices` مقدارهای `product` و `query` را می‌پذیرد. محصول فقط `third_car`، `third_motor` یا `body_car` است. Backend کلیدهای Query را مطابق خروجی مرحلهٔ پنجم HTML بررسی می‌کند، سپس به یکی از دو URL ثابت `https://api.sabim.com/api/price_thirdparty` یا `https://api.sabim.com/api/price_bodycar` درخواست POST می‌زند. پارامترها در Query String هستند، پوشش‌های بدنه با کلید تکراری `bodycar_coverage_id[]` فرستاده می‌شوند، و بدنهٔ POST دقیقاً `{}` است. هدر Authorization تنظیم نمی‌شود. پاسخ JSON خام به آزمایشگاه برمی‌گردد؛ فعلاً کارت‌های قیمت سابیم به دلیل نداشتن نمونهٔ معتبر از ساختار پاسخ نرمال‌سازی نمی‌شوند.

در دادهٔ ضبط‌شدهٔ داخل HTML، هر ۲۸ نمونهٔ POST بدنهٔ خودرو از سابیم HTTP `500` داشته‌اند. پس تکمیل فرم و ارسال درخواست ثابت می‌کند قرارداد و اتصال محلی درست ساخته شده‌اند، ولی موفقیت زندهٔ سرویس بدنه را تضمین نمی‌کند. خطای بالادستی به جای قیمت ساختگی با کد `502` و توضیح کد بالادستی نمایش داده می‌شود. بدنهٔ موتور به API وصل نیست زیرا کاتالوگ، شناسهٔ کاربری بدنهٔ موتور ندارد.

### بیمه‌بازار

`POST /api/bimebazar/offers` مقدار `product` (`third_car`، `third_motor` یا `body_car`) و دقیقاً یکی از `url` یا `params` را می‌گیرد. URL ورودی فقط برای HTTPS روی `bimebazar.com` و مسیر پیشنهادهای **همان محصول** پذیرفته می‌شود. Backend از روی Query همان فرم به مسیر ثابت مربوطه GET می‌زند:

| محصول | مسیر درخواست پیشنهادها |
| --- | --- |
| ثالث خودرو | `/thirdparty/api/offers/` |
| ثالث موتور | `/thirdpartymotor/api/offers/` |
| بدنهٔ خودرو | `/carbody/api/offers/` |

URLهای `/compare/.../` فقط برای لینک کارت‌ها هستند و به API محلی قیمت داده نمی‌شوند. Backend پاسخ `status=ok` با `data.offers[]` را برمی‌گرداند. آزمایشگاه بیمه‌بازار `company_name` و `tariff` خام هر پیشنهاد را در کارت نمایش می‌دهد؛ نمونه‌های سه محصول به ترتیب ۱۶، ۶ و ۱۱ ردیف معتبر داشتند. پاسخ ساختگی به‌عنوان قیمت زنده نمایش داده نمی‌شود و در صورت خطای بالادستی، صفحه خطا را نشان می‌دهد.

### بیمه‌دات‌کام

`POST /api/bimeh/prices` با `product` برابر `third_car`، `body_car` یا `third_motor` و `body` برابر JSON ساخته‌شده در آزمایشگاه، به یکی از سه مسیر ثابت زیر روی `https://coreapi.bimeh.com` درخواست POST می‌زند:

| محصول | مسیر موفق در HAR |
| --- | --- |
| ثالث خودرو | `/v1/insurance/third-party/inquiry` |
| بدنهٔ خودرو | `/v1/insurance/car-body/inquiry` |
| ثالث موتور | `/v1/insurance/motor/inquiry` |

نمونهٔ درخواست: `{"product":"third_motor","body":{"MotorTypeId":11,"ProductionYearId":2024,"PreviousInsuranceStatusId":1,"DurationId":2,"isRenewal":false,"InquiryUrl":"https://bimeh.com/thirdpartyMotor/planlist?MotorTypeId=11"}}`. `InquiryUrl` لینک صفحهٔ مقایسه است و Backend آن را تنها برای همان محصول روی `bimeh.com` می‌پذیرد؛ درخواست قیمت به `coreapi.bimeh.com` فرستاده می‌شود. هدرهای `referer-data` و `token` از تنظیمات سمت سرور اضافه می‌شوند؛ هیچ‌یک از ۵۷ درخواست موفق HAR هدر Cookie نداشته است. خطای بالادستی کد HTTP و پیام کوتاه JSON را نشان می‌دهد، بدون چاپ توکن یا کل payload. پاسخ JSON باید آرایه‌های `Inquiries` و `Companies` داشته باشد؛ آزمایشگاه کارت‌ها را از پاسخ تازه می‌سازد و نمونه‌های ضبط‌شده را جداگانه نشان می‌دهد. مسیر `Car-Price-Inquiry` در HARهای بدنه ۴۰۴ داشته و در مسیر اصلی قیمت‌گیری استفاده نمی‌شود. شناسهٔ موتور سه‌چرخ ۱۱ و برقی ۱۲ است؛ ۱۳ در HAR درخواست موفق دارد، اما نام آن تأیید نشده است. فهرست مدل ۲۰۲ ترکیب بدنه از کاتالوگ مدل‌های مشترک ثالث استفاده می‌کند.

## آزمون

```bash
cd backend
python -m unittest discover -s tests -p 'test_contract.py' -v
uv run pytest -q
node ../frontend/tests/azki_lab_smoke.cjs
node ../frontend/tests/sabim_lab_smoke.cjs
node ../frontend/tests/bimebazar_lab_smoke.cjs
node ../frontend/tests/bimeh_lab_smoke.cjs
```

آزمون HTTP با پاسخ ساختگی فقط قرارداد Backend را می‌سنجد. دریافت قیمت واقعی به دسترسی شبکه و اعتبارنامهٔ معتبر در محیط اجرا وابسته است. گام بعدی تکمیل نگاشت خودروها، شاخه‌های سابقه و پارسر سابیم، سپس افزودن بدنه و موتور به فرم واحد است.
