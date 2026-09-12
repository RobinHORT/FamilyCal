import React, { useEffect } from 'react';
import {
  Calendar,
  Heart,
  ShieldCheck,
  Lock,
  Database,
  ExternalLink,
  ArrowLeft,
  Mail,
  CheckCircle2,
  EyeOff,
  Server,
  RefreshCw,
  UserCheck,
  FileText,
} from 'lucide-react';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Privacy Policy - Yimly FamilyCal';
  }, []);

  const handleReturn = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div id="privacy-policy-page" className="min-h-screen bg-[#FAFAFA] text-gray-800 font-sans selection:bg-[#F8BBD0] selection:text-gray-900">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F8BBD0] border border-[#F472B6]/40 flex items-center justify-center shadow-2xs">
            <div className="relative">
              <Calendar className="w-5 h-5 text-[#831843]" />
              <Heart className="w-2.5 h-2.5 text-[#DB2777] fill-[#DB2777] absolute -bottom-0.5 -right-0.5" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-900 tracking-tight font-serif">
                Yimly FamilyCal
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-bold">
                Privacy Policy
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Family Calendar & Organizer</p>
          </div>
        </div>

        <button
          onClick={handleReturn}
          id="privacy-return-button"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to App</span>
        </button>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-8">
        {/* Policy Intro Hero */}
        <section className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 shadow-2xs text-emerald-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight font-serif">
                Privacy Policy
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Effective Date: <strong className="text-gray-900">September 11, 2026</strong> &bull; Version 1.0.0
              </p>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                This Privacy Policy describes how <strong className="text-gray-900">Yimly FamilyCal</strong> handles, stores, and protects personal information and calendar data. We are committed to transparency, data ownership, and strict privacy principles.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl font-medium">
              <Server className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Private Local Storage</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl font-medium">
              <EyeOff className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Zero Tracking or Ads</span>
            </div>
            <div className="flex items-center gap-2 text-pink-900 bg-pink-50 border border-pink-200 px-3 py-2 rounded-xl font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-pink-600" />
              <span>Google API Limited Use</span>
            </div>
          </div>
        </section>

        {/* Section 1: Introduction */}
        <section id="section-introduction" className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-gray-900">
            <FileText className="w-5 h-5 text-pink-600" />
            <h2 className="text-lg sm:text-xl font-bold font-serif">1. Introduction</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong className="text-gray-900">Yimly FamilyCal</strong> is a private, family-centric calendar and household organizer available at{' '}
            <a href="https://familycal.robinhort.link" className="text-pink-600 hover:underline font-semibold">
              https://familycal.robinhort.link
            </a>
            . It allows household members to coordinate schedules, track chores and tasks, celebrate birthdays, and optionally synchronize their individual schedules with Google Calendar.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Because Yimly FamilyCal is designed for families and self-hosted environments, your household data is stored on your designated instance. We do not operate a centralized advertising platform or monetize your personal schedules.
          </p>
        </section>

        {/* Section 2: Information We Collect */}
        <section id="section-information-collected" className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-gray-900">
            <Database className="w-5 h-5 text-pink-600" />
            <h2 className="text-lg sm:text-xl font-bold font-serif">2. Information We Collect</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            FamilyCal only stores information that is strictly necessary to provide calendar and household management features. This includes:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-1.5">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Account & Member Details
              </h3>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>Name and household member display names</li>
                <li>Email address used for account sign-in</li>
                <li>Cryptographic password hash (salted using bcrypt, never plain text)</li>
                <li>Optional member birthdays and color assignments</li>
                <li>Family household name</li>
              </ul>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-1.5">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Household & Calendar Content
              </h3>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>Event titles, descriptions, locations, and timestamps</li>
                <li>Recurring event schedules and recurrence rules</li>
                <li>Task and chore descriptions, due dates, and completion statuses</li>
                <li>Assigned member associations for events and tasks</li>
              </ul>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-1.5">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Authentication & Session Tokens
              </h3>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>HTTP-only session tokens for maintaining verified family logins</li>
                <li>Session expiration timestamps and security tokens</li>
              </ul>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-1.5">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Connected Google Calendar Data
              </h3>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>Google account email and account identifier</li>
                <li>OAuth 2.0 access and refresh tokens</li>
                <li>Synchronized calendar events and external calendar IDs</li>
                <li><em>Only stored when Google Calendar integration is explicitly enabled</em></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: Google Calendar Integration & Limited Use Disclosure */}
        <section id="section-google-calendar" className="bg-white border border-pink-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xs relative">
          <div className="flex items-center gap-2.5 text-gray-900">
            <RefreshCw className="w-5 h-5 text-pink-600" />
            <h2 className="text-lg sm:text-xl font-bold font-serif">3. Google Calendar Integration</h2>
          </div>

          <div className="p-4 rounded-2xl bg-pink-50 border border-pink-200 text-xs text-gray-700 leading-relaxed">
            <strong className="text-pink-950 font-bold block mb-1 text-sm">Google API Limited Use Disclosure:</strong>
            Yimly FamilyCal's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-700 underline font-bold hover:text-pink-900 inline-flex items-center gap-0.5"
            >
              Google API Services User Data Policy
              <ExternalLink className="w-3 h-3" />
            </a>
            , including the Limited Use requirements.
          </div>

          <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
            <p>
              Yimly FamilyCal provides an <strong className="text-gray-900">optional</strong> integration with Google Calendar. This feature allows family members to connect their individual Google Calendar accounts so that their personal schedules appear alongside family events on the shared household board.
            </p>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-900">Explicit User Authorization:</strong> We will never access your Google Calendar without your direct consent. You must explicitly click "Connect Google Calendar" and approve the OAuth 2.0 consent dialog presented by Google.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-900">Scope of Access:</strong> FamilyCal requests access to the Google Calendar API (<code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-pink-800">calendar.events</code> and <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-pink-800">calendar.readonly</code>) solely to retrieve your scheduled events and push events created in FamilyCal to your Google Calendar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-900">Strict Purpose Limitation:</strong> Google user data and calendar entries are used exclusively to provide the calendar synchronization feature you requested.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-900">No Third-Party Sharing:</strong> We do not transfer, disclose, or sell Google user data to third parties, advertising networks, data brokers, or marketing platforms.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-900">No AI Model Training:</strong> Google user data is NEVER used to train, retrain, or improve generalized machine learning, foundation, or artificial intelligence models.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: Contact Information */}
        <section id="section-contact" className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 text-gray-900">
            <Mail className="w-5 h-5 text-pink-600" />
            <h2 className="text-lg sm:text-xl font-bold font-serif">4. Contact Information</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            If you have questions or feedback regarding this Privacy Policy, please contact:
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="font-bold text-gray-900 w-28">Application:</span>
              <span>Yimly FamilyCal</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="font-bold text-gray-900 w-28">Website:</span>
              <a href="https://familycal.robinhort.link" className="text-pink-600 hover:underline font-semibold">
                https://familycal.robinhort.link
              </a>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="font-bold text-gray-900 w-28">Contact Email:</span>
              <a href="mailto:yimlyapp@gmail.com" className="text-pink-600 hover:underline font-semibold">
                yimlyapp@gmail.com
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-6 border-t border-gray-200 text-xs text-gray-500 space-y-2">
          <p>&copy; {new Date().getFullYear()} Yimly FamilyCal &bull; Dedicated to private household organization.</p>
          <div>
            <button
              onClick={handleReturn}
              className="text-pink-600 hover:underline font-semibold cursor-pointer"
            >
              &larr; Return to Yimly FamilyCal
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
};
