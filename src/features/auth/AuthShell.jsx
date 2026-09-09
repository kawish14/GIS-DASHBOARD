/**
 * The pieces every signed-out screen shares -- sign in, register, forgot and
 * reset password.
 *
 * They were duplicated across LoginPage and RegisterPage; pulling them here
 * keeps the four screens looking like one product rather than four that drifted
 * apart, and means the password rules are stated in exactly one place.
 */
import { AlertCircle, Check, LifeBuoy, ExternalLink, Mail } from 'lucide-react';
import { supportUrl, supportEmail } from '../../shared/config/runtimeConfig';

/**
 * Mirrors validatePasswordStrength in the backend's utils/password.js. The
 * server is the authority -- this only spares the user a round trip to be told
 * what it already knows.
 */
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase and a lowercase letter', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'At least one number', test: (p) => /\d/.test(p) },
];

/** The dark ground, the glow, the logo and the glass card. */
export function AuthShell({ logo, children, logoClassName = 'w-56' }) {
  return (
    <div className="min-h-screen w-full bg-[#0f1115] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        <div className="mb-8 relative group">
          <div className="absolute inset-0 bg-blue-500/30 blur-2xl rounded-full opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
          <img
            src={logo}
            alt="Company Logo"
            className={`relative ${logoClassName} h-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]`}
          />
        </div>

        <div className="w-full bg-[#181b21]/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function SubmitButton({ disabled, isLoading, children }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_4px_25px_rgba(6,182,212,0.5)] disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <div className="flex items-center justify-center gap-2 relative z-10">
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          children
        )}
      </div>
      <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
    </button>
  );
}

/** Live checklist, so the rules are visible while typing rather than arriving as a rejection. */
export function PasswordChecklist({ results }) {
  return (
    <ul className="space-y-1.5 px-1">
      {results.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-2 text-sm transition-colors ${
            rule.passed ? 'text-emerald-400' : 'text-gray-500'
          }`}
        >
          {rule.passed
            ? <Check size={14} />
            : <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shown to someone the dashboard has no account for: raise a service request
 * and the GIS Admin will create one.
 *
 * The destination comes from public/config.js so it can be pointed at a real
 * service desk without a rebuild -- an SR portal if SUPPORT_URL is set, a
 * mailto: to SUPPORT_EMAIL otherwise, and plain wording if neither is
 * configured, which is what a fresh checkout gets.
 *
 * @param {string} title    headline for the situation that prompted it
 * @param {string} message  what happened, in the caller's words
 */
export function AccessRequestNotice({ title, message }) {

  return (
    <div className="rounded-xl bg-amber-500/5 border border-amber-500/25 p-4">
      <div className="flex items-start gap-3">
        <LifeBuoy size={20} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}
