import React, { useState } from "react";
import { Link } from "wouter";
import { 
  useListOrders,
  getListOrdersQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Filter, Eye, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRupiah, formatDate } from "@/lib/format";
import type { ListOrdersStatus } from "@workspace/api-client-react/src/generated/api.schemas";

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "pending": return "secondary";
    case "paid": return "default";
    case "processing": return "default";
    case "shipped": return "default";
    case "completed": return "outline";
    case "cancelled": return "destructive";
    default: return "outline";
  }
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Menunggu",
    paid: "Dibayar",
    processing: "Diproses",
    shipped: "Dikirim",
    completed: "Selesai",
    cancelled: "Dibatalkan"
  };
  return map[status] || status;
}

export default function PesananPage() {
  const [statusFilter, setStatusFilter] = useState<ListOrdersStatus | undefined>(undefined);
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = useListOrders({
    status: statusFilter
  });

  const filteredOrders = React.useMemo(() => {
    if (!orders) return [];
    if (!search) return orders;
    const lowerSearch = search.toLowerCase();
    return orders.filter(order => 
      order.orderCode.toLowerCase().includes(lowerSearch) ||
      (order.customerName && order.customerName.toLowerCase().includes(lowerSearch)) ||
      order.customerTelegramId.toLowerCase().includes(lowerSearch)
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daftar Pesanan</h1>
        <p className="text-muted-foreground mt-1">Pantau dan kelola pesanan masuk dari pelanggan Anda.</p>
      </div>

      <Card>
        <CardHeader className="py-4 flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari ID pesanan, nama..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={statusFilter || "all"}
              onValueChange={(val) => setStatusFilter(val === "all" ? undefined : val as ListOrdersStatus)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Menunggu</SelectItem>
                <SelectItem value="paid">Dibayar</SelectItem>
                <SelectItem value="processing">Diproses</SelectItem>
                <SelectItem value="shipped">Dikirim</SelectItem>
                <SelectItem value="completed">Selesai</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat data pesanan...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <ShoppingBag className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="font-semibold text-lg">Tidak ada pesanan</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1">
                Belum ada pesanan yang sesuai dengan filter pencarian Anda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Order ID</th>
                    <th className="px-6 py-4 font-medium">Tanggal</th>
                    <th className="px-6 py-4 font-medium">Pelanggan</th>
                    <th className="px-6 py-4 font-medium text-center">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Total</th>
                    <th className="px-6 py-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">
                        <Link href={`/pesanan/${order.id}`} className="hover:text-primary transition-colors">
                          #{order.orderCode}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="font-medium text-foreground">{formatDate(order.createdAt, false)}</div>
                        <div className="text-xs">{formatDate(order.createdAt, true).split(',')[1]}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{order.customerName || 'No Name'}</div>
                        <div className="text-xs text-muted-foreground">@{order.customerTelegramId}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-medium text-primary">{formatRupiah(order.totalCents)}</div>
                        <div className="text-xs text-muted-foreground">{order.itemCount} Item</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium">
                          <Link href={`/pesanan/${order.id}`}>
                            <Eye className="w-4 h-4 mr-1.5" /> Detail
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
