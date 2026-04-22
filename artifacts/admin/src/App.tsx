import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout/Layout";

// Pages
import Dashboard from "@/pages/dashboard";
import BotPage from "@/pages/bot";
import KategoriPage from "@/pages/kategori";
import ProdukPage from "@/pages/produk";
import PesananPage from "@/pages/pesanan";
import PesananDetailPage from "@/pages/pesanan/[id]";
import PelangganPage from "@/pages/pelanggan";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/bot" component={BotPage} />
        <Route path="/kategori" component={KategoriPage} />
        <Route path="/produk" component={ProdukPage} />
        <Route path="/pesanan" component={PesananPage} />
        <Route path="/pesanan/:id" component={PesananDetailPage} />
        <Route path="/pelanggan" component={PelangganPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

