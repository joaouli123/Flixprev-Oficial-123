import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X, Settings, Check, Shield } from 'lucide-react';

interface CookieConsentProps {
  onAccept?: () => void;
  onDecline?: () => void;
}

const CookieConsent: React.FC<CookieConsentProps> = ({ onAccept, onDecline }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true, // Always true, cannot be disabled
    analytics: false,
    marketing: false,
    functional: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const cookieConsent = localStorage.getItem('cookieConsent');
    if (!cookieConsent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      marketing: true,
      functional: true,
    };
    
    localStorage.setItem('cookieConsent', JSON.stringify({
      timestamp: new Date().toISOString(),
      preferences: allAccepted,
      version: '1.0'
    }));
    
    setIsVisible(false);
    onAccept?.();
  };

  const handleDeclineAll = () => {
    const essentialOnly = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    
    localStorage.setItem('cookieConsent', JSON.stringify({
      timestamp: new Date().toISOString(),
      preferences: essentialOnly,
      version: '1.0'
    }));
    
    setIsVisible(false);
    onDecline?.();
  };

  const handleSavePreferences = () => {
    localStorage.setItem('cookieConsent', JSON.stringify({
      timestamp: new Date().toISOString(),
      preferences,
      version: '1.0'
    }));
    
    setIsVisible(false);
    setShowSettings(false);
    
    // Call appropriate callback based on preferences
    const hasOptionalCookies = preferences.analytics || preferences.marketing || preferences.functional;
    if (hasOptionalCookies) {
      onAccept?.();
    } else {
      onDecline?.();
    }
  };

  const handlePreferenceChange = (type: keyof typeof preferences) => {
    if (type === 'essential') return; // Essential cookies cannot be disabled
    
    setPreferences(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      {/* Cookie Banner */}
      <div className="relative w-full max-w-md bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-xl pointer-events-auto">
        {!showSettings ? (
          // Main Banner
          <div className="p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <Cookie className="w-5 h-5 text-amber-400 mt-0.5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white mb-2">
                  Cookies e Privacidade
                </h3>
                
                <p className="text-slate-300 text-xs leading-relaxed mb-3">
                  Utilizamos cookies para melhorar sua experiência. Você pode aceitar todos ou personalizar suas preferências.
                </p>
                
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleAcceptAll}
                      className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                    >
                      Aceitar
                    </button>
                    
                    <button
                      onClick={handleDeclineAll}
                      className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs font-medium transition-colors"
                    >
                      Essenciais
                    </button>
                  </div>
                  
                  <button
                    onClick={() => setShowSettings(true)}
                    className="w-full px-3 py-1.5 bg-transparent border border-slate-500 hover:border-slate-400 text-slate-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center justify-center space-x-1"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Personalizar</span>
                  </button>
                </div>
                
                <div className="mt-2 text-xs text-slate-400">
                  <Link to="/cookie-policy" className="text-blue-400 hover:text-blue-300 underline">
                    Política de Cookies
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Settings Panel
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center">
                <Settings className="w-4 h-4 mr-2 text-blue-400" />
                Configurações
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3 mb-4">
              {/* Essential Cookies */}
              <div className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                <div className="flex-1">
                  <h4 className="text-xs font-medium text-white">Essenciais</h4>
                  <p className="text-xs text-slate-400">Necessários para funcionamento</p>
                </div>
                <div className="ml-2">
                  <div className="w-8 h-4 bg-green-600 rounded-full flex items-center justify-end px-0.5">
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>
              
              {/* Analytics Cookies */}
              <div className="flex items-center justify-between p-2 bg-slate-700/30 rounded">
                <div className="flex-1">
                  <h4 className="text-xs font-medium text-white">Análise</h4>
                  <p className="text-xs text-slate-400">Melhorar experiência</p>
                </div>
                <div className="ml-2">
                  <button
                    onClick={() => handlePreferenceChange('analytics')}
                    className={`w-8 h-4 rounded-full flex items-center transition-colors ${
                      preferences.analytics ? 'bg-blue-600 justify-end' : 'bg-slate-500 justify-start'
                    } px-0.5`}
                  >
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
              
              {/* Marketing Cookies */}
              <div className="flex items-center justify-between p-2 bg-slate-700/30 rounded">
                <div className="flex-1">
                  <h4 className="text-xs font-medium text-white">Marketing</h4>
                  <p className="text-xs text-slate-400">Personalizar anúncios</p>
                </div>
                <div className="ml-2">
                  <button
                    onClick={() => handlePreferenceChange('marketing')}
                    className={`w-8 h-4 rounded-full flex items-center transition-colors ${
                      preferences.marketing ? 'bg-blue-600 justify-end' : 'bg-slate-500 justify-start'
                    } px-0.5`}
                  >
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
              
              {/* Functional Cookies */}
              <div className="flex items-center justify-between p-2 bg-slate-700/30 rounded">
                <div className="flex-1">
                  <h4 className="text-xs font-medium text-white">Funcionais</h4>
                  <p className="text-xs text-slate-400">Recursos avançados</p>
                </div>
                <div className="ml-2">
                  <button
                    onClick={() => handlePreferenceChange('functional')}
                    className={`w-8 h-4 rounded-full flex items-center transition-colors ${
                      preferences.functional ? 'bg-blue-600 justify-end' : 'bg-slate-500 justify-start'
                    } px-0.5`}
                  >
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSavePreferences}
                className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors flex items-center justify-center space-x-1"
              >
                <Check className="w-3 h-3" />
                <span>Salvar</span>
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={handleAcceptAll}
                  className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                >
                  Aceitar Todos
                </button>
                
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieConsent;