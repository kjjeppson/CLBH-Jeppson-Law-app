import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, ArrowRight, ArrowLeft, Loader2, Upload, X, Save } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODULE_LABELS = {
  lease: "Commercial Lease Risk",
  acquisition: "Entity Purchase / Acquisition Risk",
  ownership: "Ownership / Partner Agreement Risk"
};

// Session storage key helper
const getSessionKey = (assessmentId) => `clbh_session_${assessmentId}`;

// Save session to localStorage
const saveSession = (assessmentId, data) => {
  try {
    localStorage.setItem(getSessionKey(assessmentId), JSON.stringify({
      ...data,
      lastSaved: new Date().toISOString()
    }));
  } catch (error) {
    console.error("Failed to save session:", error);
  }
};

// Load session from localStorage
const loadSession = (assessmentId) => {
  try {
    const saved = localStorage.getItem(getSessionKey(assessmentId));
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Failed to load session:", error);
    return null;
  }
};

// Clear session from localStorage
const clearSession = (assessmentId) => {
  try {
    localStorage.removeItem(getSessionKey(assessmentId));
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
};

export default function AssessmentWizard() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [lastSaved, setLastSaved] = useState(null);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);

  useEffect(() => {
    const loadAssessment = async () => {
      try {
        // Get assessment details
        const assessmentRes = await axios.get(`${API}/assessments/${assessmentId}`);
        setAssessment(assessmentRes.data);

        // Get questions for all selected modules
        const allQuestions = [];
        for (const module of assessmentRes.data.modules) {
          const questionsRes = await axios.get(`${API}/questions/${module}`);
          allQuestions.push(...questionsRes.data.questions);
        }
        setQuestions(allQuestions);

        // Try to restore saved session
        const savedSession = loadSession(assessmentId);
        const shouldResume = searchParams.get('resume') === 'true' || savedSession !== null;

        if (savedSession && shouldResume) {
          setAnswers(savedSession.answers || {});
          setCurrentQuestionIndex(savedSession.currentQuestionIndex || 0);
          setUploadedFiles(savedSession.uploadedFiles || []);
          setShowUpload(savedSession.showUpload || false);
          setLastSaved(savedSession.lastSaved);

          const savedTime = new Date(savedSession.lastSaved).toLocaleTimeString();
          toast.success(`Session restored from ${savedTime}`, {
            description: `Recovered ${Object.keys(savedSession.answers || {}).length} saved answers`
          });
        }
      } catch (error) {
        console.error("Error loading assessment:", error);
        toast.error("Failed to load assessment");
        navigate("/select-modules");
      } finally {
        setIsLoading(false);
      }
    };

    loadAssessment();
  }, [assessmentId, navigate, searchParams]);

  // Auto-save session whenever answers or progress changes
  useEffect(() => {
    if (questions.length > 0 && Object.keys(answers).length > 0) {
      const sessionData = {
        answers,
        currentQuestionIndex,
        uploadedFiles,
        showUpload
      };

      saveSession(assessmentId, sessionData);
      setLastSaved(new Date().toISOString());

      // Show save indicator briefly
      setShowSaveIndicator(true);
      const timer = setTimeout(() => setShowSaveIndicator(false), 2000);

      return () => clearTimeout(timer);
    }
  }, [answers, currentQuestionIndex, uploadedFiles, showUpload, assessmentId, questions.length]);

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 
    ? ((currentQuestionIndex + 1) / questions.length) * 100 
    : 0;

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
  };

  const handleNext = () => {
    if (!answers[currentQuestion.id]) {
      toast.error("Please select an answer before continuing");
      return;
    }
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Show optional upload step
      setShowUpload(true);
    }
  };

  const handlePrevious = () => {
    if (showUpload) {
      setShowUpload(false);
    } else if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
    // Note: In a real implementation, you would upload files to a server
    toast.success(`${files.length} file(s) added`);
  };

  const removeFile = (fileName) => {
    setUploadedFiles(prev => prev.filter(f => f !== fileName));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API}/assessments/submit`, {
        assessment_id: assessmentId,
        answers: Object.values(answers)
      });

      // Clear saved session on successful submit
      clearSession(assessmentId);

      navigate(`/results/${assessmentId}`);
    } catch (error) {
      console.error("Error submitting assessment:", error);
      toast.error("Failed to submit assessment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  const currentModule = currentQuestion?.module;
  const currentModuleLabel = MODULE_LABELS[currentModule] || currentModule;

  // Optional Upload Step
  if (showUpload) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-slate-900" />
              <span className="font-brand text-xl font-bold text-slate-900">
                Jeppsonlaw<span className="text-slate-500">, LLP</span>
              </span>
            </div>
            {showSaveIndicator && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm animate-fade-in">
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Saved</span>
              </div>
            )}
          </div>
        </nav>

        <main className="max-w-2xl mx-auto px-6 py-12">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Almost done!</span>
              <span>Optional Step</span>
            </div>
            <Progress value={100} className="h-2" />
          </div>

          <Card className="border-slate-200 mb-8">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-slate-600" />
                </div>
                <h2 className="font-heading text-2xl font-bold text-slate-900 mb-2">
                  Upload Documents (Optional)
                </h2>
                <p className="text-slate-600">
                  Have a lease, LOI, or operating agreement you'd like us to review? 
                  Upload it here. This helps us provide more tailored recommendations.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:border-slate-300 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  data-testid="file-upload-input"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">
                    <span className="text-slate-900 font-medium">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-slate-500 text-sm">PDF, DOC, DOCX up to 10MB</p>
                </label>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                      <span className="text-slate-700 text-sm truncate">{file}</span>
                      <button
                        onClick={() => removeFile(file)}
                        className="text-slate-400 hover:text-slate-600"
                        data-testid={`remove-file-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-slate-500 text-xs mt-4 text-center">
                Documents are kept confidential and used only to enhance your assessment results.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="px-6"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8"
              data-testid="get-results-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Get My Results
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-slate-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppsonlaw<span className="text-slate-500">, LLP</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            {showSaveIndicator && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm animate-fade-in">
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Saved</span>
              </div>
            )}
            <span className="text-slate-500 text-sm hidden md:block">
              {currentModuleLabel}
            </span>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
        </div>

        {/* Module Badge */}
        <div className="mb-6">
          <span className="inline-block bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1 rounded-full">
            {currentModuleLabel}
          </span>
        </div>

        {/* Question Card */}
        <Card className="border-slate-200 mb-8">
          <CardContent className="p-8">
            <h2 className="font-heading text-xl md:text-2xl font-semibold text-slate-900 mb-8" data-testid="question-text">
              {currentQuestion?.text}
            </h2>

            <RadioGroup
              value={answers[currentQuestion?.id]?.answer_value || ""}
              onValueChange={(value) => {
                const option = currentQuestion.options.find(o => o.value === value);
                if (option) handleAnswerSelect(currentQuestion.id, option);
              }}
              className="space-y-3"
            >
              {currentQuestion?.options.map((option, index) => (
                <div key={option.value}>
                  <Label
                    htmlFor={option.value}
                    className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                      answers[currentQuestion.id]?.answer_value === option.value
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
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
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            className="px-6"
            data-testid="previous-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button
            onClick={handleNext}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6"
            data-testid="next-btn"
          >
            {currentQuestionIndex === questions.length - 1 ? "Continue" : "Next"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Question Counter Dots */}
        <div className="flex justify-center mt-8 gap-1 flex-wrap">
          {questions.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentQuestionIndex
                  ? 'bg-slate-900 w-4'
                  : index < currentQuestionIndex && answers[questions[index]?.id]
                  ? 'bg-emerald-500'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
