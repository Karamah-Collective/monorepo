import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import PageTitle from "@/components/page-title";
import karamahLogoUrl from "../../../shared/brand/karamah-logo.svg";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-svh w-full overflow-y-auto bg-background text-foreground">
      <PageTitle title="Privacy" />
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 sm:py-16">
        <header className="flex items-start justify-between gap-6 border-b border-border pb-8">
          <div>
            <a href="/auth/sign-in" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to sign in
            </a>
            <p className="mt-10 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Karamah Projects</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Privacy policy</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              This policy explains what Karamah Collective receives, why it is used, and how to contact us about it.
            </p>
          </div>
          <img src={karamahLogoUrl} alt="Karamah" className="size-10 shrink-0 object-contain" />
        </header>

        <div className="divide-y divide-border">
          <section className="py-8">
            <p className="font-mono text-xs text-muted-foreground">Effective 15 October 2026</p>
            <h2 className="mt-3 text-lg font-semibold">Information we use</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              We use your account details, such as your name, email address, profile image, and authentication identifiers, to sign you in and provide workspace access. Projects also stores the work you and your collaborators enter, including workspaces, projects, tasks, comments, files, assignments, and activity history.
            </p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              We also process ordinary operational information such as timestamps, revisions, security events, and error records so the service can stay reliable and protect accounts. Optional integrations only receive the information needed for the integration you enable.
            </p>
          </section>

          <section className="py-8">
            <h2 className="text-lg font-semibold">How we use and share it</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              We use this information to authenticate users, operate and improve Projects, deliver notifications you request, support collaboration, prevent abuse, and respond to support requests. We do not sell personal information or use workspace content for advertising. We share information with service providers that host, secure, authenticate, or deliver the service, and when required to comply with law or protect the service and its users.
            </p>
          </section>

          <section className="py-8">
            <h2 className="text-lg font-semibold">Retention and your choices</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              We keep account and workspace information while it is needed to provide Projects and meet legitimate operational or legal needs. You can ask us to correct or delete personal information, or ask questions about its use, by emailing <a className="text-foreground underline underline-offset-4" href="mailto:contact@karamahcollective.com">contact@karamahcollective.com</a>. We may need to verify the request and retain limited records where the law allows or requires it.
            </p>
          </section>

          <section className="py-8">
            <h2 className="text-lg font-semibold">Open-source notice</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Portions of Projects are derived from Kaneo, © 2024 Andrej Acevski, and are used under the MIT License. The required copyright and license text is included in the source distribution at <span className="font-mono text-xs text-foreground">Projects/THIRD_PARTY_LICENSES/KANEO_LICENSE</span>.
            </p>
          </section>

          <footer className="py-8 text-sm text-muted-foreground">
            Questions about this policy? Contact <a className="text-foreground underline underline-offset-4" href="mailto:contact@karamahcollective.com">contact@karamahcollective.com</a>.
          </footer>
        </div>
      </div>
    </main>
  );
}
