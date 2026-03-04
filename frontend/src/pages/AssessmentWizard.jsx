import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AREA_LABELS = {
  contracts: "Customer Contracts & Project Risks",
  ownership: "Ownership & Governance",
  subcontractor: "Vendors",
  employment: "Employment & Safety Compliance",
  insurance: "Insurance and Risk Management",
  systems: "Systems, Records & Digital Risk"
};

// Canonical order of areas (matches question order q1-q24)
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
        for (const module of assessmentRes.data.modules) {
          const questionsRes = await axios.get(`${API}/questions/${module}?areas=${areasParam}`);
          allQuestions.push(...questionsRes.data.questions);
        }
        setQuestions(allQuestions);
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
      // Submit the assessment
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else {
      // On question 1, go back to landing page
      navigate("/");
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API}/assessments/submit`, {
        assessment_id: assessmentId,
        answers: Object.values(answers)
      });

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

  const currentArea = currentQuestion?.area;
  const currentAreaLabel = AREA_LABELS[currentArea] || currentArea;

  // Get selected areas from assessment, sorted in canonical order
  const rawSelectedAreas = assessment?.selected_areas || AREA_ORDER;
  const selectedAreas = AREA_ORDER.filter(area => rawSelectedAreas.includes(area));

  // Calculate area number as position within selected areas (1-based)
  const currentAreaNumber = selectedAreas.indexOf(currentArea) + 1;

  // Calculate which question within the current area (1-4)
  // Find questions in the current area and get position
  const questionsInCurrentArea = questions.filter(q => q.area === currentArea);
  const questionInArea = questionsInCurrentArea.findIndex(q => q.id === currentQuestion?.id) + 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppson Law<span className="text-slate-500">, LLP</span>
            </span>
          </div>
          <span className="text-slate-500 text-sm hidden md:block">
            Clean Legal Bill of Health Quiz
          </span>
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

        {/* Area Badge */}
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm font-bold rounded-full">
            {currentAreaNumber}
          </span>
          <div>
            <span className="text-slate-900 font-medium text-sm">
              {currentAreaLabel}
            </span>
            <span className="text-slate-400 text-sm ml-2">
              (Q{questionInArea} of 4)
            </span>
            {selectedAreas.length < 6 && (
              <span className="text-slate-400 text-xs ml-2">
                • Area {currentAreaNumber} of {selectedAreas.length}
              </span>
            )}
          </div>
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
                      className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all ${borderColor} ${bgColor}`}
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
            className={`${currentQuestionIndex === questions.length - 1 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-900 hover:bg-slate-800'} text-white px-6`}
            data-testid="next-btn"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : currentQuestionIndex === questions.length - 1 ? (
              <>
                Get My Results
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
        <div className="flex justify-center mt-8 gap-2 flex-wrap">
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
                {areaIndex < selectedAreas.length - 1 && <div className="w-2" />}
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
