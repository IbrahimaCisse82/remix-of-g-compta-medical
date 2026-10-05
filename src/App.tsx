import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CguPage from "./pages/CguPage";
import ConfidentialitePage from "./pages/ConfidentialitePage";
import ProtectionDonneesPage from "./pages/ProtectionDonneesPage";
import PortailPublicPage from "./pages/PortailPublicPage";
import TarifsPage from "./pages/TarifsPage";
import NotFound from "./pages/NotFound";
import PortailPatientPage from "./pages/PortailPatientPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/cgu" element={<CguPage />} />
            <Route path="/confidentialite" element={<ConfidentialitePage />} />
            <Route path="/protection-donnees" element={<ProtectionDonneesPage />} />
            <Route path="/portail" element={<PortailPublicPage />} />
            <Route path="/resultats" element={<PortailPatientPage />} />
            <Route path="/tarifs" element={<TarifsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
