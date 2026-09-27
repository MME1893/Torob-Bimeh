import { useEffect, useState } from "react";
import { getRecentInquiries, type RecentInquiry } from "./storage/inquiryHistory";

const number = new Intl.NumberFormat("fa-IR");

export function RecentInquiries() {
  const [items, setItems] = useState<RecentInquiry[]>([]);
  useEffect(() => {
    const load = () => getRecentInquiries(5).then(setItems).catch(() => setItems([]));
    void load();
    window.addEventListener("inquiry-history-changed", load);
    return () => window.removeEventListener("inquiry-history-changed", load);
  }, []);
  if (!items.length) return null;
  return (
    <section className="recent-inquiries" aria-labelledby="recent-title">
      <div className="recent-inquiries__head"><span>سابقه در همین مرورگر</span><h2 id="recent-title">آخرین استعلام‌ها</h2></div>
      <div className="recent-inquiries__list">
        {items.map((item) => (
          <a key={item.id} href={`/results/${encodeURIComponent(item.id)}`} className="recent-inquiry">
            <div><strong>{item.displayTitle}</strong><span>{number.format(item.offerCount)} پیشنهاد از {number.format(item.sourceCount)} منبع</span></div>
            <div><b>{item.lowestPrice == null ? "قیمت ثبت نشده" : `از ${number.format(item.lowestPrice)} تومان`}</b><small>{new Date(item.createdAt).toLocaleString("fa-IR")}</small></div>
            <span className="recent-inquiry__cta">مشاهده نتایج ←</span>
          </a>
        ))}
      </div>
    </section>
  );
}
