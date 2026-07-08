import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
import AmbulanceLogin from "./pages/AmbulanceLogin";
import HospitalLogin from "./pages/HospitalLogin";
import AmbulanceDashboard from "./pages/AmbulanceDashboard";
import HospitalDashboard from "./pages/HospitalDashboard";
import NotFound from "./pages/NotFound";



import { ErrorBoundary } from "./components/ErrorBoundary";

const App = () => (
  <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/ambulance-login" element={<AmbulanceLogin />} />
              <Route path="/hospital-login" element={<HospitalLogin />} />
              <Route path="/ambulance" element={
                <ProtectedRoute allowedRoles={['ambulance', 'admin']}>
                  <AmbulanceDashboard />
                </ProtectedRoute>
              } />
              <Route path="/hospital" element={
                <ProtectedRoute allowedRoles={['hospital', 'admin']}>
                  <HospitalDashboard />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </AppProvider>
);

export default App;
