import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Privacy · PlanToMe" };

// Public even when signed out: Google's consent screen links here.
// Keep it true whenever the app starts using data in a new way.

const LINK = "underline decoration-muted underline-offset-4 hover:decoration-ink";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <Link
        href="/"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1 text-base text-muted hover:text-ink"
      >
        <ChevronLeftIcon className="size-5" />
        PlanToMe
      </Link>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated November 2, 2026</p>

      <div className="mt-8 space-y-8 text-base leading-relaxed">
        <p>
          PlanToMe is a personal planner with a single user, its owner. Only the owner&apos;s
          Google account can sign in, and nobody else can create an account.
        </p>

        <Section title="What PlanToMe uses">
          <ul>
            <li>Your Google account&apos;s email address, to check that you are the owner.</li>
            <li>
              Events in your primary Google Calendar for the coming week, to show them in your
              day list. Tasks with a time are added there as events, and PlanToMe changes or
              deletes only the events it created for your tasks.
            </li>
            <li>The tasks, habits, notes and files you add.</li>
            <li>
              Voice recordings, screenshots and documents you choose to capture, so they can
              become tasks.
            </li>
            <li>Reminder settings for the devices where you turn notifications on.</li>
          </ul>
        </Section>

        <Section title="Where it goes">
          <ul>
            <li>
              Your data is stored in Supabase (a database and private file storage in the EU),
              where only your account can read it.
            </li>
            <li>
              Google access tokens are stored encrypted on the server and never sent to the
              browser.
            </li>
            <li>
              Each device you use keeps a copy of your day list, calendar events included, so
              PlanToMe opens without a connection.
            </li>
            <li>
              Voice recordings go to a speech-to-text service (Groq, with Cloudflare Workers AI
              as a fallback). Text, screenshots and documents you capture go to Anthropic&apos;s
              Claude API to be turned into tasks. Nothing is sent until you use these features.
            </li>
            <li>Reminders are delivered through your browser&apos;s push service.</li>
            <li>The app runs on Vercel.</li>
          </ul>
        </Section>

        <Section title="Google user data">
          <p>
            PlanToMe uses data from Google only to show your calendar and keep it in step with
            your tasks. It never sells or shares your data, shows ads, or uses it for anything
            other than your own planner.
          </p>
          <p>
            PlanToMe&apos;s use and transfer of information received from Google APIs adheres to
            the{" "}
            <a className={LINK} href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Your choices">
          <ul>
            <li>
              Remove PlanToMe&apos;s access to your Google account at any time in{" "}
              <a className={LINK} href="https://myaccount.google.com/connections">
                Third-party apps &amp; services
              </a>
              .
            </li>
            <li>Signing out deletes PlanToMe&apos;s copy of your data from that device.</li>
            <li>Deleting a task in PlanToMe deletes it from the database.</li>
          </ul>
        </Section>

        <Section title="The public demo">
          <p>
            The demo at{" "}
            <a className={LINK} href="https://plantome-demo.vercel.app">
              plantome-demo.vercel.app
            </a>{" "}
            uses invented sample data. What you do there stays in your browser and is never sent
            to Google or AI services.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            PlanToMe is open source. Questions are welcome on{" "}
            <a className={LINK} href="https://github.com/iryna-kotovych/PlanToMe">
              GitHub
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  );
}
