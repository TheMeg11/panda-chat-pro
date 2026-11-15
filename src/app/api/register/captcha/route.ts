import { getI18n } from "@/lib/i18n-server";
import { makeCaptcha } from "@/lib/captcha";

export const dynamic = "force-dynamic";

/**
 * GET /api/register/captcha — a fresh signed math challenge for the register
 * form. Locale-aware (fa digits in Persian); stateless verification happens
 * in registerAction via verifyCaptcha.
 */
export async function GET() {
  const { lang } = await getI18n();
  const { question, token } = makeCaptcha(lang === "fa");
  return Response.json({ question, token }, { headers: { "cache-control": "no-store" } });
}
