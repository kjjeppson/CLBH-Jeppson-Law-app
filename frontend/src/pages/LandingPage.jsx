import { useState, useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { FileCheck, Loader2, Phone, Users, Truck, HardHat, ShieldCheck, FolderOpen } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BOOKING_URL = "https://jeppsonlaw.cliogrow.com/book/5d7625ad3292b0e84db81965f80ee5f4";

// Every visitor takes all six areas. The old "tap to remove an area" picker
// was removed from the landing page in the Sep 2026 redesign.
// Browsers that have opened the admin page are marked as team test browsers,
// so checkups taken there stay out of the funnel counts.
const isInternalBrowser = () => {
  try {
    return window.localStorage.getItem("clbh_internal") === "1";
  } catch (e) {
    return false;
  }
};

const ALL_AREAS = ["contracts", "ownership", "subcontractor", "employment", "insurance", "systems"];

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

const TM = () => <span className="align-super text-[0.4em] font-normal">™</span>;

const sampleReport = [
  { area: "Customer contracts", label: "Healthy", dot: "bg-emerald-600" },
  { area: "Ownership and governance", label: "Worth a look", dot: "bg-amber-500" },
  { area: "Vendors and subcontractors", label: "Fix now", dot: "bg-red-600" },
  { area: "Employment and safety", label: "Worth a look", dot: "bg-amber-500" },
  { area: "Insurance", label: "Healthy", dot: "bg-emerald-600" },
  { area: "Records and digital", label: "Worth a look", dot: "bg-amber-500" },
];

const readers = [
  { who: "A buyer", what: "Their attorney reads every contract before the sale closes." },
  { who: "A lender", what: "Your bank reviews ownership and records before it renews a line of credit." },
  { who: "An unhappy customer", what: "A payment dispute turns on what your contract actually says." },
  { who: "A partner who wants out", what: "Your operating agreement decides what happens next." },
];

const areas = [
  { icon: FileCheck, name: "Customer contracts" },
  { icon: Users, name: "Ownership and governance" },
  { icon: Truck, name: "Vendors and subcontractors" },
  { icon: HardHat, name: "Employment and safety" },
  { icon: ShieldCheck, name: "Insurance" },
  { icon: FolderOpen, name: "Records and digital" },
];

const steps = [
  { title: "Answer 24 questions", text: "Plain English, multiple choice. About 5 to 10 minutes." },
  { title: "Get your Legal Health Report", text: "A healthy, worth a look, or fix now score for each of the six areas." },
  { title: "Fix what matters most", text: "Start with your lowest score. Most gaps are ordinary paperwork, and paperwork is fixable." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  // When true, we render a branded "starting" screen instead of the landing
  // page, so auto-started visitors never see a confusing flash of content.
  const [autoStarting, setAutoStarting] = useState(shouldAutoStart);

  const handleBeginQuiz = async () => {
    setIsStartingQuiz(true);
    try {
      const response = await axios.post(`${API}/assessments`, {
        modules: ["clbh"],
        selected_areas: ALL_AREAS,
        internal: isInternalBrowser()
      });
      track("quiz_start", { areas_selected: ALL_AREAS.length });
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
            24 quick questions. 5 to 10 minutes. Confidential.
          </p>
        </div>
      </div>
    );
  }

  const StartButton = ({ testId, className = "" }) => (
    <button
      type="button"
      onClick={handleBeginQuiz}
      disabled={isStartingQuiz}
      className={`inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-900 font-bold text-lg md:text-xl px-8 py-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      data-testid={testId}
    >
      {isStartingQuiz ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Starting...
        </>
      ) : (
        "Start my free checkup"
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      {/* Navigation: one quiet booking link, no competing buttons */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <img
              src="/clbh-logo.png"
              alt="Clean Legal Bill of Health — A Jeppson Law Product"
              className="h-14 w-auto"
            />
          </div>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm md:text-base font-semibold text-slate-900 underline underline-offset-4 hover:text-orange-600"
            data-testid="nav-schedule-btn"
          >
            <span className="hidden sm:inline">Prefer to talk? </span>Book a free call
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-section text-white py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-6 relative z-10 grid lg:grid-cols-[minmax(0,1fr)_440px] gap-12 lg:gap-16 items-center">
          <div className="max-w-2xl">
            <p className="text-orange-400 font-semibold tracking-[0.2em] uppercase text-sm mb-5 animate-fade-in-up">
              Free Legal Health Checkup
            </p>
            <h1 className="font-brand text-5xl md:text-7xl font-bold leading-[1.05] mb-6 animate-fade-in-up animate-delay-100">
              Find it before it finds you<TM />
            </h1>
            <p className="text-slate-300 text-lg md:text-xl leading-relaxed mb-8 animate-fade-in-up animate-delay-200">
              Every business has a few legal gaps hiding in its paperwork. This free checkup shows you
              where yours are, before a buyer, a lender, or an unhappy customer finds them first.
            </p>
            <div className="flex flex-col items-stretch sm:items-center sm:self-start sm:inline-flex gap-3 animate-fade-in-up animate-delay-300">
              <StartButton testId="hero-start-checkup-btn" />
              <p className="text-slate-400 text-sm text-center">
                24 questions · 5 to 10 minutes · confidential
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-700 flex items-center gap-4">
              <img
                src="/eric-headshot.jpg"
                alt="Eric Jeppson"
                className="w-16 h-16 rounded-full border-2 border-orange-500 object-cover flex-shrink-0"
              />
              <div>
                <p className="font-brand italic text-lg md:text-xl leading-snug text-white">
                  "Most of what I find is ordinary and fixable. The trick is finding it early."
                </p>
                <p className="text-slate-400 text-sm mt-1">Eric Jeppson, Business Attorney</p>
              </div>
            </div>
          </div>

          {/* Sample report: shows the payoff before anyone commits */}
          <div className="bg-white text-slate-900 rounded-2xl p-6 md:p-7 shadow-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold tracking-[0.2em] text-orange-700 uppercase">Sample report</span>
              <span className="text-xs text-slate-500">What you'll get</span>
            </div>
            <h2 className="font-brand text-2xl md:text-3xl font-bold mb-3">Your Legal Health Report</h2>
            <ul>
              {sampleReport.map((row, i) => (
                <li
                  key={row.area}
                  className={`flex justify-between items-center py-3 text-[15px] ${i < sampleReport.length - 1 ? "border-b border-stone-200" : ""}`}
                >
                  <span>{row.area}</span>
                  <span className="flex items-center gap-2 font-semibold">
                    <span className={`w-3 h-3 rounded-full ${row.dot}`} />
                    {row.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 bg-stone-50 rounded-lg p-4 text-sm leading-relaxed">
              <span className="font-bold">Your first step:</span> Vendors and subcontractors. Start with a
              signed agreement and current insurance certificate for each sub.
            </p>
          </div>
        </div>
      </section>

      {/* Who reads your paperwork */}
      <section className="bg-slate-400 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-brand text-3xl md:text-5xl font-bold leading-tight mb-3">
            Someone will read your paperwork one day.
          </h2>
          <p className="text-slate-900 text-lg md:text-xl mb-10 max-w-3xl">
            Selling or not, these moments come for every business. The checkup shows you what they would see, first.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {readers.map((r) => (
              <div key={r.who} className="bg-white border border-stone-200 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-2">{r.who}</h3>
                <p className="text-slate-600 leading-relaxed">{r.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six areas on the brand grid */}
      <section className="bg-white grid-pattern-light border-y border-stone-200 py-16 md:py-20" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 mb-9">
            <h2 className="font-brand text-3xl md:text-5xl font-bold leading-tight">
              Six areas. One clear picture.
            </h2>
            <p className="text-slate-600 text-lg">Four quick questions in each area. No legal knowledge needed.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {areas.map(({ icon: Icon, name }) => (
              <div key={name} className="flex items-center gap-4 bg-white border border-stone-200 rounded-2xl px-6 py-5">
                <Icon className="w-7 h-7 text-slate-900 flex-shrink-0" strokeWidth={1.8} />
                <span className="text-lg font-semibold">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-400 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-brand text-3xl md:text-5xl font-bold leading-tight mb-9">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={s.title} className="bg-white border border-stone-200 rounded-2xl p-7">
                <span className="w-11 h-11 rounded-full bg-orange-500 text-slate-900 text-xl font-bold flex items-center justify-center mb-4">
                  {i + 1}
                </span>
                <h3 className="text-xl md:text-2xl font-bold mb-2">{s.title}</h3>
                <p className="text-slate-600 text-lg leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-6 pt-16">
        <div className="max-w-7xl mx-auto bg-slate-900 rounded-3xl px-8 md:px-16 py-12 flex flex-col md:flex-row md:justify-between md:items-center gap-8">
          <div>
            <h2 className="font-brand text-3xl md:text-5xl font-bold text-white leading-tight">
              Find it before it finds you<TM />
            </h2>
            <p className="text-slate-300 text-lg mt-2">Free. Confidential. 5 to 10 minutes.</p>
          </div>
          <StartButton testId="cta-start-checkup-btn" className="flex-shrink-0" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
            <a href="https://cleanlegalbillofhealth.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
              <img src="/clbh-logo.png" alt="Clean Legal Bill of Health — A Jeppson Law Product" className="h-16 w-auto" />
            </a>
            <a href="tel:916-780-7008" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">916-780-7008</span>
            </a>
            <p className="font-brand italic text-lg text-slate-900">Find it before it finds you™</p>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed max-w-4xl">
            This checkup is for educational purposes only and is not legal advice. No attorney-client relationship is
            formed by using it or receiving its results. The results help you spot potential areas of concern; they are
            not a legal assessment of your specific contracts, obligations, or exposure. © {new Date().getFullYear()} Jeppson Law, LLP.
          </p>
        </div>
      </footer>
    </div>
  );
}
