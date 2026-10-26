import React, { useState, useEffect } from 'react';
import {
  Lock,
  ShieldAlert,
  Globe,
  Clock,
  UserCheck,
  Shield,
  User,
  Phone,
  Eye,
  EyeOff,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  Store,
  KeyRound,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { useAccessAuth } from '../lib/accessAuth';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { getStoreSettings } from '../db';
import { ShopMember } from '../types';
import { normalizeRole } from '../lib/permissions';

type AuthMode = 'login' | 'register' | 'forgot_password';

export const LockScreen: React.FC = () => {
  const {
    isPinConfigured,
    isLockedOut,
    lockoutSecondsLeft,
    userRole,
    loginWithCredentials,
    registerAccount,
    sendWhatsAppRecoveryCode,
    resetAdminPasswordWithCode,
  } = useAccessAuth();
  const { t, language, setLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isAr = language === 'ar';

  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    isPinConfigured ? 'login' : 'register'
  );
  const [selectedRole, setSelectedRole] = useState<'owner' | 'employee'>(() =>
    normalizeRole(userRole)
  );

  // Store & Saved Profiles State
  const [storeName, setStoreName] = useState<string>('');
  const [storeLogo, setStoreLogo] = useState<string | undefined>(undefined);
  const [savedAdminName, setSavedAdminName] = useState<string>('');
  const [savedAdminPhone, setSavedAdminPhone] = useState<string>('');
  const [savedWorkers, setSavedWorkers] = useState<ShopMember[]>([]);

  // Login Form Fields
  const [loginName, setLoginName] = useState<string>('');
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Register Form Fields
  const [regStoreName, setRegStoreName] = useState<string>('');
  const [regFullName, setRegFullName] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regConfirmPassword, setRegConfirmPassword] = useState<string>('');
  const [regAdminApprovalPass, setRegAdminApprovalPass] = useState<string>('');

  // Forgot Password / WhatsApp Recovery Fields
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [recoveryPhone, setRecoveryPhone] = useState<string>('');
  const [recoveryCode, setRecoveryCode] = useState<string>('');
  const [newResetPassword, setNewResetPassword] = useState<string>('');
  const [confirmResetPassword, setConfirmResetPassword] = useState<string>('');

  // Feedback State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function loadBrandAndProfiles() {
      try {
        const s = await getStoreSettings();
        setStoreName(s.storeName || '');
        setRegStoreName(s.storeName || '');
        setStoreLogo(s.logo);
        const aName = s.adminName || '';
        const aPhone = s.adminPhone || s.phone || '';
        setSavedAdminName(aName);
        setSavedAdminPhone(aPhone);
        setRecoveryPhone(aPhone);

        const members = Array.isArray(s.shopMembers)
          ? s.shopMembers.filter((m) => m.active && normalizeRole(m.role) === 'employee')
          : [];
        setSavedWorkers(members);

        // Pre-fill login fields based on selected role
        if (normalizeRole(userRole) === 'owner') {
          if (aName) setLoginName(aName);
          if (aPhone) setLoginPhone(aPhone);
        } else if (members.length > 0) {
          setLoginName(members[0].full_name || '');
          setLoginPhone(members[0].phone || '');
        }
      } catch {}
    }
    loadBrandAndProfiles();
  }, [userRole]);

  // Switch pre-filled login details when role changes
  const handleSelectRole = (role: 'owner' | 'employee') => {
    setSelectedRole(role);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (role === 'owner') {
      setLoginName(savedAdminName);
      setLoginPhone(savedAdminPhone);
    } else {
      if (savedWorkers.length > 0) {
        setLoginName(savedWorkers[0].full_name || '');
        setLoginPhone(savedWorkers[0].phone || '');
      } else {
        setLoginName('');
        setLoginPhone('');
      }
    }
  };

  const fallbackName = isAr ? 'المحل الذهبي' : 'Golden Shop';
  const displayName = storeName.trim() || fallbackName;
  const initial = displayName.charAt(0).toUpperCase() || 'G';

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginName.trim()) {
      setErrorMessage(isAr ? 'المرجو إدخال الاسم الكامل.' : 'Veuillez saisir votre nom.');
      return;
    }
    if (!loginPhone.trim()) {
      setErrorMessage(
        isAr ? 'المرجو إدخال رقم الهاتف (واتساب).' : 'Veuillez saisir votre numéro WhatsApp.'
      );
      return;
    }
    if (!loginPassword.trim()) {
      setErrorMessage(
        isAr ? 'المرجو إدخال كلمة المرور أو الرمز السري.' : 'Veuillez saisir votre mot de passe.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials({
        name: loginName.trim(),
        phone: loginPhone.trim(),
        password: loginPassword.trim(),
        role: selectedRole,
      });

      if (!res.success) {
        setErrorMessage(
          res.error ||
            (isAr
              ? 'معلومات الدخول غير صحيحة. تأكد من رقم الهاتف وكلمة المرور.'
              : 'Identifiants incorrects.')
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (regPassword.trim() !== regConfirmPassword.trim()) {
      setErrorMessage(
        isAr ? 'كلمتا المرور غير متطابقتين.' : 'Les mots de passe ne correspondent pas.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerAccount({
        fullName: regFullName,
        storeName: regStoreName,
        phone: regPhone,
        password: regPassword,
        role: selectedRole,
        adminPasswordForWorker: regAdminApprovalPass,
      });

      if (!res.success) {
        setErrorMessage(res.error || (isAr ? 'تعذر إنشاء الحساب.' : 'Erreur lors de la création.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Request WhatsApp Recovery Code
  const handleRequestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    setIsSubmitting(true);
    try {
      const res = await sendWhatsAppRecoveryCode(recoveryPhone);
      if (!res.success) {
        setErrorMessage(res.error || 'تعذر إرسال كود الاسترجاع.');
      } else {
        setRecoveryStep('reset');
        setSuccessMessage(
          isAr
            ? `تم إرسال كود الاسترجاع المؤقت أوتوماتيكياً إلى واتساب (${res.maskedPhone}). أدخله أسفله لتعيين كلمة مرور جديدة.`
            : `Code de récupération envoyé sur WhatsApp (${res.maskedPhone}).`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Confirm New Password with WhatsApp Code
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newResetPassword.trim() !== confirmResetPassword.trim()) {
      setErrorMessage(
        isAr ? 'كلمتا المرور الجديدتان غير متطابقتين.' : 'Les mots de passe ne correspondent pas.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resetAdminPasswordWithCode(recoveryCode, newResetPassword);
      if (!res.success) {
        setErrorMessage(res.error || 'كود الاسترجاع غير صحيح.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent text-white overflow-y-auto selection:bg-amber-500/30"
    >
      {/* Fixed Luxury Golden Shop Interior Background */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src="/shop-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-center"
        />
        <div
          className={`absolute inset-0 transition-colors duration-300 ${
            theme === 'light'
              ? 'bg-[#FAF7F0]/90 backdrop-blur-[6px]'
              : 'bg-black/55 backdrop-blur-[3px]'
          }`}
        />
      </div>

      {/* Theme & Language Switcher */}
      <div className="fixed top-4 end-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-yellow-500/30 text-xs font-bold text-white hover:border-[#FFD700] transition cursor-pointer shadow-lg"
          title={isAr ? 'تبديل الوضع النهاري / الليلي' : 'Mode Clair / Sombre'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>{isAr ? 'نهاري' : 'Clair'}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>{isAr ? 'ليلي' : 'Sombre'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-yellow-500/30 text-xs font-bold text-white hover:border-[#FFD700] transition cursor-pointer shadow-lg"
        >
          <Globe className="w-3.5 h-3.5 text-[#FFD700]" />
          <span className="font-mono text-xs font-bold">{language === 'ar' ? 'FR' : 'عربي'}</span>
        </button>
      </div>

      {/* Main SaaS Authentication Glass Console */}
      <div className="relative z-10 w-full max-w-md bg-black/75 backdrop-blur-2xl border border-yellow-500/30 rounded-[26px] p-6 sm:p-7 my-auto shadow-[0_20px_60px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,235,150,0.25)] space-y-5">
        {/* Top Golden Rim Highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#FFD700] to-transparent opacity-80"
        />

        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-3">
            {storeLogo ? (
              <img
                src={storeLogo}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-18 h-18 rounded-2xl object-contain bg-black/80 border border-yellow-500/40 p-2 shadow-[0_0_25px_rgba(255,215,0,0.25)]"
              />
            ) : (
              <div className="w-18 h-18 rounded-2xl bg-gradient-to-b from-[#FFF2A6] via-[#FFD700] to-[#B8860B] flex items-center justify-center font-black text-black text-3xl uppercase shadow-[0_8px_25px_rgba(255,215,0,0.4)] border border-yellow-200">
                {initial}
              </div>
            )}
            <div className="absolute -bottom-1.5 -end-1.5 p-1.5 rounded-xl bg-black border border-yellow-500/40 text-[#FFD700] shadow-md">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow">
            {displayName}
          </h1>
          <p className="text-xs text-[#FFD700] mt-1 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {authMode === 'login'
                ? isAr
                  ? 'تسجيل الدخول إلى نظام تسيير المحل'
                  : 'Connexion à votre espace boutique'
                : authMode === 'register'
                ? isAr
                  ? 'إنشاء حساب جديد وتفعيل المحل'
                  : 'Créer un nouveau compte boutique'
                : isAr
                ? 'استرجاع وتعديل كلمة المرور عبر واتساب'
                : 'Récupération du mot de passe via WhatsApp'}
            </span>
          </p>
        </div>

        {/* 2-ROLE SWITCHER ONLY: Admin (الأدمين) vs Worker (العامل) */}
        {!isLockedOut && authMode !== 'forgot_password' && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-black/80 border border-yellow-500/20">
              <button
                type="button"
                onClick={() => handleSelectRole('owner')}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
                  selectedRole === 'owner'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black shadow-[0_4px_16px_rgba(255,215,0,0.35)]'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'الأدمين (Admin)' : 'Admin (Propriétaire)'}</span>
                </div>
                <span
                  className={`text-[10px] font-bold ${
                    selectedRole === 'owner' ? 'text-black/80' : 'text-gray-400'
                  }`}
                >
                  {isAr ? 'المالية، الأرباح والتعديل الكامل' : 'Finances, Bénéfices & Gestion'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRole('employee')}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
                  selectedRole === 'employee'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black shadow-[0_4px_16px_rgba(255,215,0,0.35)]'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'العامل (Employé)' : 'Employé (Opérateur)'}</span>
                </div>
                <span
                  className={`text-[10px] font-bold ${
                    selectedRole === 'employee' ? 'text-black/80' : 'text-gray-400'
                  }`}
                >
                  {isAr ? 'الخدمة والستوك (بدون مالية)' : 'Vente & Stock (Sans finances)'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Lockout Warning State */}
        {isLockedOut ? (
          <div className="p-4 rounded-2xl bg-black/80 border border-rose-500/40 text-rose-300 space-y-3 text-center">
            <div className="flex items-center justify-center gap-2 text-rose-400 font-bold text-sm">
              <ShieldAlert className="w-5 h-5" />
              <span>{t.lock.lockedOutTitle}</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">{t.lock.lockedOutDesc}</p>
            <div className="pt-2 border-t border-white/10 flex flex-col items-center">
              <span className="text-[11px] text-rose-300 mb-1">{t.lock.timeRemaining}</span>
              <div className="flex items-center gap-2 font-mono font-black text-2xl text-rose-400 tracking-wider bg-black px-4 py-1.5 rounded-xl border border-rose-500/30">
                <Clock className="w-5 h-5 text-rose-400" />
                <span>{formatTimer(lockoutSecondsLeft)}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Error & Success Alerts */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* ====================================================
                MODE 1: LOGIN VIEW (تسجيل الدخول بالاسم ورقم الهاتف وكلمة المرور)
                ==================================================== */}
            {authMode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-start">
                {/* Quick Worker Selection Pills if Employee Role & multiple workers exist */}
                {selectedRole === 'employee' && savedWorkers.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400 font-bold">
                      {isAr ? 'اختر حساب العامل:' : 'Sélectionner un employé :'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {savedWorkers.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setLoginName(w.full_name);
                            setLoginPhone(w.phone || '');
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-bold border transition cursor-pointer ${
                            loginName === w.full_name
                              ? 'bg-amber-500/25 border-[#FFD700] text-[#FFD700]'
                              : 'bg-black/60 border-white/15 text-gray-300 hover:text-white'
                          }`}
                        >
                          {w.full_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Name Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-200 mb-1.5">
                    {selectedRole === 'owner'
                      ? isAr
                        ? 'اسم الأدمين (مول المحل)'
                        : "Nom de l'Admin"
                      : isAr
                      ? 'اسم العامل'
                      : "Nom de l'employé"}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder={
                        selectedRole === 'owner'
                          ? isAr
                            ? 'أدخل اسم الأدمين الكامل...'
                            : 'Nom complet Admin...'
                          : isAr
                          ? 'أدخل اسم العامل...'
                          : 'Nom complet employé...'
                      }
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-3.5 py-2.5 text-xs sm:text-sm font-bold text-white placeholder-gray-500 focus:outline-hidden transition"
                    />
                  </div>
                </div>

                {/* WhatsApp Phone Number Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-200 mb-1.5">
                    {isAr ? 'رقم الهاتف (واتساب)' : 'Numéro de téléphone (WhatsApp)'}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#22c55e] absolute start-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      placeholder="06 00 00 00 00"
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden transition text-left"
                    />
                  </div>
                </div>

                {/* Password / PIN Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-200">
                      {isAr ? 'كلمة المرور / الرمز السري' : 'Mot de passe / Code secret'}
                    </label>
                    {selectedRole === 'owner' && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          setRecoveryPhone(loginPhone || savedAdminPhone);
                          setRecoveryStep('request');
                          setAuthMode('forgot_password');
                        }}
                        className="text-[11px] font-bold text-[#FFD700] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <MessageCircle className="w-3 h-3 text-[#22c55e]" />
                        <span>{isAr ? 'نسيت كلمة المرور؟' : 'Mot de passe oublié ?'}</span>
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-10 py-2.5 text-xs sm:text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FFD700] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Login Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black text-sm shadow-[0_6px_24px_rgba(255,215,0,0.35)] transition transform active:scale-[0.99] cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting
                    ? isAr
                      ? 'جاري التحقق والدخول...'
                      : 'Connexion en cours...'
                    : isAr
                    ? 'تسجيل الدخول'
                    : 'Se connecter'}
                </button>

                {/* Bottom Link: هل لديك حساب؟ / ليس لديك حساب؟ */}
                <div className="pt-3 border-t border-white/10 text-center">
                  <span className="text-xs text-gray-400">
                    {isAr ? 'ليس لديك حساب بعد؟ ' : "Vous n'avez pas de compte ? "}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setAuthMode('register');
                    }}
                    className="text-xs font-black text-[#FFD700] hover:underline cursor-pointer"
                  >
                    {isAr ? 'إنشاء حساب جديد' : 'Créer un compte'}
                  </button>
                </div>
              </form>
            )}

            {/* ====================================================
                MODE 2: REGISTER / SIGN UP VIEW (إنشاء حساب جديد)
                ==================================================== */}
            {authMode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3 text-start">
                {selectedRole === 'owner' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-200 mb-1">
                      {isAr ? 'اسم المحل التجاري' : 'Nom de la boutique'}
                    </label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={regStoreName}
                        onChange={(e) => setRegStoreName(e.target.value)}
                        placeholder={isAr ? 'مثال: المحل الذهبي للهواتف' : 'Ex: Golden Phone Shop'}
                        className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-3.5 py-2.5 text-xs font-bold text-white placeholder-gray-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-200 mb-1">
                    {selectedRole === 'owner'
                      ? isAr
                        ? 'الاسم الكامل للأدمين'
                        : "Nom complet de l'Admin"
                      : isAr
                      ? 'الاسم الكامل للعامل'
                      : "Nom complet de l'employé"}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder={isAr ? 'الاسم والنسب...' : 'Nom et prénom...'}
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-3.5 py-2.5 text-xs font-bold text-white placeholder-gray-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-200 mb-1">
                    {isAr
                      ? 'رقم الهاتف واتساب (لاسترجاع كلمة المرور)'
                      : 'Numéro WhatsApp (pour récupération)'}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#22c55e] absolute start-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="06 00 00 00 00"
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl ps-10 pe-3.5 py-2.5 text-xs font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden text-left"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-200 mb-1">
                      {isAr ? 'كلمة المرور / الكود' : 'Mot de passe'}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-200 mb-1">
                      {isAr ? 'تأكيد كلمة المرور' : 'Confirmer'}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* If registering a Worker and Admin PIN already exists, require Admin approval password */}
                {selectedRole === 'employee' && isPinConfigured && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-yellow-500/30 space-y-1.5">
                    <label className="block text-[11px] font-extrabold text-[#FFD700]">
                      {isAr
                        ? '🔒 كلمة مرور الأدمين (ضرورية للموافقة على إضافة هذا العامل)'
                        : "🔒 Mot de passe Admin (requis pour autoriser cet employé)"}
                    </label>
                    <input
                      type="password"
                      required
                      value={regAdminApprovalPass}
                      onChange={(e) => setRegAdminApprovalPass(e.target.value)}
                      placeholder={isAr ? 'أدخل كلمة مرور الأدمين...' : 'Mot de passe Admin...'}
                      className="w-full bg-black/80 border border-yellow-500/40 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-hidden"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black text-sm shadow-[0_6px_24px_rgba(255,215,0,0.35)] transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting
                    ? isAr
                      ? 'جاري إنشاء الحساب...'
                      : 'Création en cours...'
                    : isAr
                    ? 'إنشاء الحساب والدخول الآن'
                    : 'Créer le compte et accéder'}
                </button>

                {/* Bottom Link: هل لديك حساب؟ تسجيل الدخول */}
                <div className="pt-3 border-t border-white/10 text-center">
                  <span className="text-xs text-gray-400">
                    {isAr ? 'هل لديك حساب بالفعل؟ ' : 'Vous avez déjà un compte ? '}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setAuthMode('login');
                    }}
                    className="text-xs font-black text-[#FFD700] hover:underline cursor-pointer"
                  >
                    {isAr ? 'تسجيل الدخول' : 'Se connecter'}
                  </button>
                </div>
              </form>
            )}

            {/* ====================================================
                MODE 3: WHATSAPP PASSWORD RECOVERY (استرجاع كلمة المرور عبر واتساب)
                ==================================================== */}
            {authMode === 'forgot_password' && (
              <div className="space-y-4 text-start">
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
                  <MessageCircle className="w-5 h-5 text-[#22c55e] shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    {isAr
                      ? 'أدخل رقم الهاتف واتساب الخاص بالأدمين، وسيتم إرسال كود استرجاع سري أوتوماتيكياً إلى الواتساب ديالك باش تبدل كلمة المرور فوراً.'
                      : 'Entrez le numéro WhatsApp Admin pour recevoir automatiquement votre code de réinitialisation.'}
                  </div>
                </div>

                {recoveryStep === 'request' ? (
                  <form onSubmit={handleRequestRecovery} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-200 mb-1.5">
                        {isAr ? 'رقم واتساب الأدمين المسجل' : 'Numéro WhatsApp Admin'}
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-[#22c55e] absolute start-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          dir="ltr"
                          required
                          value={recoveryPhone}
                          onChange={(e) => setRecoveryPhone(e.target.value)}
                          placeholder="06 00 00 00 00"
                          className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#22c55e] rounded-xl ps-10 pe-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-hidden text-left"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-400 hover:from-emerald-400 hover:to-green-300 text-black font-black text-xs sm:text-sm shadow-[0_6px_20px_rgba(34,197,94,0.35)] flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'إرسال كود الاسترجاع إلى واتساب الآن'
                          : 'Envoyer le code sur WhatsApp'}
                      </span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmResetPassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#FFD700] mb-1">
                        {isAr
                          ? 'كود الاسترجاع المرسل إلى واتساب (6 أرقام)'
                          : 'Code reçu sur WhatsApp (6 chiffres)'}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        className="w-full bg-black/80 border border-yellow-500/40 focus:border-[#FFD700] rounded-xl px-4 py-2.5 text-center text-lg font-mono font-black tracking-widest text-[#FFD700] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-200 mb-1">
                        {isAr ? 'كلمة المرور الجديدة للأدمين' : 'Nouveau mot de passe Admin'}
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={newResetPassword}
                        onChange={(e) => setNewResetPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-200 mb-1">
                        {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirmer le nouveau mot de passe'}
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmResetPassword}
                        onChange={(e) => setConfirmResetPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full bg-black/70 border border-yellow-500/25 focus:border-[#FFD700] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white focus:outline-hidden"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 text-black font-black text-xs sm:text-sm shadow-[0_6px_20px_rgba(255,215,0,0.35)] transition cursor-pointer"
                    >
                      {isAr
                        ? 'حفظ كلمة المرور الجديدة والدخول'
                        : 'Enregistrer et se connecter'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecoveryStep('request')}
                      className="w-full py-2 text-[11px] font-bold text-emerald-400 hover:underline text-center cursor-pointer"
                    >
                      {isAr ? 'إعادة إرسال الكود لـ واتساب' : 'Renvoyer le code WhatsApp'}
                    </button>
                  </form>
                )}

                <div className="pt-2 border-t border-white/10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setSuccessMessage(null);
                      setAuthMode('login');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-[#FFD700] cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{isAr ? 'العودة إلى تسجيل الدخول' : 'Retour à la connexion'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

