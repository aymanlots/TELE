import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sun,
  Moon,
  Globe,
  Store,
  Lock,
  UserPlus,
  LogIn,
  Eye,
  EyeOff,
  ShieldCheck,
  MessageCircle,
  Clock,
  ShieldAlert,
  Settings2,
  Send,
  UserCheck,
  Mail,
  AtSign,
  Users,
  Sparkles,
} from 'lucide-react';
import { useAccessAuth } from '../lib/accessAuth';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { getStoreSettings } from '../db';
import {
  normalizeShopPhoneNumber,
  formatPhoneForE164,
  setupRecaptchaVerifier,
  sendPhoneOtp,
  verifyPhoneOtp,
  getActiveShopPhoneNumber,
  verifyGmailWithGooglePopup,
  firestore,
} from '../firebase';
import {
  getLocalMetaCloudConfig,
  saveLocalMetaCloudConfig,
} from '../lib/whatsappCloudApi';
import {
  sendEmailOtp,
  verifyEmailOtp,
  maskEmail,
  isValidEmail,
  lookupAccountEmailForPasswordReset,
  updateShopPasswordInDb,
  getLocalGmailSmtpConfig,
  saveLocalGmailSmtpConfig,
} from '../lib/emailOtpService';
import { ConfirmationResult } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

type Step = 'phone' | 'otp';
type AuthMode = 'login' | 'worker' | 'register' | 'forgot';
type RegisterStep = 'form' | 'verify_email';
type ForgotStep = 'enter_phone' | 'verify_otp' | 'google_verified_reset' | 'success';
type RecoveryMethod = 'gmail' | 'whatsapp';

