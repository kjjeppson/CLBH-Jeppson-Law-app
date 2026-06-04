import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import ModuleSelection from "@/pages/ModuleSelection";
import AssessmentWizard from "@/pages/AssessmentWizard";
import ResultsPage from "@/pages/ResultsPage";
import AdminDashboard from "@/pages/AdminDashboard";

// Reset scroll to the top whenever the route changes (SPA navigation
// otherwise preserves the previous page's scroll position).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/select-modules" element={<ModuleSelection />} />
          <Route path="/assessment/:assessmentId" element={<AssessmentWizard />} />
          <Route path="/results/:assessmentId" element={<ResultsPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
