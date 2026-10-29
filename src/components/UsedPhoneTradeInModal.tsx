import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Save,
  User,
  CreditCard,
  Phone,
  Upload,
  FileText,
  Printer,
  BatteryCharging,
  X,
} from 'lucide-react';
import { registerUsedPhoneTradeInTransaction, getStoreSettings } from '../db';
import { PhoneCondition, Product, StoreSettings } from '../types';
import { Modal } from './Modal';
import { ScanButton } from './ScanButton';
import { useI18n } from '../i18n';
import { useToast } from './Toast';
import { validateIMEI } from '../lib/scanner';
import { compressImage } from '../lib/image';
import { printHtmlContent, generateCode128Svg } from '../lib/code128';

interface UsedPhoneTradeInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (product: Product) => void;
}

export function printUsedPhoneContractHtml(
  product: Product,
  settings: StoreSettings,
  batteryHealth?: number
): void {
  const imei = product.imeiList?.[0]?.imei || product.barcode || 'N/A';
  const barcodeSvg = generateCode128Svg(imei, { height: 28, moduleWidth: 1.2, showText: false });
  const dateStr = new Date().toLocaleString('fr-MA');
  const bat = batteryHealth ?? product.batteryHealth;
  const conditionText =
    product.condition === 'used_excellent'
      ? 'ممتاز (Excellent)'
      : product.condition === 'used_good'
      ? 'جيد جداً (Bon état)'
      : 'مستعمل مقبول (État correct)';

  const html = `
    <div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; color: #000; padding: 12mm; max-width: 190mm; margin: 0 auto; line-height: 1.55;">
      <div style="border: 2px solid #000; padding: 14px 18px; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px;">
          <div>
            <div style="font-size: 18px; font-weight: 900;">${settings.storeName || 'المحل التجاري للهواتف'}</div>
            <div style="font-size: 12px;">الهاتف: <span dir="ltr">${settings.phone || '-'}</span></div>
            ${settings.address ? `<div style="font-size: 11px;">العنوان: ${settings.address}</div>` : ''}
          </div>
          <div style="text-align: center;">
            <div style="font-size: 17px; font-weight: 900; background: #000; color: #fff; padding: 4px 14px; border-radius: 4px;">
              التزام واعتراف ببيع هاتف مستعمل
            </div>
            <div style="font-size: 11px; font-weight: 700; margin-top: 3px;">
              ATTESTATION DE VENTE & REPRISE D'OCCASION
            </div>
          </div>
          <div style="text-align: left; font-size: 11px; font-family: monospace;" dir="ltr">
            <div>Date: ${dateStr}</div>
            <div>Réf: #REP-${product.id || ''}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div style="border: 1px solid #000; padding: 10px; border-radius: 6px;">
            <div style="font-size: 13px; font-weight: 900; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px;">
              1. معلومات البائع (الزبون المصرح)
            </div>
            <div style="font-size: 12px;"><strong>الاسم الكامل:</strong> ${product.tradeInCustomerName || '-'}</div>
            <div style="font-size: 12px;"><strong>رقم البطاقة الوطنية (CIN):</strong> <span style="font-family: monospace; font-weight: 900; font-size: 13px;">${product.tradeInCustomerCIN || '-'}</span></div>
            <div style="font-size: 12px;"><strong>رقم الهاتف:</strong> <span dir="ltr" style="font-family: monospace;">${product.tradeInCustomerPhone || '-'}</span></div>
          </div>

          <div style="border: 1px solid #000; padding: 10px; border-radius: 6px;">
            <div style="font-size: 13px; font-weight: 900; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px;">
              2. مواصفات الهاتف المستعمل وثمن الشراء
            </div>
            <div style="font-size: 12px;"><strong>نوع وموديل الهاتف:</strong> ${product.name}</div>
            <div style="font-size: 12px;"><strong>رقم التسلسل (IMEI):</strong> <span style="font-family: monospace; font-weight: 900; font-size: 13px;">${imei}</span></div>
            <div style="font-size: 12px;"><strong>حالة الجهاز:</strong> ${conditionText} ${bat ? `| <strong>حالة البطارية:</strong> ${bat}%` : ''}</div>
            <div style="font-size: 13px; margin-top: 4px;"><strong>ثمن الشراء المتفق عليه:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 14px;">${product.purchasePrice} DH</span></div>
          </div>
        </div>

        <div style="text-align: center; margin: 8px 0;">
          <div style="display: inline-block; max-width: 220px;">${barcodeSvg}</div>
          <div style="font-family: monospace; font-size: 11px; font-weight: 700;">IMEI: ${imei}</div>
        </div>

        <div style="background: #f5f5f5; border: 1px solid #000; padding: 10px 12px; border-radius: 6px; font-size: 11.5px; text-align: justify; margin-bottom: 14px;">
          <strong>تصريح بالشرف والتزام قانوني:</strong><br/>
          أشهد أنا الموقع أسفله السيد(ة) <strong>${product.tradeInCustomerName || '................'}</strong>، الحامل للبطاقة الوطنية رقم <strong>${product.tradeInCustomerCIN || '................'}</strong>، أنني بعت بمحض إرادتي الهاتف المذكور أعلاه (رقم IMEI: <strong>${imei}</strong>) لفائدة محل <strong>${settings.storeName || 'المحل'}</strong> بمبلغ <strong>${product.purchasePrice} درهم</strong> نقداً.<br/>
          وأصرح بشرفي أن هذا الهاتف ملكي الشرعي وخالٍ من أي سرقة أو نزاع قانوني أو متابعة، وأتحمل كامل المسؤولية المدنية والجنائية عن مصدره قبل تاريخ وساعة هذا العقد.<br/>
          <span dir="ltr" style="font-size: 10.5px; display: block; margin-top: 4px;">
            <em>Je soussigné(e) ${product.tradeInCustomerName || ''}, titulaire de la CIN N° ${product.tradeInCustomerCIN || ''}, déclare sur l'honneur être le propriétaire légitime de l'appareil IMEI ${imei} vendu ce jour au prix de ${product.purchasePrice} DH, et assume l'entière responsabilité légale quant à son origine.</em>
          </span>
        </div>

        ${
          product.tradeInCinImage
            ? `<div style="text-align: center; margin-bottom: 12px;">
                <div style="font-size: 11px; font-weight: 700; margin-bottom: 4px;">نسخة البطاقة الوطنية المرفقة (CIN) :</div>
                <img src="${product.tradeInCinImage}" style="max-height: 120px; border: 1px solid #000; border-radius: 4px;" />
              </div>`
            : ''
        }

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; padding-top: 10px;">
          <div style="border: 1px dashed #000; height: 85px; padding: 8px; text-align: center; border-radius: 6px;">
            <div style="font-size: 12px; font-weight: 900;">إمضاء وبصمة البائع (المصرح)</div>
            <div style="font-size: 10px; color: #444;">Signature du Vendeur (lu et approuvé)</div>
          </div>
          <div style="border: 1px dashed #000; height: 85px; padding: 8px; text-align: center; border-radius: 6px;">
            <div style="font-size: 12px; font-weight: 900;">خاتم وإمضاء المحل</div>
            <div style="font-size: 10px; color: #444;">Cachet & Signature du Magasin</div>
          </div>
        </div>
      </div>
    </div>
  `;

  printHtmlContent(html, `@page { size: A4 portrait; margin: 5mm; }`);
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
  const [batteryHealth, setBatteryHealth] = useState<string>('90');
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

  const submitTradeIn = async (contractAction: 'none' | 'pdf' | 'print') => {
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

    if (!modelName.trim() || !customerName.trim() || !customerCIN.trim()) {
      error(
        isAr
          ? 'المرجو إدخال موديل الهاتف، اسم البائع، ورقم البطاقة الوطنية (CIN).'
          : 'Veuillez renseigner le modèle, le nom du vendeur et le N° CIN.'
      );
      return;
    }

    const buyPrice = parseFloat(purchasePrice) || 0;
    const sellPrice = parseFloat(retailPrice) || Math.round(buyPrice * 1.2);
    const parsedBattery = batteryHealth ? Math.min(100, Math.max(1, parseInt(batteryHealth, 10) || 0)) : undefined;

    setIsSubmitting(true);
    try {
      const created = await registerUsedPhoneTradeInTransaction({
        modelName: modelName.trim(),
        imei: cleanImei,
        condition,
        batteryHealth: parsedBattery,
        purchasePrice: buyPrice,
        retailPrice: sellPrice,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerCIN: customerCIN.trim().toUpperCase(),
        customerCinImage: cinImage,
        notes: notes.trim() || undefined,
      });

      success(
        isAr
          ? `تم تسجيل شراء الهاتف المستعمل وإضافته للمخزون (${created.name}).`
          : `Reprise enregistrée et ajoutée au stock : ${created.name}`
      );

      if (contractAction === 'print') {
        const settings = await getStoreSettings();
        printUsedPhoneContractHtml(created, settings, parsedBattery);
      } else if (contractAction === 'pdf') {
        const settings = await getStoreSettings();
        const { generateTradeInContractPDF } = await import('../lib/pdfGenerator');
        await generateTradeInContractPDF(created, settings, 'save');
      }

      if (onSaved) onSaved(created);
      setModelName('');
      setImei('');
      setBatteryHealth('90');
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
    await submitTradeIn('print');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isAr
          ? 'شراء هاتف مستعمل (La Reprise) + طبع التزام البيع القانوني'
          : "Reprise de Téléphone d'Occasion & Contrat Légal"
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

          {/* Condition & Battery Health % */}
          <div>
            <label className="block text-neutral-300 font-bold mb-1">
              {isAr ? 'حالة الهاتف (État) *' : "État de l'appareil *"}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    val: 'used_excellent',
                    label: isAr ? 'ممتاز' : 'Excellent',
                  },
                  {
                    val: 'used_good',
                    label: isAr ? 'جيد جداً' : 'Bon état',
                  },
                  {
                    val: 'used_fair',
                    label: isAr ? 'مقبول' : 'Correct',
                  },
                ] as { val: PhoneCondition; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setCondition(opt.val)}
                  className={`py-2 px-2 rounded-lg font-bold border text-center transition ${
                    condition === opt.val
                      ? 'bg-amber-400 text-neutral-950 border-amber-300'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Battery Health % */}
          <div>
            <label className="block text-neutral-300 font-bold mb-1">
              <BatteryCharging className="w-3.5 h-3.5 inline me-1 text-emerald-400" />
              {isAr ? 'حالة البطارية (Batterie %)' : 'État de la batterie (%)'}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="100"
                value={batteryHealth}
                onChange={(e) => setBatteryHealth(e.target.value)}
                placeholder="90"
                className="w-20 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 font-mono font-bold text-emerald-400 text-center focus:outline-hidden focus:border-amber-500"
              />
              {[100, 90, 85, 80].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setBatteryHealth(String(pct))}
                  className={`px-2 py-1.5 rounded-lg font-mono text-[11px] font-bold border transition ${
                    Number(batteryHealth) === pct
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                  }`}
                >
                  {pct}%
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
            <label className="block text-neutral-300 font-bold mb-1">
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
            <label className="block text-neutral-300 font-bold mb-1">
              <CreditCard className="w-3.5 h-3.5 inline me-1 text-amber-400" />
              {isAr ? 'رقم البطاقة الوطنية (CIN) *' : 'N° CIN du vendeur *'}
            </label>
            <input
              type="text"
              required
              value={customerCIN}
              onChange={(e) => setCustomerCIN(e.target.value.toUpperCase())}
              placeholder="ex: BK123456"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 font-mono font-bold text-amber-300"
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
              {isAr ? 'ملاحظات إضافية (العلبة، الشاحن...)' : 'Notes (Boîte, chargeur...)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: Avec boîte originale"
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
                    ? 'صورة البطاقة الوطنية CIN للبائع (تُدمج في التزام البيع)'
                    : 'Photo de la CIN du vendeur (incluse dans le Contrat)'}
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
            className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
          >
            {isAr ? 'إلغاء' : 'Annuler'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => submitTradeIn('none')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 font-bold transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAr ? 'حفظ فقط' : 'Enregistrer seul'}</span>
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => submitTradeIn('pdf')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-amber-500/35 text-amber-300 font-bold transition disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isAr ? 'حفظ + عقد PDF' : 'Contrat PDF'}</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black transition disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isAr
                ? 'حفظ + طبع التزام البيع (CIN)'
                : 'Enregistrer + Imprimer Engagement'}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

