import useLang from "./useLang";
import { labels } from "./labels";

export default function useT() {
  const { lang } = useLang();
  const dict = labels[lang] || labels.en;

  function t(key) {
    return dict[key] ?? labels.en[key] ?? key;
  }

  return { t, lang };
}