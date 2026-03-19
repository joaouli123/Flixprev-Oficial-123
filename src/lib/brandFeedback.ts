import { toast } from "sonner";

export const showAssertiveDone = (message = "Feito", description = "Ação concluída por Assertive Mind.") => {
  toast.success(message, { description });
};

export const showAssertiveSent = (message = "Enviado", description = "Conteúdo enviado com Powered by Assertive Mind.") => {
  toast.success(message, { description });
};
