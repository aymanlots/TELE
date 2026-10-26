import React, { useEffect, useRef, useState } from 'react';
import {
  Printer,
  Eye,
  X,
  FileDown,
  Receipt,
  Wrench,
  Languages,
  Maximize2,
  ShieldCheck,
} from 'lucide-react';
import { Sale, RepairOrder, StoreSettings, ReceiptPaperWidth } from '../types';
import { getStoreSettings, saveStoreSettings, getNetTotal } from '../db';
import { useI18n } from '../i18n';
import { generateQrCodeDataUrl, printHtmlContent } from '../lib/code128';
import { addMonthsClamped } from '../lib/dateUtils';
import { buildRepairTrackingUrl } from '../lib/whatsapp';

export interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale?: Sale | null;
  repair?: RepairOrder | null;
  repairType?: 'deposit' | 'delivery';
  autoPrintOnOpen?: boolean;
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  sale,
  repair,
  repairType = 'deposit',
  autoPrintOnOpen = false,
}) => {
  const { language } = useI18n();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>('80mm');
  const [receiptLang, setReceiptLang] = useState<'ar' | 'fr'>(language);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const receiptContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setReceiptLang(language);
  }, [language]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function load() {
      const s = await getStoreSettings();
      if (!active) return;
      setSettings(s);
      if (s.receiptPaperWidth) {
        setPaperWidth(s.receiptPaperWidth);
      }

      // Generate Warranty / Live Repair Tracking QR Code
      if (sale) {
        const qrPayload = sale.bonNumber;
        const url = await generateQrCodeDataUrl(qrPayload, 160);
        if (active) setQrDataUrl(url);
      } else if (repair) {
        const qrPayload = buildRepairTrackingUrl(repair, s.storeName, s.phone);
        const url = await generateQrCodeDataUrl(qrPayload, 180);
        if (active) setQrDataUrl(url);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [isOpen, sale, repair]);

  // Handle changing paper size and persisting it to StoreSettings
  const handleSelectPaperWidth = async (width: ReceiptPaperWidth) => {
    setPaperWidth(width);
    if (settings) {
      const updated = { ...settings, receiptPaperWidth: width };
      setSettings(updated);
      await saveStoreSettings(updated);
    }
  };

  // Trigger browser print via hidden iframe with @page size matching 58mm, 80mm, or A4
  const handleBrowserPrint = () => {
    if (!receiptContainerRef.current) return;
    const htmlContent = receiptContainerRef.current.innerHTML;

    let pageSizeCss = '';
    if (paperWidth === '58mm') {
      pageSizeCss = `
        @page {
          size: 58mm auto;
          margin: 0mm;
        }
        body {
          width: 58mm;
          max-width: 58mm;
          padding: 1.5mm 2mm;
          font-size: 11px;
        }
      `;
    } else if (paperWidth === '80mm') {
      pageSizeCss = `
        @page {
          size: 80mm auto;
          margin: 0mm;
        }
        body {
          width: 80mm;
          max-width: 80mm;
          padding: 2mm 3mm;
          font-size: 12px;
        }
      `;
    } else {
      pageSizeCss = `
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        body {
          width: 100%;
          max-width: 190mm;
          margin: 0 auto;
          padding: 4mm;
          font-size: 13px;
        }
      `;
    }

    printHtmlContent(htmlContent, pageSizeCss);
  };

  // Optional auto-print
  useEffect(() => {
    if (isOpen && autoPrintOnOpen && settings && qrDataUrl) {
      const timer = setTimeout(() => {
        handleBrowserPrint();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoPrintOnOpen, settings, qrDataUrl]);

  // Download classic A4 PDF (Dynamic import - Partie 1 #11)
  const handleDownloadPdf = async () => {
    const s = settings || (await getStoreSettings());
    const {
      generateBonPDF,
      generateRepairDepositPDF,
      generateRepairDeliveryPDF,
    } = await import('../lib/pdfGenerator');
    if (sale) {
      await generateBonPDF(sale, s, 'save');
    } else if (repair) {
      if (repairType === 'delivery') {
        await generateRepairDeliveryPDF(repair, s, 'save');
      } else {
        await generateRepairDepositPDF(repair, s, 'save');
      }
    }
  };

  if (!isOpen || (!sale && !repair)) return null;

  const isAr = receiptLang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const fallbackName = isAr ? 'متجري' : 'Mon Magasin';
  const storeName = settings?.storeName?.trim() || fallbackName;
  const storeSubtitle = settings?.storeSubtitle?.trim();
  const storeAddress = settings?.address?.trim();
  const storePhone = settings?.phone?.trim();
  const storeIce = settings?.ice?.trim();
  const storeRc = settings?.rc?.trim();
  const storeLogo = settings?.logo;

  const isCompact = paperWidth === '58mm';
  const isThermal = paperWidth === '58mm' || paperWidth === '80mm';

  // Preview width in modal
  const previewWidthClass =
    paperWidth === '58mm'
      ? 'w-[235px]'
      : paperWidth === '80mm'
      ? 'w-[315px]'
      : 'w-full max-w-[650px]';

  // Calculate warranty end date if sale has warranty (clamped month arithmetic - Partie 1 #7)
  const getWarrantyEndStr = (s: Sale) => {
    if (!s.hasWarranty || !s.warrantyMonths) return '';
    return addMonthsClamped(s.date, s.warrantyMonths);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                {language === 'ar' ? 'معاينة وطباعة الوصل' : 'Aperçu & Impression du Reçu'}
              </h3>
              <p className="text-[11px] text-neutral-400 font-mono">
                {sale ? sale.bonNumber : repair?.repairNumber} · {paperWidth}
              </p>
            </div>
          </div>

          {/* Paper Size & Language Switchers */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Paper Width Selector: 58mm | 80mm | A4 */}
            <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs">
              <Maximize2 className="w-3.5 h-3.5 text-amber-400 mx-1.5" />
              {(['58mm', '80mm', 'A4'] as ReceiptPaperWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => handleSelectPaperWidth(w)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold transition ${
                    paperWidth === w
                      ? 'bg-amber-500 text-neutral-950 shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            {/* Receipt Language Toggle (RTL Darija / LTR French) */}
            <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs">
              <Languages className="w-3.5 h-3.5 text-amber-400 mx-1.5" />
              <button
                type="button"
                onClick={() => setReceiptLang('ar')}
                className={`px-2 py-1 rounded-lg font-bold transition ${
                  receiptLang === 'ar'
                    ? 'bg-amber-500 text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                عربي (RTL)
              </button>
              <button
                type="button"
                onClick={() => setReceiptLang('fr')}
                className={`px-2 py-1 rounded-lg font-bold transition ${
                  receiptLang === 'fr'
                    ? 'bg-amber-500 text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                FR (LTR)
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-300 text-neutral-400 border border-neutral-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Paper Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-950/90 flex justify-center items-start">
          <div
            className={`${previewWidthClass} bg-white text-black rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.85)] transition-all duration-200 overflow-hidden`}
            style={{
              padding: isCompact ? '8px 6px' : isThermal ? '12px 10px' : '24px 28px',
            }}
          >
            {/* Actual Printable HTML Container */}
            <div
              ref={receiptContainerRef}
              dir={dir}
              style={{
                direction: dir,
                textAlign: isAr ? 'right' : 'left',
                fontFamily: "'Cairo', system-ui, -apple-system, sans-serif",
                color: '#000000',
                backgroundColor: '#FFFFFF',
                lineHeight: 1.35,
                fontSize: isCompact ? '11px' : isThermal ? '12px' : '13px',
              }}
            >
              {/* 1. STORE HEADER (LOGO, NAME, ADDRESS, PHONE, ICE, RC) */}
              <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                {storeLogo && (
                  <div style={{ marginBottom: '4px' }}>
                    <img
                      src={storeLogo}
                      alt={storeName}
                      style={{
                        maxHeight: isCompact ? '44px' : isThermal ? '54px' : '70px',
                        maxWidth: '80%',
                        objectFit: 'contain',
                        margin: '0 auto',
                        display: 'block',
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    fontSize: isCompact ? '15px' : isThermal ? '17px' : '22px',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {storeName}
                </div>

                {storeSubtitle && (
                  <div style={{ fontSize: isCompact ? '10px' : '11px', fontWeight: 600 }}>
                    {storeSubtitle}
                  </div>
                )}

                {storeAddress && (
                  <div style={{ fontSize: isCompact ? '9.5px' : '10.5px', marginTop: '2px' }}>
                    {storeAddress}
                  </div>
                )}

                {storePhone && (
                  <div
                    style={{
                      fontSize: isCompact ? '10.5px' : '11.5px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      marginTop: '1px',
                    }}
                    dir="ltr"
                  >
                    Tél: {storePhone}
                  </div>
                )}

                {(storeIce || storeRc) && (
                  <div
                    style={{
                      fontSize: isCompact ? '9px' : '10px',
                      fontFamily: 'monospace',
                      marginTop: '2px',
                      fontWeight: 600,
                    }}
                  >
                    {storeIce && <span>ICE: {storeIce}</span>}
                    {storeIce && storeRc && <span> · </span>}
                    {storeRc && <span>RC: {storeRc}</span>}
                  </div>
                )}
              </div>

              {/* Dashed separator */}
              <div
                style={{
                  borderTop: '1.5px dashed #000000',
                  margin: '6px 0',
                }}
              />

              {/* 2. RECEIPT TYPE & META */}
              {sale && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <div
                      style={{
                        fontSize: isCompact ? '12px' : '14px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {isAr ? 'وصل بيع / فاتورة' : 'BON DE VENTE'}
                    </div>
                    <div
                      style={{
                        fontSize: isCompact ? '12px' : '13px',
                        fontFamily: 'monospace',
                        fontWeight: 800,
                      }}
                    >
                      N° {sale.bonNumber}
                      {sale.bonNumber?.startsWith('G-L-') ? ' (N° PROVISOIRE)' : ''}
                    </div>
                  </div>

                  <div style={{ fontSize: isCompact ? '10px' : '11px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'التاريخ:' : 'Date:'}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{sale.date}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'الزبون:' : 'Client:'}</span>
                      <span style={{ fontWeight: 700 }}>{sale.customerName}</span>
                    </div>
                    {sale.customerPhone && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{isAr ? 'الهاتف:' : 'Tél:'}</span>
                        <span style={{ fontFamily: 'monospace' }} dir="ltr">
                          {sale.customerPhone}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

                  {/* 3. SALE ITEMS TABLE */}
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: isCompact ? '10px' : '11px',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #000000', fontWeight: 800 }}>
                        <th style={{ textAlign: isAr ? 'right' : 'left', padding: '3px 0' }}>
                          {isAr ? 'السلعة' : 'Article'}
                        </th>
                        <th style={{ textAlign: 'center', padding: '3px 2px' }}>
                          {isAr ? 'كمية' : 'Qté'}
                        </th>
                        <th style={{ textAlign: isAr ? 'left' : 'right', padding: '3px 0' }}>
                          {isAr ? 'المجموع' : 'Total'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '0.5px dotted #888888',
                            textDecoration: item.isReturned ? 'line-through' : 'none',
                          }}
                        >
                          <td style={{ padding: '4px 0', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {item.imei && (
                              <div
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: isCompact ? '9px' : '10px',
                                  fontWeight: 600,
                                }}
                                dir="ltr"
                              >
                                IMEI: {item.imei}
                              </div>
                            )}
                            {item.quantity > 1 && (
                              <div style={{ fontSize: '9.5px', fontFamily: 'monospace' }}>
                                {item.quantity} x {item.price} DH
                              </div>
                            )}
                          </td>
                          <td
                            style={{
                              textAlign: 'center',
                              padding: '4px 2px',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              verticalAlign: 'top',
                            }}
                          >
                            {item.quantity}
                          </td>
                          <td
                            style={{
                              textAlign: isAr ? 'left' : 'right',
                              padding: '4px 0',
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              verticalAlign: 'top',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {(item.price * item.quantity).toFixed(0)} {isAr ? 'د.م' : 'DH'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ borderTop: '1.5px dashed #000000', margin: '6px 0' }} />

                  {/* 4. TOTALS */}
                  <div style={{ fontSize: isCompact ? '10.5px' : '11.5px' }}>
                    {sale.discountAmount && sale.discountAmount > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{isAr ? 'المجموع الفرعي:' : 'Sous-total:'}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            {(sale.subtotal || sale.totalAmount + sale.discountAmount).toFixed(0)}{' '}
                            {isAr ? 'درهم' : 'DH'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{isAr ? 'تخفيض (Remise):' : 'Remise:'}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            -{sale.discountAmount.toFixed(0)} {isAr ? 'درهم' : 'DH'}
                          </span>
                        </div>
                      </>
                    ) : null}

                    {sale.returns && sale.returns.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{isAr ? 'مرتجعات (Retours):' : 'Retours:'}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          -
                          {sale.returns
                            .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
                            .toFixed(0)}{' '}
                          {isAr ? 'درهم' : 'DH'}
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: isCompact ? '13px' : '15px',
                        fontWeight: 800,
                        margin: '3px 0',
                      }}
                    >
                      <span>{isAr ? 'المجموع الصافي:' : 'TOTAL NET:'}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {getNetTotal(sale).toFixed(0)} {isAr ? 'درهم' : 'DH'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'المبلغ المدفوع:' : 'Montant payé:'}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {sale.paidAmount.toFixed(0)} {isAr ? 'درهم' : 'DH'}
                      </span>
                    </div>

                    {sale.remainingAmount > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 800,
                          borderTop: '1px dotted #000',
                          paddingTop: '2px',
                          marginTop: '2px',
                        }}
                      >
                        <span>{isAr ? 'الباقي (الكريدي):' : 'Reste à payer:'}</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {sale.remainingAmount.toFixed(0)} {isAr ? 'درهم' : 'DH'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 5. WARRANTY SECTION */}
                  <div style={{ borderTop: '1px dashed #000000', margin: '6px 0' }} />
                  <div style={{ textAlign: 'center', fontSize: isCompact ? '10px' : '11px' }}>
                    {sale.hasWarranty && sale.warrantyMonths > 0 ? (
                      <div style={{ fontWeight: 800 }}>
                        ★{' '}
                        {isAr
                          ? `ضمان لمدة ${sale.warrantyMonths} شهراً (إلى غاية ${getWarrantyEndStr(sale)})`
                          : `Garantie ${sale.warrantyMonths} mois (jusqu'au ${getWarrantyEndStr(sale)})`}{' '}
                        ★
                      </div>
                    ) : (
                      <div style={{ fontWeight: 600 }}>
                        {isAr ? 'بدون ضمان (Sans garantie)' : 'Vendu sans garantie'}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* REPAIR RECEIPT (DEPOSIT OR DELIVERY) */}
              {repair && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <div
                      style={{
                        fontSize: isCompact ? '12px' : '14px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {repairType === 'delivery'
                        ? isAr
                          ? 'وصل تسليم إصلاح'
                          : 'BON DE LIVRAISON RÉPARATION'
                        : isAr
                        ? 'وصل إيداع للإصلاح'
                        : 'TICKET DE DÉPÔT RÉPARATION'}
                    </div>
                    <div
                      style={{
                        fontSize: isCompact ? '12px' : '13px',
                        fontFamily: 'monospace',
                        fontWeight: 800,
                      }}
                    >
                      N° {repair.repairNumber}
                      {repair.repairNumber?.startsWith('R-L-') ? ' (N° PROVISOIRE)' : ''}
                    </div>
                  </div>

                  <div style={{ fontSize: isCompact ? '10px' : '11px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'تاريخ الإيداع:' : 'Date dépôt:'}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {repair.intakeDate}
                      </span>
                    </div>
                    {repair.expectedDeliveryDate && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{isAr ? 'تاريخ التسليم المتوقع:' : 'Livraison prévue:'}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {repair.expectedDeliveryDate}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'الزبون:' : 'Client:'}</span>
                      <span style={{ fontWeight: 700 }}>{repair.customerName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'الهاتف:' : 'Tél:'}</span>
                      <span style={{ fontFamily: 'monospace' }} dir="ltr">
                        {repair.customerPhone}
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #000000', margin: '5px 0' }} />

                  {/* Device Info */}
                  <div style={{ fontSize: isCompact ? '10.5px' : '11.5px', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 800 }}>
                      {isAr ? 'الجهاز:' : 'Appareil:'} {repair.brand} {repair.model}
                    </div>
                    {repair.imei && (
                      <div style={{ fontFamily: 'monospace', fontSize: '10px' }} dir="ltr">
                        IMEI / S/N: {repair.imei}
                      </div>
                    )}
                    <div style={{ marginTop: '3px' }}>
                      <strong>{isAr ? 'العطل المصرح به:' : 'Panne déclarée:'}</strong> {repair.issue}
                    </div>
                    {repair.conditionNotes && (
                      <div style={{ fontSize: '10px', marginTop: '2px' }}>
                        <strong>{isAr ? 'حالة الجهاز:' : 'État:'}</strong> {repair.conditionNotes}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1.5px dashed #000000', margin: '6px 0' }} />

                  {/* Repair Financials */}
                  <div style={{ fontSize: isCompact ? '11px' : '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                      <span>{isAr ? 'التكلفة المتفق عليها:' : 'Prix convenu:'}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {repair.agreedPrice.toFixed(0)} {isAr ? 'درهم' : 'DH'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{isAr ? 'التسبيق (Avance):' : 'Avance reçue:'}</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {repair.depositAmount.toFixed(0)} {isAr ? 'درهم' : 'DH'}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: isCompact ? '13px' : '14px',
                        fontWeight: 800,
                        marginTop: '3px',
                        borderTop: '1px dotted #000',
                        paddingTop: '2px',
                      }}
                    >
                      <span>{isAr ? 'الباقي للأداء:' : 'Reste à payer:'}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {(repair.status === 'delivered' ? 0 : repair.remainingAmount).toFixed(0)}{' '}
                        {isAr ? 'درهم' : 'DH'}
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #000000', margin: '6px 0' }} />
                  <div style={{ fontSize: '9px', textAlign: 'center', lineHeight: 1.25 }}>
                    {isAr
                      ? 'يرجى إحضار هذا الوصل عند استلام الجهاز. المحل غير مسؤول عن الأجهزة المتروكة أكثر من 30 يوماً.'
                      : 'Veuillez présenter ce ticket lors du retrait. Le magasin décline toute responsabilité au-delà de 30 jours.'}
                  </div>
                </>
              )}

              {/* 6. QR CODE & FOOTER */}
              {qrDataUrl && (
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    style={{
                      width: isCompact ? '76px' : '90px',
                      height: isCompact ? '76px' : '90px',
                      margin: '0 auto',
                      display: 'block',
                    }}
                  />
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      fontWeight: 700,
                      marginTop: '2px',
                    }}
                  >
                    {sale ? sale.bonNumber : repair?.repairNumber}
                  </div>
                  {repair && (
                    <div
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 700,
                        marginTop: '2px',
                      }}
                    >
                      {isAr
                        ? '📱 امسح رمز QR لتتبع حالة الإصلاح مباشرة'
                        : '📱 Scanner le QR pour suivre la réparation en direct'}
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  textAlign: 'center',
                  fontSize: isCompact ? '9.5px' : '10.5px',
                  fontWeight: 700,
                  marginTop: '6px',
                }}
              >
                {isAr ? 'شكراً لثقتكم وزيارتكم!' : 'Merci de votre confiance !'}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="p-3.5 bg-neutral-950 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-semibold text-xs transition"
          >
            <FileDown className="w-4 h-4 text-amber-400" />
            <span>{language === 'ar' ? 'تحميل PDF A4' : 'Télécharger PDF A4'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition"
            >
              {language === 'ar' ? 'إغلاق' : 'Fermer'}
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>
                {language === 'ar'
                  ? `طباعة الوصل (${paperWidth})`
                  : `Imprimer (${paperWidth})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
