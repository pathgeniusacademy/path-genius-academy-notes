export function normalizeWhatsAppNumber(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsAppUrl(number?: string | null, message?: string) {
  const normalized = normalizeWhatsAppNumber(number);
  if (!normalized) return "";
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normalized}${text}`;
}
