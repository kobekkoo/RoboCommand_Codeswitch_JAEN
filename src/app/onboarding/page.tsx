import { OnboardingForm } from "@/components/contributor/OnboardingForm";
import { PublicShell } from "@/components/ui/shell";

export default function OnboardingPage() {
  return (
    <PublicShell compact>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Optional Profile</h1>
          <p className="mt-3 text-zinc-700">
            These fields are optional and privacy-conscious. Prefer not to say is always acceptable.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </PublicShell>
  );
}
