import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, FileText, Users, Briefcase, UserCheck, ShieldCheck, Database, ArrowRight, ArrowLeft, Clock, HelpCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const areas = [
  {
    id: "contracts",
    name: "Customer Contracts",
    icon: <FileText className="w-5 h-5" />,
    questions: 4
  },
  {
    id: "ownership",
    name: "Ownership & Governance",
    icon: <Users className="w-5 h-5" />,
    questions: 4
  },
  {
    id: "subcontractor",
    name: "Subcontractor & Vendor Risk",
    icon: <Briefcase className="w-5 h-5" />,
    questions: 4
  },
  {
    id: "employment",
    name: "Employment Compliance",
    icon: <UserCheck className="w-5 h-5" />,
    questions: 4
  },
  {
    id: "insurance",
    name: "Insurance & Claims",
    icon: <ShieldCheck className="w-5 h-5" />,
    questions: 4
  },
  {
    id: "systems",
    name: "Systems & Digital Risk",
    icon: <Database className="w-5 h-5" />,
    questions: 4
  }
];

export default function ModuleSelection() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleStartAssessment = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/assessments`, {
        modules: ["clbh"]
      });

      navigate(`/assessment/${response.data.id}`);
    } catch (error) {
      console.error("Error creating assessment:", error);
      toast.error("Failed to start assessment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <Shield className="w-8 h-8 text-blue-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppson Law<span className="text-slate-500">, LLP</span>
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
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Clean Legal Bill of Health Quiz
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            24 questions across 6 critical areas of business legal health.
            Get a comprehensive view of where your business stands.
          </p>
        </div>

        {/* Quiz Overview Card */}
        <Card className="border-slate-200 shadow-sm mb-8">
          <CardContent className="p-8">
            {/* Stats Row */}
            <div className="flex flex-wrap justify-center gap-8 mb-8 pb-8 border-b border-slate-100">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-slate-900 mb-1">
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                  <span className="text-2xl font-bold">24</span>
                </div>
                <p className="text-sm text-slate-500">Questions</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-slate-900 mb-1">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="text-2xl font-bold">5-10</span>
                </div>
                <p className="text-sm text-slate-500">Minutes</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-slate-900 mb-1">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <span className="text-2xl font-bold">6</span>
                </div>
                <p className="text-sm text-slate-500">Areas Covered</p>
              </div>
            </div>

            {/* Areas Grid */}
            <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4 text-center">
              Areas We'll Assess
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              {areas.map((area) => (
                <div
                  key={area.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-600 shadow-sm">
                    {area.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{area.name}</p>
                    <p className="text-xs text-slate-500">{area.questions} questions</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div className="text-center">
              <Button
                onClick={handleStartAssessment}
                disabled={isLoading}
                className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-6 text-lg font-semibold disabled:opacity-50"
                data-testid="start-assessment-btn"
              >
                {isLoading ? "Starting..." : "Start Your Assessment"}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <p className="text-slate-500 text-sm mt-4">
                Your answers are confidential. Results will help identify potential risks and next steps.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* What You'll Get Section */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8">
          <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">
            What You'll Receive
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-600 font-bold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium text-slate-900">Overall Score</p>
                <p className="text-sm text-slate-500">Your complete legal health rating</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-600 font-bold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium text-slate-900">6 Area Scores</p>
                <p className="text-sm text-slate-500">See exactly where you're strong or at risk</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-600 font-bold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium text-slate-900">Action Plan</p>
                <p className="text-sm text-slate-500">Prioritized next steps for protection</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Legend */}
        <div className="flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-slate-600">Green = Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-slate-600">Yellow = At Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-slate-600">Red = Urgent</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-900" />
              <span className="font-brand text-lg font-semibold text-slate-900">
                Jeppson Law<span className="text-slate-500">, LLP</span>
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Jeppson Law, LLP. All rights reserved.
            </p>
          </div>
          <p className="text-slate-400 text-xs text-center">
            This tool is for educational purposes only and is not legal advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
