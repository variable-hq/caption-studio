import { headers } from "next/headers";

import { localeFromAcceptLanguage } from "@/i18n";
import ReaderPage from "./reader-client";

export default async function ReadPage() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  return <ReaderPage locale={locale} />;
}
