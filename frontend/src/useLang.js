import { useEffect, useState } from "react";
import { getLang, setLang } from "./i18n";

export default function useLang() {
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    const onChange = () => setLangState(getLang());
    window.addEventListener("mc_lang_change", onChange);
    return () => window.removeEventListener("mc_lang_change", onChange);
  }, []);

  function updateLang(next) {
    setLang(next);
    setLangState(next);
  }

  return { lang, setLang: updateLang };
}