export const LockScreen: React.FC = () => {
  const {
    loginWithPhone,
    loginAsWorkerWithCode,
    sendWhatsAppRecoveryCode,
    sendEmailRecoveryCode,
    resetAdminPasswordWithCode,
    resetAdminPasswordWithEmailCode,
  } = useAccessAuth();
  const { language, setLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isAr = language === 'ar';

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<Step>('phone');
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');
  const [phoneNumber, setPhoneNumber] = useState<string>(() => getActiveShopPhoneNumber() || '');
  const [pinCode, setPinCode] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [storeName, setStoreName] = useState<string>('');
  const [gmailInput, setGmailInput] = useState<string>('');
  const [googleVerifiedEmail, setGoogleVerifiedEmail] = useState<string>('');
  const [registerOtpDigits, setRegisterOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [registerOtpExpiresAt, setRegisterOtpExpiresAt] = useState<number>(0);
  const [registerExpirySecondsLeft, setRegisterExpirySecondsLeft] = useState<number>(0);
  const registerOtpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Dedicated Worker Code Login State
  const [workerSecretCode, setWorkerSecretCode] = useState<string>('');
  const [showWorkerCode, setShowWorkerCode] = useState<boolean>(false);

  const [otpCode, setOtpCode] = useState<string>('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Forgot Password: Gmail (Nodemailer / Google Sign-In) by default, or Meta WhatsApp Cloud API
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('gmail');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('enter_phone');
  const [recoveryPhone, setRecoveryPhone] = useState<string>('');
  const [recoveryInput, setRecoveryInput] = useState<string>('');
  const [resolvedShopPhone, setResolvedShopPhone] = useState<string>('');
  const [resolvedAccountEmail, setResolvedAccountEmail] = useState<string>('');
  const [maskedAccountEmail, setMaskedAccountEmail] = useState<string>('');
  const [maskedTargetPhone, setMaskedTargetPhone] = useState<string>('');
  const [resolvedUserName, setResolvedUserName] = useState<string>('');
  const [resolvedStoreName, setResolvedStoreName] = useState<string>('');
  const [resolvedAccountType, setResolvedAccountType] = useState<'owner' | 'member'>('owner');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [expirySecondsLeft, setExpirySecondsLeft] = useState<number>(0);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [remainingWindowRequests, setRemainingWindowRequests] = useState<number | null>(null);

  // Free Gmail App Password (Nodemailer) inline configuration drawer
  const [showGmailSmtpDrawer, setShowGmailSmtpDrawer] = useState<boolean>(false);
  const [smtpUserInput, setSmtpUserInput] = useState<string>(
    () => getLocalGmailSmtpConfig().gmailUser || ''
  );
  const [smtpPassInput, setSmtpPassInput] = useState<string>(
    () => getLocalGmailSmtpConfig().gmailAppPassword || ''
  );

  // Optional inline Meta Cloud API credentials drawer
  const [showMetaConfigDrawer, setShowMetaConfigDrawer] = useState<boolean>(false);
  const [metaPhoneIdInput, setMetaPhoneIdInput] = useState<string>(
    () => getLocalMetaCloudConfig().phoneNumberId || ''
  );
  const [metaTokenInput, setMetaTokenInput] = useState<string>(
    () => getLocalMetaCloudConfig().accessToken || ''
  );
  const [metaTemplateInput, setMetaTemplateInput] = useState<string>(
    () => getLocalMetaCloudConfig().templateName || ''
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    async function loadInitial() {
      try {
        const s = await getStoreSettings();
        if (s.storeName) setStoreName(s.storeName);
        if (s.phone && !phoneNumber) {
          setPhoneNumber(s.phone);
          setRecoveryPhone(s.phone);
        }
        if (s.metaPhoneNumberId && !metaPhoneIdInput) setMetaPhoneIdInput(s.metaPhoneNumberId);
        if (s.metaAccessToken && !metaTokenInput) setMetaTokenInput(s.metaAccessToken);
        if (s.metaTemplateName && !metaTemplateInput) setMetaTemplateInput(s.metaTemplateName);
      } catch {}
    }
    loadInitial();
  }, []);

  // Countdown timer for SMS OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Countdown timer for Rate Limit Cooldown
  useEffect(() => {
    if (rateLimitCooldown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCooldown]);

  // Live 5-minute OTP Expiration Countdown Timer
  useEffect(() => {
    if (!otpExpiresAt || forgotStep !== 'verify_otp') return;
    const updateRemaining = () => {
      const diff = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setExpirySecondsLeft(diff);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [otpExpiresAt, forgotStep]);

  // Live 5-minute Countdown Timer for Registration Email OTP
  useEffect(() => {
    if (!registerOtpExpiresAt || registerStep !== 'verify_email') return;
    const updateRemaining = () => {
      const diff = Math.max(0, Math.ceil((registerOtpExpiresAt - Date.now()) / 1000));
      setRegisterExpirySecondsLeft(diff);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [registerOtpExpiresAt, registerStep]);

  const formatMmSs = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const persistGmailSmtpIfEntered = async () => {
    const u = smtpUserInput.trim().toLowerCase();
    const p = smtpPassInput.replace(/\s+/g, '');
    if (u && p) {
      saveLocalGmailSmtpConfig({ gmailUser: u, gmailAppPassword: p });
      try {
        await setDoc(
          doc(firestore, 'platform_config', 'email_smtp'),
          { gmailAppUser: u, gmailAppPassword: p, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch {}
    }
  };

  // =======================================================================
  // WORKER LOGIN: Dedicated Worker Button Linked to Admin
  // =======================================================================
  const handleWorkerCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanCode = workerSecretCode.trim();
    if (!cleanCode || cleanCode.length < 4) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال الكود السري الذي أعطاه لك الأدمين (4 أرقام على الأقل).'
          : 'Veuillez saisir le code secret fourni par votre Admin (min. 4 chiffres).'
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginAsWorkerWithCode(cleanCode, phoneNumber);
      if (!res.success) {
        setErrorMessage(
          res.error ||
            (isAr
              ? 'هذا الكود غير صحيح أو غير مرتبط بأي عامل عند الأدمين.'
              : 'Code employé incorrect ou introuvable.')
        );
        return;
      }
      setSuccessMessage(
        isAr
          ? `مرحباً ${res.workerName || 'بالعامل'}! تم الدخول بنجاح إلى محل (${res.storeName || 'الأدمين'}).`
          : `Bienvenue ${res.workerName || 'Employé'} ! Connexion réussie.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // =======================================================================
  // 100% FREE GOOGLE POPUP VERIFICATION FOR REGISTRATION
  // =======================================================================
  const handleRegisterWithGoogleFree = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanPhone = normalizeShopPhoneNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم هاتف المحل أولاً (مثال: 0612345678)'
          : 'Veuillez d’abord saisir le numéro de téléphone (ex: 0612345678)'
      );
      return;
    }

    const cleanPin = pinCode.trim();
    if (!cleanPin || cleanPin.length < 4) {
      setErrorMessage(
        isAr
          ? 'المرجو اختيار الكود السري (4 أرقام على الأقل) أولاً.'
          : 'Veuillez d’abord choisir un code PIN secret (au moins 4 chiffres).'
      );
      return;
    }

    if (!storeName.trim()) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال اسم المحل التجاري أولاً.'
          : 'Veuillez d’abord saisir le nom de la boutique.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const googleRes = await verifyGmailWithGooglePopup(gmailInput.trim() || undefined);
      if (!googleRes.success || !googleRes.email) {
        setErrorMessage(
          googleRes.error ||
            (isAr ? 'لم يكتمل تأكيد حساب Gmail عبر Google.' : 'Échec de vérification Google.')
        );
        return;
      }

      const verifiedMail = googleRes.email.trim().toLowerCase();
      setGmailInput(verifiedMail);
      setGoogleVerifiedEmail(verifiedMail);
      setPhoneNumber(cleanPhone);

      const loginRes = await loginWithPhone(
        cleanPhone,
        storeName.trim(),
        cleanPin,
        'register',
        verifiedMail,
        true
      );

      if (!loginRes.success) {
        setErrorMessage(loginRes.error || (isAr ? 'فشل إتمام التسجيل.' : "Erreur d'inscription."));
        return;
      }

      setSuccessMessage(
        isAr
          ? `تم تأكيد بريدك (${verifiedMail}) مجاناً وتفعيل حساب المحل بنجاح!`
          : `Compte Gmail (${verifiedMail}) vérifié et activé avec succès !`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Primary submit: Log in or Register by Phone Number + Secret PIN (+ Mandatory Gmail)
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanPhone = normalizeShopPhoneNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678 أو 0717566513)'
          : 'Veuillez saisir un numéro de téléphone valide (ex: 0612345678)'
      );
      return;
    }

    const cleanPin = pinCode.trim();
    if (!cleanPin || cleanPin.length < 4) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال الكود السري (4 أرقام على الأقل) لحماية حسابك.'
          : 'Veuillez saisir votre code PIN secret (au moins 4 chiffres).'
      );
      return;
    }

    if (authMode === 'register') {
      if (!storeName.trim()) {
        setErrorMessage(
          isAr
            ? 'المرجو إدخال اسم المحل التجاري لإنشاء حساب جديد'
            : 'Veuillez saisir le nom de la boutique pour créer un compte'
        );
        return;
      }

      const cleanGmail = gmailInput.trim().toLowerCase();
      if (!cleanGmail) {
        setErrorMessage(
          isAr
            ? 'المرجو إدخال بريد Gmail الخاص بك (إجباري لتأكيد وتفعيل الحساب لأول مرة)'
            : 'Veuillez saisir votre adresse Gmail (obligatoire pour activer le compte)'
        );
        return;
      }

      if (!isValidEmail(cleanGmail)) {
        setErrorMessage(
          isAr
            ? 'صيغة البريد الإلكتروني غير صحيحة (مثال: exemple@gmail.com)'
            : 'Format Gmail non valide (ex: exemple@gmail.com)'
        );
        return;
      }

      // If already verified via Google Popup for this exact email, complete registration immediately
      if (googleVerifiedEmail && googleVerifiedEmail === cleanGmail) {
        setIsLoading(true);
        try {
          const loginRes = await loginWithPhone(
            cleanPhone,
            storeName.trim(),
            cleanPin,
            'register',
            cleanGmail,
            true
          );
          if (!loginRes.success) {
            setErrorMessage(loginRes.error || (isAr ? 'فشل التسجيل.' : "Erreur d'inscription."));
          }
          return;
        } finally {
          setIsLoading(false);
        }
      }

      // Send 6-digit OTP to the entered Gmail via Nodemailer
      setIsLoading(true);
      try {
        await persistGmailSmtpIfEntered();
        const sendRes = await sendEmailOtp({
          email: cleanGmail,
          type: 'register_verification',
          storeName: storeName.trim(),
          phone: cleanPhone,
        });

        if (!sendRes.success) {
          setShowGmailSmtpDrawer(true);
          setErrorMessage(
            sendRes.error ||
              (isAr
                ? 'تعذر إرسال كود التحقق عبر Nodemailer. يمكنك الضغط على الزر الأخضر "تأكيد حساب Gmail مجاناً عبر Google" أو إدخال Gmail App Password بالأسفل.'
                : "Échec d'envoi du code via Nodemailer.")
          );
          return;
        }

        setPhoneNumber(cleanPhone);
        setRegisterOtpExpiresAt(sendRes.expiresAt || Date.now() + 5 * 60 * 1000);
        setRegisterOtpDigits(['', '', '', '', '', '']);
        setRegisterStep('verify_email');
        setSuccessMessage(
          isAr
            ? `تم إرسال رمز التحقق الحقيقي (6 أرقام) إلى بريدك Gmail: ${sendRes.maskedEmail}. افتح علبة الوارد في Gmail وأدخل الرمز.`
            : `Code OTP (6 chiffres) envoyé à votre Gmail : ${sendRes.maskedEmail} (valide 5 min).`
        );
        return;
      } finally {
        setIsLoading(false);
      }
    }

    // Strict Login Mode: Phone must be registered & PIN must match
    setIsLoading(true);
    setPhoneNumber(cleanPhone);

    try {
      const loginRes = await loginWithPhone(
        cleanPhone,
        storeName,
        cleanPin,
        'login'
      );
      if (!loginRes.success) {
        setErrorMessage(loginRes.error || (isAr ? 'فشل تسجيل الدخول.' : 'Erreur de connexion.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle 6-digit input for Registration Email OTP
  const handleRegisterOtpDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...registerOtpDigits];
      next[index] = '';
      setRegisterOtpDigits(next);
      return;
    }

    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = [...registerOtpDigits];
      for (let i = 0; i < 6; i++) {
        if (chars[i]) next[i] = chars[i];
      }
      setRegisterOtpDigits(next);
      const focusIdx = Math.min(5, chars.length - 1);
      registerOtpInputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...registerOtpDigits];
    next[index] = clean;
    setRegisterOtpDigits(next);

    if (index < 5) {
      registerOtpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleRegisterOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !registerOtpDigits[index] && index > 0) {
      registerOtpInputRefs.current[index - 1]?.focus();
    }
  };

  // Verify Registration Email OTP & Unlock Account
  const handleVerifyRegisterEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const code = registerOtpDigits.join('').trim();
    if (code.length !== 6) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رمز التحقق كاملاً المكون من 6 أرقام المرسل إلى بريدك Gmail.'
          : 'Veuillez saisir les 6 chiffres du code OTP reçu sur votre Gmail.'
      );
      return;
    }

    if (registerExpirySecondsLeft <= 0) {
      setErrorMessage(
        isAr
          ? 'انتهت صلاحية رمز التحقق (صالح لمدة 5 دقائق فقط). اضغط على إعادة الإرسال.'
          : 'Le code OTP a expiré (5 min). Veuillez demander un renvoi.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const verifyRes = await verifyEmailOtp({
        email: gmailInput.trim().toLowerCase(),
        otp: code,
        type: 'register_verification',
      });

      if (!verifyRes.success) {
        setErrorMessage(
          verifyRes.error || (isAr ? 'رمز التحقق غير صحيح.' : 'Code OTP incorrect.')
        );
        return;
      }

      // Verification success: register account with verified Gmail (correct parameter order!)
      const loginRes = await loginWithPhone(
        phoneNumber,
        storeName.trim(),
        pinCode.trim(),
        'register',
        gmailInput.trim().toLowerCase(),
        true
      );

      if (!loginRes.success) {
        setErrorMessage(loginRes.error || (isAr ? 'فشل إتمام التسجيل.' : "Erreur d'inscription."));
        return;
      }

      setSuccessMessage(
        isAr
          ? 'تم تأكيد بريدك Gmail وتفعيل حساب محلك بنجاح!'
          : 'Votre compte a été vérifié et activé avec succès !'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // =======================================================================
  // FORGOT PASSWORD: 100% FREE GOOGLE VERIFICATION OF REGISTERED GMAIL
  // =======================================================================
  const handleGooglePasswordRecovery = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const inputVal = (recoveryInput || recoveryPhone || phoneNumber || '').trim();
    if (!inputVal) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم الهاتف أو بريد Gmail المسجل به المحل أولاً.'
          : 'Veuillez saisir votre téléphone ou adresse Gmail enregistrée.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const lookup = await lookupAccountEmailForPasswordReset(inputVal);
      if (!lookup.found || !lookup.email) {
        setErrorMessage(
          lookup.error ||
            (isAr
              ? 'هذا الحساب غير مسجل أو لا يوجد بريد Gmail مرتبط به.'
              : 'Compte introuvable ou aucun Gmail associé.')
        );
        return;
      }

      const expectedGmail = lookup.email.trim().toLowerCase();
      const googleRes = await verifyGmailWithGooglePopup(expectedGmail);

      if (!googleRes.success || !googleRes.email) {
        setErrorMessage(
          googleRes.error ||
            (isAr ? 'لم يكتمل التحقق من حساب Gmail عبر Google.' : 'Échec de vérification Google.')
        );
        return;
      }

      const signedInEmail = googleRes.email.trim().toLowerCase();
      if (signedInEmail !== expectedGmail) {
        setErrorMessage(
          isAr
            ? `البريد الذي اخترته (${signedInEmail}) لا يطابق البريد المسجل لهذا المحل (${lookup.maskedEmail || maskEmail(expectedGmail)}). المرجو تسجيل الدخول بنفس حساب Gmail الذي سجلت به المحل.`
            : `L'email sélectionné (${signedInEmail}) ne correspond pas au Gmail enregistré (${lookup.maskedEmail}).`
        );
        return;
      }

      setResolvedAccountEmail(expectedGmail);
      setMaskedAccountEmail(lookup.maskedEmail || maskEmail(expectedGmail));
      setResolvedShopPhone(lookup.shopPhone || normalizeShopPhoneNumber(inputVal));
      setResolvedUserName(lookup.userName || (isAr ? 'المدير' : 'Gérant'));
      setResolvedStoreName(lookup.storeName || storeName || (isAr ? 'المحل الذهبي' : 'Boutique'));
      setNewPassword('');
      setConfirmNewPassword('');
      setForgotStep('google_verified_reset');
      setSuccessMessage(
        isAr
          ? `تم التأكد من ملكيتك لبريد (${signedInEmail}) بنجاح! يمكنك الآن تعيين كلمة السر الجديدة.`
          : `Propriété du compte (${signedInEmail}) confirmée ! Choisissez votre nouveau code.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNewPasswordAfterGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanNewPass = newPassword.trim();
    if (cleanNewPass.length < 4) {
      setErrorMessage(
        isAr
          ? 'كلمة السر الجديدة يجب أن تتكون من 4 أرقام على الأقل.'
          : 'Le nouveau code secret doit contenir au moins 4 chiffres.'
      );
      return;
    }

    if (cleanNewPass !== confirmNewPassword.trim()) {
      setErrorMessage(
        isAr
          ? 'تأكيد كلمة السر غير متطابق مع كلمة السر الجديدة.'
          : 'La confirmation ne correspond pas au nouveau code secret.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const targetPhone =
        resolvedShopPhone || normalizeShopPhoneNumber(recoveryPhone || phoneNumber);
      const updated = await updateShopPasswordInDb(
        targetPhone,
        cleanNewPass,
        resolvedAccountEmail
      );

      if (!updated.success) {
        setErrorMessage(updated.error || (isAr ? 'فشل تحديث كلمة السر.' : 'Échec de mise à jour.'));
        return;
      }

      if (targetPhone) {
        setPhoneNumber(targetPhone);
        setRecoveryPhone(targetPhone);
      }
      setPinCode(cleanNewPass);
      setForgotStep('success');
      setSuccessMessage(
        isAr
          ? 'تم تغيير كلمة السر بنجاح وتحديثها في قاعدة البيانات!'
          : 'Votre mot de passe a été modifié avec succès !'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password: Request 6-digit OTP via Registered Gmail (Nodemailer)
  const handleRequestEmailResetOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const inputVal = (recoveryInput || recoveryPhone || phoneNumber || '').trim();
    if (!inputVal) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم الهاتف أو بريد Gmail المسجل'
          : 'Veuillez saisir votre téléphone ou adresse Gmail'
      );
      return;
    }

    setIsLoading(true);
    try {
      await persistGmailSmtpIfEntered();
      const res = await sendEmailRecoveryCode(inputVal);
      if (!res.success) {
        if (res.account?.found) {
          setShowGmailSmtpDrawer(true);
        }
        setErrorMessage(
          res.error || (isAr ? 'تعذر إرسال كود الاسترجاع إلى Gmail' : "Impossible d'envoyer le code")
        );
        return;
      }

      const emailFound = res.account?.email || (inputVal.includes('@') ? inputVal : '');
      const maskedFound = res.account?.maskedEmail || maskEmail(emailFound);
      setResolvedAccountEmail(emailFound);
      setMaskedAccountEmail(maskedFound);
      setResolvedShopPhone(res.account?.shopPhone || '');
      setResolvedUserName(res.account?.userName || (isAr ? 'المدير' : 'Gérant'));
      setResolvedStoreName(res.account?.storeName || storeName || (isAr ? 'المحل الذهبي' : 'Boutique'));
      setOtpExpiresAt(res.expiresAt || Date.now() + 5 * 60 * 1000);
      setOtpDigits(['', '', '', '', '', '']);
      setForgotStep('verify_otp');
      setRecoveryMethod('gmail');

      setSuccessMessage(
        isAr
          ? `تم إرسال كود استرجاع كلمة المرور (6 أرقام) مباشرة إلى بريدك Gmail المسجل: ${maskedFound}. افتح Gmail وأدخل الكود (صالح 5 دقائق).`
          : `Code OTP (6 chiffres) envoyé directement à votre Gmail : ${maskedFound} (valide 5 min).`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Step 1: Request 6-digit OTP via Meta WhatsApp Cloud API
  const handleRequestWhatsAppOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetPhone = normalizeShopPhoneNumber(recoveryPhone || phoneNumber);
    if (!targetPhone || targetPhone.length < 9) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم الواتساب الخاص بحسابك (مثال: 0612345678)'
          : 'Veuillez saisir votre numéro WhatsApp (ex: 0612345678)'
      );
      return;
    }

    if (metaPhoneIdInput.trim() || metaTokenInput.trim()) {
      saveLocalMetaCloudConfig({
        phoneNumberId: metaPhoneIdInput.trim(),
        accessToken: metaTokenInput.trim(),
        templateName: metaTemplateInput.trim(),
      });
    }

    setIsLoading(true);
    setRecoveryPhone(targetPhone);

    try {
      const res = await sendWhatsAppRecoveryCode(targetPhone);
      if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
        setRateLimitCooldown(res.retryAfterSeconds);
      }
      if (res.remainingRequestsInWindow !== undefined) {
        setRemainingWindowRequests(res.remainingRequestsInWindow);
      }

      if (!res.success) {
        setShowMetaConfigDrawer(true);
        setErrorMessage(
          res.error ||
            (isAr ? 'تعذر إرسال كود التحقق عبر واتساب.' : "Impossible d'envoyer le code OTP.")
        );
        return;
      }

      setMaskedTargetPhone(res.maskedPhone || targetPhone);
      setResolvedUserName(res.userName || (isAr ? 'مستخدم الحساب' : 'Utilisateur'));
      setResolvedStoreName(res.storeName || storeName || (isAr ? 'المحل الذهبي' : 'Boutique'));
      setResolvedAccountType(res.accountType || 'owner');
      setOtpExpiresAt(res.expiresAt || Date.now() + 5 * 60 * 1000);
      setOtpDigits(['', '', '', '', '', '']);
      setForgotStep('verify_otp');

      setSuccessMessage(
        isAr
          ? `تم إرسال كود OTP (6 أرقام) عبر واتساب إلى ${res.maskedPhone}. صالح لمدة 5 دقائق.`
          : `Code OTP (6 chiffres) envoyé sur WhatsApp au ${res.maskedPhone} (valide 5 min).`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle 6-digit OTP box changes
  const handleOtpDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        if (chars[i]) next[i] = chars[i];
      }
      setOtpDigits(next);
      const focusIdx = Math.min(5, chars.length - 1);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Forgot Password Step 2: Verify 6-digit OTP & Update Password in Database
  const handleVerifyOtpAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const combinedOtp = otpDigits.join('').trim();
    if (combinedOtp.length !== 6) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال كود التحقق المكون من 6 أرقام كاملاً.'
          : 'Veuillez saisir les 6 chiffres du code OTP.'
      );
      return;
    }

    if (expirySecondsLeft <= 0) {
      setErrorMessage(
        isAr
          ? 'انتهت صلاحية هذا الكود (مرت 5 دقائق). المرجو الضغط على "إعادة إرسال كود جديد".'
          : 'Ce code a expiré (5 minutes écoulées). Veuillez demander un nouveau code.'
      );
      return;
    }

    const cleanNewPass = newPassword.trim();
    if (cleanNewPass.length < 4) {
      setErrorMessage(
        isAr
          ? 'كلمة السر الجديدة يجب أن تتكون من 4 أرقام على الأقل.'
          : 'Le nouveau code secret doit contenir au moins 4 chiffres.'
      );
      return;
    }

    if (cleanNewPass !== confirmNewPassword.trim()) {
      setErrorMessage(
        isAr
          ? 'تأكيد كلمة السر غير متطابق مع كلمة السر الجديدة.'
          : 'La confirmation ne correspond pas au nouveau code secret.'
      );
      return;
    }

    setIsLoading(true);
    try {
      let res: { success: boolean; error?: string };
      if (recoveryMethod === 'gmail') {
        res = await resetAdminPasswordWithEmailCode(
          resolvedAccountEmail || recoveryInput || recoveryPhone || phoneNumber,
          combinedOtp,
          cleanNewPass,
          resolvedShopPhone || recoveryPhone || phoneNumber
        );
      } else {
        res = await resetAdminPasswordWithCode(
          combinedOtp,
          cleanNewPass,
          recoveryPhone || phoneNumber
        );
      }

      if (!res.success) {
        setErrorMessage(
          res.error || (isAr ? 'فشل التحقق من الكود.' : 'Échec de la vérification du code.')
        );
        return;
      }

      const finalPhone = resolvedShopPhone || recoveryPhone || phoneNumber;
      if (finalPhone) {
        setPhoneNumber(finalPhone);
      }
      setPinCode(cleanNewPass);
      setForgotStep('success');
      setSuccessMessage(
        isAr
          ? 'تم تغيير كلمة السر بنجاح وتحديثها في قاعدة البيانات!'
          : 'Votre mot de passe a été modifié avec succès !'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Optional SMS OTP flow if requested
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanPhone = normalizeShopPhoneNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678 أو 0717566513)'
          : 'Veuillez saisir un numéro de téléphone valide (ex: 0612345678)'
      );
      return;
    }

    setIsLoading(true);
    setPhoneNumber(cleanPhone);

    try {
      const verifier = setupRecaptchaVerifier('recaptcha-container');
      const confirmation = await sendPhoneOtp(cleanPhone, verifier);
      setConfirmationResult(confirmation);
      setStep('otp');
      setCountdown(60);
      setSuccessMessage(
        isAr
          ? `تم إرسال كود التحقق (OTP) في رسالة SMS إلى الرقم ${cleanPhone}`
          : `Code OTP envoyé par SMS au ${cleanPhone}`
      );
    } catch {
      await handlePhoneSubmit(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm SMS OTP & Login (Strictly no hardcoded bypass!)
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال كود التحقق المكون من 6 أرقام'
          : 'Veuillez saisir le code à 6 chiffres'
      );
      return;
    }

    if (!confirmationResult) {
      setErrorMessage(
        isAr ? 'انتهت جلسة التحقق. المرجو إعادة المحاولة.' : 'Session expirée. Veuillez réessayer.'
      );
      return;
    }

    setIsLoading(true);
    const cleanPhone = normalizeShopPhoneNumber(phoneNumber);

    try {
      await verifyPhoneOtp(confirmationResult, cleanCode);

      const loginRes = await loginWithPhone(
        cleanPhone,
        storeName,
        pinCode.trim(),
        authMode === 'register' ? 'register' : 'login',
        gmailInput.trim().toLowerCase() || undefined,
        true
      );
      if (!loginRes.success) {
        setErrorMessage(loginRes.error || (isAr ? 'فشل تسجيل الدخول.' : 'Erreur de connexion.'));
        return;
      }

      setSuccessMessage(
        isAr
          ? 'تم تسجيل الدخول بنجاح! جاري فتح حساب المحل...'
          : 'Connexion réussie ! Ouverture de votre boutique...'
      );
    } catch {
      setErrorMessage(
        isAr
          ? 'كود التحقق غير صحيح أو منتهي الصلاحية.'
          : 'Code OTP invalide ou expiré.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent text-white overflow-y-auto selection:bg-amber-500/30"
    >
      {/* Background Image */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          src="/shop-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-top"
        />
        <div
          className={`absolute inset-0 transition-colors duration-300 ${
            theme === 'light' ? 'bg-[#FAF7F0]/75' : 'bg-black/25'
          }`}
        />
      </div>

      {/* Invisible container for Firebase Phone Auth reCAPTCHA */}
      <div id="recaptcha-container" ref={recaptchaContainerRef} className="hidden"></div>

      {/* Top Controls: Theme & Language */}
      <div className="fixed top-4 end-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black/35 backdrop-blur-md border border-amber-500/30 text-xs font-bold text-white hover:bg-black/50 hover:border-amber-400 transition cursor-pointer shadow-lg"
          title={isAr ? 'تبديل الوضع' : 'Changer de thème'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAr ? 'نهاري' : 'Clair'}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAr ? 'ليلي' : 'Sombre'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black/35 backdrop-blur-md border border-amber-500/30 text-xs font-bold text-white hover:bg-black/50 hover:border-amber-400 transition cursor-pointer shadow-lg"
        >
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-xs font-bold">{language === 'ar' ? 'FR' : 'عربي'}</span>
        </button>
      </div>

      {/* Main Authentication Box */}
      <div className="relative z-10 w-full max-w-md bg-black/40 backdrop-blur-md border border-amber-500/30 rounded-2xl p-6 sm:p-7 my-auto shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.15)] space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-3">
            <div className="w-18 h-18 rounded-2xl bg-black flex items-center justify-center border border-amber-400/60 shadow-lg overflow-hidden">
              <img
                src="/assets/aistudio/image_e43ac3cd.png"
                alt="Golden Shop Icon"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -end-1 p-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-amber-500/40 text-amber-400">
              {authMode === 'register' ? (
                <UserPlus className="w-3.5 h-3.5" />
              ) : authMode === 'worker' ? (
                <Users className="w-3.5 h-3.5 text-emerald-400" />
              ) : authMode === 'forgot' ? (
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow">
            {authMode === 'forgot'
              ? isAr
                ? 'استرجاع وتغيير كلمة السر'
                : 'Réinitialisation du mot de passe'
              : authMode === 'worker'
              ? isAr
                ? 'دخول العامل (بـ كود الأدمين)'
                : 'Accès Employé (Code Admin)'
              : authMode === 'register'
              ? isAr
                ? 'إنشاء حساب جديد للمحل'
                : 'Créer un nouveau compte'
              : storeName.trim() || (isAr ? 'تسجيل الدخول للمحل' : 'Connexion à la Boutique')}
          </h1>
          <p className="text-xs text-amber-400 mt-1 font-semibold drop-shadow">
            {authMode === 'forgot'
              ? isAr
                ? 'استرجع كلمة السر عبر حساب Gmail المسجل به المحل'
                : 'Récupérez votre mot de passe via votre Gmail enregistré'
              : authMode === 'worker'
              ? isAr
                ? 'أدخل فقط الكود السري الذي أعطاه لك الأدمين للدخول إلى حساب المحل'
                : 'Saisissez uniquement le code secret fourni par votre Admin'
              : authMode === 'register'
              ? isAr
                ? 'سجل رقم هاتفك وبريد Gmail حقيقي لحماية محلك في جميع الأجهزة'
                : 'Enregistrez votre numéro et votre Gmail pour protéger votre boutique'
              : isAr
              ? 'أدخل رقم الهاتف المسجل والكود السري (PIN) للدخول إلى حساب محلك'
              : 'Entrez votre numéro enregistré et votre code PIN secret'}
          </p>
        </div>

        {/* Top Quick Switcher between Admin Login & Worker Code Login */}
        {(authMode === 'login' || authMode === 'worker') && step === 'phone' && (
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/50 border border-amber-500/25 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'login'
                  ? 'bg-amber-400 text-neutral-950 font-black shadow-md'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isAr ? 'دخول المدير (الأدمين)' : 'Accès Admin'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('worker');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                authMode === 'worker'
                  ? 'bg-emerald-500 text-neutral-950 font-black shadow-md'
                  : 'text-emerald-300 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{isAr ? 'دخول العامل (بكود الأدمين)' : 'Accès Employé'}</span>
            </button>
          </div>
        )}

        {/* Alerts */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/20 backdrop-blur-sm border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/20 backdrop-blur-sm border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* =====================================================================
            DEDICATED WORKER LOGIN SCREEN (ONLY ADMIN-GIVEN WORKER CODE)
           ===================================================================== */}
        {authMode === 'worker' && (
          <form onSubmit={handleWorkerCodeSubmit} className="space-y-4 text-start">
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-black">
                <Users className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {isAr
                    ? 'بوابة العامل المربوطة مباشرة بحساب الأدمين'
                    : 'Portail Employé relié au compte Admin'}
                </span>
              </div>
              <p className="text-[11px] text-white/85 leading-relaxed">
                {isAr
                  ? 'أدخل فقط الكود السري الذي أنشأه لك الأدمين في الإعدادات (إدارة حسابات العمال) للدخول مباشرة بصلاحيات العامل.'
                  : 'Entrez uniquement le code secret créé par l’Admin dans les paramètres (Comptes employés).'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-2 flex items-center gap-1.5 drop-shadow">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>
                  {isAr
                    ? 'الكود السري الذي أعطاه لك الأدمين'
                    : 'Code secret donné par l’Admin'}
                </span>
              </label>
              <div className="relative" dir="ltr">
                <KeyRound className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showWorkerCode ? 'text' : 'password'}
                  inputMode="numeric"
                  dir="ltr"
                  required
                  autoFocus
                  minLength={4}
                  maxLength={12}
                  value={workerSecretCode}
                  onChange={(e) => setWorkerSecretCode(e.target.value.replace(/\s+/g, '').slice(0, 12))}
                  placeholder="••••"
                  className="w-full bg-black/50 backdrop-blur-sm border border-emerald-500/45 focus:border-emerald-400 rounded-xl pl-10 pr-10 py-3.5 text-lg font-mono font-black tracking-[0.35em] text-emerald-400 placeholder-white/40 focus:outline-hidden transition text-center"
                />
                <button
                  type="button"
                  onClick={() => setShowWorkerCode(!showWorkerCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-emerald-400 transition cursor-pointer"
                  title={showWorkerCode ? (isAr ? 'إخفاء الكود' : 'Masquer') : (isAr ? 'إظهار الكود' : 'Afficher')}
                >
                  {showWorkerCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري التحقق من كود العامل...' : 'Vérification du code...'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{isAr ? 'دخول العامل للمحل' : 'Se connecter en tant qu’employé'}</span>
                </>
              )}
            </button>

            <div className="pt-2 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs font-bold text-neutral-300 hover:text-amber-400 transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'العودة إلى دخول المدير (الأدمين)' : 'Retour à la connexion Admin'}</span>
              </button>
            </div>
          </form>
        )}

        {/* =====================================================================
            FORGOT PASSWORD: GMAIL (GOOGLE FREE / NODEMAILER) OR WHATSAPP
           ===================================================================== */}
        {authMode === 'forgot' && (
          <div className="space-y-4 text-start">
            {/* Recovery Channel Selector Tabs */}
            {forgotStep === 'enter_phone' && (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/45 border border-white/10 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('gmail');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    recoveryMethod === 'gmail'
                      ? 'bg-amber-400 text-neutral-950 shadow-md font-black'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عبر Gmail المسجل' : 'Via Gmail'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('whatsapp');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    recoveryMethod === 'whatsapp'
                      ? 'bg-emerald-500 text-neutral-950 shadow-md font-black'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عبر WhatsApp' : 'Via WhatsApp'}</span>
                </button>
              </div>
            )}

            {/* SUB-STEP 1A: Enter Phone or Gmail for Gmail Recovery */}
            {forgotStep === 'enter_phone' && recoveryMethod === 'gmail' && (
              <form onSubmit={handleRequestEmailResetOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5 drop-shadow">
                    {isAr
                      ? 'رقم الهاتف أو بريد Gmail المسجل به المحل'
                      : 'Numéro de téléphone ou Gmail enregistré'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-amber-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={recoveryInput || recoveryPhone}
                      onChange={(e) => {
                        setRecoveryInput(e.target.value);
                        setRecoveryPhone(e.target.value);
                      }}
                      placeholder={
                        isAr
                          ? 'مثال: 0612345678 أو exemple@gmail.com'
                          : 'Ex: 0612345678 ou contact@gmail.com'
                      }
                      className="w-full bg-black/40 backdrop-blur-sm border border-amber-500/40 focus:border-amber-400 rounded-xl ps-10 pe-4 py-3 text-xs sm:text-sm font-bold text-white placeholder-white/45 focus:outline-hidden transition"
                    />
                  </div>
                </div>

                {/* 100% Free Instant Google Gmail Ownership Verification */}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGooglePasswordRecovery}
                  className="w-full py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>
                    {isAr
                      ? 'استرجاع مجاني وفوري عبر حساب Gmail المسجل (Google)'
                      : 'Récupération gratuite via Google Gmail'}
                  </span>
                </button>

                {/* Or send 6-digit OTP via Nodemailer */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {isAr ? 'جاري التحقق والإرسال...' : 'Vérification et envoi...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'إرسال كود (6 أرقام) إلى Gmail عبر Nodemailer'
                          : 'Envoyer le code OTP (6 chiffres) via Nodemailer'}
                      </span>
                    </>
                  )}
                </button>

                {/* Collapsible Free Gmail App Password Setup for Nodemailer */}
                <div className="rounded-xl bg-black/40 border border-white/15 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowGmailSmtpDrawer(!showGmailSmtpDrawer)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-[11px] font-bold text-amber-300 hover:bg-white/5 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {isAr
                          ? 'إعداد Gmail App Password المجاني لـ Nodemailer'
                          : 'Configurer Gmail App Password (Gratuit)'}
                      </span>
                    </span>
                    <span className="text-[10px] text-white/60">
                      {showGmailSmtpDrawer ? (isAr ? 'إخفاء ▲' : 'Masquer ▲') : isAr ? 'إعداد ▼' : 'Configurer ▼'}
                    </span>
                  </button>

                  {showGmailSmtpDrawer && (
                    <div className="p-3.5 border-t border-white/10 space-y-2.5 bg-black/55 text-xs">
                      <p className="text-[11px] text-white/80 leading-relaxed">
                        {isAr
                          ? 'لإرسال الكود مجاناً عبر Nodemailer بدون شراء دومين: افتح حسابك Google ← الأمان ← التحقق بخطوتين ← كلمات مرور التطبيقات (App Passwords) وانسخ الكود المكون من 16 حرفاً:'
                          : 'Créez un "Mot de passe d’application" (16 caractères) gratuitement dans votre compte Google > Sécurité :'}
                      </p>
                      <div>
                        <label className="block text-[10px] text-white/75 mb-1 font-bold">
                          {isAr ? 'بريد المرسل (GMAIL_USER)' : 'Email expéditeur (GMAIL_USER)'}
                        </label>
                        <input
                          type="email"
                          dir="ltr"
                          value={smtpUserInput}
                          onChange={(e) => setSmtpUserInput(e.target.value)}
                          placeholder="votre.boutique@gmail.com"
                          className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/75 mb-1 font-bold">
                          {isAr
                            ? 'كود تطبيق جيمايل من 16 حرفاً (GMAIL_APP_PASSWORD)'
                            : 'Gmail App Password (16 lettres)'}
                        </label>
                        <input
                          type="password"
                          dir="ltr"
                          value={smtpPassInput}
                          onChange={(e) => setSmtpPassInput(e.target.value)}
                          placeholder="abcd efgh ijkl mnop"
                          className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-neutral-300 hover:text-amber-400 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isAr ? 'العودة إلى صفحة تسجيل الدخول' : 'Retour à la connexion'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-STEP 1B: Enter WhatsApp Phone Number */}
            {forgotStep === 'enter_phone' && recoveryMethod === 'whatsapp' && (
              <form onSubmit={handleRequestWhatsAppOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5 drop-shadow">
                    {isAr
                      ? 'رقم الواتساب الخاص بك (مدير المحل أو العامل)'
                      : 'Votre numéro WhatsApp (Gérant ou Employé)'}
                  </label>
                  <div className="relative" dir="ltr">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 border-r border-emerald-500/30 pr-2.5 select-none pointer-events-none">
                      <span>🇲🇦</span>
                      <span>+212</span>
                    </div>
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      autoFocus
                      value={recoveryPhone}
                      onChange={(e) => setRecoveryPhone(e.target.value)}
                      placeholder="06 12 34 56 78"
                      className="w-full bg-black/40 backdrop-blur-sm border border-emerald-500/40 focus:border-emerald-400 rounded-xl pl-22 pr-4 py-3 text-sm font-mono font-bold text-white placeholder-white/45 focus:outline-hidden transition text-left"
                    />
                  </div>
                </div>

                {rateLimitCooldown > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {isAr
                          ? 'حماية Rate Limit (منع الإرسال المتكرر):'
                          : 'Protection Rate Limit active :'}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-black text-amber-400" dir="ltr">
                      {formatMmSs(rateLimitCooldown)}
                    </span>
                  </div>
                )}

                <div className="rounded-xl bg-black/40 border border-white/15 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowMetaConfigDrawer(!showMetaConfigDrawer)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-[11px] font-bold text-emerald-300 hover:bg-white/5 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {isAr
                          ? 'إعدادات Meta WhatsApp Cloud API'
                          : 'Paramètres Meta WhatsApp Cloud API'}
                      </span>
                    </span>
                    <span className="text-[10px] text-white/60">
                      {showMetaConfigDrawer ? (isAr ? 'إخفاء ▲' : 'Masquer ▲') : isAr ? 'إعداد ▼' : 'Configurer ▼'}
                    </span>
                  </button>

                  {showMetaConfigDrawer && (
                    <div className="p-3.5 border-t border-white/10 space-y-2.5 bg-black/50 text-xs">
                      <div>
                        <label className="block text-[10px] text-white/75 mb-1 font-bold">
                          Phone Number ID (Meta Cloud API)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={metaPhoneIdInput}
                          onChange={(e) => setMetaPhoneIdInput(e.target.value)}
                          placeholder="ex: 109283746512345"
                          className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/75 mb-1 font-bold">
                          Permanent Access Token (Bearer)
                        </label>
                        <input
                          type="password"
                          dir="ltr"
                          value={metaTokenInput}
                          onChange={(e) => setMetaTokenInput(e.target.value)}
                          placeholder="EAAGm0PX4ZCpsBA..."
                          className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/75 mb-1 font-bold">
                          {isAr ? 'اسم القالب في Meta (اختياري)' : 'Nom du Template Meta (Optionnel)'}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={metaTemplateInput}
                          onChange={(e) => setMetaTemplateInput(e.target.value)}
                          placeholder="ex: otp_verification"
                          className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || rateLimitCooldown > 0}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {isAr ? 'جاري إرسال كود OTP عبر واتساب...' : 'Envoi du code OTP...'}
                      </span>
                    </>
                  ) : rateLimitCooldown > 0 ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>
                        {isAr
                          ? `انتظر ${rateLimitCooldown} ثانية (Rate Limit)`
                          : `Patientez ${rateLimitCooldown}s (Rate Limit)`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'إرسال كود التحقق (6 أرقام) عبر واتساب'
                          : 'Envoyer le code OTP (6 chiffres) sur WhatsApp'}
                      </span>
                    </>
                  )}
                </button>

                <div className="pt-2 border-t border-white/10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-neutral-300 hover:text-amber-400 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isAr ? 'العودة إلى صفحة تسجيل الدخول' : 'Retour à la connexion'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-STEP 2A: Google Verified Password Reset Form */}
            {forgotStep === 'google_verified_reset' && (
              <form onSubmit={handleSaveNewPasswordAfterGoogle} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      {isAr
                        ? `تم التحقق من حساب Gmail المسجل (${resolvedAccountEmail})`
                        : `Gmail vérifié (${resolvedAccountEmail})`}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/80">
                    {resolvedStoreName} • {resolvedUserName}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5">
                      {isAr
                        ? 'كلمة السر / الكود السري الجديد (4 أرقام على الأقل)'
                        : 'Nouveau mot de passe / Code PIN (min. 4 chiffres)'}
                    </label>
                    <div className="relative" dir="ltr">
                      <KeyRound className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        dir="ltr"
                        required
                        autoFocus
                        minLength={4}
                        maxLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="••••"
                        className="w-full bg-black/40 border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-base font-mono font-black tracking-[0.3em] text-amber-400 placeholder-white/40 focus:outline-hidden text-center"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-amber-400 transition cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5">
                      {isAr ? 'تأكيد كلمة السر الجديدة' : 'Confirmer le nouveau code secret'}
                    </label>
                    <div className="relative" dir="ltr">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        dir="ltr"
                        required
                        minLength={4}
                        maxLength={8}
                        value={confirmNewPassword}
                        onChange={(e) =>
                          setConfirmNewPassword(e.target.value.replace(/\D/g, '').slice(0, 8))
                        }
                        placeholder="••••"
                        className="w-full bg-black/40 border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-base font-mono font-black tracking-[0.3em] text-emerald-400 placeholder-white/40 focus:outline-hidden text-center"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isAr ? 'جاري حفظ كلمة السر الجديدة...' : 'Enregistrement...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isAr ? 'حفظ كلمة السر الجديدة' : 'Enregistrer le nouveau mot de passe'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* SUB-STEP 2B: Enter 6-Digit OTP + New Password (NO FAKE CODE ON SCREEN!) */}
            {forgotStep === 'verify_otp' && (
              <form onSubmit={handleVerifyOtpAndResetPassword} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-black/45 border border-amber-500/35 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-black text-white">
                          {resolvedUserName}{' '}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 ms-1">
                            {resolvedAccountType === 'owner'
                              ? isAr
                                ? 'المدير (الأدمين)'
                                : 'Admin'
                              : isAr
                              ? 'حساب عامل / موظف'
                              : 'Employé'}
                          </span>
                        </div>
                        <div className="text-[11px] text-white/75 font-mono" dir="ltr">
                          {resolvedStoreName} •{' '}
                          {recoveryMethod === 'gmail'
                            ? maskedAccountEmail || resolvedAccountEmail
                            : maskedTargetPhone}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-black flex items-center gap-1.5 shrink-0 ${
                        expirySecondsLeft > 60
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : expirySecondsLeft > 0
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                          : 'bg-rose-500/25 border-rose-500/50 text-rose-300'
                      }`}
                      dir="ltr"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{expirySecondsLeft > 0 ? formatMmSs(expirySecondsLeft) : '00:00'}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-300/90 flex items-center justify-between pt-1 border-t border-white/10">
                    <span>
                      {expirySecondsLeft > 0
                        ? isAr
                          ? '⏳ صلاحية الكود المرسل: 5 دقائق'
                          : '⏳ Validité du code : 5 minutes'
                        : isAr
                        ? '⚠️ انتهت صلاحية الكود (مرت 5 دقائق)!'
                        : '⚠️ Code expiré (5 minutes écoulées) !'}
                    </span>
                    {remainingWindowRequests !== null && (
                      <span className="text-[10px] text-white/70">
                        {isAr
                          ? `الطلبات المتبقية: ${remainingWindowRequests}/3`
                          : `Essais restants: ${remainingWindowRequests}/3`}
                      </span>
                    )}
                  </div>
                </div>

                {/* 6-Digit OTP Input Boxes */}
                <div>
                  <label className="block text-xs font-bold text-white mb-2 text-center">
                    {isAr
                      ? 'أدخل كود التحقق المكون من 6 أرقام الذي وصلك في الرسالة'
                      : 'Saisissez le code OTP à 6 chiffres reçu'}
                  </label>
                  <div className="grid grid-cols-6 gap-2" dir="ltr">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-full h-12 rounded-xl bg-black/50 border border-amber-500/40 focus:border-amber-400 text-center text-lg font-mono font-black text-amber-400 focus:outline-hidden transition shadow-inner"
                      />
                    ))}
                  </div>
                </div>

                {/* New Password & Confirm New Password */}
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5">
                      {isAr
                        ? 'كلمة السر / الكود السري الجديد (4 أرقام على الأقل)'
                        : 'Nouveau mot de passe / Code PIN (min. 4 chiffres)'}
                    </label>
                    <div className="relative" dir="ltr">
                      <KeyRound className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        dir="ltr"
                        required
                        minLength={4}
                        maxLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="••••"
                        className="w-full bg-black/40 border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-base font-mono font-black tracking-[0.3em] text-amber-400 placeholder-white/40 focus:outline-hidden text-center"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-amber-400 transition cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5">
                      {isAr ? 'تأكيد كلمة السر الجديدة' : 'Confirmer le nouveau code secret'}
                    </label>
                    <div className="relative" dir="ltr">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        dir="ltr"
                        required
                        minLength={4}
                        maxLength={8}
                        value={confirmNewPassword}
                        onChange={(e) =>
                          setConfirmNewPassword(e.target.value.replace(/\D/g, '').slice(0, 8))
                        }
                        placeholder="••••"
                        className="w-full bg-black/40 border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-base font-mono font-black tracking-[0.3em] text-emerald-400 placeholder-white/40 focus:outline-hidden text-center"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || expirySecondsLeft <= 0}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {isAr ? 'جاري التحقق وتغيير كلمة السر...' : 'Vérification et mise à jour...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'تأكيد الكود وحفظ كلمة السر الجديدة'
                          : 'Valider le code et changer le mot de passe'}
                      </span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('enter_phone');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>
                      {recoveryMethod === 'gmail'
                        ? isAr
                          ? 'تغيير البريد أو الرقم'
                          : 'Changer email/numéro'
                        : isAr
                        ? 'تغيير رقم الواتساب'
                        : 'Changer de numéro'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={rateLimitCooldown > 0 || isLoading}
                    onClick={() => {
                      if (recoveryMethod === 'gmail') {
                        handleRequestEmailResetOtp();
                      } else {
                        handleRequestWhatsAppOtp();
                      }
                    }}
                    className="text-amber-400 hover:underline disabled:opacity-50 disabled:no-underline font-bold cursor-pointer"
                  >
                    {rateLimitCooldown > 0
                      ? isAr
                        ? `إعادة الإرسال بعد (${rateLimitCooldown}ث)`
                        : `Renvoyer (${rateLimitCooldown}s)`
                      : isAr
                      ? 'إعادة إرسال كود جديد'
                      : 'Renvoyer un nouveau code'}
                  </button>
                </div>
              </form>
            )}

            {/* SUB-STEP 3: Password Reset Complete */}
            {forgotStep === 'success' && (
              <div className="space-y-4 text-center py-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">
                    {isAr
                      ? 'تم تحديث كلمة السر بنجاح!'
                      : 'Mot de passe mis à jour avec succès !'}
                  </h3>
                  <p className="text-xs text-white/80">
                    {isAr
                      ? `تم حفظ الكود السري الجديد لحساب (${resolvedUserName}) في قاعدة البيانات.`
                      : `Le nouveau code PIN pour (${resolvedUserName}) est actif.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const targetLoginPhone =
                      resolvedShopPhone || recoveryPhone || phoneNumber;
                    setAuthMode('login');
                    setForgotStep('enter_phone');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setIsLoading(true);
                    try {
                      await loginWithPhone(
                        targetLoginPhone,
                        resolvedStoreName || storeName,
                        newPassword.trim(),
                        'login'
                      );
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {isAr
                      ? 'الدخول الآن بكلمة السر الجديدة'
                      : 'Se connecter maintenant'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Registration Email OTP Verification Step (NO FAKE CODE ON SCREEN!) */}
        {authMode === 'register' && registerStep === 'verify_email' && (
          <form onSubmit={handleVerifyRegisterEmail} className="space-y-4 text-start">
            <div className="p-3.5 rounded-xl bg-black/45 border border-amber-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-black text-white">
                      {isAr ? 'تأكيد بريد Gmail لتفعيل الحساب' : "Vérification de l'adresse Gmail"}
                    </div>
                    <div className="text-[11px] text-white/75 font-mono" dir="ltr">
                      {maskEmail(gmailInput)}
                    </div>
                  </div>
                </div>

                <div
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-black flex items-center gap-1.5 shrink-0 ${
                    registerExpirySecondsLeft > 60
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : registerExpirySecondsLeft > 0
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                      : 'bg-rose-500/25 border-rose-500/50 text-rose-300'
                  }`}
                  dir="ltr"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {registerExpirySecondsLeft > 0
                      ? formatMmSs(registerExpirySecondsLeft)
                      : '00:00'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-amber-300/90 pt-1 border-t border-white/10">
                {registerExpirySecondsLeft > 0
                  ? isAr
                    ? '⏳ افتح علبة الوارد في بريدك Gmail وأدخل الكود المكون من 6 أرقام (صالح 5 دقائق)'
                    : '⏳ Ouvrez votre boîte Gmail et saisissez le code à 6 chiffres (valide 5 min)'
                  : isAr
                  ? '⚠️ انتهت صلاحية الرمز! اضغط على إعادة الإرسال.'
                  : '⚠️ Code expiré ! Cliquez sur renvoyer.'}
              </div>
            </div>

            {/* 6-Digit OTP Input Boxes */}
            <div>
              <label className="block text-xs font-bold text-white mb-2 text-center">
                {isAr
                  ? 'أدخل رمز التحقق (6 أرقام) المرسل إلى بريدك Gmail'
                  : 'Saisissez le code à 6 chiffres reçu sur votre Gmail'}
              </label>
              <div className="grid grid-cols-6 gap-2" dir="ltr">
                {registerOtpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      registerOtpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleRegisterOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleRegisterOtpKeyDown(idx, e)}
                    className="w-full h-12 rounded-xl bg-black/50 border border-amber-500/40 focus:border-amber-400 text-center text-lg font-mono font-black text-amber-400 focus:outline-hidden transition shadow-inner"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || registerExpirySecondsLeft <= 0}
              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري التحقق وتفعيل الحساب...' : 'Validation et activation...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? 'تأكيد البريد وتفعيل الحساب' : 'Valider et activer le compte'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <button
                type="button"
                onClick={() => {
                  setRegisterStep('form');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{isAr ? 'تعديل البريد أو المعلومات' : 'Modifier les infos'}</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handlePhoneSubmit(new Event('submit') as any)}
                className="text-amber-400 hover:underline disabled:opacity-50 font-bold cursor-pointer"
              >
                {isAr ? 'إعادة إرسال الرمز إلى Gmail' : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 1: Enter Phone Number + Secret PIN (Admin Login / Register Form) */}
        {(authMode === 'login' || (authMode === 'register' && registerStep === 'form')) &&
          step === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4 text-start">
              <div>
                <label className="block text-xs font-bold text-white mb-1.5 drop-shadow">
                  {isAr
                    ? 'رقم الهاتف المسجل للمحل'
                    : 'Numéro de téléphone de la boutique'}
                </label>
                <div className="relative" dir="ltr">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 border-r border-amber-500/30 pr-2.5 select-none pointer-events-none">
                    <span>🇲🇦</span>
                    <span>+212</span>
                  </div>
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    autoFocus
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="06 12 34 56 78"
                    className="w-full bg-black/35 backdrop-blur-sm border border-amber-500/35 focus:border-amber-400 rounded-xl pl-22 pr-4 py-3 text-sm font-mono font-bold text-white placeholder-white/45 focus:outline-hidden transition text-left"
                  />
                </div>
              </div>

              {/* Secret PIN (4 digits) linked to phone number */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-white flex items-center gap-1.5 drop-shadow">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {authMode === 'register'
                        ? isAr
                          ? 'اختيار كود سري للمحل (PIN - 4 أرقام)'
                          : 'Choisir un code PIN secret (4 chiffres)'
                        : isAr
                        ? 'الكود السري للمحل (PIN - 4 أرقام)'
                        : 'Code PIN secret (4 chiffres)'}
                    </span>
                  </label>

                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryPhone(phoneNumber);
                        setRecoveryInput(phoneNumber);
                        setAuthMode('forgot');
                        setForgotStep('enter_phone');
                        setRecoveryMethod('gmail');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] font-extrabold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition cursor-pointer"
                    >
                      {isAr ? 'نسيت كلمة السر؟' : 'Mot de passe oublié ?'}
                    </button>
                  )}
                </div>
                <div className="relative" dir="ltr">
                  <KeyRound className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    dir="ltr"
                    required
                    minLength={4}
                    maxLength={8}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="••••"
                    className="w-full bg-black/35 backdrop-blur-sm border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-10 py-2.5 text-base font-mono font-black tracking-[0.35em] text-amber-400 placeholder-white/40 focus:outline-hidden transition text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-amber-400 transition cursor-pointer"
                    title={
                      showPin
                        ? isAr
                          ? 'إخفاء الكود'
                          : 'Masquer'
                        : isAr
                        ? 'إظهار الكود'
                        : 'Afficher'
                    }
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Registration Fields: Store Name + MANDATORY GMAIL */}
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5 drop-shadow">
                      {isAr ? 'اسم المحل التجاري' : 'Nom de la boutique'}
                    </label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-amber-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder={isAr ? 'مثال: المحل الذهبي للهواتف' : 'Ex: Golden Phone Shop'}
                        className="w-full bg-black/35 backdrop-blur-sm border border-amber-500/35 focus:border-amber-400 rounded-xl ps-10 pe-3.5 py-2.5 text-xs font-bold text-white placeholder-white/45 focus:outline-hidden transition"
                      />
                    </div>
                  </div>

                  {/* MANDATORY GMAIL */}
                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5 drop-shadow flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {isAr
                            ? 'بريد Gmail الخاص بك (إجباري للتأكيد والتفعيل)'
                            : 'Votre Gmail (Obligatoire)'}
                        </span>
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                        {isAr ? 'إجباري' : 'Obligatoire'}
                      </span>
                    </label>
                    <div className="relative" dir="ltr">
                      <AtSign className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        dir="ltr"
                        required
                        value={gmailInput}
                        onChange={(e) => setGmailInput(e.target.value)}
                        placeholder="exemple@gmail.com"
                        className="w-full bg-black/35 backdrop-blur-sm border border-amber-500/35 focus:border-amber-400 rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono font-bold text-white placeholder-white/45 focus:outline-hidden transition text-left"
                      />
                    </div>
                  </div>

                  {/* 100% Free Instant Google Verification Button */}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleRegisterWithGoogleFree}
                    className="w-full py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      {isAr
                        ? 'تأكيد حساب Gmail مجاناً وبنقرة واحدة عبر Google'
                        : 'Vérifier mon Gmail gratuitement avec Google'}
                    </span>
                  </button>

                  {/* Optional Collapsible Free Gmail App Password Setup for Nodemailer */}
                  <div className="rounded-xl bg-black/40 border border-white/15 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowGmailSmtpDrawer(!showGmailSmtpDrawer)}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-[11px] font-bold text-amber-300 hover:bg-white/5 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {isAr
                            ? 'إعداد Gmail App Password المجاني لـ Nodemailer (اختياري)'
                            : 'Configurer Gmail App Password (Optionnel)'}
                        </span>
                      </span>
                      <span className="text-[10px] text-white/60">
                        {showGmailSmtpDrawer
                          ? isAr
                            ? 'إخفاء ▲'
                            : 'Masquer ▲'
                          : isAr
                          ? 'إعداد ▼'
                          : 'Configurer ▼'}
                      </span>
                    </button>

                    {showGmailSmtpDrawer && (
                      <div className="p-3 border-t border-white/10 space-y-2 bg-black/55 text-xs">
                        <div>
                          <label className="block text-[10px] text-white/75 mb-1 font-bold">
                            {isAr ? 'بريد المرسل (GMAIL_USER)' : 'Email expéditeur (GMAIL_USER)'}
                          </label>
                          <input
                            type="email"
                            dir="ltr"
                            value={smtpUserInput}
                            onChange={(e) => setSmtpUserInput(e.target.value)}
                            placeholder="votre.boutique@gmail.com"
                            className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/75 mb-1 font-bold">
                            {isAr
                              ? 'كود تطبيق جيمايل من 16 حرفاً (GMAIL_APP_PASSWORD)'
                              : 'Gmail App Password (16 lettres)'}
                          </label>
                          <input
                            type="password"
                            dir="ltr"
                            value={smtpPassInput}
                            onChange={(e) => setSmtpPassInput(e.target.value)}
                            placeholder="abcd efgh ijkl mnop"
                            className="w-full bg-black/60 border border-white/20 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2.5 pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isAr ? 'جاري التحقق...' : 'Vérification...'}</span>
                    </>
                  ) : authMode === 'register' ? (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'إرسال كود (6 أرقام) إلى Gmail عبر Nodemailer'
                          : 'Envoyer le code OTP (6 chiffres) via Nodemailer'}
                      </span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>{isAr ? 'تسجيل الدخول إلى حسابي' : 'Accéder à mon compte'}</span>
                    </>
                  )}
                </button>

                {authMode === 'login' && (
                  <>
                    {/* Dedicated Worker Login Button Linked to Admin */}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('worker');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-300 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow"
                    >
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>
                        {isAr
                          ? 'دخول العامل (أدخل فقط الكود الذي أعطاه لك الأدمين)'
                          : 'Accès Employé (Code donné par l’Admin)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryPhone(phoneNumber);
                        setRecoveryInput(phoneNumber);
                        setAuthMode('forgot');
                        setForgotStep('enter_phone');
                        setRecoveryMethod('gmail');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="w-full py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {isAr
                          ? 'نسيت كلمة السر؟ استرجاع عبر بريد Gmail المسجل'
                          : 'Mot de passe oublié ? Récupérer via Gmail'}
                      </span>
                    </button>
                  </>
                )}
              </div>

              {/* Switch between Login and Create New Account */}
              <div className="pt-3 border-t border-white/10 text-center">
                {authMode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setRegisterStep('form');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-neutral-300 hover:text-amber-400 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>{isAr ? 'هل ليس لديك حساب؟' : "Vous n'avez pas de compte ?"}</span>
                    <span className="text-amber-400 underline underline-offset-4 font-extrabold">
                      {isAr ? 'إنشاء حساب جديد' : 'Créer un nouveau compte'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setRegisterStep('form');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-neutral-300 hover:text-amber-400 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isAr ? 'لديك حساب بالفعل؟' : 'Vous avez déjà un compte ?'}</span>
                    <span className="text-amber-400 underline underline-offset-4 font-extrabold">
                      {isAr ? 'تسجيل الدخول' : 'Se connecter'}
                    </span>
                  </button>
                )}
              </div>
            </form>
          )}

        {/* STEP 2: Enter SMS OTP Code */}
        {authMode !== 'forgot' && authMode !== 'worker' && step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 text-start">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-amber-400">
                  {isAr ? 'كود التحقق (OTP)' : 'Code de vérification (OTP)'}
                </label>
                <span className="text-xs font-mono text-white" dir="ltr">
                  {formatPhoneForE164(phoneNumber)}
                </span>
              </div>
              <div className="relative" dir="ltr">
                <KeyRound className="w-5 h-5 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full bg-neutral-900 border border-amber-500/40 focus:border-amber-400 rounded-xl pl-11 pr-4 py-3 text-center text-xl font-mono font-black tracking-[0.3em] text-amber-400 focus:outline-hidden"
                />
              </div>
              <p className="text-[11px] text-neutral-300 mt-1.5">
                {isAr
                  ? 'أدخل الرمز المكون من 6 أرقام لتأكيد الدخول إلى حسابك'
                  : 'Validez le code à 6 chiffres pour accéder à votre compte'}
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري الدخول...' : 'Vérification en cours...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? 'تأكيد الدخول' : 'Confirmer la connexion'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtpCode('');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{isAr ? 'تغيير رقم الهاتف' : 'Changer le numéro'}</span>
              </button>

              <button
                type="button"
                disabled={countdown > 0 || isLoading}
                onClick={handleSendOtp}
                className="text-amber-400 hover:underline disabled:opacity-50 disabled:no-underline font-bold cursor-pointer"
              >
                {countdown > 0
                  ? isAr
                    ? `إعادة الإرسال بعد (${countdown}ث)`
                    : `Renvoyer (${countdown}s)`
                  : isAr
                  ? 'إعادة إرسال الكود'
                  : 'Renvoyer le code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
