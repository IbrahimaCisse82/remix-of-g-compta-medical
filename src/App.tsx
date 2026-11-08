import { lazy, Suspense } from "react";
import { ConfirmationHost } from '@/components/Confirmation';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const CguPage = lazy(() => import("./pages/CguPage"));
const ConfidentialitePage = lazy(() => import("./pages/ConfidentialitePage"));
const ProtectionDonneesPage = lazy(() => import("./pages/ProtectionDonneesPage"));
const PortailPublicPage = lazy(() => import("./pages/PortailPublicPage"));
const InvitationPage = lazy(() => import("./pages/InvitationPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PortailPatientPage = lazy(() => import("./pages/PortailPatientPage"));
const VerifierCrPage = lazy(() => import("./pages/VerifierCrPage"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ConfirmationHost />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div role="status" aria-live="polite" className="p-8 text-sm">Chargement…</div>}><Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/cgu" element={<CguPage />} />
            <Route path="/confidentialite" element={<ConfidentialitePage />} />
            <Route path="/protection-donnees" element={<ProtectionDonneesPage />} />
            <Route path="/portail" element={<PortailPublicPage />} />
            <Route path="/resultats" element={<PortailPatientPage />} />
            <Route path="/verifier/:token" element={<VerifierCrPage />} />
            <Route path="/invitation/:id" element={<InvitationPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes></Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
