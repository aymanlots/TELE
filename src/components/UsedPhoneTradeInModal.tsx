import React, { useState } from 'react';
import {
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  Save,
  User,
  CreditCard,
  Phone,
  Upload,
  FileText,
  X,
} from 'lucide-react';
import { registerUsedPhoneTradeInTransaction, getStoreSettings } from '../db';
import { PhoneCondition, Product } from '../types';
import { Modal } from './Modal';
import { ScanButton } from './ScanButton';
import { useI18n } from '../i18n';
import { useToast } from './Toast';
import { validateIMEI } from '../lib/scanner';
import { compressImage } from '../lib/image';

interface UsedPhoneTradeInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (product: Product) => void;
}

export const UsedPhoneTradeInModal: React.FC<UsedPhoneTradeInModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { language } = useI18n();
  const { success, error } = useToast();
  const isAr = language === 'ar';

  const [modelName, setModelName] = useState('');
  const [imei, setImei] = useState('');
  const [condition, setCondition] = useState<PhoneCondition>('used_good');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCIN, setCustomerCIN] = useState('');
  const [cinImage, setCinImage] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imeiCheck = imei.trim().length > 0 ? validateIMEI(imei.trim()) : null;

  const handleCinImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 650, 0.85);
      setCinImage(compressed);
      success(isAr ? 'تم إرفاق صورة البطاقة الوطنية بنجاح.' : 'Photo de la CIN jointe avec succès.');
    } catch {
      error(isAr ? 'تعذر ضغط صورة البطاقة الوطنية.' : 'Erreur lors du traitement de la photo CIN.');
    }
  };

  const submitTradeIn = async (printContractPdf: boolean) => {
    const cleanImei = imei.trim();
    const check = validateIMEI(cleanImei);

    if (!check.valid) {
      error(
        check.reason === 'length'
          ? isAr
            ? 'رقم IMEI غير صالح: يجب أن يتكون من 15 رقماً بالضبط.'
            : 'N° IMEI invalide : il doit comporter exactement 15 chiffres.'
          : isAr
          ? 'رقم IMEI غير صالح (فشل التحقق من خوارزمية Luhn). تأكد من الرقم.'
          : 'N° IMEI invalide (somme de contrôle Luhn incorrecte). Veuillez vérifier les 15 chiffres.'
      );
      return;
    }

    if (!modelName.trim() || !customerName.trim()) {
      error(
        isAr
          ? 'المرجو إدخال موديل الهاتف واسم البائع.'
          : 'Veuillez renseigner le modèle du téléphone et le nom du vendeur.'
      );
      return;
    }

    const buyPrice = parseFloat(purchasePrice) || 0;
    const sellPrice = parseFloat(retailPrice) || Math.round(buyPrice * 1.2);

    setIsSubmitting(true);
    try {
      const created = await registerUsedPhoneTradeInTransaction({
        modelName: modelName.trim(),
        imei: cleanImei,
        condition,
        purchasePrice: buyPrice,
        retailPrice: sellPrice,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerCIN: customerCIN.trim() || undefined,
        customerCinImage: cinImage,
        notes: notes.trim() || undefined,
      });

      success(
        isAr
          ? `تم تسجيل شراء الهاتف المستعمل وإضافته للمخزون (${created.name}).`
          : `Reprise enregistrée et ajoutée au stock : ${created.name}`
      );

      if (printContractPdf) {
        const settings = await getStoreSettings();
        const { generateTradeInContractPDF } = await import('../lib/pdfGenerator');
        await generateTradeInContractPDF(created, settings, 'save');
      }

      if (onSaved) onSaved(created);
      setModelName('');
      setImei('');
      setPurchasePrice('');
      setRetailPrice('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerCIN('');
      setCinImage(undefined);
      setNotes('');
      onClose();
    } catch (err: any) {
      error(err?.message || 'Erreur lors de la reprise.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTradeIn(true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isAr
          ? 'شراء هاتف مستعمل + عقد قانوني رسمي (Contrat de Reprise)'
          : "Reprise de Téléphone d'Occasion & Contrat Officiel"
      }
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Phone Model */}
          <div className="sm:col-span-2">
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'ماركة وموديل الهاتف *' : 'Marque & Modèle du téléphone *'}
            </label>
            <input
              type="text"
              required
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="ex: iPhone 13 Pro 128Go / Samsung S22"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500"
            />
          </div>

          {/* IMEI with Luhn live validation & Camera Scan */}
          <div className="sm:col-span-2">
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'رقم IMEI (15 رقماً + فحص Luhn) *' : 'N° IMEI (15 chiffres + contrôle Luhn) *'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                maxLength={15}
                value={imei}
                onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="35xxxxxxxxxxxxx"
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono text-sm text-neutral-100 focus:outline-hidden focus:border-amber-500"
              />
              <ScanButton
                mode="imei"
                onScan={(code) => setImei(code.replace(/\D/g, '').slice(0, 15))}
              />
            </div>

            {imeiCheck && (
              <div
                className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold ${
                  imeiCheck.valid ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {imeiCheck.valid ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isAr
                        ? 'رقم IMEI صحيح (15 رقماً ومطابق لـ Luhn)'
                        : 'IMEI valide (15 chiffres et somme de Luhn conforme)'}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {imeiCheck.reason === 'length'
                        ? isAr
                          ? `يجب إدخال 15 رقماً (${imei.trim().length}/15)`
                          : `15 chiffres requis (${imei.trim().length}/15)`
                        : isAr
                        ? 'رقم IMEI غير صالح (مجموع Luhn خاطئ)'
                        : 'IMEI invalide (somme de contrôle Luhn incorrecte)'}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Condition */}
          <div className="sm:col-span-2">
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'حالة الهاتف (État) *' : "État de l'appareil *"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    val: 'used_excellent',
                    label: isAr ? 'ممتاز (كالجديد)' : 'Excellent (Comme neuf)',
                  },
                  {
                    val: 'used_good',
                    label: isAr ? 'جيد جداً' : 'Bon état',
                  },
                  {
                    val: 'used_fair',
                    label: isAr ? 'مقبول / مستعمل' : 'État correct',
                  },
                ] as { val: PhoneCondition; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setCondition(opt.val)}
                  className={`py-2 px-2 rounded-lg font-bold border text-center transition ${
                    condition === opt.val
                      ? 'bg-amber-500 text-neutral-950 border-amber-400'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Purchase Price & Retail Price */}
          <div>
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'ثمن الشراء من الزبون (DH) *' : 'Prix de reprise / achat (DH) *'}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder="ex: 2200"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono font-bold text-amber-400 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'ثمن البيع المقترح (DH) *' : 'Prix de revente prévu (DH) *'}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              placeholder="ex: 2700"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono font-bold text-emerald-400 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          {/* Seller / Customer Identity */}
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              <User className="w-3.5 h-3.5 inline me-1 text-amber-400" />
              {isAr ? 'اسم البائع (الزبون) *' : 'Nom du vendeur (Client) *'}
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="ex: Youssef Alami"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              <CreditCard className="w-3.5 h-3.5 inline me-1 text-amber-400" />
              {isAr ? 'رقم البطاقة الوطنية (CIN) *' : 'N° CIN du vendeur *'}
            </label>
            <input
              type="text"
              value={customerCIN}
              onChange={(e) => setCustomerCIN(e.target.value)}
              placeholder="ex: BK123456"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              <Phone className="w-3.5 h-3.5 inline me-1 text-amber-400" />
              {isAr ? 'هاتف البائع' : 'Téléphone du vendeur'}
            </label>
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="06XXXXXXXX"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'ملاحظات (نسبة البطارية، الملحقات...)' : 'Notes (Batterie %, boîte...)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: Batterie 89%, avec boîte"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          {/* CIN Photo Upload for Legal Protection */}
          <div className="sm:col-span-2 p-3 rounded-xl bg-neutral-950/90 border border-amber-500/25 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {cinImage ? (
                <div className="relative w-16 h-11 rounded-lg overflow-hidden border border-amber-500/50 shrink-0">
                  <img src={cinImage} alt="CIN" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setCinImage(undefined)}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 text-rose-400 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-12 h-11 rounded-lg bg-neutral-900 border border-dashed border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="font-bold text-amber-400">
                  {isAr
                    ? 'صورة البطاقة الوطنية CIN للبائع (تُدمج في عقد الشراء PDF)'
                    : 'Photo de la CIN du vendeur (incluse dans le Contrat PDF)'}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {isAr
                    ? 'لحماية المحل قانونياً مع تصريح بالشرف وإمضاء البائع'
                    : 'Protection juridique du magasin avec déclaration sur l’honneur'}
                </div>
              </div>
            </div>

            <label className="cursor-pointer shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs transition">
                <Upload className="w-3.5 h-3.5" />
                <span>{cinImage ? (isAr ? 'تغيير الصورة' : 'Changer') : (isAr ? 'تصوير / إرفاق CIN' : 'Joindre CIN')}</span>
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCinImageUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
          >
            {isAr ? 'إلغاء' : 'Annuler'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => submitTradeIn(false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 font-bold transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAr ? 'حفظ في المخزون فقط' : 'Enregistrer seul'}</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-neutral-950 font-black transition shadow-md disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>
              {isAr
                ? 'حفظ + تحميل عقد الشراء الرسمي (PDF)'
                : 'Enregistrer + Contrat de Reprise PDF'}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

