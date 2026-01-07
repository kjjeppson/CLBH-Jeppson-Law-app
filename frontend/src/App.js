import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import ModuleSelection from "@/pages/ModuleSelection";
import AssessmentWizard from "@/pages/AssessmentWizard";
import ResultsPage from "@/pages/ResultsPage";
import AdminDashboard from "@/pages/AdminDashboard";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
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
