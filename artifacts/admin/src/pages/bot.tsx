import React from "react";
import { useGetBotInfo, useBroadcastMessage, getGetBotInfoQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Bot, Send, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

const broadcastSchema = z.object({
  message: z.string().min(5, "Pesan minimal 5 karakter").max(4000, "Pesan maksimal 4000 karakter"),
});

type BroadcastFormValues = z.infer<typeof broadcastSchema>;

export default function BotPage() {
  const { data: botInfo, isLoading } = useGetBotInfo();
  const broadcastMutation = useBroadcastMessage();
  const { toast } = useToast();

  const form = useForm<BroadcastFormValues>({
    resolver: zodResolver(broadcastSchema),
    defaultValues: {
      message: "",
    },
  });

  const onSubmit = (data: BroadcastFormValues) => {
    broadcastMutation.mutate({ data: { message: data.message } }, {
      onSuccess: (result) => {
        toast({
          title: "Pesan Siaran Berhasil Terkirim",
          description: `Berhasil mengirim ke ${result.sent} pelanggan. Gagal: ${result.failed}`,
        });
        form.reset();
      },
      onError: () => {
        toast({
          title: "Gagal Mengirim Siaran",
          description: "Terjadi kesalahan saat mengirim pesan broadcast. Coba lagi.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Bot</h1>
        <p className="text-muted-foreground mt-1">Kelola bot Telegram toko Anda dan kirim pesan massal.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Status Bot
            </CardTitle>
            <CardDescription>Informasi koneksi bot Telegram Anda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              {botInfo?.connected ? (
                <Badge variant="default" className="bg-green-500 hover:bg-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Terhubung
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Terputus
                </Badge>
              )}
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Username</span>
              <span className="text-sm font-medium">@{botInfo?.username || "-"}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">Nama Bot</span>
              <span className="text-sm font-medium">{botInfo?.firstName || "-"}</span>
            </div>
          </CardContent>
          <CardFooter>
            {botInfo?.link && (
              <Button asChild variant="outline" className="w-full">
                <a href={botInfo.link} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                  Buka di Telegram <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Siaran Pesan (Broadcast)
            </CardTitle>
            <CardDescription>Kirim pesan massal ke semua pelanggan yang pernah berinteraksi dengan bot.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pesan</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ketik pesan promosi atau pengumuman Anda di sini..." 
                          className="min-h-[150px] resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Pesan akan dikirim secara berurutan. Harap hindari spam berlebihan.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  disabled={broadcastMutation.isPending || !botInfo?.connected} 
                  className="w-full"
                >
                  {broadcastMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Mengirim...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="h-4 w-4" /> Kirim Siaran Sekarang
                    </span>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
