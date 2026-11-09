"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dictionaries, dirFor, type Dict, type Lang } from "@/lib/i18n";

type I18nValue = { lang: Lang; t: Dict; dir: "ltr" | "rtl" };

const I18nContext = createContext<I18nValue>({ lang: "en", t: dictionaries.en, dir: "ltr" });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: dictionaries[lang], dir: dirFor(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
