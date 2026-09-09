import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Shield,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { landingPathFor } from '../../app/routes';
import { AccessRequestNotice } from './AuthShell';
import logo from "../../assets/images/TesLogo.png";

// __APP_VERSION__ is injected at build time via vite.config.js `define`
// (see setup notes) -- it's the version baked into *this* running bundle.
/* global __APP_VERSION__ */

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // RegisterPage hands the freshly generated username over in route state, so
  // someone arriving straight from sign-up does not have to retype a name
  // they have only just been shown.
  const justRegisteredAs = location.state?.username || '';

  const [username, setUsername] = useState(justRegisteredAs);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Sign-in cannot say whether the username exists -- it answers "Invalid
  // credentials" either way, on purpose, so the form is not a way to find out
  // who has an account. So the service-request notice appears after any failed
  // attempt, worded for someone who may simply not have an account yet.
  const [hasFailed, setHasFailed] = useState(false);

  // Login is a safe place to check for a stale build: there's no
  // unsaved user state here, so a silent one-time reload is harmless.
  // Guarded by sessionStorage so a broken/missing version.json can't
  // cause a reload loop.
  useEffect(() => {
    const checkForNewBuild = async () => {
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        const alreadyReloadedFor = sessionStorage.getItem('reloadedForVersion');
        if (version && version !== __APP_VERSION__ && alreadyReloadedFor !== version) {
          sessionStorage.setItem('reloadedForVersion', version);
          window.location.reload();
        }
      } catch {
        // Offline, or version.json not deployed yet -- fail silently,
        // never block the login screen over this.
      }
    };
    checkForNewBuild();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    const loginResult = await login(username, password);
    
    if (loginResult.success) {
      // RBAC routing: admins to the admin panel, every other role to the
      // dashboard -- no hardcoded list of allowed roles. What they can
      // actually see once there is decided by the role's JSON permissions.
      // The rule lives in app/routes.jsx because the root redirect and the
      // /login guard have to agree with it.
      navigate(landingPathFor(loginResult.data), { replace: true });
    } else {
      setError(loginResult.message || "Invalid credentials");
      setHasFailed(true);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#0f1115] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* --- BACKGROUND EFFECTS --- */}
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      
      {/* Glowing Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* --- MAIN CONTENT --- */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        
        {/* 1. LARGE CENTERED LOGO */}
        <div className="mb-8 relative group">
            {/* Glow effect behind logo */}
            <div className="absolute inset-0 bg-blue-500/30 blur-2xl rounded-full opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
            
            <img
              src={logo}
              alt="Company Logo"
              className="relative w-64 h-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] transform hover:scale-105 transition-transform duration-300"
            />
        </div>

        {/* 2. GLASS LOGIN CARD */}
        <div className="w-full bg-[#181b21]/80 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl p-8 transform transition-all hover:border-blue-500/30">
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white tracking-wide">Sign In</h1>
            <p className="text-gray-400 text-sm mt-1">Sign in to access the GIS Dashboard</p>
          </div>

          {justRegisteredAs && (
            <div className="flex items-start gap-3 mb-5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <span>
                Registration complete. Sign in as{' '}
                <span className="font-mono font-bold text-white">{justRegisteredAs}</span>.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Username Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Username</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#0f1115] border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  placeholder="Enter your ID"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Password</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0f1115] border border-gray-700 rounded-xl pl-10 pr-12 py-3 text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <Link to="/forgot-password" className="text-sm text-gray-300 hover:text-blue-400 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_4px_25px_rgba(6,182,212,0.5)] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-center gap-2 relative z-10">
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <Shield size={18} className="group-hover:rotate-12 transition-transform" />
                  </>
                )}
              </div>
              
              {/* Shine Effect Overlay */}
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700/50 space-y-3">
            <p className="text-sm text-gray-400 text-center">
              <p>Invited by your GIS Admin but haven't set a password?</p>
              <Link to="/register" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                Complete your registration
              </Link>
            </p>
            <div className="text-sm text-gray-400" style={{ display: 'flex', justifyContent: 'center' }}>
              <span>v2.6.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}