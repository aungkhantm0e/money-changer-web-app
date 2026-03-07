import useLang from "../useLang";
import { toggleLang } from "../i18n";

export default function LanguageButton() {
  const { lang } = useLang();

  return (
    <button
      type="button"
      className="ghost-btn"
      onClick={toggleLang}
      title="Language"
      style={{height:50,marginTop:10}}
    >
      {lang === "en" ? "မြန်မာ" : "English"}
    </button>
  );
}