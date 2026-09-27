import logoCatalog from "./assest/All_company_logos.json";

type LogoCompany = { Title: string; LogoUrl: string };

const normalize = (value: string) =>
  value
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^بیمه\s+/, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim();

const repairUtf8 = (value: string) => {
  if (!/[ØÙÚÛ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
};

const companies = (logoCatalog as { Companies: LogoCompany[] }).Companies;

export function resolveInsurerLogo(insurerName: string): string | null {
  const wanted = normalize(insurerName);
  const match = companies.find((company) => {
    const title = normalize(repairUtf8(company.Title));
    return title === wanted || title.includes(wanted) || wanted.includes(title);
  });
  return match?.LogoUrl ?? null;
}
