import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingCart,
  Users,
  Bot,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Beranda", href: "/", icon: LayoutDashboard },
  { name: "Pesanan", href: "/pesanan", icon: ShoppingCart },
  { name: "Produk", href: "/produk", icon: Package },
  { name: "Kategori", href: "/kategori", icon: Tags },
  { name: "Pelanggan", href: "/pelanggan", icon: Users },
  { name: "Pengaturan Bot", href: "/bot", icon: Bot },
];

export function Sidebar() {
  const [location] = useLocation();

  const isCurrent = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  return (
    <aside className="w-64 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col hidden md:flex">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <Store className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-sidebar-foreground tracking-tight">
            TokoKu Admin
          </h1>
          <p className="text-xs text-muted-foreground">Panel Penjual Telegram</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
          Menu Utama
        </div>
        {navigation.map((item) => {
          const active = isCurrent(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors group",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5",
                  active
                    ? "text-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70"
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
            T
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">TokoKu Official</p>
            <p className="text-xs text-muted-foreground truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
