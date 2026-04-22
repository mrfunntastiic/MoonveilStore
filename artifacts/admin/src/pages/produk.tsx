import React, { useState } from "react";
import { Link } from "wouter";
import { 
  useListProducts, 
  useCreateProduct, 
  useUpdateProduct, 
  useDeleteProduct,
  useListCategories,
  getListProductsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatRupiah } from "@/lib/format";
import { Plus, Pencil, Trash2, Search, Filter, ImageIcon, Check, X, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDebounce } from "@/hooks/use-debounce"; // We'll create this inline if needed or assume standard implementation

const productSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter").max(100, "Nama maksimal 100 karakter"),
  description: z.string().max(2000, "Deskripsi terlalu panjang").optional().default(""),
  priceCents: z.coerce.number().min(0, "Harga tidak valid"),
  stock: z.coerce.number().min(0, "Stok tidak valid"),
  categoryId: z.coerce.number().nullable().optional(),
  imageUrl: z.string().url("URL gambar tidak valid").nullable().optional().or(z.literal("")),
  digitalFileUrl: z.string().nullable().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProdukPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [searchInput, setSearchInput] = useState("");
  // Simple debounce logic to avoid external dependency if not present
  const [search, setSearch] = useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [categoryIdFilter, setCategoryIdFilter] = useState<number | undefined>(undefined);
  
  const { data: categories } = useListCategories();
  const { data: products, isLoading } = useListProducts({ 
    search: search || undefined, 
    categoryId: categoryIdFilter 
  });
  
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      priceCents: 0,
      stock: 0,
      categoryId: null,
      imageUrl: "",
      digitalFileUrl: "",
      active: true,
    },
  });

  const handleOpenCreate = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      description: "",
      priceCents: 0,
      stock: 10,
      categoryId: null,
      imageUrl: "",
      digitalFileUrl: "",
      active: true,
    });
    setIsSheetOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      description: product.description || "",
      priceCents: product.priceCents,
      stock: product.stock,
      categoryId: product.categoryId || null,
      imageUrl: product.imageUrl || "",
      digitalFileUrl: (product as any).digitalFileUrl || "",
      active: product.active,
    });
    setIsSheetOpen(true);
  };

  const handleOpenDelete = (id: number) => {
    setProductToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const onSubmit = (data: ProductFormValues) => {
    // Process empty string to null for optional fields
    const processedData = {
      ...data,
      categoryId: data.categoryId === 0 ? null : data.categoryId,
      imageUrl: data.imageUrl === "" ? null : data.imageUrl,
      digitalFileUrl: data.digitalFileUrl === "" ? null : data.digitalFileUrl,
    };

    if (editingProduct) {
      updateMutation.mutate(
        { id: editingProduct.id, data: processedData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            toast({ title: "Produk Berhasil Diperbarui" });
            setIsSheetOpen(false);
          },
          onError: () => toast({ title: "Gagal Memperbarui Produk", variant: "destructive" })
        }
      );
    } else {
      createMutation.mutate(
        { data: processedData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            toast({ title: "Produk Berhasil Ditambahkan" });
            setIsSheetOpen(false);
          },
          onError: () => toast({ title: "Gagal Menambahkan Produk", variant: "destructive" })
        }
      );
    }
  };

  const confirmDelete = () => {
    if (!productToDelete) return;
    deleteMutation.mutate(
      { id: productToDelete },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          toast({ title: "Produk Berhasil Dihapus" });
          setIsDeleteDialogOpen(false);
        },
        onError: () => toast({ title: "Gagal Menghapus Produk", variant: "destructive" })
      }
    );
  };

  // Convert Rp input to cents for the form
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    if (value === "") {
      form.setValue("priceCents", 0);
    } else {
      form.setValue("priceCents", parseInt(value, 10) * 100);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Katalog Produk</h1>
          <p className="text-muted-foreground mt-1">Kelola barang yang Anda jual di toko Telegram.</p>
        </div>
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Tambah Produk
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari nama produk..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={categoryIdFilter?.toString() || "all"}
              onValueChange={(val) => setCategoryIdFilter(val === "all" ? undefined : parseInt(val))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.emoji} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat katalog...</div>
          ) : products?.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="font-semibold text-lg">Tidak ada produk</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-1 mb-4">
                {search || categoryIdFilter 
                  ? "Tidak ada produk yang sesuai dengan filter pencarian Anda." 
                  : "Mulai berjualan dengan menambahkan produk pertama Anda ke katalog."}
              </p>
              {!(search || categoryIdFilter) && (
                <Button onClick={handleOpenCreate} variant="outline">
                  Tambah Produk Pertama
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium w-[80px]">Foto</th>
                    <th className="px-6 py-4 font-medium">Informasi Produk</th>
                    <th className="px-6 py-4 font-medium text-right">Harga</th>
                    <th className="px-6 py-4 font-medium text-center">Stok</th>
                    <th className="px-6 py-4 font-medium text-center">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products?.map((product) => (
                    <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="w-12 h-12 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground opacity-30" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground mb-1">{product.name}</div>
                        {product.categoryName && (
                          <span className="text-xs text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                            {product.categoryName}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {formatRupiah(product.priceCents)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={product.stock > 0 ? "secondary" : "destructive"}>
                          {product.stock}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {product.active ? (
                          <span className="inline-flex items-center text-xs font-medium text-green-600 bg-green-500/10 px-2 py-1 rounded-full">
                            <Check className="w-3 h-3 mr-1" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            <X className="w-3 h-3 mr-1" /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Menu aksi</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(product)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit Produk
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleOpenDelete(product.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE/EDIT SHEET */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-md w-[90vw] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingProduct ? "Edit Produk" : "Tambah Produk Baru"}</SheetTitle>
            <SheetDescription>
              Isi detail produk yang akan ditawarkan di Telegram bot Anda.
            </SheetDescription>
          </SheetHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Produk *</FormLabel>
                    <FormControl>
                      <Input placeholder="Contoh: Kopi Susu Aren" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "0" ? null : parseInt(val))} 
                      value={field.value?.toString() || "0"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Kategori" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Tanpa Kategori</SelectItem>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.emoji} {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priceCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Harga (Rp) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">Rp</span>
                          <Input 
                            className="pl-8" 
                            type="text"
                            inputMode="numeric"
                            value={field.value > 0 ? (field.value / 100).toString() : ""} 
                            onChange={handlePriceChange} 
                            placeholder="25000"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stok Awal *</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deskripsi Lengkap</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Jelaskan detail, ukuran, bahan, dll." 
                        className="resize-none min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Gambar (Opsional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/image.jpg" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Link langsung ke gambar produk.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="digitalFileUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link File Produk Digital</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://drive.google.com/... atau https://..."
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Link unduhan (Google Drive, Dropbox, dll). Otomatis dikirim ke pembeli saat status pesanan diubah ke "Dikirim" atau "Selesai".
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Produk Aktif</FormLabel>
                      <FormDescription>
                        Produk yang tidak aktif disembunyikan dari bot Telegram.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <SheetFooter className="pt-6">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full">
                  {createMutation.isPending || updateMutation.isPending ? "Menyimpan..." : "Simpan Produk"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Produk Ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Produk akan dihapus secara permanen dari katalog Anda dan tidak lagi muncul di Telegram bot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
