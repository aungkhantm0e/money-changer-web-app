export const LANG_KEY = "mc_lang";

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "en";
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new Event("mc_lang_change")); // notify all listeners
}

export function toggleLang() {
  const next = getLang() === "en" ? "mm" : "en";
  setLang(next);
  return next;
}