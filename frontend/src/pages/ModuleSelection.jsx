import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Building2, FileCheck, Users, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const modules = [
  {
    id: "lease",
    title: "Commercial Lease Risk",
    description: "Assess potential risks within your commercial lease agreements—personal guarantees, assignment restrictions, default terms, and more.",
    icon: <Building2 className="w-8 h-8" />,
    questions: 10,
    timeEstimate: "3-5 min"
  },
  {
    id: "acquisition",
    title: "Entity Purchase / Acquisition Risk",
    description: "Identify risks associated with buying or selling business entities—due diligence gaps, representations, indemnification issues.",
    icon: <FileCheck className="w-8 h-8" />,
    questions: 10,
    timeEstimate: "3-5 min"
  },
  {
    id: "ownership",
    title: "Ownership / Partner Agreement Risk",
    description: "Evaluate the clarity and completeness of your ownership and partnership agreements—buy-sell terms, decision authority, exit provisions.",
    icon: <Users className="w-8 h-8" />,
    questions: 10,
    timeEstimate: "3-5 min"
  }
];

export default function ModuleSelection() {
  const navigate = useNavigate();
  const [selectedModule, setSelectedModule] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectModule = (moduleId) => {
    setSelectedModule(prev => prev === moduleId ? null : moduleId);
  };

  const handleStartAssessment = async () => {
    if (!selectedModule) {
      toast.error("Please select a quiz to take");
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/assessments`, {
        modules: [selectedModule]
      });

      navigate(`/assessment/${response.data.id}`);
    } catch (error) {
      console.error("Error creating assessment:", error);
      toast.error("Failed to start assessment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedModuleData = modules.find(m => m.id === selectedModule);
  const totalQuestions = selectedModuleData?.questions || 0;
  const estimatedTime = selectedModuleData?.timeEstimate || "Select a quiz";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <Shield className="w-8 h-8 text-slate-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppsonlaw<span className="text-slate-500">, LLP</span>
            </span>
          </div>
          <Button 
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-slate-600"
            data-testid="back-to-home-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Select a Quiz
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Choose an area of your business you'd like to assess.
            After completing a quiz, you can return to take another.
          </p>
        </div>

        {/* Module Cards */}
        <div className="space-y-4 mb-8">
          {modules.map((module) => {
            const isSelected = selectedModule === module.id;
            return (
              <Card
                key={module.id}
                className={`cursor-pointer transition-all duration-300 ${
                  isSelected
                    ? 'border-slate-900 shadow-md ring-2 ring-slate-900/10'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
                onClick={() => selectModule(module.id)}
                data-testid={`module-card-${module.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center pt-1">
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900'
                            : 'border-slate-300'
                        }`}
                        data-testid={`module-radio-${module.id}`}
                      >
                        {isSelected && (
                          <div className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <div className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {module.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-heading text-xl font-semibold text-slate-900">
                          {module.title}
                        </h3>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        )}
                      </div>
                      <p className="text-slate-600 text-sm mb-3">
                        {module.description}
                      </p>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="font-medium">{module.questions}</span> questions
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-medium">{module.timeEstimate}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary and CTA */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-slate-600 text-sm mb-1">
                {selectedModule ? (
                  <span className="font-semibold text-slate-900">{selectedModuleData?.title}</span>
                ) : (
                  <span className="text-slate-500">No quiz selected</span>
                )}
              </p>
              <p className="text-slate-500 text-sm">
                {selectedModule
                  ? `${totalQuestions} questions • Estimated time: ${estimatedTime}`
                  : 'Select a quiz to continue'
                }
              </p>
            </div>
            <Button
              onClick={handleStartAssessment}
              disabled={!selectedModule || isLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg font-semibold disabled:opacity-50"
              data-testid="start-assessment-btn"
            >
              {isLoading ? "Starting..." : "Begin Quiz"}
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Info Note */}
        <div className="text-center">
          <p className="text-slate-500 text-sm">
            Your answers are confidential. Results will help identify potential risks and next steps.
          </p>
        </div>
      </main>
    </div>
  );
}
