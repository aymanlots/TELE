import React, { useEffect, useState, useMemo } from 'react';
import {
  Printer,
  QrCode,
  Barcode,
  X,
  Plus,
  Minus,
  Check,
  Search,
  Tag,
  Smartphone,
  Layers,
} from 'lucide-react';
import { Product } from '../types';
import { getStoreSettings } from '../db';
import { useI18n } from '../i18n';
import {
  generateCode128Svg,
  generateQrCodeDataUrl,
  printHtmlContent,
} from '../lib/code128';

export type StickerSize = '38x25mm' | '50x30mm' | '40x30mm' | 'A4-sheet';
export type StickerCodeMode = 'both' | 'barcode' | 'qr';

export interface StickerItemSelection {
  id: string;
  productId: number;
  productName: string;
  price: number;
  code: string; // IMEI or Barcode or Product ID
  isImei?: boolean;
  copies: number;
}

export interface StickerPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialProduct?: Product | null;
  initialImei?: string;
}

export const StickerPrintModal: React.FC<StickerPrintModalProps> = ({
  isOpen,
  onClose,
  products,
  initialProduct,
  initialImei,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [storeName, setStoreName] = useState('');
  const [stickerSize, setStickerSize] = useState<StickerSize>('50x30mm');
  const [codeMode, setCodeMode] = useState<StickerCodeMode>('both');
  const [showPrice, setShowPrice] = useState(true);
  const [showStoreName, setShowStoreName] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');

  // Selected sticker items to print
  const [selectedItems, setSelectedItems] = useState<StickerItemSelection[]>([]);
  // Pre-rendered QR code data URLs keyed by code string
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    getStoreSettings().then((s) => {
      setStoreName(s.storeName?.trim() || '');
    });
  }, [isOpen]);

  // Populate initial product or IMEI when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialProduct) {
      if (initialImei) {
        setSelectedItems([
          {
            id: `${initialProduct.id}_${initialImei}`,
            productId: initialProduct.id!,
            productName: initialProduct.name,
            price: initialProduct.retailPrice,
            code: initialImei,
            isImei: true,
            copies: 1,
          },
        ]);
      } else if (
        initialProduct.category === 'phone' &&
        initialProduct.imeiList &&
        initialProduct.imeiList.filter((i) => i.status === 'in_stock').length > 0
      ) {
        // Add all in-stock IMEIs of this phone (1 copy each by default)
        const inStockImeis = initialProduct.imeiList.filter((i) => i.status === 'in_stock');
        setSelectedItems(
          inStockImeis.map((im) => ({
            id: `${initialProduct.id}_${im.imei}`,
            productId: initialProduct.id!,
            productName: initialProduct.name,
            price: initialProduct.retailPrice,
            code: im.imei,
            isImei: true,
            copies: 1,
          }))
        );
      } else {
        const code =
          initialProduct.barcode?.trim() || `PROD-${initialProduct.id || 1}`;
        setSelectedItems([
          {
            id: `${initialProduct.id}_main`,
            productId: initialProduct.id!,
            productName: initialProduct.name,
            price: initialProduct.retailPrice,
            code,
            isImei: false,
            copies: 1,
          },
        ]);
      }
    } else if (selectedItems.length === 0 && products.length > 0) {
      // Default empty selection so user can pick from list
      setSelectedItems([]);
    }
  }, [isOpen, initialProduct, initialImei]);

  // Generate QR codes for all unique codes in selectedItems
  useEffect(() => {
    let active = true;
    async function buildQrs() {
      const nextMap: Record<string, string> = { ...qrMap };
      let changed = false;
      for (const item of selectedItems) {
        if (!nextMap[item.code]) {
          nextMap[item.code] = await generateQrCodeDataUrl(item.code, 120);
          changed = true;
        }
      }
      if (active && changed) {
        setQrMap(nextMap);
      }
    }
    buildQrs();
    return () => {
      active = false;
    };
  }, [selectedItems]);

  // Toggle a product from the catalog list
  const handleToggleProduct = (p: Product) => {
    const existingForProduct = selectedItems.some((item) => item.productId === p.id);
    if (existingForProduct) {
      setSelectedItems((prev) => prev.filter((item) => item.productId !== p.id));
      return;
    }

    if (p.category === 'phone' && p.imeiList) {
      const inStock = p.imeiList.filter((i) => i.status === 'in_stock');
      if (inStock.length > 0) {
        const toAdd: StickerItemSelection[] = inStock.map((im) => ({
          id: `${p.id}_${im.imei}`,
          productId: p.id!,
          productName: p.name,
          price: p.retailPrice,
          code: im.imei,
          isImei: true,
          copies: 1,
        }));
        setSelectedItems((prev) => [...prev, ...toAdd]);
        return;
      }
    }

    const code = p.barcode?.trim() || `PROD-${p.id || 1}`;
    setSelectedItems((prev) => [
      ...prev,
      {
        id: `${p.id}_main`,
        productId: p.id!,
        productName: p.name,
        price: p.retailPrice,
        code,
        isImei: false,
        copies: 1,
      },
    ]);
  };

  const handleUpdateCopies = (id: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, copies: Math.max(0, item.copies + delta) } : item
        )
        .filter((item) => item.copies > 0)
    );
  };

  // Expand items according to copies count
  const expandedStickers = useMemo(() => {
    const list: StickerItemSelection[] = [];
    for (const item of selectedItems) {
      for (let c = 0; c < item.copies; c++) {
        list.push(item);
      }
    }
    return list;
  }, [selectedItems]);

  // Filter catalog products
  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.imeiList && p.imeiList.some((im) => im.imei.includes(q)))
    );
  }, [products, catalogSearch]);

  // Print Stickers via isolated iframe
  const handlePrintStickers = () => {
    if (expandedStickers.length === 0) return;

    const dims =
      stickerSize === '38x25mm'
        ? { w: '38mm', h: '25mm', isSmall: true }
        : stickerSize === '40x30mm'
        ? { w: '40mm', h: '30mm', isSmall: false }
        : { w: '50mm', h: '30mm', isSmall: false };

    const isSheet = stickerSize === 'A4-sheet';

    const pageCss = isSheet
      ? `
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        .stickers-wrapper {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3mm;
          width: 100%;
        }
        .sticker-box {
          width: 100%;
          height: 32mm;
          border: 1px dashed #666666;
          padding: 1.5mm 2mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          page-break-inside: avoid;
          overflow: hidden;
        }
      `
      : `
        @page {
          size: ${dims.w} ${dims.h};
          margin: 0mm;
        }
        .stickers-wrapper {
          margin: 0;
          padding: 0;
        }
        .sticker-box {
          width: ${dims.w};
          height: ${dims.h};
          padding: 1mm 1.5mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          page-break-after: always;
          break-after: page;
          overflow: hidden;
        }
      `;

    const stickersHtml = expandedStickers
      .map((st) => {
        const barcodeSvg =
          codeMode === 'barcode' || codeMode === 'both'
            ? generateCode128Svg(st.code, {
                height: dims.isSmall ? 18 : 22,
                moduleWidth: dims.isSmall ? 1.05 : 1.2,
                showText: false,
              })
            : '';
        const qrImgUrl = qrMap[st.code] || '';

        return `
          <div class="sticker-box">
            <div style="width:100%;line-height:1.1;">
              ${
                showStoreName && storeName
                  ? `<div style="font-size:${dims.isSmall ? '7px' : '8px'};font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${storeName}</div>`
                  : ''
              }
              <div style="font-size:${dims.isSmall ? '8.5px' : '9.5px'};font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
                ${st.productName}
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:center;gap:3px;width:100%;margin:1px 0;">
              ${
                (codeMode === 'qr' || codeMode === 'both') && qrImgUrl
                  ? `<img src="${qrImgUrl}" style="width:${
                      codeMode === 'qr'
                        ? dims.isSmall
                          ? '34px'
                          : '42px'
                        : dims.isSmall
                        ? '26px'
                        : '32px'
                    };height:${
                      codeMode === 'qr'
                        ? dims.isSmall
                          ? '34px'
                          : '42px'
                        : dims.isSmall
                        ? '26px'
                        : '32px'
                    };object-fit:contain;flex-shrink:0;" />`
                  : ''
              }
              ${
                codeMode === 'barcode' || codeMode === 'both'
                  ? `<div style="flex:1;max-width:${codeMode === 'both' ? '72%' : '95%'};overflow:hidden;">${barcodeSvg}</div>`
                  : ''
              }
            </div>

            <div style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:2px;font-family:monospace;line-height:1;">
              <span style="font-size:${dims.isSmall ? '7.5px' : '8.5px'};font-weight:700;">
                ${st.code}
              </span>
              ${
                showPrice
                  ? `<span style="font-size:${dims.isSmall ? '8.5px' : '10px'};font-weight:900;background:#000;color:#fff;padding:1px 3px;border-radius:2px;">
                      ${st.price} DH
                    </span>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    printHtmlContent(`<div class="stickers-wrapper">${stickersHtml}</div>`, pageCss);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl bg-neutral-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                {isAr
                  ? 'طباعة ستيكرات الباركود و QR Code (للمنتجات و IMEI)'
                  : 'Impression Étiquettes QR Code & Code-Barres (Produits & IMEI)'}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {isAr
                  ? `مجموع الملصقات الجاهزة للطباعة: ${expandedStickers.length} ستيكر`
                  : `Total d'étiquettes prêtes à imprimer : ${expandedStickers.length}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-300 text-neutral-400 border border-neutral-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Body: Left = Product Picker & Settings | Right = Live Sticker Preview */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x rtl:lg:divide-x-reverse divide-neutral-800">
          {/* Left Column (5 cols): Sticker Options & Multi-Product Selector */}
          <div className="lg:col-span-5 p-4 space-y-4 text-xs bg-neutral-900/60">
            {/* 1. Sticker Dimensions & Code Format */}
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div>
                <label className="block font-bold text-amber-400 mb-1.5">
                  {isAr ? 'مقاس الستيكر / الورق:' : "Format de l'étiquette :"}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: '38x25mm', label: '38 × 25 mm (صغير)' },
                      { id: '50x30mm', label: '50 × 30 mm (قياسي)' },
                      { id: '40x30mm', label: '40 × 30 mm (متوسط)' },
                      { id: 'A4-sheet', label: 'A4 (صفحة ستيكرات)' },
                    ] as { id: StickerSize; label: string }[]
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setStickerSize(sz.id)}
                      className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] font-bold border transition ${
                        stickerSize === sz.id
                          ? 'bg-amber-500 text-neutral-950 border-amber-400'
                          : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-amber-400 mb-1.5">
                  {isAr ? 'نوع الكود المطبوع:' : 'Type de code :'}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCodeMode('both')}
                    className={`px-2 py-1.5 rounded-lg font-bold text-[11px] border transition ${
                      codeMode === 'both'
                        ? 'bg-amber-500 text-neutral-950 border-amber-400'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800'
                    }`}
                  >
                    QR + Code128
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeMode('barcode')}
                    className={`px-2 py-1.5 rounded-lg font-bold text-[11px] border transition ${
                      codeMode === 'barcode'
                        ? 'bg-amber-500 text-neutral-950 border-amber-400'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800'
                    }`}
                  >
                    Code128 فقط
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeMode('qr')}
                    className={`px-2 py-1.5 rounded-lg font-bold text-[11px] border transition ${
                      codeMode === 'qr'
                        ? 'bg-amber-500 text-neutral-950 border-amber-400'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800'
                    }`}
                  >
                    QR Code فقط
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-neutral-300">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>{isAr ? 'إظهار الثمن' : 'Afficher le prix'}</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-neutral-300">
                  <input
                    type="checkbox"
                    checked={showStoreName}
                    onChange={(e) => setShowStoreName(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>{isAr ? 'إظهار اسم المحل' : 'Nom du magasin'}</span>
                </label>
              </div>
            </div>

            {/* 2. Multi-Product Picker from Stock */}
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {isAr
                      ? 'اختر منتجات متعددة للطباعة دفعة واحدة:'
                      : 'Sélectionner plusieurs produits à imprimer :'}
                  </span>
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={isAr ? 'ابحث في المنتجات...' : 'Filtrer les produits...'}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg ps-8 pe-3 py-1.5 text-xs text-neutral-200"
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {filteredCatalog.map((p) => {
                  const isSelected = selectedItems.some((item) => item.productId === p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleToggleProduct(p)}
                      className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between gap-2 transition ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900/70 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {p.retailPrice} DH ·{' '}
                          {p.category === 'phone'
                            ? `${p.imeiList?.filter((i) => i.status === 'in_stock').length || 0} IMEI`
                            : p.barcode || `ID #${p.id}`}
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                          isSelected
                            ? 'bg-amber-500 border-amber-400 text-neutral-950'
                            : 'border-neutral-700 bg-neutral-950'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column (7 cols): Selected Items Copies & Live Sticker Preview */}
          <div className="lg:col-span-7 p-4 space-y-4 flex flex-col bg-neutral-950/60">
            {/* Copies controller */}
            {selectedItems.length > 0 && (
              <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2 max-h-44 overflow-y-auto">
                <div className="text-xs font-bold text-neutral-300 mb-1">
                  {isAr ? 'عدد النسخ لكل ستيكر:' : "Nombre d'exemplaires par code :"}
                </div>
                {selectedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs"
                  >
                    <div className="truncate">
                      <span className="font-bold text-neutral-200">{item.productName}</span>
                      <span className="text-amber-400 font-mono text-[11px] ms-2">
                        [{item.code}]
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateCopies(item.id, -1)}
                        className="w-6 h-6 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-300"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-amber-400">
                        {item.copies}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCopies(item.id, 1)}
                        className="w-6 h-6 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-300"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Live Visual Preview of Stickers */}
            <div className="flex-1 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 overflow-y-auto">
              <div className="text-xs font-bold text-neutral-400 mb-3 flex items-center justify-between">
                <span>{isAr ? 'معاينة الستيكرات:' : 'Aperçu des étiquettes :'}</span>
                <span className="font-mono text-amber-400">{stickerSize}</span>
              </div>

              {expandedStickers.length === 0 ? (
                <div className="py-16 text-center text-xs text-neutral-500">
                  {isAr
                    ? 'اختر منتجاً واحداً أو أكثر من القائمة الجانبية لمعاينة وطباعة الستيكرات'
                    : 'Sélectionnez un ou plusieurs produits à gauche pour générer les étiquettes'}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 justify-center">
                  {expandedStickers.map((st, idx) => {
                    const barcodeSvg =
                      codeMode === 'barcode' || codeMode === 'both'
                        ? generateCode128Svg(st.code, {
                            height: 24,
                            moduleWidth: 1.15,
                            showText: false,
                          })
                        : '';
                    const qrUrl = qrMap[st.code];

                    return (
                      <div
                        key={`${st.id}_${idx}`}
                        className="bg-white text-black rounded-md shadow-md border border-neutral-300 p-2 flex flex-col justify-between items-center text-center"
                        style={{
                          width: stickerSize === '38x25mm' ? '165px' : '210px',
                          height: stickerSize === '38x25mm' ? '108px' : '126px',
                        }}
                      >
                        <div className="w-full leading-tight">
                          {showStoreName && storeName && (
                            <div className="text-[8px] font-bold uppercase tracking-wider text-neutral-700 truncate">
                              {storeName}
                            </div>
                          )}
                          <div className="text-[10px] font-extrabold truncate w-full">
                            {st.productName}
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 w-full my-0.5">
                          {(codeMode === 'qr' || codeMode === 'both') && qrUrl && (
                            <img
                              src={qrUrl}
                              alt="QR"
                              className={
                                codeMode === 'qr'
                                  ? 'w-11 h-11 object-contain'
                                  : 'w-9 h-9 object-contain shrink-0'
                              }
                            />
                          )}
                          {(codeMode === 'barcode' || codeMode === 'both') && (
                            <div
                              className="flex-1 overflow-hidden"
                              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                            />
                          )}
                        </div>

                        <div className="w-full flex items-center justify-between gap-1 font-mono leading-none pt-0.5 border-t border-neutral-200">
                          <span className="text-[9px] font-bold truncate">{st.code}</span>
                          {showPrice && (
                            <span className="text-[10px] font-black bg-black text-white px-1.5 py-0.5 rounded-xs shrink-0">
                              {st.price} DH
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-400">
            {expandedStickers.length}{' '}
            {isAr ? 'ملصق جاهز للطباعة' : 'étiquette(s) prête(s) à imprimer'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition"
            >
              {isAr ? 'إغلاق' : 'Fermer'}
            </button>
            <button
              type="button"
              disabled={expandedStickers.length === 0}
              onClick={handlePrintStickers}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-black text-xs transition shadow-md active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>
                {isAr
                  ? `طباعة الستيكرات (${expandedStickers.length})`
                  : `Imprimer (${expandedStickers.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
