import { useState, useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Wallet, ScrollText, Briefcase, PhoneCall, ShieldCheck, KeyRound,
  Loader2, Phone, ArrowLeft, ArrowRight, UserRound, Building2
} from "lucide-react";
import { HOME_MODULE, HOME_AREA_ORDER, cleanHelperName } from "../lib/home";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const isInternalBrowser = () => {
  try {
    return window.localStorage.getItem("clbh_internal") === "1";
  } catch (e) {
    return false;
  }
};

const sampleReport = [
  { area: "Money and what you owe", label: "Worth a look", dot: "bg-amber-500" },
  { area: "Will, trust and beneficiaries", label: "Fix now", dot: "bg-red-600" },
  { area: "Advisors and access", label: "Healthy", dot: "bg-emerald-600" },
  { area: "Insurance", label: "Worth a look", dot: "bg-amber-500" },
  { area: "Records and passwords", label: "Fix now", dot: "bg-red-600" },
];

const helpers = [
  { who: "A spouse or partner", what: "Who suddenly has to pay the bills from accounts they have never logged into." },
  { who: "A grown child", what: "Flying in from another state to sort out a house full of paper." },
  { who: "A sibling or close friend", what: "Who agreed to help years ago and has no idea where anything is." },
  { who: "Whoever you name", what: "The checkup asks for their first name, so every question is about the real person." },
];

const areas = [
  { icon: Wallet, name: "Income, cash flow and what you owe" },
  { icon: ScrollText, name: "Estate, ownership and succession" },
  { icon: Briefcase, name: "The business bridge (only if you own one)" },
  { icon: PhoneCall, name: "Advisors, access and authority" },
  { icon: ShieldCheck, name: "Insurance and protection" },
  { icon: KeyRound, name: "Records, digital access and continuity" },
];

const steps = [
  { title: "Answer 12 questions", text: "Plain English, multiple choice. About 5 minutes. Ten questions if you do not own a business." },
  { title: "Get your Home Legal Health Report", text: "A Healthy, Worth a look, or Fix now result for each area of your household." },
  { title: "Start with your first three fixes", text: "Most gaps are a phone call or a form. Every one of them is fixable, and you can start this week." },
];

