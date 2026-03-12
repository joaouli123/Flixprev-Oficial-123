import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard } from "lucide-react";

interface SubscriptionExpiredDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export const SubscriptionExpiredDialog: React.FC<SubscriptionExpiredDialogProps> = ({
  isOpen,
  onClose,
  userEmail
}) => {
  const handleBuyAgain = () => {
    window.open('https://pay.cakto.com.br/33b5sor', '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Assinatura Cancelada
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2">
            Sua assinatura foi cancelada e você não tem mais acesso à plataforma.
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-6 space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <CreditCard className="h-5 w-5 text-indigo-600 mt-0.5" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-indigo-800">
                  Mantenha seus dados salvos
                </h3>
                <p className="text-sm text-indigo-700 mt-1">
                  Para manter todos os seus dados e configurações, use o mesmo email ({userEmail}) ao fazer uma nova compra.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleBuyAgain}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Comprar Novamente
            </Button>
            
            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full"
            >
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
