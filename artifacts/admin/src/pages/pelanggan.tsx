import React, { useState } from "react";
import { useListCustomers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, ExternalLink } from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/format";

export default function PelangganPage() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useListCustomers();

  const filteredCustomers = React.useMemo(() => {
    if (!customers) return [];
    if (!search) return customers;
    const lowerSearch = search.toLowerCase();
    return customers.filter(c => 
      (c.username && c.username.toLowerCase().includes(lowerSearch)) ||
      c.telegramId.toLowerCase().includes(lowerSearch) ||
      (c.firstName && c.firstName.toLowerCase().includes(lowerSearch))
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daftar Pelanggan</h1>
        <p className="text-muted-foreground mt-1">Data pengguna Telegram yang berinteraksi dengan bot toko Anda.</p>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari username, ID telegram, nama..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat data pelanggan...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="font-semibold text-lg">Tidak ada pelanggan</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1">
                Belum ada pengguna yang cocok dengan kriteria pencarian Anda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Pengguna</th>
                    <th className="px-6 py-4 font-medium">Telegram ID</th>
                    <th className="px-6 py-4 font-medium text-center">Jml Pesanan</th>
                    <th className="px-6 py-4 font-medium text-right">Total Belanja</th>
                    <th className="px-6 py-4 font-medium text-right">Bergabung</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                            {(customer.firstName?.[0] || customer.username?.[0] || 'U')}
                          </div>
                          <div>
                            {customer.firstName} {customer.lastName}
                            <div className="text-xs text-muted-foreground hover:text-primary transition-colors">
                              {customer.username ? (
                                <a href={`https://t.me/${customer.username}`} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                                  @{customer.username} <ExternalLink className="h-2 w-2" />
                                </a>
                              ) : "Tanpa Username"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                        {customer.telegramId}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary/10 text-secondary-foreground font-medium text-xs">
                          {customer.orderCount}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-primary">
                        {formatRupiah(customer.totalSpentCents)}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground">
                        {formatDate(customer.createdAt)}
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
