export function formatNumber(n) {
  const num = Number(n);
  if (n === null || n === undefined || n === "") return "—";
  if (!Number.isFinite(num)) return String(n ?? "—");
  return num.toLocaleString("en-US");
}
export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
export function pad2(n) {
  return String(n).padStart(2, "0");
}
export function localISODate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
export function toLocalDateTimeWithOffset(dtLocalValue) {
  const base = dtLocalValue.length === 16 ? `${dtLocalValue}:00` : dtLocalValue;
  const offMin = -new Date().getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${base}${sign}${hh}:${mm}`;
}
export function nowLocalWithOffset() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}${sign}${oh}:${om}`;
}