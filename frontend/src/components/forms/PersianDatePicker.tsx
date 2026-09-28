import { useRef } from "react";
import DatePicker, {
  type DateObject,
  type DatePickerRef,
} from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";
import "./persian-date-picker.css";

const PERSIAN_DATE_FORMAT = "YYYY/MM/DD";

export const normalizePersianDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (character) => String(character.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (character) => String(character.charCodeAt(0) - 1632));

export const normalizePersianDate = (value: string) =>
  normalizePersianDigits(value)
    .trim()
    .replace(/-/g, "/");

export const isValidPersianDate = (value: string) => {
  const normalized = normalizePersianDate(value);
  if (!/^(13|14)\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(normalized))
    return false;

  const [, month, day] = normalized.split("/").map(Number);
  return day <= (month <= 6 ? 31 : 30);
};

type PersianDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  name?: string;
};

export function PersianDatePicker({
  value,
  onChange,
  placeholder = "۱۴۰۵/۰۷/۰۱",
  disabled = false,
  error = false,
  name,
}: PersianDatePickerProps) {
  const pickerRef = useRef<DatePickerRef | null>(null);

  const handleChange = (date: DateObject | null) => {
    onChange(date ? normalizePersianDate(date.format(PERSIAN_DATE_FORMAT)) : "");
    if (date) window.setTimeout(() => pickerRef.current?.closeCalendar(), 0);
  };

  return (
    <DatePicker
      ref={pickerRef}
      value={value || undefined}
      onChange={handleChange}
      calendar={persian}
      locale={persianFa}
      format={PERSIAN_DATE_FORMAT}
      calendarPosition="bottom-right"
      className="torob-persian-calendar"
      containerClassName={`persian-date-picker${error ? " is-invalid" : ""}`}
      inputClass="persian-date-picker__input"
      name={name}
      placeholder={placeholder}
      disabled={disabled}
      editable={false}
      inputMode="none"
      onOpenPickNewDate={false}
      arrow={false}
      title={error ? "تاریخ انتخاب‌شده معتبر نیست" : undefined}
    />
  );
}