export default function HomeLanding() {
  const navigate = useNavigate();
  // step: null (landing page), "name", "business"
  const [step, setStep] = useState(null);
  const [helperName, setHelperName] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const nameInput = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (step === "name") setTimeout(() => nameInput.current?.focus(), 50);
  }, [step]);

  const beginSetup = (source) => {
    track("home_setup_start", { source });
    setStep("name");
  };

  const startCheckup = async (ownsBusiness) => {
    setIsStarting(true);
    const selected = ownsBusiness
      ? HOME_AREA_ORDER
      : HOME_AREA_ORDER.filter((a) => a !== "home_business");
    try {
      const response = await axios.post(`${API}/assessments`, {
        modules: [HOME_MODULE],
        selected_areas: selected,
        helper_name: cleanHelperName(helperName),
        internal: isInternalBrowser(),
      });
      track("quiz_start", { module: HOME_MODULE, areas_selected: selected.length, owns_business: ownsBusiness });
      navigate(`/assessment/${response.data.id}`);
    } catch (error) {
      console.error("Error creating assessment:", error);
      toast.error("We could not start the checkup. Please try again.");
      setIsStarting(false);
    }
  };

  const Nav = () => (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center relative z-10">
        <a href="https://www.jeppsonlaw.com" aria-label="Jeppson Law home" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
          <img src="/jeppsonlaw-clbh-logo.png" alt="Jeppson Law and Clean Legal Bill of Health" className="h-7 sm:h-10 md:h-12 w-auto" />
        </a>
        <a href="https://www.jeppsonlaw.com" className="inline-flex items-center gap-1 text-sm md:text-base font-medium text-slate-600 hover:text-orange-600" data-testid="back-to-site-link">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back to jeppsonlaw.com</span>
          <span className="sm:hidden">Back to site</span>
        </a>
      </div>
    </nav>
  );

  // ----- Two short setup screens before question one -----
  if (step) {
    const isName = step === "name";
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Nav />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12">
          <p className="text-sm text-slate-500 mb-3">Before we start · {isName ? "1" : "2"} of 2</p>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <span className="inline-flex items-center justify-center w-11 h-11 bg-orange-100 rounded-full mb-4">
              {isName ? <UserRound className="w-5 h-5 text-orange-600" /> : <Building2 className="w-5 h-5 text-orange-600" />}
            </span>

            {isName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  track("home_helper_named", { named: !!cleanHelperName(helperName) });
                  setStep("business");
                }}
              >
                <h1 className="font-heading text-2xl md:text-3xl font-bold mb-3" data-testid="helper-heading">
                  Who would sort things out?
                </h1>
                <p className="text-slate-600 text-base md:text-lg mb-6">
                  Think of the one person who would handle the bills, the accounts and the paperwork if something
                  happened to you. Type their first name and every question will be about them.
                </p>
                <label htmlFor="helper_name" className="block text-sm font-medium text-slate-900 mb-1">
                  Their first name
                </label>
                <input
                  id="helper_name"
                  ref={nameInput}
                  value={helperName}
                  onChange={(e) => setHelperName(e.target.value.slice(0, 40))}
                  placeholder="Sarah"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  data-testid="helper-name-input"
                />
                <p className="text-slate-500 text-sm mt-2">
                  Not sure yet? Leave it blank. That is a useful answer too.
                </p>
                <div className="flex justify-between mt-8">
                  <button
                    type="button"
                    onClick={() => setStep(null)}
                    className="inline-flex items-center px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                    data-testid="helper-next-btn"
                  >
                    {cleanHelperName(helperName) ? "Next" : "Skip"} <ArrowRight className="w-4 h-4 ml-2" />
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h1 className="font-heading text-2xl md:text-3xl font-bold mb-3" data-testid="business-heading">
                  Do you own a business, or part of one?
                </h1>
                <p className="text-slate-600 text-base md:text-lg mb-6">
                  If you do, two questions ask what would happen to it. If not, we skip them and your score
                  adjusts on its own.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => startCheckup(true)}
                    className="rounded-xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 px-5 py-4 text-left disabled:opacity-60"
                    data-testid="owns-business-yes"
                  >
                    <span className="block text-lg font-semibold">Yes</span>
                    <span className="block text-sm text-slate-500">12 questions</span>
                  </button>
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => startCheckup(false)}
                    className="rounded-xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 px-5 py-4 text-left disabled:opacity-60"
                    data-testid="owns-business-no"
                  >
                    <span className="block text-lg font-semibold">No</span>
                    <span className="block text-sm text-slate-500">10 questions</span>
                  </button>
                </div>
                {isStarting && (
                  <p className="flex items-center gap-2 text-slate-600 mt-5">
                    <Loader2 className="w-4 h-4 animate-spin" /> Starting your checkup...
                  </p>
                )}
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={() => setStep("name")}
                    className="inline-flex items-center px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  const StartButton = ({ testId, source, className = "" }) => (
    <button
      type="button"
      onClick={() => beginSetup(source)}
      className={`inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-900 font-bold text-lg md:text-xl px-8 py-4 transition-colors ${className}`}
      data-testid={testId}
    >
      Start my free home checkup
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <Nav />

      {/* Hero */}
      <section className="hero-section text-white py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-6 relative z-10 grid lg:grid-cols-[minmax(0,1fr)_440px] gap-12 lg:gap-16 items-center">
          <div className="max-w-2xl">
            <p className="text-orange-400 font-semibold tracking-[0.2em] uppercase text-sm mb-5 animate-fade-in-up">
              Free Home Legal Health Checkup
            </p>
            <h1 className="font-brand text-5xl md:text-6xl font-bold leading-[1.05] mb-6 animate-fade-in-up animate-delay-100">
              Could your family find everything without you?
            </h1>
            <p className="text-slate-300 text-lg md:text-xl leading-relaxed mb-8 animate-fade-in-up animate-delay-200">
              Twelve plain questions about the accounts, papers and passwords your family would need if something
              happened to you. You find out what is in good shape, what is worth a look, and the first three
              things to do. Most of them take an evening.
            </p>
            <div className="flex flex-col items-stretch sm:items-center sm:self-start sm:inline-flex gap-3 animate-fade-in-up animate-delay-300">
              <StartButton testId="hero-start-home-checkup-btn" source="hero" />
              <p className="text-slate-400 text-sm text-center">
                12 questions · about 5 minutes · confidential
              </p>
            </div>
          </div>

          <div className="bg-white text-slate-900 rounded-2xl p-6 md:p-7 shadow-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold tracking-[0.2em] text-orange-700 uppercase">Sample report</span>
              <span className="text-xs text-slate-500">What you'll get</span>
            </div>
            <h2 className="font-brand text-2xl md:text-3xl font-bold mb-3">Your Home Legal Health Report</h2>
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
              <span className="font-bold">Your first step:</span> read the beneficiary names on every retirement
              account out loud. The name on the account beats the will.
            </p>
          </div>
        </div>
      </section>

      {/* Who would sort it out */}
      <section className="bg-slate-400 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-brand text-3xl md:text-5xl font-bold leading-tight mb-3">
            Someone would have to sort it out.
          </h2>
          <p className="text-slate-900 text-lg md:text-xl mb-10 max-w-3xl">
            This checkup is about them. It shows you what they would find, and what they would not, while there is
            still time to make it easy.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {helpers.map((r) => (
              <div key={r.who} className="bg-white border border-stone-200 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-2">{r.who}</h3>
                <p className="text-slate-600 leading-relaxed">{r.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six areas */}
      <section className="bg-white grid-pattern-light border-y border-stone-200 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 mb-9">
            <h2 className="font-brand text-3xl md:text-5xl font-bold leading-tight">
              Six areas. One clear picture.
            </h2>
            <p className="text-slate-600 text-lg">Two quick questions in each area. No legal knowledge needed.</p>
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
              Make it easy for the people you love.
            </h2>
            <p className="text-slate-300 text-lg mt-2">Free. Confidential. About 5 minutes.</p>
          </div>
          <StartButton testId="cta-start-home-checkup-btn" source="closing" className="flex-shrink-0" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
            <a href="https://www.jeppsonlaw.com" className="hover:opacity-80 transition-opacity">
              <img src="/jeppsonlaw-clbh-logo.png" alt="Jeppson Law and Clean Legal Bill of Health" className="h-10 w-auto" />
            </a>
            <a href="tel:916-780-7008" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">916-780-7008</span>
            </a>
            <p className="font-brand italic text-lg text-slate-900">Clean Legal Bill of Health: Home Edition</p>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed max-w-4xl">
            This checkup is for educational purposes only and is not legal advice. No attorney-client relationship is
            formed by using it or receiving its results. The results help you spot potential gaps in your household
            planning; they are not a legal review of your will, trust, accounts or policies. © {new Date().getFullYear()} Jeppson Law, LLP.
          </p>
        </div>
      </footer>
    </div>
  );
}
