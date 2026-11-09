import { cookies, headers } from "next/headers";
import { dictionaries, dirFor, LANG_COOKIE, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const fromCookie = (await cookies()).get(LANG_COOKIE)?.value;
  if (fromCookie === "fa" || fromCookie === "en") return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /(^|,)\s*fa\b/i.test(accept) ? "fa" : "en";
}

export async function getI18n() {
  const lang = await getLang();
  return { lang, t: dictionaries[lang], dir: dirFor(lang) };
}
