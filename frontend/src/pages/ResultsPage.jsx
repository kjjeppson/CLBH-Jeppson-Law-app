import { useState, useEffect } from "react";
import { track } from "../lib/analytics";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle,
  Calendar, ArrowRight, Loader2, ChevronDown, Check,
  Phone, FileText, Users, Briefcase, UserCheck, ShieldCheck, Database, ShoppingCart
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Squarespace shop products, keyed by the quiz's internal area IDs
const SHOP_BASE = "https://www.cleanlegalbillofhealth.com";
const BUNDLE_URL = `${SHOP_BASE}/shop/p/6-pillars-bundle`;
const PILLAR_PRODUCTS = {
  contracts: {
    pillar: 1,
    url: `${SHOP_BASE}/shop/p/pillar-1-checklist-customer-contracts-project-risks`
  },
  ownership: {
    pillar: 2,
    url: `${SHOP_BASE}/shop/p/pillar-2-checklist-ownership-governance`
  },
  subcontractor: {
    pillar: 3,
    url: `${SHOP_BASE}/shop/p/pillar-3-checklist-vendor-risk`
  },
  employment: {
    pillar: 4,
    url: `${SHOP_BASE}/shop/p/pillar-4-checklist-employment-safety-compliance`
  },
  insurance: {
    pillar: 5,
    url: `${SHOP_BASE}/shop/p/pillar-5-checklist-insurance-claims-readiness`
  },
  systems: {
    pillar: 6,
    url: `${SHOP_BASE}/shop/p/pillar-6-checklist-systems-records-digital-risk`
  }
};

// Adds UTM tags so quiz-driven purchases show up in analytics
const withUtm = (url, content) =>
  `${url}?utm_source=quiz&utm_medium=results&utm_campaign=clbh&utm_content=${content}`;

const openShopLink = (url, content) => {
  track("results_cta_click", { target: content });
  window.open(withUtm(url, content), "_blank");
};

const AREA_ICONS = {
  contracts: <FileText className="w-5 h-5" />,
  ownership: <Users className="w-5 h-5" />,
  subcontractor: <Briefcase className="w-5 h-5" />,
  employment: <UserCheck className="w-5 h-5" />,
  insurance: <ShieldCheck className="w-5 h-5" />,
  systems: <Database className="w-5 h-5" />
};


// Status colors for each area's label, icon and bar. Cards share one neutral
// light blue background so the card color never suggests a grade by itself.
const STATUS = {
  green: { solid: "bg-emerald-500", text: "text-emerald-700", label: "Healthy" },
  yellow: { solid: "bg-amber-500", text: "text-amber-700", label: "Worth a look" },
  red: { solid: "bg-red-500", text: "text-red-700", label: "Fix now" }
};

// What a Healthy answer means, phrased as good news (the risk titles name the problem)
const HEALTHY_LABELS = {
  q1: "Clear contract terms", q2: "Change order process in place", q3: "Liability cap in your contracts", q4: "Written, reviewed agreements",
  q5: "Written ownership agreement", q6: "Buy-sell provisions in place", q7: "Plan for partner deadlocks", q8: "Entity structure fits your business",
  q9: "Signed vendor agreements", q10: "Workers classified correctly", q11: "Indemnification in vendor contracts", q12: "Vendor insurance verified",
  q13: "Current employee handbook", q14: "Pay practices reviewed", q15: "Termination documentation", q16: "Employee confidentiality agreements",
  q17: "Coverage fits your current operations", q18: "Contracts match your insurance", q19: "Incident response plan", q20: "Known policy limits and exclusions",
  q21: "Organized records", q22: "Data security in place", q23: "Access controls in place", q24: "Due diligence ready",
  // Current 12-question checkup
  c1: "Signed, clear customer contracts", c2: "Change order process in place",
  o1: "Owner exit plan in writing", o2: "Company records current",
  v1: "Signed, protective vendor agreements", v2: "Workers classified correctly",
  e1: "Current employee handbook", e2: "Pay practices reviewed",
  i1: "Insurance reviewed and gaps addressed", i2: "Contracts match your insurance",
  r1: "Records ready for a buyer or lender", r2: "Sensitive data secured"
};

