export function fmt(n, currency = "RUB") {
  const num = Math.abs(n || 0);
  const formatted = num.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  if (currency === "USD") return `$${formatted}`;
  if (currency === "EUR") return `€${formatted}`;
  if (currency === "CNY") return `¥${formatted}`;
  if (currency === "GBP") return `£${formatted}`;
  return `${formatted} ₽`;
}

export function fmtRub(n, usdRate = 90) {
  return fmt(n);
}

export function toRub(amount, currency, usdRate = 90) {
  if (currency === "USD") return amount * usdRate;
  if (currency === "EUR") return amount * usdRate * 1.08;
  if (currency === "GBP") return amount * usdRate * 1.27;
  if (currency === "CNY") return amount * (usdRate / 7.3);
  return amount;
}

export function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function fmtDateFull(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target - today) / 86400000);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function prevMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function nextMonth(year, month) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

export function groupByDate(transactions) {
  const groups = {};
  for (const tx of transactions) {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push(tx);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}
