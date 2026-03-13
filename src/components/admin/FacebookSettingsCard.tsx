import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Facebook, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/SessionContextProvider";
import { buildApiUrl } from "@/lib/api";

interface FacebookSettings {
  facebook_pixel_id: string | null;
  facebook_capi_token: string | null;
}

interface FacebookSettingsCardProps {
  initialSettings: FacebookSettings | null;
  onSettingsSaved: () => void;
}

const FacebookSettingsCard: React.FC<FacebookSettingsCardProps> = ({ initialSettings, onSettingsSaved }) => {
  const { session } = useSession();
  const [pixelId, setPixelId] = useState(initialSettings?.facebook_pixel_id || "");
  const [capiToken, setCapiToken] = useState(initialSettings?.facebook_capi_token || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setPixelId(initialSettings.facebook_pixel_id || "");
      setCapiToken(initialSettings.facebook_capi_token || "");
    }
  }, [initialSettings]);

  const handleSave = async () => {
    if (!session?.user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }

    setIsSaving(true);
    
    try {
      const response = await fetch(buildApiUrl('/api/admin/app-settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': session.user.id,
        },
        body: JSON.stringify({
          facebook_pixel_id: pixelId.trim() || null,
          facebook_capi_token: capiToken.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      toast.success("Configurações do Facebook salvas com sucesso!");
      onSettingsSaved(); // Notificar o pai para recarregar
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao salvar configurações.";
      toast.error("Erro ao salvar configurações: " + message);
      console.error("Erro ao salvar configurações do Facebook:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <CardHeader className="p-0 mb-4 flex flex-row items-center gap-3">
        <Facebook className="h-6 w-6 text-indigo-600" />
        <div>
          <CardTitle className="text-2xl font-semibold">Configurações de Marketing (Facebook)</CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure o Pixel ID e o Access Token para a API de Conversão (CAPI).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <div className="space-y-2">
          <Label htmlFor="pixelId">Facebook Pixel ID</Label>
          <Input
            id="pixelId"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="Ex: 123456789012345"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capiToken">Access Token da API de Conversão (CAPI)</Label>
          <Input
            id="capiToken"
            type="password"
            value={capiToken}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder="EAA..."
          />
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Este token é sensível e deve ser mantido em segredo.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="w-full md:w-auto">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Salvando..." : "Salvar Configurações do Facebook"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FacebookSettingsCard;
