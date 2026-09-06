import { useState, useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, FileCheck, AlertTriangle, CheckCircle2, Clock, ArrowRight, Calendar, Loader2, Phone, Users, Briefcase, UserCheck, ShieldCheck, Database, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Decide BEFORE first paint whether this visit should skip the landing page
// and start the checkup immediately: links carrying ?start=1, or visitors
// arriving from our own websites. sessionStorage-guarded so Back from
// question 1 shows the landing page normally.
const shouldAutoStart = () => {
  try {
    if (sessionStorage.getItem("clbh_autostart_done") === "1") return false;
  } catch (e) { /* private mode; continue */ }
  const params = new URLSearchParams(window.location.search);
  const startParam = params.get("start");
  if (startParam === "1" || startParam === "true") return true;
  try {
    if (document.referrer) {
      const refHost = new URL(document.referrer).hostname;
      return (
        refHost !== window.location.hostname &&
        (refHost.endsWith("cleanlegalbillofhealth.com") || refHost.endsWith("jeppsonlaw.com"))
      );
    }
  } catch (e) { /* unparseable referrer */ }
  return false;
};

export default function LandingPage() {
  const navigate = useNavigate();

  const benefits = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "About 5 Minutes",
      description: "24 quick questions across 6 critical areas of business legal health"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Clear Risk Scores",
      description: "Easy-to-understand Green/Yellow/Red ratings for each area and overall"
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: "Action Plan",
      description: "Prioritized steps to protect your business with RED flags highlighted"
    }
  ];

  const quizAreas = [
    { id: "contracts", icon: <FileCheck className="w-5 h-5" />, name: "Customer Contracts & Project Risks" },
    { id: "ownership", icon: <Users className="w-5 h-5" />, name: "Ownership & Governance" },
    { id: "subcontractor", icon: <Briefcase className="w-5 h-5" />, name: "Vendors" },
    { id: "employment", icon: <UserCheck className="w-5 h-5" />, name: "Employment & Safety Compliance" },
    { id: "insurance", icon: <ShieldCheck className="w-5 h-5" />, name: "Insurance and Risk Management" },
    { id: "systems", icon: <Database className="w-5 h-5" />, name: "Systems, Records & Digital Risk" }
  ];

  // All areas selected by default so the quiz can start immediately.
  // Visitors can deselect areas to take a shorter quiz.
  const [selectedAreas, setSelectedAreas] = useState(quizAreas.map(a => a.id));
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  // When true, we render a branded "starting" screen instead of the landing
  // page, so auto-started visitors never see a confusing flash of content.
  const [autoStarting, setAutoStarting] = useState(shouldAutoStart);

  const toggleArea = (areaId) => {
    setSelectedAreas(prev =>
      prev.includes(areaId)
        ? prev.filter(id => id !== areaId)
        : [...prev, areaId]
    );
  };

  const toggleAllAreas = () => {
    if (selectedAreas.length === quizAreas.length) {
      setSelectedAreas([]);
    } else {
      setSelectedAreas(quizAreas.map(a => a.id));
    }
  };

  const handleBeginQuiz = async () => {
    if (selectedAreas.length === 0) {
      toast.error("Please select at least one area to assess");
      return;
    }

    setIsStartingQuiz(true);
    try {
      const response = await axios.post(`${API}/assessments`, {
        modules: ["clbh"],
        selected_areas: selectedAreas
      });
      track("quiz_start", { areas_selected: selectedAreas.length });
      navigate(`/assessment/${response.data.id}`);
      return true;
    } catch (error) {
      console.error("Error creating assessment:", error);
      toast.error("Failed to start the checkup. Please try again.");
      return false;
    } finally {
      setIsStartingQuiz(false);
    }
  };

  // Run the auto-start decided above. If starting fails (network hiccup),
  // fall back to showing the normal landing page.
  const autoStartAttempted = useRef(false);
  useEffect(() => {
    if (!autoStarting || autoStartAttempted.current) return;
    autoStartAttempted.current = true;
    try {
      sessionStorage.setItem("clbh_autostart_done", "1");
    } catch (e) { /* private mode; worst case is no auto-start next time */ }
    (async () => {
      const started = await handleBeginQuiz();
      if (!started) setAutoStarting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStarting]);

  // Branded starting screen for auto-started visitors: no landing-page
  // flash, and the key trust facts ride along while their checkup loads.
  if (autoStarting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center">
          <img
            src="/clbh-logo.png"
            alt="Clean Legal Bill of Health — A Jeppson Law Product"
            className="h-20 w-auto mx-auto mb-8"
          />
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-6" />
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900 mb-3">
            Starting your checkup...
          </h1>
          <p className="text-slate-600 text-lg">
            24 quick questions. About 5 minutes. Confidential.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center relative z-10">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img
              src="/clbh-logo.png"
              alt="Clean Legal Bill of Health — A Jeppson Law Product"
              className="h-14 w-auto"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => window.open('https://jeppsonlaw.cliogrow.com/book/5d7625ad3292b0e84db81965f80ee5f4', '_blank')}
              className="hidden sm:flex bg-orange-500 hover:bg-orange-600"
              data-testid="nav-schedule-btn"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Schedule a Free CLBH Call
            </Button>
            <Button
              onClick={handleBeginQuiz}
              disabled={isStartingQuiz}
              className="bg-slate-900 hover:bg-slate-800"
              data-testid="nav-start-checkup-btn"
            >
              Start Checkup
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section text-white py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <p className="text-orange-400 font-semibold tracking-wider uppercase text-sm mb-4 animate-fade-in-up">
              Legal Preventive Maintenance
            </p>
            <h1 className="font-heading text-4xl md:text-6xl font-bold tracking-tight mb-6 animate-fade-in-up animate-delay-100">
              Clean Legal Bill of Health
              <span className="block text-slate-400 text-3xl md:text-4xl mt-2">Quick Checkup</span>
            </h1>
            <p className="text-slate-300 text-lg md:text-xl leading-relaxed mb-8 animate-fade-in-up animate-delay-200">
              Identify preventable legal risks across 6 critical areas of your business.
              Get clear scores for each area, see exactly where you're at risk, and receive
              an actionable protection plan, all in about 5 minutes.
            </p>
            {/* Area selection, merged into the hero */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 animate-fade-in-up animate-delay-300">
              <p className="text-slate-300">
                All six areas are included. Tap an area to remove it.
              </p>
              <Button
                variant="outline"
                onClick={toggleAllAreas}
                className="border-orange-500 text-orange-400 hover:bg-orange-500/10 text-sm self-start sm:self-auto"
                data-testid="toggle-all-areas-btn"
              >
                {selectedAreas.length === quizAreas.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4 animate-fade-in-up animate-delay-300">
              {quizAreas.map((area) => {
                const isSelected = selectedAreas.includes(area.id);
                return (
                  <div
                    key={area.id}
                    onClick={() => toggleArea(area.id)}
                    className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg text-left border-2 cursor-pointer transition-all duration-200 bg-slate-800 ${
                      isSelected
                        ? "border-orange-500 shadow-lg shadow-orange-500/30"
                        : "border-orange-500/50 hover:border-orange-500"
                    }`}
                    data-testid={`area-card-${area.id}`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-400"
                    }`}>
                      {isSelected ? <Check className="w-5 h-5" /> : area.icon}
                    </div>
                    <span className="text-sm font-medium text-slate-200">
                      {area.name}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-slate-400 text-sm mb-8">
              {selectedAreas.length} of 6 areas selected • {selectedAreas.length * 4} questions • confidential • instant results
            </p>

            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up animate-delay-300">
              <Button
                onClick={handleBeginQuiz}
                disabled={isStartingQuiz || selectedAreas.length === 0}
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="hero-start-checkup-btn"
              >
                {isStartingQuiz ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start the Quick Checkup
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="border-slate-500 text-white hover:bg-slate-800 px-8 py-6 text-lg"
                onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
                data-testid="learn-more-btn"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* What You'll Get Section */}
      <section className="py-20 bg-white grid-pattern-light" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              What You'll Get
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              A comprehensive snapshot of your legal risk exposure with clear next steps
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-slate-100 shadow-sm hover:shadow-md transition-shadow" data-testid={`benefit-card-${index}`}>
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center text-white mb-6">
                    {benefit.icon}
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-slate-900 mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-600">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Risk Score Explanation */}
      <section className="py-20 bg-white grid-pattern-light">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Your Risk Score Explained
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="border-emerald-200 bg-emerald-50" data-testid="score-green-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-emerald-900 mb-2">Green</h3>
                <p className="text-emerald-700 text-sm">
                  Likely stable. Confirm with a brief review.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-amber-200 bg-amber-50" data-testid="score-yellow-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-amber-900 mb-2">Yellow</h3>
                <p className="text-amber-700 text-sm">
                  Common gaps found. Recommend review soon.
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-red-200 bg-red-50" data-testid="score-red-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-red-900 mb-2">Red</h3>
                <p className="text-red-700 text-sm">
                  High-risk flags. Priority review recommended.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-6">
            Ready to Check Your Business Health?
          </h2>
          <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
            Our comprehensive 24-question checkup covers 6 critical areas of business legal health.
            No commitment, completely confidential.
          </p>
          <Button
            onClick={handleBeginQuiz}
            disabled={isStartingQuiz}
            className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-6 text-lg font-semibold"
            data-testid="cta-start-checkup-btn"
          >
            Start the Quick Checkup
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-slate-600 text-sm text-center leading-relaxed mb-6">
            <strong>DISCLAIMER:</strong> This assessment is for educational purposes only and does not constitute legal advice, and no attorney-client relationship is formed by using this tool or receiving its output. The results are intended to help you identify potential areas of concern in your business — they are not a legal assessment of your specific contracts, obligations, or exposure. For specific legal guidance tailored to your situation, please consult with a licensed attorney. You may take this checklist to your own attorney or schedule a consultation with Jeppson Law.
          </p>
          <div className="text-center">
            <Button
              onClick={() => window.open('https://jeppsonlaw.cliogrow.com/book/5d7625ad3292b0e84db81965f80ee5f4', '_blank')}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              data-testid="disclaimer-book-consultation-btn"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Book a Free Consultation
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-white border-t border-slate-200 grid-pattern-light">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:justify-between items-center gap-4 mb-4">
            <a href="https://cleanlegalbillofhealth.com" target="_blank" rel="noopener noreferrer" className="md:flex-1 flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img
                src="/clbh-logo.png"
                alt="Clean Legal Bill of Health — A Jeppson Law Product"
                className="h-20 w-auto"
              />
            </a>
            <a href="tel:916-780-7008" className="md:flex-1 flex items-center justify-center gap-2 text-slate-600 hover:text-blue-900 transition-colors">
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">916-780-7008</span>
            </a>
            <p className="md:flex-1 text-slate-500 text-sm md:text-right">
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
