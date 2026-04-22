import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

export function formatRupiah(cents: number): string {
  const rupiah = cents / 100;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupiah);
}

export function formatDate(dateString: string, includeTime = false): string {
  const date = typeof dateString === "string" ? parseISO(dateString) : dateString;
  const formatStr = includeTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy";
  return format(date, formatStr, { locale: id });
}
