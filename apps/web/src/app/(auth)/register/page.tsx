import { countryFromIsoCode } from "@pharmachain/core";
import { headers } from "next/headers";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Register your company" };

export default async function RegisterPage() {
  // Vercel sets this from the requester's IP; absent locally and behind some
  // proxies, in which case the form falls back to the browser's timezone.
  const ipCountry = countryFromIsoCode((await headers()).get("x-vercel-ip-country"));
  return <RegisterForm ipCountry={ipCountry} />;
}
