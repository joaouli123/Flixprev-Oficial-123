import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Facebook, Save, AlertTriangle } from "lucide-react";
import { neon } from "@/lib/neon";
import { toast } from "sonner";
import { useSession } from "@/components/SessionContextProvider";

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
      // 1. Buscar o ID da linha de configurações (deve ser apenas uma)
      const { data: existingSettings, error: fetchError } = await neon
        .from('app_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const updateData = {
        facebook_pixel_id: pixelId.trim() || null,
        facebook_capi_token: capiToken.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let result;

      if (existingSettings && existingSettings.length > 0) {
        // 2. Atualizar
        result = await neon
          .from('app_settings')
          .update(updateData)
          .eq('id', existingSettings[0].id)
          .execute();
      } else {
        // 3. Inserir se não existir
        result = await neon
          .from('app_settings')
          .insert(updateData)
          .execute();
      }

      if (result.error) {
        throw new Error(result.error.message);
      }

      toast.success("Configurações do Facebook salvas com sucesso!");
      onSettingsSaved(); // Notificar o pai para recarregar
    } catch (error: any) {
      toast.error("Erro ao salvar configurações: " + error.message);
      console.error("Erro ao salvar configurações do Facebook:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <CardHeader className="p-0 mb-4 flex flex-row items-center gap-3">
        <Facebook className="h-6 w-6 text-blue-600" />
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