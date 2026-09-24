# ترب بیمه — آزمایشگاه اتصال API

این مخزن گام اول پروژهٔ مقایسهٔ بیمه است. چهار HTML تحقیق در `frontend/labs` نگهداری می‌شوند و فرانت نهایی شروع نشده است. آزمایشگاه‌های ازکی، سابیم و بیمه‌بازار سه محصول ثالث خودرو، ثالث موتور و بدنهٔ خودرو را به FastAPI محلی می‌فرستند. Backend برای هر سایت یک آداپتور مستقل دارد و پاسخ تازهٔ همان درخواست را برمی‌گرداند. بدنهٔ موتور سابیم همچنان پیش‌نمایش دارد ولی درخواست زنده ندارد.

```text
frontend/labs/                         آزمایشگاه‌های HTML چهار سایت
frontend/labs/bimebazar-live.js        اتصال سه تب بیمه‌بازار و نمایش پیشنهادها
backend/app/adapters/azki/             قرارداد و کلاینت ازکی
backend/app/adapters/sabim/            قرارداد و کلاینت سابیم
backend/app/adapters/bimebazar/        قرارداد و کلاینت بیمه‌بازار
backend/app/routers/                   روتر مستقل هر سایت
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

در Windows PowerShell به‌جای `cp` می‌توان `Copy-Item .env.example .env` را اجرا کرد. اگر درخواست بدون احراز هویت جواب نداد، **مقدار کامل هدر `Authorization`** را در `backend/.env` زیر `AZKI_AUTHORIZATION` قرار دهید. این فایل در `.gitignore` است و به مرورگر فرستاده نمی‌شود. `Deviceid` با `AZKI_DEVICE_ID` قابل تغییر است. مقدار `Baggage` فقط در صورت نیاز با `AZKI_BAGGAGE` تنظیم می‌شود. توکن و Cookie نمونه داخل مخزن نیست.

سپس این نشانی‌ها را باز کنید:

- [آزمایشگاه ازکی](http://127.0.0.1:8000/labs/azki.html) — فرم ثالث خودرو/موتور و بدنهٔ خودرو و فراخوانی API از طریق Backend.
- [مستندات API](http://127.0.0.1:8000/docs)
- [آزمایشگاه سابیم](http://127.0.0.1:8000/labs/sabim.html) — ثالث خودرو، ثالث موتور و بدنهٔ خودرو به Backend وصل‌اند؛ بدنهٔ موتور فقط پیش‌نمایش Query دارد.
- [آزمایشگاه بیمه‌بازار](http://127.0.0.1:8000/labs/bimebazar.html) — ثالث خودرو، ثالث موتور و بدنهٔ خودرو به API محلی وصل‌اند؛ کارت‌ها از پاسخ زنده ساخته می‌شوند.
- [بیمه‌دات‌کام](http://127.0.0.1:8000/labs/bimeh.html) — آزمایشگاه تحقیق موجود، هنوز بدون اتصال به روتر پروژه.

صفحهٔ ازکی را از نشانی `127.0.0.1:8000/labs/azki.html` باز کنید، نه با دوبار کلیک روی فایل HTML. صفحه و API محلی در این حالت هم‌مبدأ هستند.

## قرارداد API فعلی

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

## آزمون

```bash
cd backend
python -m unittest discover -s tests -p 'test_contract.py' -v
uv run pytest -q
node ../frontend/tests/azki_lab_smoke.cjs
node ../frontend/tests/sabim_lab_smoke.cjs
node ../frontend/tests/bimebazar_lab_smoke.cjs
```

آزمون HTTP با پاسخ ساختگی فقط قرارداد Backend را می‌سنجد. آزمایش واقعی ازکی به دسترسی شبکه و هدر معتبر در محیط خودتان نیاز دارد. سپس برای هر سایت دیگر یک adapter و router مجزا می‌افزاییم؛ بعد فرم مشترک و ادغام نتایج را می‌سازیم.
