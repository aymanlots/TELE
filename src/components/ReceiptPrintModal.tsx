import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Printer, X, Check } from 'lucide-react';
import { Sale, RepairOrder, StoreSettings, ReceiptPaperWidth } from '../types';
import { getStoreSettings, getNetTotal } from '../db';
import { buildRepairTrackingUrl } from '../lib/whatsapp';

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale?: Sale | null;
  repair?: RepairOrder | null;
  repairType?: 'deposit' | 'delivery';
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  sale,
  repair,
  repairType = 'deposit',
}) => {
  const [settings, setSettings] = useState<StoreSettings>({
    storeName: '',
    address: '',
    phone: '',
    defaultWarrantyMonths: 6,
    language: 'ar',
    theme: 'dark',
  });
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>('80mm');
  const [receiptLang, setReceiptLang] = useState<'ar' | 'fr'>('ar');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      getStoreSettings().then((currentSettings) => {
        setSettings(currentSettings);
        if (currentSettings.receiptPaperWidth) {
          setPaperWidth(currentSettings.receiptPaperWidth);
        }
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (sale) {
      const netTotal = getNetTotal(sale);
      const qrPayload = JSON.stringify({
        bon: sale.bonNumber,
        date: sale.date,
        total: netTotal,
        store: settings.storeName || 'Mon Magasin',
        phone: settings.phone || '',
      });

      QRCode.toDataURL(qrPayload, {
        width: 140,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    } else if (repair) {
      const trackingUrl = buildRepairTrackingUrl(repair, settings.storeName || 'Mon Magasin');
      QRCode.toDataURL(trackingUrl, {
        width: 140,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    }
  }, [isOpen, sale, repair, settings]);

  if (!isOpen || (!sale && !repair)) return null;

  const isRTL = receiptLang === 'ar';
  const fallbackStoreName = receiptLang === 'ar' ? 'متجري' : 'Mon Magasin';
  const storeName = settings.storeName?.trim() || fallbackStoreName;

  const docNumber = sale ? sale.bonNumber : repair?.repairNumber || '';
  const docDate = sale
    ? sale.date
    : repairType === 'delivery'
    ? repair?.actualDeliveryDate || repair?.intakeDate || ''
    : repair?.intakeDate || '';

  const netTotal = sale ? getNetTotal(sale) : repair?.agreedPrice || 0;
  const rawSubtotal = sale ? sale.subtotal ?? sale.totalAmount + (sale.discountAmount || 0) : netTotal;
  const hasDiscount = Boolean(sale && sale.discountAmount && sale.discountAmount > 0);
  const returnedSum = sale
    ? Math.max(0, Math.round(((sale.totalAmount ?? 0) - netTotal) * 100) / 100)
    : 0;
  const hasReturns = returnedSum > 0;

  const handleDirectPrint = () => {
    const printContents = document.getElementById('printable-receipt-area')?.innerHTML;
    if (!printContents) {
      window.print();
      return;
    }

    const pageWidthCss = paperWidth === '58mm' ? '58mm' : paperWidth === '80mm' ? '80mm' : '210mm';
    const bodyWidthCss = paperWidth === '58mm' ? '54mm' : paperWidth === '80mm' ? '76mm' : '190mm';

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow?.document;
    if (!frameDoc) {
      window.print();
      return;
    }

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${receiptLang}">
        <head>
          <meta charset="utf-8" />
          <title>Bon_${docNumber}</title>
          <style>
            @page {
              size: ${paperWidth === 'A4' ? 'A4 portrait' : `${pageWidthCss} auto`};
              margin: ${paperWidth === 'A4' ? '10mm' : '2mm'};
            }
            * {
              box-sizing: border-box;
              color: #000000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0 auto;
              padding: ${paperWidth === 'A4' ? '8mm' : '2mm'};
              width: ${bodyWidthCss};
              font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
              background: #ffffff !important;
              color: #000000 !important;
              font-size: ${paperWidth === '58mm' ? '11px' : paperWidth === '80mm' ? '12px' : '14px'};
              line-height: 1.4;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 8px 0;
            }
            th, td {
              padding: 4px 2px;
              border-bottom: 1px dashed #444;
              text-align: inherit;
              vertical-align: top;
            }
            th {
              border-top: 1.5px solid #000;
              border-bottom: 1.5px solid #000;
              font-weight: 800;
            }
            .divider-dashed {
              border-top: 1.5px dashed #000;
              margin: 8px 0;
            }
            .divider-solid {
              border-top: 2px solid #000;
              margin: 8px 0;
            }
            .text-center { text-align: center; }
            .font-bold { font-weight: 700; }
            .font-extrabold { font-weight: 800; }
            .flex-between {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 6px;
            }
            .imei-badge {
              display: inline-block;
              font-family: monospace;
              font-size: 10px;
              border: 1px solid #000;
              padding: 1px 4px;
              border-radius: 3px;
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          ${printContents}
        </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 2000);
    }, 300);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#16161B] border border-[#D4AF37]/30 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Control Bar */}
        <div className="p-4 bg-[#1E1E24] border-b border-[#282830] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-bold text-white text-base">
              معاينة وطباعة البون (N° {docNumber})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#282830] text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Bar: Paper Size & Language */}
        <div className="px-4 py-3 bg-[#121216] border-b border-[#282830] flex flex-wrap items-center justify-between gap-3">
          {/* Paper Width Selector */}
          <div className="flex items-center gap-1.5 bg-[#1E1E24] p-1 rounded-xl border border-[#282830]">
            <span className="text-xs text-gray-400 px-2">حجم الورق:</span>
            {(['58mm', '80mm', 'A4'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setPaperWidth(size)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  paperWidth === size
                    ? 'bg-[#D4AF37] text-black shadow'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-1.5 bg-[#1E1E24] p-1 rounded-xl border border-[#282830]">
            <span className="text-xs text-gray-400 px-2">اللغة:</span>
            <button
              onClick={() => setReceiptLang('ar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                receiptLang === 'ar'
                  ? 'bg-[#D4AF37] text-black shadow'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              عربي (RTL)
            </button>
            <button
              onClick={() => setReceiptLang('fr')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                receiptLang === 'fr'
                  ? 'bg-[#D4AF37] text-black shadow'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              FR (LTR)
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0E0E11] flex justify-center">
          <div
            id="printable-receipt-area"
            dir={isRTL ? 'rtl' : 'ltr'}
            className={`bg-white text-black shadow-xl rounded-lg p-5 transition-all ${
              paperWidth === '58mm'
                ? 'w-[260px] text-xs'
                : paperWidth === '80mm'
                ? 'w-[340px] text-xs sm:text-sm'
                : 'w-full max-w-[580px] text-sm p-8'
            }`}
          >
            {/* Store Header */}
            <div className="text-center border-b-2 border-black pb-3 mb-3">
              {settings.logo ? (
                <img
                  src={settings.logo}
                  alt={storeName}
                  style={{ width: '96px', height: '96px', objectFit: 'contain', margin: '0 auto 8px auto', display: 'block' }}
                  className="mx-auto mb-2 w-24 h-24 object-contain"
                />
              ) : (
                <div
                  style={{
                    width: '88px',
                    height: '88px',
                    margin: '0 auto 8px auto',
                    borderRadius: '14px',
                    border: '2.5px solid #000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '42px',
                    fontWeight: 900,
                    backgroundColor: '#f5f5f5',
                    color: '#000000',
                  }}
                >
                  {storeName.charAt(0).toUpperCase() || 'M'}
                </div>
              )}
              <div className="font-extrabold text-lg tracking-wide uppercase text-black">
                {storeName}
              </div>
              {settings.storeSubtitle?.trim() && (
                <div className="text-xs font-semibold text-black mt-0.5">
                  {settings.storeSubtitle}
                </div>
              )}
              {settings.address?.trim() && (
                <div className="text-[11px] text-black mt-1">
                  📍 {settings.address}
                </div>
              )}
              {settings.phone?.trim() && (
                <div className="text-xs font-bold text-black mt-0.5" dir="ltr">
                  📞 {settings.phone}
                </div>
              )}
              {(settings.ice || settings.rc) && (
                <div className="text-[10px] font-mono text-black mt-1">
                  {settings.ice ? `ICE: ${settings.ice}` : ''}{' '}
                  {settings.rc ? `| RC: ${settings.rc}` : ''}
                </div>
              )}
            </div>

            {/* Document Title Banner */}
            <div className="text-center border border-black py-1.5 px-2 mb-3 bg-gray-100 rounded">
              <div className="font-extrabold text-sm uppercase">
                {sale
                  ? isRTL
                    ? 'وصل بيع / BON DE VENTE'
                    : 'BON DE VENTE / FACTURE'
                  : repairType === 'delivery'
                  ? isRTL
                    ? 'وصل تسليم إصلاح / BON DE LIVRAISON'
                    : 'BON DE LIVRAISON RÉPARATION'
                  : isRTL
                  ? 'وصل إيداع إصلاح / REÇU DE DÉPÔT'
                  : 'REÇU DE DÉPÔT RÉPARATION'}
              </div>
              <div className="font-mono font-bold text-xs mt-0.5">
                N° {docNumber}
                {docNumber?.startsWith('G-L-') && (
                  <span className="text-[10px] font-normal">
                    {' '}
                    ({isRTL ? 'رقم مؤقت' : 'N° Provisoire'})
                  </span>
                )}
              </div>
            </div>

            {/* Sale Receipt Body */}
            {sale && (
              <>
                {/* Sale & Customer Meta */}
                <div className="space-y-1 text-xs mb-3 border-b border-dashed border-black pb-2.5">
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'التاريخ:' : 'Date:'}</span>
                    <span className="font-mono">{sale.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'الزبون:' : 'Client:'}</span>
                    <span className="font-bold">
                      {sale.customerName || (isRTL ? 'زبون مباشر' : 'Client Comptoir')}
                    </span>
                  </div>
                  {sale.customerPhone && (
                    <div className="flex justify-between">
                      <span className="font-bold">{isRTL ? 'الهاتف:' : 'Tél:'}</span>
                      <span className="font-mono" dir="ltr">{sale.customerPhone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'طريقة الأداء:' : 'Mode:'}</span>
                    <span>
                      {sale.paymentType === 'cash'
                        ? isRTL
                          ? 'نقداً (Espèces)'
                          : 'Espèces'
                        : sale.paymentType === 'credit'
                        ? isRTL
                          ? 'كريدي (À Crédit)'
                          : 'À Crédit'
                        : isRTL
                        ? 'بالتقسيط (Facilité)'
                        : 'Facilité'}
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-xs border-collapse mb-3">
                  <thead>
                    <tr className="border-y-2 border-black font-extrabold">
                      <th className="py-1.5 text-start">#</th>
                      <th className="py-1.5 text-start">
                        {isRTL ? 'المادة / Article' : 'Désignation'}
                      </th>
                      <th className="py-1.5 text-center">{isRTL ? 'الكمية' : 'Qté'}</th>
                      <th className="py-1.5 text-end">{isRTL ? 'المجموع' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-gray-400">
                    {sale.items.map((item, idx) => {
                      const lineTotal = item.quantity * item.price;
                      return (
                        <tr key={idx} className={item.isReturned ? 'line-through opacity-60' : ''}>
                          <td className="py-1.5 pr-1 font-mono align-top">{idx + 1}</td>
                          <td className="py-1.5 align-top">
                            <div className="font-bold text-black">
                              {item.name}
                              {item.type === 'wholesale' && (
                                <span className="text-[10px] font-normal">
                                  {' '}
                                  ({isRTL ? 'جملة' : 'Gros'})
                                </span>
                              )}
                              {item.isReturned && (
                                <span className="text-[10px] font-bold">
                                  {' '}
                                  [{isRTL ? 'مسترجع' : 'RETOURNÉ'}]
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-black">
                              {item.quantity} x {item.price.toFixed(2)} DH
                            </div>
                            {item.imei && (
                              <div className="imei-badge font-mono text-[10px] border border-black px-1.5 py-0.5 rounded inline-block mt-0.5 bg-gray-50">
                                IMEI: {item.imei}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 text-center font-mono align-top">
                            {item.quantity}
                          </td>
                          <td className="py-1.5 text-end font-mono font-bold align-top">
                            {lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals Block */}
                <div className="border-t-2 border-black pt-2 space-y-1 text-xs">
                  {(hasDiscount || hasReturns) && (
                    <div className="flex justify-between">
                      <span>{isRTL ? 'المجموع الفرعي:' : 'Sous-total:'}</span>
                      <span className="font-mono font-bold">{rawSubtotal.toFixed(2)} DH</span>
                    </div>
                  )}

                  {hasDiscount && (
                    <div className="flex justify-between">
                      <span>
                        {isRTL ? 'التخفيض الممنوح:' : 'Remise accordée:'}
                        {sale.discountType === 'percent' && sale.discountValue
                          ? ` (${sale.discountValue}%)`
                          : ''}
                      </span>
                      <span className="font-mono font-bold">
                        - {(sale.discountAmount || 0).toFixed(2)} DH
                      </span>
                    </div>
                  )}

                  {hasReturns && (
                    <div className="flex justify-between">
                      <span>{isRTL ? 'مرتجعات مسجلة:' : 'Retours enregistrés:'}</span>
                      <span className="font-mono font-bold">- {returnedSum.toFixed(2)} DH</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm font-extrabold border-y border-black py-1.5 my-1 bg-gray-100 px-1.5 rounded">
                    <span>{isRTL ? 'المجموع الصافي:' : 'TOTAL NET:'}</span>
                    <span className="font-mono">{netTotal.toFixed(2)} DH</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'المبلغ المؤدى:' : 'Montant versé:'}</span>
                    <span className="font-mono font-bold">{sale.paidAmount.toFixed(2)} DH</span>
                  </div>

                  <div className="flex justify-between font-extrabold pt-0.5">
                    <span>{isRTL ? 'الباقي (كريدي):' : 'Reste dû (Crédit):'}</span>
                    <span className="font-mono">
                      {sale.remainingAmount > 0
                        ? `${sale.remainingAmount.toFixed(2)} DH`
                        : isRTL
                        ? 'خالص 100% (0.00 DH)'
                        : 'RÉGLÉ 100% (0.00 DH)'}
                    </span>
                  </div>
                </div>

                {/* Warranty & Conditions Note */}
                {(sale.warrantyMonths > 0 || settings.defaultWarrantyMonths > 0) && (
                  <div className="mt-3 p-2 border border-black rounded text-[11px] bg-gray-50">
                    <div className="font-bold">
                      🛡️ {isRTL ? 'الضمان:' : 'Garantie:'}{' '}
                      {sale.warrantyMonths || settings.defaultWarrantyMonths}{' '}
                      {isRTL ? 'أشهر' : 'mois'}
                    </div>
                    <div className="text-[10px] mt-0.5">
                      {isRTL
                        ? 'الضمان لا يشمل الكسر أو الماء أو سوء الاستعمال. يرجى الاحتفاظ بهذا البون.'
                        : "La garantie n'inclut pas la casse, l'oxydation ou mauvaise utilisation."}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Repair Receipt Body */}
            {repair && (
              <>
                <div className="space-y-1 text-xs mb-3 border-b border-dashed border-black pb-2.5">
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'التاريخ:' : 'Date:'}</span>
                    <span className="font-mono">{docDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'الزبون:' : 'Client:'}</span>
                    <span className="font-bold">{repair.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'الهاتف:' : 'Tél:'}</span>
                    <span className="font-mono" dir="ltr">{repair.customerPhone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'الجهاز:' : 'Appareil:'}</span>
                    <span className="font-bold">{repair.brand} {repair.model}</span>
                  </div>
                  {repair.imei && (
                    <div className="flex justify-between">
                      <span className="font-bold">IMEI:</span>
                      <span className="font-mono">{repair.imei}</span>
                    </div>
                  )}
                  <div className="pt-1 border-t border-dashed border-gray-400">
                    <span className="font-bold">{isRTL ? 'العطل المصرح به:' : 'Panne déclarée:'}</span>
                    <div className="mt-0.5">{repair.issue}</div>
                  </div>
                </div>

                <div className="border-t-2 border-black pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-sm font-extrabold border-y border-black py-1.5 my-1 bg-gray-100 px-1.5 rounded">
                    <span>{isRTL ? 'تكلفة الإصلاح:' : 'COÛT RÉPARATION:'}</span>
                    <span className="font-mono">{repair.agreedPrice.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">{isRTL ? 'التسبيق المؤدى:' : 'Avance versée:'}</span>
                    <span className="font-mono font-bold">{repair.depositAmount.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between font-extrabold pt-0.5">
                    <span>{isRTL ? 'الباقي للأداء:' : 'Reste à payer:'}</span>
                    <span className="font-mono">{repair.remainingAmount.toFixed(2)} DH</span>
                  </div>
                </div>
              </>
            )}

            {/* QR Code & Footer */}
            <div className="mt-4 pt-3 border-t border-dashed border-black text-center">
              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center mb-2">
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-24 h-24 object-contain border border-black p-1 rounded bg-white"
                  />
                  <span className="text-[10px] font-mono mt-1">
                    {isRTL
                      ? 'امسح رمز QR للتحقق من الضمان أو تتبع الإصلاح'
                      : 'Scannez pour vérifier la garantie ou le suivi'}
                  </span>
                </div>
              )}
              <div className="font-extrabold text-xs mt-1">
                {isRTL ? 'شكراً لثقتكم وزيارتكم!' : 'MERCI POUR VOTRE CONFIANCE !'}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 bg-[#1E1E24] border-t border-[#282830] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[#282830] text-gray-300 hover:text-white text-sm font-bold transition"
          >
            إغلاق
          </button>
          <button
            onClick={handleDirectPrint}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B5902B] text-black font-extrabold text-sm flex items-center gap-2 shadow-lg hover:brightness-110 transition"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة البون الآن ({paperWidth})</span>
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ReceiptPrintModal;
