import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle,
  Mail, Calendar, ArrowRight, Loader2,
  Phone, MessageSquare
} from "lucide-react";

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

export default function ResultsPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [dialogMode, setDialogMode] = useState("results"); // "results" or "schedule"
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

  useEffect(() => {
    const loadResults = async () => {
      try {
        const response = await axios.get(`${API}/assessments/${assessmentId}`);
        setResults(response.data);
      } catch (error) {
        console.error("Error loading results:", error);
        toast.error("Failed to load results");
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    loadResults();
  }, [assessmentId, navigate]);

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
        modules: results.modules,
        assessment_id: assessmentId
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

  const handleEmailResults = () => {
    setDialogMode("results");
    setShowLeadCapture(true);
  };

  const handleScheduleCall = () => {
    setDialogMode("schedule");
    setShowLeadCapture(true);
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

  const getScoreIcon = () => {
    switch (results?.risk_level) {
      case "green":
        return <CheckCircle2 className="w-16 h-16 text-white" />;
      case "yellow":
        return <AlertTriangle className="w-16 h-16 text-white" />;
      case "red":
        return <XCircle className="w-16 h-16 text-white" />;
      default:
        return <Shield className="w-16 h-16 text-white" />;
    }
  };

  const getScoreColor = () => {
    switch (results?.risk_level) {
      case "green":
        return "bg-emerald-500";
      case "yellow":
        return "bg-amber-500";
      case "red":
        return "bg-red-500";
      default:
        return "bg-slate-500";
    }
  };

  const getScoreLabel = () => {
    switch (results?.risk_level) {
      case "green":
        return "Likely Stable";
      case "yellow":
        return "Common Gaps Found";
      case "red":
        return "High-Risk Flags";
      default:
        return "Assessment Complete";
    }
  };

  const getScoreDescription = () => {
    switch (results?.risk_level) {
      case "green":
        return "Your agreements appear to have solid foundations. A brief review can confirm your protections are in place.";
      case "yellow":
        return "We've identified some common gaps that many business owners overlook. A review can help address these before they become problems.";
      case "red":
        return "We've identified several high-risk areas that warrant prompt attention. Early action can prevent costly issues down the road.";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Calculating your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <Shield className="w-8 h-8 text-blue-900 fill-blue-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppson Law<span className="text-slate-500">, LLP</span>
            </span>
          </div>
          <Button
            variant="outline"
            onClick={handleEmailResults}
            data-testid="email-results-btn"
          >
            <Mail className="w-4 h-4 mr-2" />
            Email & Text Me My Results
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Score Section */}
        <div className="text-center mb-12">
          <div className={`score-badge ${results?.risk_level} w-32 h-32 ${getScoreColor()} rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg`} data-testid="risk-score-display">
            {getScoreIcon()}
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-slate-900 mb-2" data-testid="score-label">
            {getScoreLabel()}
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            {getScoreDescription()}
          </p>
        </div>

        {/* Confidence Meter */}
        <Card className="border-slate-200 mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-lg font-semibold text-slate-900">
                Agreement Protection Confidence
              </h3>
              <span className="text-2xl font-bold text-slate-900" data-testid="confidence-score">
                {results?.confidence_level}%
              </span>
            </div>
            <Progress value={results?.confidence_level || 0} className="h-3" />
            <p className="text-slate-500 text-sm mt-2">
              Based on your answers, this reflects how confident you can be in your current agreement protections.
            </p>
          </CardContent>
        </Card>

        {/* Top Risks */}
        {results?.top_risks?.length > 0 && (
          <Card className="border-slate-200 mb-8">
            <CardHeader>
              <CardTitle className="font-heading text-xl font-semibold text-slate-900">
                Your Top Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                {results.top_risks.map((risk, index) => (
                  <div 
                    key={index}
                    className={`stagger-item p-4 rounded-lg border ${
                      risk.severity === "high" 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-amber-50 border-amber-200'
                    }`}
                    data-testid={`risk-item-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        risk.severity === "high" ? 'bg-red-500' : 'bg-amber-500'
                      }`}>
                        <AlertTriangle className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h4 className={`font-semibold ${
                          risk.severity === "high" ? 'text-red-900' : 'text-amber-900'
                        }`}>
                          {risk.title}
                        </h4>
                        <p className={`text-sm mt-1 ${
                          risk.severity === "high" ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          {risk.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* What This Could Cost */}
        <Card className="border-slate-200 mb-8 bg-slate-900 text-white">
          <CardContent className="p-6">
            <h3 className="font-heading text-xl font-semibold mb-3">
              What This Could Cost If Ignored
            </h3>
            <p className="text-slate-300 leading-relaxed">
              Unaddressed legal risks in business agreements commonly lead to unexpected costs: 
              personal liability exposure, disputes with partners or landlords, deal failures, 
              or costly litigation. Many of these issues are preventable with proper review and documentation.
            </p>
          </CardContent>
        </Card>

        {/* Action Plan */}
        {results?.action_plan?.length > 0 && (
          <Card className="border-slate-200 mb-8">
            <CardHeader>
              <CardTitle className="font-heading text-xl font-semibold text-slate-900">
                Recommended Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                {results.action_plan.map((action, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg"
                    data-testid={`action-item-${index}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm ${
                      action.urgency === "high" 
                        ? 'bg-orange-500 text-white' 
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {action.priority}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{action.action}</h4>
                      <p className="text-sm text-slate-600 mt-1">{action.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* What We Do Section */}
        <Card className="border-orange-200 bg-orange-50 mb-8">
          <CardContent className="p-8">
            <h3 className="font-heading text-xl font-semibold text-slate-900 mb-4">
              What We Do in a CLBH Review Call
            </h3>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-700">Review your specific situation and assessment results in detail</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-700">Identify the highest-priority items that need immediate attention</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-700">Create a clear action plan with timeline and next steps</span>
              </li>
            </ul>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-6 text-lg font-semibold"
              onClick={handleScheduleCall}
              data-testid="book-review-call-btn"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Schedule a CLBH Review Call
            </Button>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <div className="text-center mb-8">
          <p className="text-slate-500 text-xs leading-relaxed max-w-2xl mx-auto">
            <strong>Disclaimer:</strong> This assessment is for educational purposes only and does not constitute legal advice.
            No attorney-client relationship is created by using this tool. Results are based solely on your inputs
            and may not reflect all relevant factors. For personalized legal guidance, please consult with a qualified attorney.
          </p>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="flex items-center justify-center"
            data-testid="back-to-home-btn"
          >
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
            Back to Main Menu
          </Button>
          <Button
            onClick={() => navigate("/select-modules")}
            className="bg-slate-900 hover:bg-slate-800 flex items-center justify-center"
            data-testid="new-assessment-btn"
          >
            Start New Assessment
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>

      {/* Floating Book Now Button */}
      <div className="fixed bottom-6 right-6 z-40 no-print">
        <Button
          onClick={handleScheduleCall}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-6 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 rounded-full group"
          data-testid="floating-book-btn"
        >
          <Calendar className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
          Book Now
        </Button>
      </div>

      {/* Lead Capture Dialog */}
      <Dialog open={showLeadCapture} onOpenChange={handleLeadDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {leadSubmitted
                ? "Thank You!"
                : dialogMode === "results"
                  ? "Get Your Results"
                  : "Schedule a Free Consultation"
              }
            </DialogTitle>
            {!leadSubmitted && (
              <DialogDescription>
                {dialogMode === "results"
                  ? "Fill in your details to receive your results by email and text message."
                  : "Fill in your details to schedule your free 15-minute CLBH consultation."
                }
              </DialogDescription>
            )}
          </DialogHeader>

          {leadSubmitted ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              {dialogMode === "results" ? (
                <>
                  <p className="text-slate-600 mb-4">
                    We have emailed and texted you your results. If you have any questions, you can schedule a free 15-minute CLBH consultation.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={() => window.open('https://calendly.com/jeppsonlaw', '_blank')}
                      className="bg-orange-500 hover:bg-orange-600"
                      data-testid="schedule-consultation-btn"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Free Consultation
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowLeadCapture(false)}
                      data-testid="close-success-btn"
                    >
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-slate-600 mb-4">
                    Click below to choose a time for your free 15-minute CLBH consultation.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={() => window.open('https://calendly.com/jeppsonlaw', '_blank')}
                      className="bg-orange-500 hover:bg-orange-600"
                      data-testid="open-calendar-btn"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Choose a Time
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowLeadCapture(false)}
                      data-testid="close-success-btn"
                    >
                      Close
                    </Button>
                  </div>
                </>
              )}
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
                  data-testid="lead-name-input"
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
                  data-testid="lead-email-input"
                />
              </div>

              <div>
                <Label htmlFor="phone">Cell Phone {dialogMode === "results" ? "(for text) " : ""}*</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className="mt-1"
                  data-testid="lead-phone-input"
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
                  data-testid="lead-business-input"
                />
              </div>

              <div>
                <Label htmlFor="state">State *</Label>
                <Select value={formData.state} onValueChange={(value) => handleInputChange("state", value)}>
                  <SelectTrigger className="mt-1" data-testid="lead-state-select">
                    <SelectValue placeholder="Select your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem
                        key={state}
                        value={state}
                        data-testid={`lead-state-option-${state.replace(/\s+/g, "-")}`}
                      >
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="situation">What best describes your situation? *</Label>
                <Select value={formData.situation} onValueChange={(value) => handleInputChange("situation", value)}>
                  <SelectTrigger className="mt-1" data-testid="lead-situation-select">
                    <SelectValue placeholder="Select your situation" />
                  </SelectTrigger>
                  <SelectContent>
                    {SITUATIONS.map((situation) => (
                      <SelectItem
                        key={situation}
                        value={situation}
                        data-testid={`lead-situation-option-${situation.replace(/\s+/g, "-")}`}
                      >
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
                data-testid="submit-lead-btn"
              >
                {isSubmittingLead ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : dialogMode === "results" ? (
                  <>
                    Send My Results
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Continue to Calendar
                    <Calendar className="w-4 h-4 ml-2" />
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
