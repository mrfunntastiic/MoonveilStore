import React from "react";
import { Link } from "wouter";
import { useGetDashboardSummary, useGetSalesTrend, useGetTopProducts, useGetRecentOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah, formatDate } from "@/lib/format";
import { DollarSign, ShoppingBag, Users, ShoppingCart, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: salesTrend, isLoading: isLoadingTrend } = useGetSalesTrend();
  const { data: topProducts, isLoading: isLoadingTopProducts } = useGetTopProducts();
  const { data: recentOrders, isLoading: isLoadingRecent } = useGetRecentOrders();

  const formattedTrend = React.useMemo(() => {
    if (!salesTrend) return [];
    return salesTrend.map(point => ({
      ...point,
      dateFormatted: formatDate(point.date),
      revenue: point.revenueCents / 100
    }));
  }, [salesTrend]);

  if (isLoadingSummary) {
    return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ringkasan Beranda</h1>
        <p className="text-muted-foreground mt-1">Pantau performa toko Telegram Anda hari ini.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pendapatan</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary ? formatRupiah(summary.totalRevenueCents) : "Rp 0"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              + {summary ? formatRupiah(summary.revenueTodayCents) : "Rp 0"} hari ini
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pesanan</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.pendingOrders || 0} menunggu diproses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pelanggan</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total pelanggan terdaftar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produk Aktif</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeProducts || 0} / {summary?.totalProducts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produk tersedia untuk dijual
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Sales Trend Chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Tren Penjualan (14 Hari)</CardTitle>
            <CardDescription>Pendapatan harian dari pesanan selesai</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingTrend ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">Memuat data...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedTrend} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="dateFormatted" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    minTickGap={30}
                  />
                  <YAxis 
                    tickFormatter={(value) => `Rp${value / 1000}k`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`Rp ${new Intl.NumberFormat('id-ID').format(value)}`, "Pendapatan"]}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} 
                    activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Produk Terlaris</CardTitle>
            <CardDescription>Berdasarkan unit terjual</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTopProducts ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Memuat...</div>
            ) : !topProducts?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Belum ada penjualan.</div>
            ) : (
              <div className="space-y-6">
                {topProducts.map((product, i) => (
                  <div key={product.productId} className="flex items-center">
                    <div className="w-8 h-8 rounded bg-primary/10 text-primary font-bold flex items-center justify-center mr-4 text-sm">
                      {i + 1}
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate">{product.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.unitsSold} terjual
                      </p>
                    </div>
                    <div className="font-medium text-sm ml-4 whitespace-nowrap">
                      {formatRupiah(product.revenueCents)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pesanan Terbaru</CardTitle>
            <CardDescription>Pesanan terakhir yang masuk ke toko Anda.</CardDescription>
          </div>
          <Link href="/pesanan" className="text-sm text-primary hover:underline flex items-center gap-1 font-medium">
            Lihat Semua <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {isLoadingRecent ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Memuat...</div>
          ) : !recentOrders?.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Belum ada pesanan masuk.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-tl-md">Order ID</th>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Pelanggan</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right rounded-tr-md">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/pesanan/${order.id}`} className="text-primary hover:underline">
                          #{order.orderCode}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(order.createdAt, true)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-[150px]">{order.customerName || 'No Name'}</div>
                        <div className="text-xs text-muted-foreground">@{order.customerTelegramId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatRupiah(order.totalCents)}</td>
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
