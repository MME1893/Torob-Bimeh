# ترب بیمه — آزمایشگاه اتصال API

این مخزن گام اول پروژهٔ مقایسهٔ بیمه است. فعلاً چهار HTML تحقیق در `frontend/labs` نگهداری می‌شوند و فرانت نهایی شروع نشده است. آزمایشگاه ازکی درخواست قیمت ثالث خودرو، ثالث موتور و بدنهٔ خودرو را از فرم می‌سازد و به FastAPI محلی می‌فرستد. FastAPI درخواست‌های GET ثالث و POST بدنه را با هدرهای سمت سرور به ازکی می‌زند و **پاسخ تازهٔ JSON همان درخواست** را برمی‌گرداند. کارت‌ها در HTML آزمایشگاه از روی این JSON ساخته می‌شوند. بدنهٔ موتور در آزمایشگاه انتخاب نمی‌شود و API آن پیاده نشده است.

```text
frontend/labs/              آزمایشگاه‌های HTML موجود برای چهار سایت
backend/app/routers/azki.py APIهای محلی POST /api/azki/prices/third و /api/azki/prices/body
backend/app/adapters/azki_contract.py  اعتبارسنجی URL و ساخت هدرهای ازکی
backend/app/adapters/azki.py           درخواست HTTP به ازکی
backend/tests/           آزمون قرارداد و پاسخ آزمایشی سرور
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
- [آزمایشگاه سابیم](http://127.0.0.1:8000/labs/sabim.html)، [بیمه‌بازار](http://127.0.0.1:8000/labs/bimebazar.html)، [بیمه‌دات‌کام](http://127.0.0.1:8000/labs/bimeh.html) — فایل‌های تحقیق موجود، هنوز بدون اتصال به روترهای پروژه.

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

## آزمون

```bash
cd backend
python -m unittest discover -s tests -p 'test_contract.py' -v
uv run pytest -q
node ../frontend/tests/azki_lab_smoke.cjs
```

آزمون HTTP با پاسخ ساختگی فقط قرارداد Backend را می‌سنجد. آزمایش واقعی ازکی به دسترسی شبکه و هدر معتبر در محیط خودتان نیاز دارد. سپس برای هر سایت دیگر یک adapter و router مجزا می‌افزاییم؛ بعد فرم مشترک و ادغام نتایج را می‌سازیم.
