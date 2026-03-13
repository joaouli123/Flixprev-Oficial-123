import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SessionContextProvider } from "./components/SessionContextProvider";
import { AppSettingsProvider } from "./components/AppSettingsProvider";
import AdminRoute from "./components/AdminRoute";

// Lazy load pages for code splitting
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ThankYouPage = lazy(() => import("./pages/ThankYouPage"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const AgentsView = lazy(() => import("./pages/AgentsView"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const TutorialManagement = lazy(() => import("./pages/TutorialManagement"));
const HowToUse = lazy(() => import("./pages/HowToUse"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const LGPDNotice = lazy(() => import("./pages/LGPDNotice"));
const EsqueciSenha = lazy(() => import("./pages/EsqueciSenha"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const AILogs = lazy(() => import("./pages/AILogs"));
const Indicacoes = lazy(() => import("./pages/Indicacoes"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const AgentEditorPage = lazy(() => import("./pages/AgentEditorPage"));
const FaviconUpdater = lazy(() => import("./components/FaviconUpdater"));
const CookieConsent = lazy(() => import("./components/CookieConsent"));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <SessionContextProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/obrigado" element={<ThankYouPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/lgpd" element={<LGPDNotice />} />              
              {/* Protected routes with AppLayout (Header + Sidebar) */}
              <Route path="/app" element={
                <AppSettingsProvider>
                  <FaviconUpdater />
                  <AppLayout />
                </AppSettingsProvider>
              }>
                <Route index element={<AgentsView />} />
                <Route path="settings" element={<Settings />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="users" element={<AdminRoute><UserManagement /></AdminRoute>} />
                <Route path="finance" element={<AdminRoute><Financeiro /></AdminRoute>} />
                <Route path="ai-logs" element={<AdminRoute><AILogs /></AdminRoute>} />
                <Route path="admin/agentes/novo" element={<AdminRoute><AgentEditorPage /></AdminRoute>} />
                <Route path="admin/agentes/:agentEditId/editar" element={<AdminRoute><AgentEditorPage /></AdminRoute>} />
                <Route path="indications" element={<Indicacoes />} />
                <Route path="subscription" element={<SubscriptionPage />} />
                <Route path="tutorials" element={<AdminRoute><TutorialManagement /></AdminRoute>} />
                <Route path="how-to-use" element={<HowToUse />} />
                <Route path="chat/:agentId/:conversationId?" element={<ChatPage />} />
                <Route path="agente/:agentSlug/:conversationId?" element={<ChatPage />} />
                <Route path="categorias/:categorySlug" element={<AgentsView />} />
                <Route path="configuracoes" element={<Settings />} />
                <Route path="perfil" element={<ProfilePage />} />
                <Route path="administracao" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="usuarios" element={<AdminRoute><UserManagement /></AdminRoute>} />
                <Route path="financeiro" element={<AdminRoute><Financeiro /></AdminRoute>} />
                <Route path="logs-ia" element={<AdminRoute><AILogs /></AdminRoute>} />
                <Route path="administracao/agentes/novo" element={<AdminRoute><AgentEditorPage /></AdminRoute>} />
                <Route path="administracao/agentes/:agentEditId/editar" element={<AdminRoute><AgentEditorPage /></AdminRoute>} />
                <Route path="indicacoes" element={<Indicacoes />} />
                <Route path="assinatura" element={<SubscriptionPage />} />
                <Route path="tutoriais" element={<AdminRoute><TutorialManagement /></AdminRoute>} />
                <Route path="como-usar" element={<HowToUse />} />
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <CookieConsent />
          </Suspense>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
