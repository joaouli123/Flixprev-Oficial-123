import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, Linkedin, MessageCircle, Share2 } from "lucide-react";
import { showAssertiveDone, showAssertiveSent } from "@/lib/brandFeedback";
import { trackPlatformEvent } from "@/lib/platformEvents";

type ShareActionsProps = {
  userId?: string | null;
  shareUrl: string;
  shareTitle: string;
  shareText: string;
  eventBaseName: string;
  compact?: boolean;
};

const encodeShareText = (text: string, url: string) => `${text}\n\n${url}`.trim();

export const ShareActions: React.FC<ShareActionsProps> = ({
  userId,
  shareUrl,
  shareTitle,
  shareText,
  eventBaseName,
  compact = false,
}) => {
  const canUseNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    showAssertiveDone("Feito", "Link copiado por Assertive Mind.");
    void trackPlatformEvent({
      userId,
      action: `${eventBaseName}_copy`,
      label: shareTitle,
      channel: "copy",
      metadata: { url: shareUrl },
    });
  };

  const handleWhatsApp = () => {
    const text = encodeShareText(shareText, shareUrl);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    showAssertiveSent("Enviado", "Compartilhado no WhatsApp com Powered by Assertive Mind.");
    void trackPlatformEvent({
      userId,
      action: `${eventBaseName}_share`,
      label: shareTitle,
      channel: "whatsapp",
      metadata: { url: shareUrl },
    });
  };

  const handleLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener,noreferrer");
    showAssertiveSent("Enviado", "Compartilhado no LinkedIn com Powered by Assertive Mind.");
    void trackPlatformEvent({
      userId,
      action: `${eventBaseName}_share`,
      label: shareTitle,
      channel: "linkedin",
      metadata: { url: shareUrl },
    });
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare) {
      await handleCopy();
      return;
    }

    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });

      showAssertiveSent("Enviado", "Compartilhado com Powered by Assertive Mind.");
      void trackPlatformEvent({
        userId,
        action: `${eventBaseName}_share`,
        label: shareTitle,
        channel: "native_share",
        metadata: { url: shareUrl },
      });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!aborted) {
        await handleCopy();
      }
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "justify-end" : ""}`}>
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => void handleNativeShare()} title="Compartilhar">
        <Share2 className="md:mr-2 h-4 w-4" />
        <span className="hidden md:inline">Compartilhar</span>
      </Button>
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={handleWhatsApp} title="WhatsApp">
        <MessageCircle className="md:mr-2 h-4 w-4" />
        <span className="hidden md:inline">WhatsApp</span>
      </Button>
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={handleLinkedIn} title="LinkedIn">
        <Linkedin className="md:mr-2 h-4 w-4" />
        <span className="hidden md:inline">LinkedIn</span>
      </Button>
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => void handleCopy()} title="Copiar">
        <Copy className="md:mr-2 h-4 w-4" />
        <span className="hidden md:inline">Copiar</span>
      </Button>
    </div>
  );
};
