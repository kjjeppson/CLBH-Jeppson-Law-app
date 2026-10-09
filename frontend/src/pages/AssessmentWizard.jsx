import { useState, useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, ArrowRight, ArrowLeft, Loader2, Mail, Building2, FileCheck } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AREA_LABELS = {
  contracts: "Customer Contracts & Project Risks",
  ownership: "Ownership & Governance",
  subcontractor: "Vendors",
  employment: "Employment & Safety Compliance",
  insurance: "Insurance and Risk Management",
  systems: "Systems, Records & Digital Risk"
};

// Canonical order of areas (matches question order)
const AREA_ORDER = ["contracts", "ownership", "subcontractor", "employment", "insurance", "systems"];

export default function AssessmentWizard() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Final email capture step (shown after the last question is submitted)
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({ first_name: "", email: "" });

  // Unscored "About your business" intake: a few quick taps before the
  // scored questions, and a document checklist after them.
  // phase: "about" -> "questions" -> "documents" -> lead capture
  const [profileConfig, setProfileConfig] = useState(null);
  const [phase, setPhase] = useState("questions");
  const [aboutIndex, setAboutIndex] = useState(0);
  const [profile, setProfile] = useState({
    industry: "", revenue: "", team: "", ownership: "", documents: [], concern: ""
  });
  const aboutIndexRef = useRef(0);
  const phaseRef = useRef(phase);
  useEffect(() => { aboutIndexRef.current = aboutIndex; }, [aboutIndex]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const loadAssessment = async () => {
      try {
        // Get assessment details
        const assessmentRes = await axios.get(`${API}/assessments/${assessmentId}`);
        setAssessment(assessmentRes.data);

        // Get selected areas (default to all if not specified)
        const selectedAreas = assessmentRes.data.selected_areas || Object.keys(AREA_LABELS);
        const areasParam = selectedAreas.join(",");

        // Get questions for all selected modules, filtered by selected areas
        const allQuestions = [];
        let profileConfigLoaded = null;
        for (const module of assessmentRes.data.modules) {
          const questionsRes = await axios.get(`${API}/questions/${module}?areas=${areasParam}`);
          allQuestions.push(...questionsRes.data.questions);
          if (questionsRes.data.profile && !profileConfigLoaded) {
            profileConfigLoaded = questionsRes.data.profile;
          }
        }
        setQuestions(allQuestions);
        if (profileConfigLoaded?.questions?.length) {
          setProfileConfig(profileConfigLoaded);
          setPhase("about");
        }
      } catch (error) {
        console.error("Error loading assessment:", error);
        toast.error("Failed to load assessment");
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    loadAssessment();
  }, [assessmentId, navigate]);

  // Scroll back to the top each time the question changes so the next
  // question is visible without manual scrolling.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentQuestionIndex, phase, aboutIndex]);

  // Record how far each visitor gets, once per question, so the admin funnel
  // and Google Analytics can show exactly where people stop.
  const reportedQuestions = useRef(new Set());
  useEffect(() => {
    if (!assessmentId || questions.length === 0 || phase !== "questions") return;
    const number = currentQuestionIndex + 1;
    if (reportedQuestions.current.has(number)) return;
    reportedQuestions.current.add(number);
    const area = questions[currentQuestionIndex]?.area || "";
    track("question_view", { question_number: number, area });
    axios
      .post(`${API}/assessments/${assessmentId}/progress`, { question_number: number, area })
      .catch(() => {});
  }, [currentQuestionIndex, questions, assessmentId, phase]);

  // Jump instantly to the top when the email capture screen appears,
  // after it has rendered (reliable on mobile, unlike a pre-render scroll).
  useEffect(() => {
    if (showLeadCapture) {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  }, [showLeadCapture]);

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0
    ? ((currentQuestionIndex + 1) / questions.length) * 100
    : 0;
  const hasDocumentsStep = !!profileConfig?.documents?.length;

  const handleAnswerSelect = (questionId, option) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        answer_value: option.value,
        points: option.points,
        trigger_flag: option.trigger_flag || false
      }
    }));

    // Auto-advance to the next question after a short pause so the
    // selection is visible. The last question keeps the explicit
    // "Finish Checkup" button so nothing is submitted by surprise.
    if (currentQuestionIndex < questions.length - 1) {
      setTimeout(() => {
        setCurrentQuestionIndex(prev => {
          // Only advance if we are still on the question that was answered
          // (prevents double-jumps from rapid taps).
          if (questions[prev]?.id === questionId) {
            return prev + 1;
          }
          return prev;
        });
      }, 350);
    }
  };

  const handleNext = () => {
    if (!answers[currentQuestion.id]) {
      toast.error("Please select an answer before continuing");
      return;
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else if (profileConfig?.documents?.length) {
      // Last scored question: one more quick screen (documents on hand)
      setPhase("documents");
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else if (profileConfig?.questions?.length) {
      // On question 1, go back to the last About your business screen
      setAboutIndex(profileConfig.questions.length - 1);
      setPhase("about");
    } else {
      navigate("/");
    }
  };

  // ----- About your business (unscored) -----
  const aboutQuestions = profileConfig?.questions || [];
  const currentAbout = aboutQuestions[aboutIndex];

  const advanceAbout = () => {
    if (aboutIndex < aboutQuestions.length - 1) {
      setAboutIndex(prev => prev + 1);
    } else {
      setPhase("questions");
    }
  };

  const handleAboutSelect = (fieldId, value) => {
    setProfile(prev => ({ ...prev, [fieldId]: value }));
    const answeredIndex = aboutIndex;
    // Auto-advance after a short pause, unless the visitor already moved on
    setTimeout(() => {
      if (aboutIndexRef.current !== answeredIndex || phaseRef.current !== "about") return;
      if (answeredIndex < aboutQuestions.length - 1) {
        setAboutIndex(answeredIndex + 1);
      } else {
        setPhase("questions");
      }
    }, 350);
  };

  const handleAboutBack = () => {
    if (aboutIndex > 0) {
      setAboutIndex(prev => prev - 1);
    } else {
      navigate("/");
    }
  };

  const toggleDocument = (value, checked) => {
    setProfile(prev => ({
      ...prev,
      documents: checked
        ? [...prev.documents.filter(d => d !== value), value]
        : prev.documents.filter(d => d !== value)
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await axios.post(`${API}/assessments/submit`, {
        assessment_id: assessmentId,
        answers: Object.values(answers),
        ...(profileConfig ? { profile } : {})
      });

      track("quiz_complete", { assessment_id: assessmentId });

      // Scores are calculated — now ask for their email before showing results
      setShowLeadCapture(true);
    } catch (error) {
      console.error("Error submitting assessment:", error);
      toast.error("Failed to submit assessment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();

    const firstName = leadForm.first_name.trim();
    const email = leadForm.email.trim();

    if (!firstName) {
      toast.error("Please enter your first name");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmittingLead(true);
    try {
      await axios.post(`${API}/leads`, {
        first_name: firstName,
        last_name: "",
        email: email,
        modules: assessment?.modules || ["clbh"],
        assessment_id: assessmentId
      });

      track("lead_capture_submitted", { assessment_id: assessmentId });
      navigate(`/results/${assessmentId}`);
    } catch (error) {
      console.error("Error submitting contact info:", error);
      toast.error("Something went wrong. Please try again.");
      setIsSubmittingLead(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your checkup...</p>
        </div>
      </div>
    );
  }

  const currentArea = currentQuestion?.area;
  const currentAreaLabel = AREA_LABELS[currentArea] || currentArea;

  // Get selected areas from assessment, sorted in canonical order
  const rawSelectedAreas = assessment?.selected_areas || AREA_ORDER;
  const selectedAreas = AREA_ORDER.filter(area => rawSelectedAreas.includes(area));

  // Calculate area number as position within selected areas (1-based)
  const currentAreaNumber = selectedAreas.indexOf(currentArea) + 1;

  // Calculate which question within the current area
  // Find questions in the current area and get position
  const questionsInCurrentArea = questions.filter(q => q.area === currentArea);
  const questionInArea = questionsInCurrentArea.findIndex(q => q.id === currentQuestion?.id) + 1;

  // ----- Final step: email capture (required before results) -----
  if (showLeadCapture) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center relative z-10">
            <a href="https://www.cleanlegalbillofhealth.com" aria-label="Jeppson Law home" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
              <img src="/jeppsonlaw-clbh-logo.png" alt="Jeppson Law and Clean Legal Bill of Health" className="h-7 sm:h-10 md:h-12 w-auto" />
            </a>
            <span className="text-slate-500 text-sm hidden md:block">
              Clean Legal Bill of Health Quick Checkup
            </span>
          </div>
        </nav>

        <main className="max-w-2xl mx-auto px-6 py-12">
          {/* Progress — quiz complete */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Checkup complete!</span>
              <span>One last step</span>
            </div>
            <Progress value={100} className="h-2" data-testid="progress-bar" />
          </div>

          <Card className="border-slate-200 mb-8">
            <CardContent className="p-8">
              <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-7 h-7 text-orange-500" />
              </div>
              <h2 className="font-heading text-xl md:text-2xl font-semibold text-slate-900 mb-2 text-center" data-testid="lead-capture-heading">
                Where should we send your results?
              </h2>
              <p className="text-slate-600 text-center mb-8">
                Your Clean Legal Bill of Health score is ready. Enter your name and email to see your results and get a copy sent to your inbox.
              </p>

              <form onSubmit={handleLeadSubmit} className="space-y-4 max-w-md mx-auto">
                <div>
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={leadForm.first_name}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="John"
                    className="mt-1"
                    data-testid="lead-first-name-input"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@company.com"
                    className="mt-1"
                    data-testid="lead-email-input"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-6 text-lg font-semibold"
                  disabled={isSubmittingLead}
                  data-testid="submit-lead-btn"
                >
                  {isSubmittingLead ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Preparing your results...
                    </>
                  ) : (
                    <>
                      Get My Results
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                <p className="text-slate-400 text-xs text-center">
                  We respect your inbox. Your results will be emailed to you along with helpful guidance from Jeppson Law.
                </p>
              </form>
            </CardContent>
          </Card>
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

  // Shared page frame for the About and Documents screens
  const renderFrame = (children) => (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
        <div className="max-w-7xl mx-auto px-6 py-2 flex justify-between items-center relative z-10">
          <a href="https://www.cleanlegalbillofhealth.com" aria-label="Jeppson Law home" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
            <img src="/jeppsonlaw-clbh-logo.png" alt="Jeppson Law and Clean Legal Bill of Health" className="h-7 sm:h-10 md:h-12 w-auto" />
          </a>
          <span className="text-slate-500 text-sm hidden md:block">
            Clean Legal Bill of Health Quick Checkup
          </span>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-3 md:py-5 min-h-[calc(100dvh-65px)] flex flex-col">
        {children}
      </main>
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

  // Overall progress across every screen (About, scored questions, documents)
  const totalSteps = aboutQuestions.length + questions.length + (profileConfig?.documents?.length ? 1 : 0);
  const overallProgress = (stepNumber) => (totalSteps > 0 ? (stepNumber / totalSteps) * 100 : 0);

  // ----- About your business screens -----
  if (phase === "about" && currentAbout) {
    const selectedValue = profile[currentAbout.id] || "";
    return renderFrame(
      <>
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>About your business · {aboutIndex + 1} of {aboutQuestions.length}</span>
            <span>{Math.round(overallProgress(aboutIndex + 1))}% complete</span>
          </div>
          <Progress value={overallProgress(aboutIndex + 1)} className="h-2" data-testid="progress-bar" />
          {aboutIndex === 0 && (
            <p className="text-slate-400 text-xs text-center mt-2">
              {questions.length} quick questions • 5 to 10 minutes • confidential • instant results
            </p>
          )}
        </div>

        <div className="mb-2.5 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-slate-900 text-white rounded-full">
            <Building2 className="w-4 h-4" />
          </span>
          <span className="text-slate-900 font-medium text-sm">
            A few quick facts so your report fits your business
          </span>
        </div>

        <Card className="border-slate-200 mb-3">
          <CardContent className="p-4 md:p-6">
            <h2 className="font-heading text-lg md:text-xl font-semibold text-slate-900 mb-4 md:mb-5" data-testid="about-question-text">
              {currentAbout.text}
            </h2>
            <RadioGroup
              value={selectedValue}
              onValueChange={(value) => handleAboutSelect(currentAbout.id, value)}
              className="space-y-2"
            >
              {currentAbout.options.map((option, index) => {
                const isSelected = selectedValue === option.value;
                const optionId = `about-${currentAbout.id}-${option.value}`;
                return (
                  <div key={option.value}>
                    <Label
                      htmlFor={optionId}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                      data-testid={`about-option-${index}`}
                    >
                      <RadioGroupItem value={option.value} id={optionId} className="mt-0.5" />
                      <span className="text-slate-700">{option.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleAboutBack} className="px-6" data-testid="about-previous-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {aboutIndex === 0 ? "Back" : "Previous"}
          </Button>
          <Button onClick={advanceAbout} className="bg-slate-900 hover:bg-slate-800 text-white px-6" data-testid="about-next-btn">
            {selectedValue ? "Next" : "Skip"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </>
    );
  }

  // ----- Documents on hand (last screen before results) -----
  if (phase === "documents" && profileConfig?.documents?.length) {
    return renderFrame(
      <>
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>Last step</span>
            <span>{Math.round(overallProgress(totalSteps))}% complete</span>
          </div>
          <Progress value={overallProgress(totalSteps)} className="h-2" data-testid="progress-bar" />
        </div>

        <div className="mb-2.5 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-slate-900 text-white rounded-full">
            <FileCheck className="w-4 h-4" />
          </span>
          <span className="text-slate-900 font-medium text-sm">
            This helps us know what to look at first
          </span>
        </div>

        <Card className="border-slate-200 mb-3">
          <CardContent className="p-4 md:p-6">
            <h2 className="font-heading text-lg md:text-xl font-semibold text-slate-900 mb-1" data-testid="documents-heading">
              Which of these do you have on hand?
            </h2>
            <p className="text-slate-500 text-sm mb-4">Tap all that apply. It is fine if the list is short.</p>
            <div className="space-y-2">
              {profileConfig.documents.map((doc, index) => {
                const checked = profile.documents.includes(doc.value);
                const docId = `doc-${doc.value}`;
                return (
                  <Label
                    key={doc.value}
                    htmlFor={docId}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                      checked ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                    data-testid={`document-option-${index}`}
                  >
                    <Checkbox
                      id={docId}
                      checked={checked}
                      onCheckedChange={(value) => toggleDocument(doc.value, value === true)}
                      className="mt-0.5"
                    />
                    <span className="text-slate-700">{doc.label}</span>
                  </Label>
                );
              })}
            </div>

            <div className="mt-6">
              <Label htmlFor="concern" className="text-slate-900 font-medium">
                {profileConfig.concern_prompt} <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="concern"
                value={profile.concern}
                onChange={(e) => setProfile(prev => ({ ...prev, concern: e.target.value.slice(0, 1000) }))}
                placeholder="A sentence or two is plenty."
                className="mt-2"
                rows={3}
                data-testid="concern-input"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setPhase("questions")}
            className="px-6"
            data-testid="documents-previous-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6"
            data-testid="finish-btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Finish Checkup
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
        <div className="max-w-7xl mx-auto px-6 py-2 flex justify-between items-center relative z-10">
          <a href="https://www.cleanlegalbillofhealth.com" aria-label="Jeppson Law home" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
            <img src="/jeppsonlaw-clbh-logo.png" alt="Jeppson Law and Clean Legal Bill of Health" className="h-7 sm:h-10 md:h-12 w-auto" />
          </a>
          <span className="text-slate-500 text-sm hidden md:block">
            Clean Legal Bill of Health Quick Checkup
          </span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-3 md:py-5 min-h-[calc(100dvh-65px)] flex flex-col">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(profileConfig ? overallProgress(aboutQuestions.length + currentQuestionIndex + 1) : progress)}% complete</span>
          </div>
          <Progress
            value={profileConfig ? overallProgress(aboutQuestions.length + currentQuestionIndex + 1) : progress}
            className="h-2"
            data-testid="progress-bar"
          />
          {currentQuestionIndex === 0 && !profileConfig && (
            <p className="text-slate-400 text-xs text-center mt-2">
              {questions.length} quick questions • 5 to 10 minutes • confidential • instant results
            </p>
          )}
        </div>

        {/* Area Badge */}
        <div className="mb-2.5 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm font-bold rounded-full">
            {currentAreaNumber}
          </span>
          <div>
            <span className="text-slate-900 font-medium text-sm">
              {currentAreaLabel}
            </span>
            <span className="text-slate-400 text-sm ml-2">
              (Q{questionInArea} of {questionsInCurrentArea.length})
            </span>
            {selectedAreas.length < 6 && (
              <span className="text-slate-400 text-xs ml-2">
                • Area {currentAreaNumber} of {selectedAreas.length}
              </span>
            )}
          </div>
        </div>

        {/* Question Card */}
        <Card className="border-slate-200 mb-3">
          <CardContent className="p-4 md:p-6">
            <h2 className="font-heading text-lg md:text-xl font-semibold text-slate-900 mb-4 md:mb-5" data-testid="question-text">
              {currentQuestion?.text}
            </h2>

            <RadioGroup
              value={answers[currentQuestion?.id]?.answer_value || ""}
              onValueChange={(value) => {
                const option = currentQuestion.options.find(o => o.value === value);
                if (option) handleAnswerSelect(currentQuestion.id, option);
              }}
              className="space-y-2"
            >
              {currentQuestion?.options.map((option, index) => {
                const isSelected = answers[currentQuestion.id]?.answer_value === option.value;
                // Color-code options based on their value
                let borderColor = "border-slate-200 hover:border-slate-300";
                let bgColor = "hover:bg-slate-50/50";
                if (isSelected) {
                  if (option.value === "green") {
                    borderColor = "border-emerald-500";
                    bgColor = "bg-emerald-50";
                  } else if (option.value === "yellow") {
                    borderColor = "border-amber-500";
                    bgColor = "bg-amber-50";
                  } else if (option.value === "red") {
                    borderColor = "border-red-500";
                    bgColor = "bg-red-50";
                  }
                }

                return (
                  <div key={option.value}>
                    <Label
                      htmlFor={option.value}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${borderColor} ${bgColor}`}
                      data-testid={`option-${index}`}
                    >
                      <RadioGroupItem
                        value={option.value}
                        id={option.value}
                        className="mt-0.5"
                      />
                      <span className="text-slate-700">{option.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            className="px-6"
            data-testid="previous-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {currentQuestionIndex === 0 ? "Back" : "Previous"}
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            className={`${currentQuestionIndex === questions.length - 1 && !hasDocumentsStep ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'} text-white px-6`}
            data-testid="next-btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : currentQuestionIndex === questions.length - 1 && !hasDocumentsStep ? (
              <>
                Finish Checkup
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Area Progress Dots */}
        <div className="flex justify-center mt-3 gap-2.5 sm:gap-2 flex-wrap">
          {selectedAreas.map((areaKey, areaIndex) => {
            // Get questions for this area from the filtered questions list
            const areaQuestions = questions.filter(q => q.area === areaKey);
            const isCurrentArea = currentArea === areaKey;

            // Calculate global start index for this area
            let globalStartIndex = 0;
            for (let i = 0; i < areaIndex; i++) {
              globalStartIndex += questions.filter(q => q.area === selectedAreas[i]).length;
            }

            return (
              <div key={areaKey} className="flex items-center gap-1">
                {areaQuestions.map((q, qIndex) => {
                  const globalIndex = globalStartIndex + qIndex;
                  const isCurrentQuestion = globalIndex === currentQuestionIndex;
                  const isAnswered = answers[q?.id];

                  return (
                    <div
                      key={q.id}
                      className={`w-2 h-2 rounded-full transition-all ${
                        isCurrentQuestion
                          ? 'bg-blue-600 w-3'
                          : isAnswered
                          ? answers[q?.id]?.answer_value === 'red'
                            ? 'bg-red-500'
                            : answers[q?.id]?.answer_value === 'yellow'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          : 'bg-slate-200'
                      }`}
                    />
                  );
                })}
                {areaIndex < selectedAreas.length - 1 && <div className="hidden sm:block w-2" />}
              </div>
            );
          })}
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
