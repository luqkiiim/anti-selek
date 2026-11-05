import { redirect } from "next/navigation";
import { getSafeCallbackUrl } from "@/lib/authCallback";
import { isGoogleEnrollmentOpen } from "@/lib/googleAuthConfig";
import { readGoogleCompletion } from "@/lib/googleAuthCookies";
import { GoogleProfileForm } from "./GoogleProfileForm";

export default async function CompleteGoogleProfilePage() {
  if (!isGoogleEnrollmentOpen()) redirect("/signin?google=paused");
  const pending = await readGoogleCompletion();
  if (!pending) redirect("/signin?google=failed");

  return (
    <main className="app-page flex items-center justify-center px-4 py-10">
      <section className="app-panel w-full max-w-md px-6 py-8 sm:px-8">
        <h1 className="text-2xl font-semibold text-gray-900">{pending.link ? "Confirm your Anti Selek password" : "Finish creating your account"}</h1>
        <GoogleProfileForm
          name={pending.name}
          email={pending.email}
          callbackUrl={getSafeCallbackUrl(pending.callbackUrl)}
          linking={!!pending.link}
        />
      </section>
    </main>
  );
}
