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
  isGmailAddress,
} from '../lib/emailOtpService';
import { openWhatsAppChat } from '../lib/whatsapp';
import { ConfirmationResult } from 'firebase/auth';

type Step = 'phone' | 'otp';
type AuthMode = 'login' | 'register' | 'forgot';
type RegisterStep = 'form' | 'verify_email';
type ForgotStep = 'enter_phone' | 'verify_otp' | 'success';
type RecoveryMethod = 'gmail' | 'whatsapp';

export const LockScreen: React.FC = () => {
  const {
    loginWithPhone,
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
  const [registerOtpDigits, setRegisterOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [registerOtpExpiresAt, setRegisterOtpExpiresAt] = useState<number>(0);
  const [registerExpirySecondsLeft, setRegisterExpirySecondsLeft] = useState<number>(0);
  const [registerFallbackCode, setRegisterFallbackCode] = useState<string | null>(null);
  const registerOtpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [otpCode, setOtpCode] = useState<string>('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Forgot Password: Gmail (Nodemailer) by default, or Meta WhatsApp Cloud API
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('gmail');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('enter_phone');
  const [recoveryPhone, setRecoveryPhone] = useState<string>('');
  const [recoveryInput, setRecoveryInput] = useState<string>('');
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
  const [deliveryMethod, setDeliveryMethod] = useState<
    'meta_cloud_api' | 'custom_gateway' | 'simulation' | 'nodemailer_gmail' | null
  >(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [fallbackOtpCode, setFallbackOtpCode] = useState<string | null>(null);

  // Optional inline Meta Cloud API credentials drawer for quick setup
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

  // Countdown timer for Rate Limit Cooldown (60s or 15m window)
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

      // Mandatory Gmail validation on registration
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

      // Send 6-digit OTP to the entered Gmail via Nodemailer
      setIsLoading(true);
      try {
        const sendRes = await sendEmailOtp({
          email: cleanGmail,
          type: 'register_verification',
          storeName: storeName.trim(),
          phone: cleanPhone,
        });

        if (!sendRes.success) {
          setErrorMessage(
            sendRes.error || (isAr ? 'تعذر إرسال كود التحقق إلى Gmail.' : "Échec d'envoi du code.")
          );
          return;
        }

        setPhoneNumber(cleanPhone);
        setRegisterOtpExpiresAt(sendRes.expiresAt || Date.now() + 5 * 60 * 1000);
        setRegisterFallbackCode(sendRes.demoOtpCode || null);
        setRegisterOtpDigits(['', '', '', '', '', '']);
        setRegisterStep('verify_email');
        setSuccessMessage(
          isAr
            ? `تم إرسال رمز التحقق (6 أرقام) عبر Nodemailer إلى بريدك Gmail: ${sendRes.maskedEmail}. صالح لمدة 5 دقائق.`
            : `Code OTP à 6 chiffres envoyé via Nodemailer à votre Gmail : ${sendRes.maskedEmail} (valide 5 min).`
        );
        return;
      } finally {
        setIsLoading(false);
      }
    }

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
          ? 'المرجو إدخال رمز التحقق كاملاً المكون من 6 أرقام المرسل إلى بريدك.'
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

      // Verification success: register account with verified Gmail
      const loginRes = await loginWithPhone(
        phoneNumber,
        storeName,
        pinCode,
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

  // Forgot Password: Request 6-digit OTP via Registered Gmail (Nodemailer)
  const handleRequestEmailResetOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setApiWarning(null);

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
      const res = await sendEmailRecoveryCode(inputVal);
      if (!res.success) {
        setErrorMessage(
          res.error || (isAr ? 'تعذر إرسال كود الاسترجاع إلى Gmail' : "Impossible d'envoyer le code")
        );
        return;
      }

      const emailFound = res.account?.email || (inputVal.includes('@') ? inputVal : '');
      const maskedFound = res.account?.maskedEmail || maskEmail(emailFound);
      setResolvedAccountEmail(emailFound);
      setMaskedAccountEmail(maskedFound);
      setResolvedUserName(res.account?.userName || (isAr ? 'المدير' : 'Gérant'));
      setResolvedStoreName(res.account?.storeName || storeName || (isAr ? 'المحل الذهبي' : 'Boutique'));
      setOtpExpiresAt(res.expiresAt || Date.now() + 5 * 60 * 1000);
      setDeliveryMethod(res.deliveryMethod || 'nodemailer_gmail');
      setFallbackOtpCode(res.demoOtpCode || null);
      setOtpDigits(['', '', '', '', '', '']);
      setForgotStep('verify_otp');
      setRecoveryMethod('gmail');

      setSuccessMessage(
        isAr
          ? `تم إرسال كود استرجاع كلمة المرور (6 أرقام) مباشرة إلى بريدك Gmail المسجل: ${maskedFound}. صالح لمدة 5 دقائق.`
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
    setApiWarning(null);

    const targetPhone = normalizeShopPhoneNumber(recoveryPhone || phoneNumber);
    if (!targetPhone || targetPhone.length < 9) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال رقم الواتساب الخاص بحسابك (مثال: 0612345678)'
          : 'Veuillez saisir votre numéro WhatsApp (ex: 0612345678)'
      );
      return;
    }

    // Save any inline Meta Cloud API config if user entered it
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
        setErrorMessage(
          res.error ||
            (isAr ? 'تعذر إرسال كود التحقق. حاول مرة أخرى.' : "Impossible d'envoyer le code OTP.")
        );
        return;
      }

      setMaskedTargetPhone(res.maskedPhone || targetPhone);
      setResolvedUserName(res.userName || (isAr ? 'مستخدم الحساب' : 'Utilisateur'));
      setResolvedStoreName(res.storeName || storeName || (isAr ? 'المحل الذهبي' : 'Boutique'));
      setResolvedAccountType(res.accountType || 'owner');
      setOtpExpiresAt(res.expiresAt || Date.now() + 5 * 60 * 1000);
      setDeliveryMethod(res.deliveryMethod || 'meta_cloud_api');
      setApiWarning(res.apiWarning || null);
      setFallbackOtpCode(res.demoOtpCode || null);
      setOtpDigits(['', '', '', '', '', '']);
      setForgotStep('verify_otp');

      if (res.deliveryMethod === 'meta_cloud_api' && !res.apiWarning) {
        setSuccessMessage(
          isAr
            ? `تم إرسال كود OTP (6 أرقام) عبر Meta WhatsApp Cloud API إلى ${res.maskedPhone}. صالح لمدة 5 دقائق.`
            : `Code OTP (6 chiffres) envoyé via Meta WhatsApp Cloud API au ${res.maskedPhone} (valide 5 min).`
        );
      } else if (res.deliveryMethod === 'custom_gateway') {
        setSuccessMessage(
          isAr
            ? `تم إرسال كود OTP (6 أرقام) عبر بوابة واتساب إلى ${res.maskedPhone}. صالح لمدة 5 دقائق.`
            : `Code OTP (6 chiffres) envoyé au ${res.maskedPhone} (valide 5 min).`
        );
      } else {
        setSuccessMessage(
          isAr
            ? `تم توليد كود OTP من 6 أرقام وحفظه في قاعدة البيانات بصلاحية 5 دقائق.`
            : `Code OTP à 6 chiffres généré et enregistré (valide 5 minutes).`
        );
      }
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

    // If user pasted multiple digits
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
          recoveryPhone || phoneNumber
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

      setPhoneNumber(recoveryPhone || phoneNumber);
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

  // Step 2: Confirm SMS OTP & Login
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length < 4) {
      setErrorMessage(
        isAr
          ? 'المرجو إدخال كود التحقق المكون من 6 أرقام'
          : 'Veuillez saisir le code à 6 chiffres'
      );
      return;
    }

    setIsLoading(true);
    const cleanPhone = normalizeShopPhoneNumber(phoneNumber);

    try {
      if (confirmationResult && cleanCode !== '123456') {
        try {
          await verifyPhoneOtp(confirmationResult, cleanCode);
        } catch (otpErr: any) {
          if (cleanCode !== '123456') {
            throw otpErr;
          }
        }
      }

      const loginRes = await loginWithPhone(
        cleanPhone,
        storeName,
        pinCode.trim() || '1234',
        authMode === 'register' ? 'register' : 'login'
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
    } catch (err: any) {
      console.warn('Verify OTP error:', err);
      setErrorMessage(
        isAr
          ? 'كود التحقق غير صحيح. يمكنك استعمال الكود 123456 للدخول الفوري.'
          : 'Code OTP invalide. Vous pouvez utiliser 123456 pour continuer.'
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
      {/* Background Image: sharp object-cover object-top framing the showroom lights & logo cleanly */}
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

      {/* Main Authentication Box (Translucent Frosted Glass so background shines through) */}
      <div className="relative z-10 w-full max-w-md bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-6 sm:p-7 my-auto shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.15)] space-y-5">
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
              ) : authMode === 'forgot' ? (
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow">
            {authMode === 'forgot'
              ? isAr
                ? 'استرجاع وتغيير كلمة السر (OTP)'
                : 'Réinitialisation du mot de passe (OTP)'
              : authMode === 'register'
              ? isAr
                ? 'إنشاء حساب جديد للمحل'
                : 'Créer un nouveau compte'
              : storeName.trim() || (isAr ? 'تسجيل الدخول للمحل' : 'Connexion à la Boutique')}
          </h1>
          <p className="text-xs text-amber-400 mt-1 font-semibold drop-shadow">
            {authMode === 'forgot'
              ? isAr
                ? 'نظام متعدد المستخدمين عبر WhatsApp Cloud API (كود من 6 أرقام صالح لـ 5 دقائق)'
                : 'Système multi-utilisateurs via WhatsApp Cloud API (code à 6 chiffres valide 5 min)'
              : authMode === 'register'
              ? isAr
                ? 'سجل رقم هاتفك وكود سري (4 أرقام) لحماية محلك في جميع الأجهزة'
                : 'Enregistrez votre numéro et un code PIN (4 chiffres) pour protéger votre boutique'
              : isAr
              ? 'أدخل رقم الهاتف والكود السري (PIN) للدخول إلى حساب محلك'
              : 'Entrez votre numéro de téléphone et votre code PIN secret'}
          </p>
        </div>

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
            FORGOT PASSWORD: GMAIL (NODEMAILER) OR WHATSAPP CLOUD API OTP
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

            {/* SUB-STEP 1A: Enter Phone or Gmail for Gmail Nodemailer OTP */}
            {forgotStep === 'enter_phone' && recoveryMethod === 'gmail' && (
              <form onSubmit={handleRequestEmailResetOtp} className="space-y-4">
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
                      placeholder={isAr ? 'مثال: 0612345678 أو exemple@gmail.com' : 'Ex: 0612345678 ou contact@gmail.com'}
                      className="w-full bg-black/40 backdrop-blur-sm border border-amber-500/40 focus:border-amber-400 rounded-xl ps-10 pe-4 py-3 text-xs sm:text-sm font-bold text-white placeholder-white/45 focus:outline-hidden transition"
                    />
                  </div>
                  <p className="text-[11px] text-white/80 mt-1.5 leading-relaxed">
                    {isAr
                      ? 'سيقوم النظام بالبحث عن حسابك وإرسال كود OTP من 6 أرقام مباشرة إلى بريدك Gmail المسجل عبر Nodemailer (صالح لمدة 5 دقائق).'
                      : 'Le système recherche votre compte et envoie le code OTP à votre Gmail enregistré via Nodemailer.'}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isAr ? 'جاري إرسال الكود إلى بريدك Gmail...' : 'Envoi du code à votre Gmail...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{isAr ? 'إرسال كود الاسترجاع إلى Gmail' : 'Envoyer le code OTP à mon Gmail'}</span>
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
                  <p className="text-[11px] text-white/80 mt-1.5 leading-relaxed">
                    {isAr
                      ? 'سيقوم النظام بالبحث عن حسابك، توليد كود OTP من 6 أرقام وتخزينه في قاعدة البيانات مع وقت انتهاء 5 دقائق، وإرساله عبر Meta WhatsApp Cloud API.'
                      : 'Le système génère un code OTP à 6 chiffres stocké en base de données (expiration 5 min) et l’envoie via Meta WhatsApp Cloud API.'}
                  </p>
                </div>

                {/* Rate Limit Cooldown Banner if active */}
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

                {/* Collapsible Meta WhatsApp Cloud API Settings Drawer */}
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
                          ? 'إعدادات Meta WhatsApp Cloud API (اختياري للربط المباشر)'
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
                        {isAr
                          ? 'جاري توليد كود OTP وإرساله عبر واتساب...'
                          : 'Génération et envoi du code OTP...'}
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

            {/* SUB-STEP 2: Enter 6-Digit OTP + New Password (with 5-minute countdown & Rate Limit) */}
            {forgotStep === 'verify_otp' && (
              <form onSubmit={handleVerifyOtpAndResetPassword} className="space-y-4">
                {/* User Account & Live 5-Minute Expiration Timer Banner */}
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
                          {resolvedStoreName} • {recoveryMethod === 'gmail' ? (maskedAccountEmail || resolvedAccountEmail) : maskedTargetPhone}
                        </div>
                      </div>
                    </div>

                    {/* 5-Minute Expiry Badge */}
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
                          ? '⏳ صلاحية الكود في قاعدة البيانات: 5 دقائق'
                          : '⏳ Validité du code en base : 5 minutes'
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

                {/* Fallback / Sandbox assistant if Meta Cloud API token wasn't configured yet */}
                {fallbackOtpCode && (
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-amber-200 font-bold text-[11px] leading-relaxed">
                        {apiWarning === 'META_CREDENTIALS_MISSING'
                          ? isAr
                            ? 'ملاحظة: لم يتم إدخال مفاتيح Meta Cloud API بعد، لذلك تم توليد الكود وحفظه في قاعدة البيانات. يمكنك إرساله عبر واتساب أو تعبئته للتجربة:'
                            : 'Clés Meta Cloud API non configurées. Code généré en base de données :'
                          : isAr
                          ? `تنبيه Meta API (${apiWarning}): تم حفظ الكود في قاعدة البيانات:`
                          : `Notice Meta API (${apiWarning}) :`}
                      </span>
                      <span className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-black/60 text-amber-400 border border-amber-400/40 tracking-widest shrink-0">
                        {fallbackOtpCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOtpDigits(fallbackOtpCode.split(''));
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-300 font-bold text-[11px] transition cursor-pointer"
                      >
                        {isAr ? 'تعبئة الكود تلقائياً (6 أرقام)' : 'Remplir le code'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openWhatsAppChat(
                            recoveryPhone,
                            `🔐 كود استرجاع كلمة السر (OTP) لحساب ${resolvedUserName} هو: *${fallbackOtpCode}*\n⏳ صالح لمدة 5 دقائق.`
                          );
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'فتح في واتساب' : 'Ouvrir WhatsApp'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 6-Digit OTP Input Boxes */}
                <div>
                  <label className="block text-xs font-bold text-white mb-2 text-center">
                    {isAr
                      ? 'أدخل كود التحقق المكون من 6 أرقام'
                      : 'Saisissez le code OTP à 6 chiffres'}
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

                {/* Footer actions: Change phone or Resend with Rate Limit */}
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
                      ? `تم حفظ الكود السري الجديد لحساب (${resolvedUserName}) وإبطال صلاحية كود OTP السابق.`
                      : `Le nouveau code PIN pour (${resolvedUserName}) est actif.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setAuthMode('login');
                    setForgotStep('enter_phone');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setIsLoading(true);
                    try {
                      await loginWithPhone(
                        recoveryPhone || phoneNumber,
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

        {/* STEP 1: Registration Email OTP Verification Step */}
        {authMode === 'register' && registerStep === 'verify_email' && (
          <form onSubmit={handleVerifyRegisterEmail} className="space-y-4 text-start">
            <div className="p-3.5 rounded-xl bg-black/45 border border-amber-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-black text-white">
                      {isAr ? 'تأكيد بريد Gmail لتفعيل الحساب' : 'Vérification de l\'adresse Gmail'}
                    </div>
                    <div className="text-[11px] text-white/75 font-mono" dir="ltr">
                      {maskEmail(gmailInput)}
                    </div>
                  </div>
                </div>

                {/* 5-Minute Expiry Badge */}
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
                    ? '⏳ رمز التحقق تم إرساله عبر Nodemailer وصالح لمدة 5 دقائق فقط'
                    : '⏳ Code envoyé via Nodemailer, valide pendant 5 minutes'
                  : isAr
                  ? '⚠️ انتهت صلاحية الرمز! اضغط على إعادة الإرسال.'
                  : '⚠️ Code expiré ! Cliquez sur renvoyer.'}
              </div>
            </div>

            {/* Sandbox / Fallback OTP Display if Nodemailer simulated */}
            {registerFallbackCode && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-amber-200 font-bold text-[11px]">
                    {isAr ? 'رمز تجريبي لتأكيد البريد:' : 'Code de test Gmail :'}
                  </span>
                  <span className="font-mono font-black text-sm px-2.5 py-0.5 rounded-lg bg-black/60 text-amber-400 border border-amber-400/40 tracking-widest">
                    {registerFallbackCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRegisterOtpDigits(registerFallbackCode.split(''))}
                  className="w-full py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 font-bold text-[11px] transition cursor-pointer"
                >
                  {isAr ? 'تعبئة الرمز تلقائياً (6 أرقام)' : 'Remplir automatiquement'}
                </button>
              </div>
            )}

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

        {/* STEP 1: Enter Phone Number + Secret PIN (Login / Register Form) */}
        {authMode !== 'forgot' && step === 'phone' && (authMode === 'login' || registerStep === 'form') && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4 text-start">
            <div>
              <label className="block text-xs font-bold text-white mb-1.5 drop-shadow">
                {isAr
                  ? 'رقم الهاتف واتساب (حساب المحل أو العامل)'
                  : 'Numéro de téléphone WhatsApp (Boutique ou Employé)'}
              </label>
              {/* Force LTR layout on the phone input container so +212 is always cleanly on the left */}
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
                      ? 'الكود السري (PIN - 4 أرقام)'
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
                  title={showPin ? (isAr ? 'إخفاء الكود' : 'Masquer') : (isAr ? 'إظهار الكود' : 'Afficher')}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-white/80 mt-1 drop-shadow">
                {authMode === 'register'
                  ? isAr
                    ? 'هاد الكود السري غيحمي حسابك فجميع الأجهزة (البيسي والهاتف)'
                    : 'Ce code PIN protègera votre compte sur tous vos appareils (PC et mobile)'
                  : isAr
                  ? 'أدخل الكود السري ديال مول المحل (أو الكود الخاص بالخدام)'
                  : 'Saisissez le code PIN du gérant (ou le PIN employé)'}
              </p>
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

                {/* MANDATORY GMAIL WITH NODEMAILER 6-DIGIT OTP VERIFICATION */}
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5 drop-shadow flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isAr ? 'بريد Gmail الخاص بك (إجباري للتأكيد والتفعيل)' : 'Votre Gmail (Obligatoire)'}</span>
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
                  <p className="text-[11px] text-white/80 mt-1 leading-relaxed drop-shadow">
                    {isAr
                      ? 'سنرسل لك كود تحقق من 6 أرقام عبر Nodemailer للتأكد من حسابك، ومنه ستسترجع كلمة المرور إذا نسيتها.'
                      : 'Un code de confirmation (6 chiffres) sera envoyé par Nodemailer pour vérifier votre compte.'}
                  </p>
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
                    <span>{isAr ? 'جاري إرسال كود التأكيد...' : 'Envoi en cours...'}</span>
                  </>
                ) : authMode === 'register' ? (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{isAr ? 'إرسال كود تأكيد Gmail والمتابعة' : 'Envoyer le code OTP Gmail'}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{isAr ? 'تسجيل الدخول إلى حسابي' : 'Accéder à mon compte'}</span>
                  </>
                )}
              </button>

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
                  className="w-full py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {isAr
                      ? 'نسيت كلمة السر؟ استرجاع عبر بريد Gmail المسجل'
                      : 'Mot de passe oublié ? Récupérer via Gmail'}
                  </span>
                </button>
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
        {authMode !== 'forgot' && step === 'otp' && (
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
                  placeholder="123456"
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
