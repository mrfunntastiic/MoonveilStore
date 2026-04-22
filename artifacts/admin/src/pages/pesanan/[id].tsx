import React from "react";
import { useParams, Link } from "wouter";
import { 
  useGetOrder, 
  useUpdateOrderStatus,
  getGetOrderQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah, formatDate } from "@/lib/format";
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  CreditCard, 
  Clock,
  Package,
  CheckCircle2,
  XCircle,
  Truck,
  Loader2
} from "lucide-react";
import type { OrderStatusInputStatus } from "@workspace/api-client-react/src/generated/api.schemas";

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Menunggu Pembayaran",
    paid: "Sudah Dibayar",
    processing: "Sedang Diproses",
    shipped: "Sedang Dikirim",
    completed: "Selesai",
    cancelled: "Dibatalkan"
  };
  return map[status] || status;
}

export default function PesananDetailPage() {
  const params = useParams();
  const orderId = params.id ? parseInt(params.id, 10) : null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: order, isLoading } = useGetOrder(orderId!, {
    query: {
      enabled: !!orderId,
      queryKey: getGetOrderQueryKey(orderId!)
    }
  });

  const updateStatusMutation = useUpdateOrderStatus();

  const handleUpdateStatus = (newStatus: OrderStatusInputStatus) => {
    if (!orderId) return;
    updateStatusMutation.mutate(
      { id: orderId, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
          toast({ title: "Status Pesanan Diperbarui", description: `Status diubah menjadi ${getStatusLabel(newStatus)}` });
        },
        onError: () => toast({ title: "Gagal", description: "Terjadi kesalahan saat memperbarui status", variant: "destructive" })
      }
    );
  };

  if (!orderId || isNaN(orderId)) {
    return <div className="p-8 text-center text-destructive">Invalid Order ID</div>;
  }

  if (isLoading || !order) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon" className="h-8 w-8 rounded-full">
          <Link href="/pesanan"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            Pesanan #{order.orderCode}
            <Badge variant="outline" className="text-sm font-normal ml-2">
              {getStatusLabel(order.status)}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Dibuat pada {formatDate(order.createdAt, true)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="py-4 border-b border-border bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Rincian Produk
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {order.items.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center border border-border">
                        <Package className="h-6 w-6 text-muted-foreground opacity-50" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{item.productName}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {formatRupiah(item.unitPriceCents)} x {item.quantity}
                        </div>
                      </div>
                    </div>
                    <div className="font-medium">{formatRupiah(item.subtotalCents)}</div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-muted/10 border-t border-border">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span>Total Tagihan</span>
                  <span className="text-primary">{formatRupiah(order.totalCents)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tindakan Status (Action Panel) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tindakan Pesanan</CardTitle>
              <CardDescription>Ubah status pesanan untuk memberitahu pelanggan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {order.status === "pending" && (
                  <Button 
                    onClick={() => handleUpdateStatus("paid")} 
                    disabled={updateStatusMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Tandai Dibayar
                  </Button>
                )}
                {(order.status === "paid" || order.status === "pending") && (
                  <Button 
                    onClick={() => handleUpdateStatus("processing")} 
                    disabled={updateStatusMutation.isPending}
                  >
                    Proses Pesanan
                  </Button>
                )}
                {order.status === "processing" && (
                  <Button 
                    onClick={() => handleUpdateStatus("shipped")} 
                    disabled={updateStatusMutation.isPending}
                  >
                    <Truck className="h-4 w-4 mr-2" /> Kirim Pesanan
                  </Button>
                )}
                {order.status === "shipped" && (
                  <Button 
                    onClick={() => handleUpdateStatus("completed")} 
                    disabled={updateStatusMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Selesaikan
                  </Button>
                )}
                {order.status !== "completed" && order.status !== "cancelled" && (
                  <Button 
                    variant="destructive"
                    onClick={() => handleUpdateStatus("cancelled")} 
                    disabled={updateStatusMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Batalkan
                  </Button>
                )}
                {order.status === "completed" && (
                  <div className="text-sm font-medium text-green-600 flex items-center bg-green-500/10 px-3 py-2 rounded-md">
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Pesanan telah selesai
                  </div>
                )}
                {order.status === "cancelled" && (
                  <div className="text-sm font-medium text-destructive flex items-center bg-destructive/10 px-3 py-2 rounded-md">
                    <XCircle className="h-4 w-4 mr-2" /> Pesanan dibatalkan
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="py-4 border-b border-border bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Info Pelanggan
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Nama / Telegram</div>
                <div className="font-medium text-sm">
                  {order.customerName || "Tidak ada nama"} 
                  <span className="font-normal text-muted-foreground block">@{order.customerTelegramId}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4 border-b border-border bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Pengiriman
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Alamat Tujuan</div>
                <div className="text-sm bg-muted/50 p-3 rounded border border-border whitespace-pre-line leading-relaxed">
                  {order.shippingAddress || "Alamat tidak disertakan"}
                </div>
              </div>
              {order.notes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Catatan Pembeli</div>
                  <div className="text-sm bg-amber-500/10 text-amber-900 dark:text-amber-200 p-3 rounded border border-amber-500/20 italic">
                    "{order.notes}"
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4 border-b border-border bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" /> Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="text-xs text-muted-foreground">Metode</div>
                <div className="text-sm font-semibold uppercase">{order.paymentMethod || "MANUAL"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
