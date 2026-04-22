export function formatRupiah(cents: number): string {
  const rupiah = Math.round(cents / 100);
  return "Rp " + rupiah.toLocaleString("id-ID");
}

export function generateOrderCode(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${ymd}-${rand}`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Menunggu Pembayaran",
    paid: "Sudah Dibayar",
    processing: "Diproses",
    shipped: "Dikirim",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };
  return map[status] ?? status;
}
