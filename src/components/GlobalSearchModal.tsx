import React, { useState, useEffect } from 'react';
import { Search, Smartphone, FileText, User, Hash, ArrowRight, Wrench } from 'lucide-react';
import { db, getNetTotal } from '../db';
import { Product, Sale, Customer, RepairOrder } from '../types';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { ScanButton } from './ScanButton';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: any, params?: any) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);
  const [matchedSales, setMatchedSales] = useState<Sale[]>([]);
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [matchedRepairs, setMatchedRepairs] = useState<RepairOrder[]>([]);
  const [matchedImeis, setMatchedImeis] = useState<{ product: Product; imei: string; status: string }[]>([]);
  const { t, language } = useI18n();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setMatchedProducts([]);
      setMatchedSales([]);
      setMatchedCustomers([]);
      setMatchedImeis([]);
      setMatchedRepairs([]);
      return;
    }

    const q = query.toLowerCase().trim();
    let isCancelled = false;

    async function executeSearch() {
      // Products search (name or barcode)
      const allProducts = (await db.products.toArray()).filter((p) => !p.deleted_at);
      const prods = allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );

      // Search across IMEIs
      const imeiMatches: { product: Product; imei: string; status: string }[] = [];
      allProducts.forEach((p) => {
        if (p.imeiList) {
          p.imeiList.forEach((item) => {
            if (item.imei.includes(q)) {
              imeiMatches.push({ product: p, imei: item.imei, status: item.status });
            }
          });
        }
      });

      // Customers search
      const custs = await db.customers
        .filter(
          (c) =>
            !c.deleted_at &&
            (c.name.toLowerCase().includes(q) ||
              c.phone.includes(q) ||
              (c.CIN ? c.CIN.toLowerCase().includes(q) : false))
        )
        .toArray();

      // Sales search (including provisionalNumber N2)
      const sales = await db.sales
        .filter(
          (s) =>
            !s.deleted_at &&
            (s.bonNumber.toLowerCase().includes(q) ||
              Boolean(s.provisionalNumber && s.provisionalNumber.toLowerCase().includes(q)) ||
              s.customerName.toLowerCase().includes(q) ||
              (s.customerPhone ? s.customerPhone.includes(q) : false))
        )
        .toArray();

      // Repairs search (including provisionalNumber N2)
      const reps = await db.repairs
        .filter(
          (r) =>
            !r.deleted_at &&
            (r.repairNumber.toLowerCase().includes(q) ||
              Boolean(r.provisionalNumber && r.provisionalNumber.toLowerCase().includes(q)) ||
              r.customerName.toLowerCase().includes(q) ||
              r.customerPhone.includes(q) ||
              r.brand.toLowerCase().includes(q) ||
              r.model.toLowerCase().includes(q) ||
              (r.imei ? r.imei.toLowerCase().includes(q) : false))
        )
        .toArray();

      if (!isCancelled) {
        setMatchedProducts(prods.slice(0, 5));
        setMatchedImeis(imeiMatches.slice(0, 5));
        setMatchedCustomers(custs.slice(0, 5));
        setMatchedSales(sales.slice(0, 5));
        setMatchedRepairs(reps.slice(0, 5));
      }
    }

    executeSearch();
    return () => {
      isCancelled = true;
    };
  }, [query]);

  if (!isOpen) return null;

  const totalResults =
    matchedProducts.length +
    matchedImeis.length +
    matchedCustomers.length +
    matchedSales.length +
    matchedRepairs.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-amber-500/35 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),0_0_24px_rgba(212,175,55,0.12)] overflow-hidden z-10 flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-amber-500/20 bg-neutral-950">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-transparent border-0 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-hidden"
          />
          <ScanButton
            onScan={(code) => setQuery(code.trim())}
            mode="any"
            variant="inline"
            size="md"
          />
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded hover:text-neutral-200"
          >
            ESC
          </button>
        </div>

        {/* Search Results Container */}
        <div className="p-4 overflow-y-auto space-y-4">
          {query.trim().length < 2 && (
            <div className="text-center py-8 text-neutral-500 text-xs">
              {t.dashboard.quickSearchTitle} (ex: 35987, iPhone, G-0001, Youssef...)
            </div>
          )}

          {query.trim().length >= 2 && totalResults === 0 && (
            <div className="text-center py-8 text-neutral-500 text-xs">
              {t.noData}
            </div>
          )}

          {/* IMEI Results */}
          {matchedImeis.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                <span>IMEI ({matchedImeis.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedImeis.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onNavigate('stock', { search: item.imei });
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-800 cursor-pointer transition text-xs"
                  >
                    <div>
                      <div className="font-mono font-medium text-amber-300">
                        {item.imei}
                      </div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        {item.product.name}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.status === 'in_stock'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {item.status === 'in_stock' ? t.stock.inStock : t.stock.sold}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products Results */}
          {matchedProducts.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>{t.nav.stock} ({matchedProducts.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onNavigate('stock', { search: p.name });
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-800 cursor-pointer transition text-xs"
                  >
                    <div>
                      <div className="font-medium text-neutral-100">{p.name}</div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        Stock: {p.quantity} {p.barcode ? `· ${p.barcode}` : ''}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-mono font-semibold text-neutral-200">
                        {formatMAD(p.retailPrice, language)}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Achat: {formatMAD(p.purchasePrice, language)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales Bons Results */}
          {matchedSales.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>{t.nav.bons} ({matchedSales.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedSales.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => {
                      onNavigate('bons', { search: s.bonNumber });
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-800 cursor-pointer transition text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-amber-400">{s.bonNumber}</div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        {s.customerName} · {s.date}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-mono font-bold text-neutral-100">
                        {formatMAD(getNetTotal(s), language)}
                      </div>
                      {s.remainingAmount > 0 ? (
                        <div className="text-[10px] text-rose-400 font-semibold">
                          Reste: {formatMAD(s.remainingAmount, language)}
                        </div>
                      ) : (
                        <div className="text-[10px] text-emerald-400">Soldé</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customers Results */}
          {matchedCustomers.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{t.nav.customers} ({matchedCustomers.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedCustomers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onNavigate('customers', { search: c.name });
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-800 cursor-pointer transition text-xs"
                  >
                    <div>
                      <div className="font-medium text-neutral-100">{c.name}</div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        {c.phone} {c.CIN ? `· CIN: ${c.CIN}` : ''}
                      </div>
                    </div>
                    <div className="text-end">
                      {c.totalCredit > 0 ? (
                        <span className="font-mono text-rose-400 font-semibold">
                          Crédit: {formatMAD(c.totalCredit, language)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-400">0 DH</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repairs Results */}
          {matchedRepairs.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />
                <span>{t.nav.repairs} ({matchedRepairs.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedRepairs.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      onNavigate('repairs', { search: r.repairNumber });
                      onClose();
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-800 cursor-pointer transition text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{r.repairNumber}</span>
                        <span className="font-semibold text-neutral-100">{r.brand} {r.model}</span>
                      </div>
                      <div className="text-neutral-400 text-[11px] mt-0.5">
                        {r.customerName} · {r.customerPhone} {r.imei ? `· IMEI: ${r.imei}` : ''}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-mono font-bold text-neutral-100">
                        {formatMAD(r.agreedPrice, language)}
                      </div>
                      <div className={`text-[10px] font-semibold ${
                        r.status === 'ready'
                          ? 'text-emerald-400'
                          : r.status === 'delivered'
                          ? 'text-blue-400'
                          : 'text-amber-400'
                      }`}>
                        {r.status === 'ready'
                          ? (language === 'ar' ? 'واجد' : 'Prêt')
                          : r.status === 'delivered'
                          ? (language === 'ar' ? 'تسلم' : 'Livré')
                          : (language === 'ar' ? 'قيد المعالجة' : 'En cours')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
