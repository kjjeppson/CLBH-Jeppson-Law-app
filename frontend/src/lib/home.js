// Home checkup (household version). Module key "home", areas home_*,
// questions h1 to h12. Question text from the API may carry a {them} token,
// replaced here with the helper's first name, or "that person" when no name
// was given. The token never starts a sentence and is always singular, so the
// swap is grammatical either way.

export const HOME_MODULE = "home";

export const HOME_AREA_LABELS = {
  home_money: "Income, cash flow and what you owe",
  home_estate: "Estate, ownership and succession",
  home_business: "The business bridge",
  home_advisors: "Advisors, access and authority",
  home_insurance: "Insurance and protection",
  home_records: "Records, digital access and continuity",
};

export const HOME_AREA_ORDER = [
  "home_money",
  "home_estate",
  "home_business",
  "home_advisors",
  "home_insurance",
  "home_records",
];

// Where the Home Edition is sold. Override with REACT_APP_HOME_CTA_URL.
export const HOME_CTA_URL =
  process.env.REACT_APP_HOME_CTA_URL || "https://www.jeppsonlaw.com/athome";

export const BUSINESS_CHECKUP_URL = "https://checkup.jeppsonlaw.com";

export const isHomeModules = (modules) => (modules || []).includes(HOME_MODULE);

export const cleanHelperName = (name) =>
  (name || "").replace(/\s+/g, " ").trim().slice(0, 40);

export const fillThem = (text, helperName) => {
  if (!text) return text;
  const who = cleanHelperName(helperName) || "that person";
  return text.split("{them}").join(who);
};

// Good-news labels for answers that came back Healthy
export const HOME_HEALTHY_LABELS = {
  h1: "A written list of what you have",
  h2: "Money that can be reached",
  h3: "A current will or trust",
  h4: "Beneficiaries checked",
  h5: "A second person can run the business",
  h6: "A value and a buyer for the business",
  h7: "Advisors written down",
  h8: "A second person on the phone account",
  h9: "Policies that could be found",
  h10: "Life insurance on track",
  h11: "Email and passwords reachable",
  h12: "Originals kept in one safe place",
};

export const withHomeUtm = (url, content) =>
  `${url}${url.includes("?") ? "&" : "?"}utm_source=quiz&utm_medium=results&utm_campaign=clbh_home&utm_content=${content}`;
