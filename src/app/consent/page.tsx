import { ConsentForm } from "@/components/contributor/ConsentForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";
import { CONSENT_VERSION } from "@/lib/domain";

export default function ConsentPage() {
  return (
    <PublicShell compact>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Consent</h1>
          <p className="mt-2 text-sm text-zinc-600">Current version: {CONSENT_VERSION}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Prototype consent information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-zinc-700">
            <p>
              CommandLoop collects short voice recordings, the command prompt metadata, session conditions, and optional
              profile fields such as broad language and device information.
            </p>
            <p>
              The data is used to review command audio quality, create verified transcripts, and optionally evaluate
              speech-to-text models after recording is complete.
            </p>
            <p>
              Participation is voluntary. You can stop at any time. Please do not say your name, address, phone number,
              account details, precise location, or other private information.
            </p>
            <p>
              This is a prototype consent flow for an engineering MVP and does not claim to be a complete legal consent
              system.
            </p>
          </CardContent>
        </Card>
        <ConsentForm />
      </div>
    </PublicShell>
  );
}
