import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, FileCheck, AlertTriangle, CheckCircle2, Clock, ArrowRight, Building2, Calendar, Loader2, Phone } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming"
];

const SITUATIONS = [
  "Reviewing a new lease",
  "Renewing an existing lease",
  "Planning a business acquisition",
  "Currently in acquisition process",
  "Starting a new partnership",
  "Reviewing existing partnership agreement",
  "General business health check",
  "Addressing a specific concern",
  "Other"
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    business_name: "",
    state: "",
    situation: ""
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !formData.business_name || !formData.state || !formData.situation) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmittingLead(true);
    try {
      await axios.post(`${API}/leads`, {
        ...formData,
        modules: [],
        assessment_id: null
      });

      setLeadSubmitted(true);
      toast.success("Information submitted successfully!");
    } catch (error) {
      console.error("Error submitting lead:", error);
      toast.error("Failed to submit. Please try again.");
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleLeadDialogOpenChange = (open) => {
    setShowLeadCapture(open);
    if (!open) {
      setLeadSubmitted(false);
      setIsSubmittingLead(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        business_name: "",
        state: "",
        situation: ""
      });
    }
  };

  const benefits = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "3-5 Minute Assessment",
      description: "Quick, focused questions to identify your key legal risks"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Clear Risk Score",
      description: "Easy-to-understand Green/Yellow/Red rating"
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: "Action Plan",
      description: "Prioritized steps to protect your business"
    }
  ];

  const modules = [
    {
      icon: <Building2 className="w-8 h-8" />,
      title: "Commercial Lease",
      description: "Personal guarantees, assignment restrictions, default terms"
    },
    {
      icon: <FileCheck className="w-8 h-8" />,
      title: "Business Acquisition",
      description: "Due diligence, representations, indemnification"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Partnership Agreement",
      description: "Buy-sell terms, decision authority, exit provisions"
    }
  ];

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
          <div className="flex gap-2">
            <Button
              onClick={() => setShowLeadCapture(true)}
              className="hidden sm:flex bg-orange-500 hover:bg-orange-600"
              data-testid="nav-schedule-btn"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Schedule a CLBH Call
            </Button>
            <Button
              onClick={() => navigate("/select-modules")}
              className="bg-slate-900 hover:bg-slate-800"
              data-testid="nav-start-checkup-btn"
            >
              Start Checkup
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section text-white py-24 md:py-32">
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
              Identify preventable legal risks in your business agreements. 
              Get a clear score, understand your top risks, and receive an 
              actionable protection plan—all in under 5 minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up animate-delay-300">
              <Button 
                onClick={() => navigate("/select-modules")}
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg font-semibold"
                data-testid="hero-start-checkup-btn"
              >
                Start the Quick Checkup
                <ArrowRight className="ml-2 w-5 h-5" />
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
      <section className="py-20 bg-white" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6">
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

      {/* Assessment Modules Section */}
      <section className="py-20 bg-slate-50 grid-pattern">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Assessment Areas
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Choose one or more areas to assess. Each takes just 3-5 minutes.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {modules.map((module, index) => (
              <Card
                key={index}
                className="bg-white border-slate-200 hover:border-slate-300 transition-all hover:-translate-y-1 cursor-pointer"
                onClick={() => navigate("/select-modules")}
                data-testid={`module-preview-${index}`}
              >
                <CardContent className="p-8">
                  <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 mb-6">
                    {module.icon}
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-slate-900 mb-3">
                    {module.title}
                  </h3>
                  <p className="text-slate-600 text-sm">
                    {module.description}
                  </p>
                  <Button
                    className="mt-4 w-full bg-orange-500 hover:bg-orange-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/select-modules");
                    }}
                  >
                    Start Assessment
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Risk Score Explanation */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
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
            It takes just 3-5 minutes to identify potential risks in your business agreements. 
            No commitment, completely confidential.
          </p>
          <Button 
            onClick={() => navigate("/select-modules")}
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
          <p className="text-slate-500 text-xs text-center leading-relaxed">
            <strong>Disclaimer:</strong> This assessment is for educational purposes only and does not constitute legal advice. 
            No attorney-client relationship is created by using this tool. Results are based solely on your inputs 
            and may not reflect all relevant factors. For personalized legal guidance, please consult with a qualified attorney.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-900" />
            <span className="font-brand text-lg font-semibold text-slate-900">
              Jeppson Law<span className="text-slate-500">, LLP</span>
            </span>
          </div>
          <a href="tel:916-780-7008" className="flex items-center gap-2 text-slate-600 hover:text-blue-900 transition-colors">
            <Phone className="w-4 h-4" />
            <span className="text-sm font-medium">916-780-7008</span>
          </a>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Jeppson Law, LLP. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Lead Capture Dialog */}
      <Dialog open={showLeadCapture} onOpenChange={handleLeadDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {leadSubmitted ? "Thank You!" : "Schedule a CLBH Review Call"}
            </DialogTitle>
            <DialogDescription>
              {leadSubmitted
                ? "We'll be in touch shortly to schedule your CLBH Review Call."
                : "Fill in your details and we'll reach out to schedule a review call."
              }
            </DialogDescription>
          </DialogHeader>

          {leadSubmitted ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-slate-600 mb-4">
                Your information has been submitted. We'll reach out within 1 business day.
              </p>
              <Button
                onClick={() => setShowLeadCapture(false)}
                className="bg-slate-900"
              >
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleLeadSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="John Smith"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="john@company.com"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="business_name">Business Name *</Label>
                <Input
                  id="business_name"
                  value={formData.business_name}
                  onChange={(e) => handleInputChange("business_name", e.target.value)}
                  placeholder="Acme Construction LLC"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="state">State *</Label>
                <Select value={formData.state} onValueChange={(value) => handleInputChange("state", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="situation">What best describes your situation? *</Label>
                <Select value={formData.situation} onValueChange={(value) => handleInputChange("situation", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your situation" />
                  </SelectTrigger>
                  <SelectContent>
                    {SITUATIONS.map((situation) => (
                      <SelectItem key={situation} value={situation}>
                        {situation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={isSubmittingLead}
              >
                {isSubmittingLead ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit & Schedule Call
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