const flagsFor = (list, areaId) => (list || []).filter((f) => f.area === areaId);

export default function ResultsPage() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();

  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openArea, setOpenArea] = useState(undefined);

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

  const handleScheduleCall = () => {
    window.open('https://jeppsonlaw.cliogrow.com/book/5d7625ad3292b0e84db81965f80ee5f4', '_blank');
  };

  const getOverallScoreDisplay = () => {
    switch (results?.risk_level) {
      case "green":
        return {
          icon: <CheckCircle2 className="w-9 h-9 sm:w-10 sm:h-10 text-white" />,
          bgColor: "bg-emerald-500",
          textColor: "text-emerald-600",
          label: "Healthy",
          description: "Your business has a strong legal foundation. Review the details below for any specific areas to monitor."
        };
      case "yellow":
        return {
          icon: <AlertTriangle className="w-9 h-9 sm:w-10 sm:h-10 text-white" />,
          bgColor: "bg-amber-500",
          textColor: "text-amber-700",
          label: "Worth a look",
          description: "You have a solid start and a few gaps worth closing. Nothing here is unusual, and every item is fixable. Start with the items below."
        };
      case "red":
        return {
          icon: <XCircle className="w-9 h-9 sm:w-10 sm:h-10 text-white" />,
          bgColor: "bg-red-500",
          textColor: "text-red-600",
          label: "Fix now",
          description: "Several areas need attention now. These gaps are fixable, and the items below show where to start. A review call can help you prioritize."
        };
      default:
        return {
          icon: <Shield className="w-9 h-9 sm:w-10 sm:h-10 text-white" />,
          bgColor: "bg-slate-500",
          textColor: "text-slate-700",
          label: "Complete",
          description: "Your checkup is complete."
        };
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

  const scoreDisplay = getOverallScoreDisplay();

  // Weak pillars (red first, then yellow, worst score first within each)
  const weakAreas = (results?.area_scores || [])
    .filter((a) => a.risk_level === "red" || a.risk_level === "yellow")
    .sort((a, b) => {
      if (a.risk_level !== b.risk_level) return a.risk_level === "red" ? -1 : 1;
      return a.score - b.score;
    });
  const areaCount = results?.area_scores?.length || 0;
  // Score bands for the legend: 2 questions per area now (max 6),
  // older checkups had 4 per area (max 12).
  const areaMax = results?.area_scores?.[0]?.max_score || 6;
  const scoreBands = areaMax === 12
    ? { green: "10 to 12", yellow: "7 to 9", red: "4 to 6" }
    : { green: "5 to 6", yellow: "4", red: "2 to 3" };

  // Areas lowest score first (ties keep the pillar order)
  const sortedAreas = [...(results?.area_scores || [])]
    .map((a, i) => ({ ...a, _i: i }))
    .sort((a, b) => a.score - b.score || a._i - b._i);

  // "Start here": the top Fix now item from each of the lowest-scoring areas,
  // then any other Fix now items, then Worth a look items, up to three.
  const firstFixes = [];
  const seen = new Set();
  const pushFlag = (flag, level) => {
    if (!flag || firstFixes.length >= 3 || seen.has(flag.question_id)) return;
    seen.add(flag.question_id);
    firstFixes.push({ ...flag, level });
  };
  sortedAreas.forEach((a) => pushFlag(flagsFor(results?.red_flag_details, a.area_id)[0], "red"));
  sortedAreas.forEach((a) => flagsFor(results?.red_flag_details, a.area_id).forEach((f) => pushFlag(f, "red")));
  sortedAreas.forEach((a) => flagsFor(results?.yellow_flag_details, a.area_id).forEach((f) => pushFlag(f, "yellow")));
  const totalItems = (results?.red_flag_details?.length || 0) + (results?.yellow_flag_details?.length || 0);

  // The lowest-scoring area that needs work starts open; people can open or close any area
  const defaultOpen = sortedAreas.find((a) => a.risk_level !== "green")?.area_id || null;
  const currentOpen = openArea === undefined ? defaultOpen : openArea;
  const toggleArea = (areaId) => {
    const next = currentOpen === areaId ? null : areaId;
    if (next) track("results_area_open", { area: areaId });
    setOpenArea(next);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 no-print nav-grid">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 relative z-10">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img
              src="/clbh-logo.png"
              alt="Clean Legal Bill of Health — A Jeppson Law Product"
              className="h-12 sm:h-14 md:h-16 w-auto shrink-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => openShopLink(`${SHOP_BASE}/shop`, "nav-shop")}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm px-2 sm:px-4 shrink-0"
              data-testid="purchase-checklist-btn"
            >
              <ShoppingCart className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Shop checklists</span>
              <span className="sm:hidden">Checklist</span>
            </Button>
            <Button
              onClick={handleScheduleCall}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm px-2 sm:px-4 shrink-0"
              data-testid="schedule-call-nav-btn"
            >
              <Calendar className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Book a free review call</span>
              <span className="sm:hidden">Book a Call</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Overall result */}
        <section className="text-center">
          <div className={`w-16 h-16 sm:w-20 sm:h-20 ${scoreDisplay.bgColor} rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg`}>
            {scoreDisplay.icon}
          </div>
          <p className="text-xs sm:text-sm font-semibold tracking-[0.15em] text-slate-500 mb-2">YOUR LEGAL HEALTH REPORT</p>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-slate-900 mb-3" data-testid="overall-result">
            Your result:{" "}
            <span className={scoreDisplay.textColor}>{scoreDisplay.label}</span>
          </h1>
          <p className="text-slate-600 text-base sm:text-lg max-w-2xl mx-auto mb-4">
            {scoreDisplay.description}
          </p>
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm text-sm sm:text-base">
            <span className="text-slate-600">Score</span>
            <span className="font-bold text-slate-900">{results?.total_score || 0} / {results?.max_possible_score || 72}</span>
            <span className="text-slate-300">|</span>
            <span className="font-bold text-slate-900">{Math.round(results?.score_percentage || 0)}%</span>
          </div>
          {results?.selected_areas && results.selected_areas.length < 6 && (
            <p className="text-slate-500 text-sm mt-3">
              Checked {results.selected_areas.length} of 6 areas
            </p>
          )}
        </section>

        {/* Start here */}
        {firstFixes.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm" data-testid="start-here-section">
            <p className="text-xs sm:text-sm font-bold tracking-[0.15em] text-orange-700 mb-1">START HERE</p>
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">
              {firstFixes.length === 1 ? "Your first fix" : `Your ${firstFixes.length} first fixes`}
            </h2>
            <p className="text-slate-500 text-sm sm:text-base mb-5">
              The most important items from your lowest-scoring areas.
            </p>
            <ol className="space-y-3">
              {firstFixes.map((flag, i) => {
                const isRed = flag.level === "red";
                return (
                  <li
                    key={flag.question_id || i}
                    className={`flex items-start gap-3 sm:gap-4 p-4 rounded-xl border ${isRed ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}
                  >
                    <span className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="space-y-1">
                      <h3 className="font-heading text-base sm:text-lg font-bold text-slate-900">{flag.title}</h3>
                      <p className="text-sm sm:text-base text-slate-600">{flag.description}</p>
                      <p className={`text-xs sm:text-sm font-semibold ${isRed ? "text-red-700" : "text-amber-700"}`}>
                        {flag.area_name} · {isRed ? "Fix now" : "Worth a look"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {totalItems > firstFixes.length && (
              <p className="text-slate-500 text-sm mt-4">
                Your full list of {totalItems} items is organized by area below.
              </p>
            )}
          </section>
        )}

        {/* Bundle offer */}
        {weakAreas.length > 0 ? (
          <section className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-testid="bundle-section">
            <div>
              <h2 className="font-heading text-lg sm:text-xl font-extrabold text-slate-900 mb-1">
                {weakAreas.length === areaCount
                  ? `All ${areaCount} of your areas need some attention`
                  : `${weakAreas.length} of your ${areaCount} areas need some attention`}
              </h2>
              <p className="text-slate-600 text-sm sm:text-base">
                The 6 Pillar Bundle gives you every checklist for $299, instead of $402 bought separately.
              </p>
            </div>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-6 text-base flex-shrink-0"
              onClick={() => openShopLink(BUNDLE_URL, "bundle")}
              data-testid="bundle-cta-btn"
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Get the bundle ($299)
            </Button>
          </section>
        ) : (
          areaCount > 0 && (
            <section className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 text-center" data-testid="all-green-section">
              <h2 className="font-heading text-xl font-extrabold text-slate-900 mb-2">
                Strong score. Keep it that way.
              </h2>
              <p className="text-slate-700 mb-4">
                Laws and businesses both change. The 6 Pillar Checklist Bundle gives you a
                repeatable annual checkup you can run yourself, for $299.
              </p>
              <Button
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => openShopLink(BUNDLE_URL, "bundle-green")}
                data-testid="bundle-green-cta-btn"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Get the Bundle ($299)
              </Button>
            </section>
          )
        )}

        {/* Your areas */}
        <section className="space-y-4" data-testid="areas-section">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">
                Your {areaCount} areas
              </h2>
              <p className="text-slate-500 text-sm sm:text-base">
                Lowest scores first. Open an area to see exactly what we found.
              </p>
            </div>
            <div className="flex flex-wrap md:flex-nowrap md:flex-shrink-0 gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{scoreBands.green}: Healthy</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />{scoreBands.yellow}: Worth a look</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />{scoreBands.red}: Fix now</span>
            </div>
          </div>

          {sortedAreas.map((area) => {
            const st = STATUS[area.risk_level] || STATUS.yellow;
            const product = PILLAR_PRODUCTS[area.area_id];
            const fix = flagsFor(results?.red_flag_details, area.area_id);
            const wal = flagsFor(results?.yellow_flag_details, area.area_id);
            const ok = flagsFor(results?.green_flag_details, area.area_id);
            const isOpen = currentOpen === area.area_id;
            return (
              <div
                key={area.area_id}
                className={`rounded-2xl border-2 p-4 sm:p-6 space-y-3 sm:space-y-4 bg-[#F4F8FD] border-[#D6E3F3]`}
                data-testid={`area-card-${area.area_id}`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 ${st.solid} rounded-xl flex items-center justify-center text-white flex-shrink-0`}>
                    {AREA_ICONS[area.area_id] || <Shield className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading text-base sm:text-lg font-bold text-slate-900 leading-snug">{area.area_name}</h3>
                    <span className={`text-sm sm:text-base font-semibold ${st.text}`}>{st.label}</span>
                  </div>
                  <div className="flex items-baseline gap-0.5 flex-shrink-0">
                    <span className="font-heading text-3xl font-extrabold text-slate-900">{area.score}</span>
                    <span className="text-slate-400 text-sm">/{area.max_score}</span>
                  </div>
                </div>

                <div className="w-full bg-[#E3ECF7] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${st.solid} transition-all duration-500`}
                    style={{ width: `${(area.score / area.max_score) * 100}%` }}
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-600">
                    {fix.length > 0 && (
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{fix.length} to fix now</span>
                    )}
                    {wal.length > 0 && (
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{wal.length} worth a look</span>
                    )}
                    {ok.length > 0 && (
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{ok.length} healthy</span>
                    )}
                  </div>
                  <div className="hidden md:flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleArea(area.area_id)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-slate-900 hover:text-orange-700"
                      data-testid={`area-toggle-${area.area_id}`}
                    >
                      {isOpen ? "Hide details" : "See what we found"}
                      <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {product && area.risk_level !== "green" && (
                      <Button
                        variant="outline"
                        className="border-slate-900 border-[1.5px] bg-white text-slate-900 hover:bg-slate-50 font-semibold"
                        onClick={() => openShopLink(product.url, `pillar-${product.pillar}`)}
                        data-testid={`pillar-${product.pillar}-cta-btn`}
                      >
                        Pillar {product.pillar} checklist · $67
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className={"bg-white rounded-xl border border-[#D6E3F3] p-4 sm:p-6 space-y-5"}>
                    {fix.length > 0 && (
                      <div className="space-y-2.5">
                        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-red-700">
                          <XCircle className="w-4 h-4" /> FIX NOW
                        </p>
                        {fix.map((f) => (
                          <div key={f.question_id} className="md:pl-6">
                            <h4 className="font-heading font-bold text-slate-900">{f.title}</h4>
                            <p className="text-sm text-slate-600">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {wal.length > 0 && (
                      <div className="space-y-2.5">
                        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-amber-700">
                          <AlertTriangle className="w-4 h-4" /> WORTH A LOOK
                        </p>
                        {wal.map((f) => (
                          <div key={f.question_id} className="md:pl-6">
                            <h4 className="font-heading font-bold text-slate-900">{f.title}</h4>
                            <p className="text-sm text-slate-600">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {ok.length > 0 && (
                      <div className="space-y-2.5">
                        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> ALREADY HEALTHY
                        </p>
                        <div className="flex flex-wrap gap-2 md:pl-6">
                          {ok.map((f) => (
                            <span
                              key={f.question_id}
                              className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-3 py-1.5 rounded-full"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {HEALTHY_LABELS[f.question_id] || f.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Phone: stacked buttons */}
                <div className="flex flex-col gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => toggleArea(area.area_id)}
                    aria-expanded={isOpen}
                    className={`flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-slate-900 rounded-lg border border-[#D6E3F3] bg-white`}
                  >
                    {isOpen ? "Hide details" : "See what we found"}
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {product && area.risk_level !== "green" && (
                    <Button
                      variant="outline"
                      className="w-full border-slate-900 border-[1.5px] bg-white text-slate-900 hover:bg-slate-50 font-semibold py-5"
                      onClick={() => openShopLink(product.url, `pillar-${product.pillar}`)}
                    >
                      Get the Pillar {product.pillar} checklist ($67)
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Review call */}
        <section className="bg-orange-50 border border-orange-200 rounded-2xl p-5 sm:p-8">
          <p className="text-xs sm:text-sm font-bold tracking-[0.15em] text-orange-700 mb-1">NOT SURE WHERE TO START?</p>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mb-4">
            Book a free CLBH review call
          </h2>
          <ul className="grid md:grid-cols-3 gap-3 mb-6">
            <li className="flex items-start gap-2.5 text-slate-700">
              <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              We review your checkup results with you in detail
            </li>
            <li className="flex items-start gap-2.5 text-slate-700">
              <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              We pick the highest-priority items together
            </li>
            <li className="flex items-start gap-2.5 text-slate-700">
              <CheckCircle2 className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              You leave with a clear plan and timeline
            </li>
          </ul>
          <Button
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white px-7 py-6 text-lg font-bold"
            onClick={handleScheduleCall}
            data-testid="book-review-call-btn"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Schedule a free review call
          </Button>
        </section>

        {/* Disclaimer + navigation */}
        <section className="space-y-5 pb-4">
          <p className="text-slate-500 text-xs sm:text-sm text-center max-w-2xl mx-auto">
            This checkup is for educational purposes only and is not legal advice. For guidance on
            your situation, talk with a licensed attorney, or schedule a consultation with Jeppson Law.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-center">
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
              onClick={() => navigate("/")}
              className="bg-slate-900 hover:bg-slate-800 flex items-center justify-center"
              data-testid="new-assessment-btn"
            >
              Take Another Checkup
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 pb-24 sm:pb-6 bg-white border-t border-slate-200 grid-pattern-light">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:justify-between items-center gap-4">
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
        </div>
      </footer>

      {/* Floating Book Now Button (desktop/tablet only — hidden on mobile to avoid covering content) */}
      <div className="hidden sm:block fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 no-print">
        <Button
          onClick={handleScheduleCall}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-6 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 rounded-full group"
          data-testid="floating-book-btn"
        >
          <Calendar className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
          Book Now
        </Button>
      </div>

    </div>
  );
}
