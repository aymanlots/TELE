import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ShieldCheck,
  Search,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Smartphone,
  FileText,
  User,
  Calendar,
  MessageSquare,
  Phone,
} from 'lucide-react';
import { db, withSyncMetadata, queueOutboxOperation } from '../db';
import { Warranty, SavTicket, SavTicketStatus } from '../types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { getMoroccoDateString } from '../lib/dateUtils';
import { useViewMode } from '../lib/viewMode';
import { ScanButton } from '../components/ScanButton';
import { openWhatsAppChat } from '../lib/whatsapp';

export const WarrantySavPage: React.FC = () => {
  const { t, language } = useI18n();
  const { success, error } = useToast();
  const { isMobileMode } = useViewMode();

  // Store settings for custom store name in WhatsApp messages
  const storeSettings = useLiveQuery(async () => {
    try {
      const record = await db.settings.get('store_settings');
      return record?.value;
    } catch {
      return null;
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);

  // New SAV Ticket Modal
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketIssue, setTicketIssue] = useState('');
  const [ticketCustomerName, setTicketCustomerName] = useState('');
  const [ticketCustomerPhone, setTicketCustomerPhone] = useState('');
  const [ticketProductName, setTicketProductName] = useState('');
  const [ticketImei, setTicketImei] = useState('');

  // Resolve Ticket Modal
  const [resolvingTicket, setResolvingTicket] = useState<SavTicket | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [repairCost, setRepairCost] = useState<number>(0);

  // Live queries
  const warranties =
    useLiveQuery(
      () => db.warranties.toArray().then((arr) => arr.filter((w) => !w.deleted_at)),
      []
    ) || [];
  const sales =
    useLiveQuery(
      () => db.sales.toArray().then((arr) => arr.filter((s) => !s.deleted_at)),
      []
    ) || [];
  const savTickets =
    useLiveQuery(
      () =>
        db.savTickets
          .orderBy('id')
          .reverse()
          .toArray()
          .then((arr) => arr.filter((t) => !t.deleted_at)),
      []
    ) || [];

  // Check Days Left for a warranty
  const getWarrantyDaysLeft = (endDateStr: string): number => {
    const end = new Date(endDateStr);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Perform Warranty Search (N2: searches in warranties AND sales including provisionalNumber)
  const handleSearchWarranty = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      setSelectedWarranty(null);
      return;
    }

    const matchingSaleByProvisional = sales.find(
      (s) =>
        s.bonNumber.toLowerCase() === q ||
        (s.provisionalNumber && s.provisionalNumber.toLowerCase() === q)
    );

    const found = warranties.find(
      (w) =>
        (w.imei && w.imei.toLowerCase() === q) ||
        w.bonNumber.toLowerCase() === q ||
        (w.provisionalNumber && w.provisionalNumber.toLowerCase() === q) ||
        (matchingSaleByProvisional &&
          (w.saleId === matchingSaleByProvisional.id ||
            (matchingSaleByProvisional.uuid && w.saleUuid === matchingSaleByProvisional.uuid) ||
            w.bonNumber === matchingSaleByProvisional.bonNumber)) ||
        (w.customerPhone && w.customerPhone.includes(q))
    );

    if (found) {
      setSelectedWarranty(found);
      success("Garantie trouvée pour ce numéro !");
    } else {
      setSelectedWarranty(null);
      error("Aucune garantie trouvée pour ce numéro IMEI ou Bon.");
    }
  };

  // Pre-fill and open Create SAV ticket
  const handleOpenCreateTicket = (w?: Warranty) => {
    if (w) {
      setTicketCustomerName(w.customerName);
      setTicketCustomerPhone(w.customerPhone || '');
      setTicketProductName(w.productName);
      setTicketImei(w.imei || '');
    } else {
      setTicketCustomerName('');
      setTicketCustomerPhone('');
      setTicketProductName('');
      setTicketImei('');
    }
    setTicketIssue('');
    setIsTicketModalOpen(true);
  };

  // Save SAV Ticket
  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketIssue.trim() || !ticketCustomerName.trim()) {
      error("Veuillez renseigner le nom et le descriptif de la panne.");
      return;
    }

    try {
      const payload = withSyncMetadata<SavTicket>({
        warrantyId: selectedWarranty?.id,
        bonNumber: selectedWarranty?.bonNumber,
        imei: ticketImei.trim() || undefined,
        customerName: ticketCustomerName.trim(),
        customerPhone: ticketCustomerPhone.trim() || undefined,
        productName: ticketProductName.trim() || undefined,
        issue: ticketIssue.trim(),
        status: 'open',
        createdAt: getMoroccoDateString(),
      });
      const id = await db.savTickets.add(payload);
      await queueOutboxOperation('sav_tickets', 'insert', { ...payload, id });
      success("Ticket SAV ouvert avec succès.");
      setIsTicketModalOpen(false);
      setTicketIssue('');
    } catch {
      error("Erreur lors de la création du ticket SAV.");
    }
  };

  // Update Ticket Status
  const handleUpdateStatus = async (ticket: SavTicket, nextStatus: SavTicketStatus) => {
    if (!ticket.id) return;
    if (nextStatus === 'resolved') {
      setResolvingTicket(ticket);
      setResolutionNotes(ticket.resolutionNotes || '');
      setRepairCost(ticket.cost || 0);
      return;
    }

    try {
      const updated = withSyncMetadata({ ...ticket, status: nextStatus });
      await db.savTickets.put(updated);
      await queueOutboxOperation('sav_tickets', 'update', updated);
      success(`Statut mis à jour : ${nextStatus}`);
    } catch {
      error("Erreur lors de la mise à jour du statut.");
    }
  };

  // Confirm Resolve Ticket
  const handleConfirmResolve = async () => {
    if (!resolvingTicket?.id) return;
    try {
      const updated = withSyncMetadata({
        ...resolvingTicket,
        status: 'resolved' as const,
        resolvedAt: getMoroccoDateString(),
        resolutionNotes: resolutionNotes.trim() || undefined,
        cost: repairCost || undefined,
      });
      await db.savTickets.put(updated);
      await queueOutboxOperation('sav_tickets', 'update', updated);
      success("Ticket SAV marqué comme résolu et restitué.");
      setResolvingTicket(null);
    } catch {
      error("Erreur lors de la clôture du ticket.");
    }
  };

  // Send customer WhatsApp notification for repairs
  const handleSendWhatsApp = (ticket: SavTicket) => {
    if (!ticket.customerPhone) {
      error(language === 'ar' ? 'ما كاينش رقم الهاتف ديال الزبون' : 'Numéro de téléphone du client manquant.');
      return;
    }
    const storeTitle = storeSettings?.storeName?.trim() || (language === 'ar' ? 'المحل' : 'notre magasin');
    
    let statusText = '';
    if (ticket.status === 'resolved') {
      statusText = language === 'ar' ? 'راه واجد ومصلوح ناضي، تقدرو تجيو تاخدوه فالمحل' : 'est réparé et prêt à être récupéré';
    } else if (ticket.status === 'in_progress') {
      statusText = language === 'ar' ? 'راه دابا قيد الإصلاح وغادي نعلموكم ملي يسالي' : 'est actuellement en cours de réparation';
    } else {
      statusText = language === 'ar' ? 'راه مسجل فالمحل وغادي يبدا فيه المعلم قريباً' : 'a bien été enregistré et pris en charge';
    }

    const message = language === 'ar'
      ? `السلام عليكم ${ticket.customerName || ''}، معكم محل ${storeTitle}. كنعلموكم بلي الجهاز ديالكم (${ticket.productName || 'التيليفون'}) ${statusText}.${ticket.cost ? ' تكلفة الإصلاح: ' + ticket.cost + ' درهم.' : ''} شكراً لثقتكم.`
      : `Bonjour ${ticket.customerName || ''}, ici ${storeTitle}. Votre appareil (${ticket.productName || 'Téléphone'}) ${statusText}.${ticket.cost ? ' Montant: ' + ticket.cost + ' DH.' : ''} Merci de votre confiance.`;

    openWhatsAppChat(ticket.customerPhone, message);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-neutral-900 border border-amber-500/20 shadow-xl shadow-black/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gold-gradient tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-400 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />
            <span>{t.warranty.title}</span>
          </h1>
          <p className="text-xs text-neutral-300 mt-1 font-medium">
            {language === 'ar' ? 'التحقق من الضمان وتتبع الإصلاحات وإشعار الزبون بالواتساب' : 'Vérifiez l\'éligibilité de garantie par IMEI ou N° Bon et suivez les interventions techniques'}
          </p>
        </div>
        <button
          onClick={() => handleOpenCreateTicket()}
          className={`flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-sm active:scale-95 shrink-0 ${
            isMobileMode ? 'w-full py-3.5 px-4 text-sm min-h-[48px]' : 'px-3.5 py-2 text-xs'
          }`}
        >
          <Plus className={isMobileMode ? "w-5 h-5" : "w-4 h-4"} />
          <span>{t.warranty.createTicket}</span>
        </button>
      </div>

      {/* Warranty Search Checker Section */}
      <div className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-200">
          {t.warranty.searchHelper}
        </h2>
        <form onSubmit={handleSearchWarranty} className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Saisissez un IMEI (15 chiffres) ou N° Bon (ex: G-0001)..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>
            <ScanButton
              onScan={(scannedCode) => {
                const code = scannedCode.trim();
                setSearchQuery(code);
                const q = code.toLowerCase();
                const found = warranties.find(
                  (w) =>
                    (w.imei && w.imei.toLowerCase() === q) ||
                    w.bonNumber.toLowerCase() === q ||
                    (w.customerPhone && w.customerPhone.includes(q))
                );
                if (found) {
                  setSelectedWarranty(found);
                  success("Garantie trouvée pour ce numéro !");
                } else {
                  setSelectedWarranty(null);
                  error("Aucune garantie trouvée pour ce numéro IMEI ou Bon.");
                }
              }}
              mode="any"
              size="md"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition shrink-0"
          >
            {t.warranty.checkButton}
          </button>
        </form>

        {/* Search Result Card */}
        {selectedWarranty && (
          <div className="p-4 rounded-xl bg-neutral-950 border border-amber-500/30 mt-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold font-mono">
                  {selectedWarranty.bonNumber}
                </span>
                <h3 className="text-sm font-bold text-neutral-100 mt-0.5">
                  {selectedWarranty.productName}
                </h3>
              </div>

              {/* Status Badge & Days left */}
              {(() => {
                const days = getWarrantyDaysLeft(selectedWarranty.endDate);
                const isActive = days > 0 && selectedWarranty.status === 'active';
                return (
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}
                    >
                      {isActive ? t.warranty.active : t.warranty.expired}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      {isActive ? `${days} ${t.warranty.daysLeft}` : 'Expirée'}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-neutral-500 block">IMEI</span>
                <span className="font-mono text-neutral-200">{selectedWarranty.imei || '-'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Client</span>
                <span className="font-medium text-neutral-200">{selectedWarranty.customerName}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Début</span>
                <span className="font-mono text-neutral-200">{selectedWarranty.startDate}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Fin</span>
                <span className="font-mono text-neutral-200">{selectedWarranty.endDate}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => handleOpenCreateTicket(selectedWarranty)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 font-semibold text-xs rounded-lg transition"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Ouvrir ticket SAV pour cet appareil</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SAV Tickets List */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-100 flex items-center justify-between">
          <span>{t.warranty.ticketsList}</span>
          <span className="text-xs font-mono text-amber-400">
            {savTickets.filter((t) => t.status !== 'resolved').length} en cours
          </span>
        </h2>

        {savTickets.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 flex flex-col items-center justify-center gap-2.5">
            <Wrench className="w-8 h-8 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-300">
              {language === 'ar' ? 'ما كاين والو، فتح أول تذكرة إصلاح أو ضمان' : 'Aucun ticket SAV enregistré pour le moment.'}
            </p>
            <button
              onClick={() => handleOpenCreateTicket()}
              className="mt-1 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.warranty.createTicket}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {savTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-amber-400">
                      {ticket.bonNumber || 'Sans Bon'}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="font-semibold text-neutral-200">{ticket.customerName}</span>
                    {ticket.customerPhone && (
                      <span className="text-neutral-400 font-mono text-[11px]">
                        ({ticket.customerPhone})
                      </span>
                    )}
                    <span className="text-neutral-500">·</span>
                    <span className="text-neutral-400 text-[11px]">{ticket.createdAt}</span>
                  </div>

                  <div className="text-neutral-300 font-medium">
                    {ticket.productName} {ticket.imei ? `(IMEI: ${ticket.imei})` : ''}
                  </div>

                  <p className="text-neutral-400 text-[11px] bg-neutral-900/60 p-2 rounded border border-neutral-800/80">
                    <strong>Panne : </strong> {ticket.issue}
                  </p>

                  {ticket.resolutionNotes && (
                    <p className="text-emerald-400 text-[11px] bg-emerald-950/20 p-2 rounded border border-emerald-900/30">
                      <strong>Rapport : </strong> {ticket.resolutionNotes}{' '}
                      {ticket.cost ? `· Frais: ${formatMAD(ticket.cost, language)}` : ''}
                    </p>
                  )}
                </div>

                {/* Status Switcher & WhatsApp Workflow */}
                <div className={`flex items-stretch sm:items-center gap-2 shrink-0 ${isMobileMode ? 'flex-col w-full' : 'flex-row'}`}>
                  <div className={`grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800 ${isMobileMode ? 'w-full' : ''}`}>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ticket, 'open')}
                      className={`rounded-lg transition font-bold flex items-center justify-center text-center ${
                        isMobileMode ? 'py-2.5 px-2 text-xs min-h-[40px]' : 'px-2.5 py-1 text-[11px]'
                      } ${
                        ticket.status === 'open'
                          ? 'bg-amber-500 text-neutral-950'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {language === 'ar' ? 'فـ الإنتظار' : 'En Attente'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ticket, 'in_progress')}
                      className={`rounded-lg transition font-bold flex items-center justify-center text-center ${
                        isMobileMode ? 'py-2.5 px-2 text-xs min-h-[40px]' : 'px-2.5 py-1 text-[11px]'
                      } ${
                        ticket.status === 'in_progress'
                          ? 'bg-amber-500 text-neutral-950'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {language === 'ar' ? 'فـ الإصلاح' : 'En Cours'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(ticket, 'resolved')}
                      className={`rounded-lg transition font-bold flex items-center justify-center text-center ${
                        isMobileMode ? 'py-2.5 px-2 text-xs min-h-[40px]' : 'px-2.5 py-1 text-[11px]'
                      } ${
                        ticket.status === 'resolved'
                          ? 'bg-emerald-500 text-neutral-950'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {language === 'ar' ? 'مصلوح' : 'Réparé'}
                    </button>
                  </div>

                  {ticket.customerPhone && (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(ticket)}
                      className={`rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 font-bold flex items-center justify-center gap-1.5 transition active:scale-95 ${
                        isMobileMode ? 'w-full py-3 text-xs min-h-[44px]' : 'px-3 py-1.5 text-[11px]'
                      }`}
                      title={language === 'ar' ? 'إشعار الزبون فـ الواتساب' : 'Informer le client par WhatsApp'}
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'ar' ? 'إشعار بالواتساب' : 'WhatsApp'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New SAV Ticket Modal */}
      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title={t.warranty.createTicket}
        maxWidth="md"
      >
        <form onSubmit={handleSaveTicket} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Nom du client *</label>
            <input
              type="text"
              required
              value={ticketCustomerName}
              onChange={(e) => setTicketCustomerName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">Téléphone</label>
            <input
              type="text"
              value={ticketCustomerPhone}
              onChange={(e) => setTicketCustomerPhone(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">Appareil concerné</label>
            <input
              type="text"
              value={ticketProductName}
              onChange={(e) => setTicketProductName(e.target.value)}
              placeholder="ex: iPhone 15 Pro, Smart TV LG..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">Numéro IMEI (si téléphone)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ticketImei}
                onChange={(e) => setTicketImei(e.target.value)}
                placeholder="359876543210123"
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
              <ScanButton
                onScan={(code) => {
                  setTicketImei(code.trim());
                  success(`IMEI: ${code.trim()}`);
                }}
                mode="imei"
                size="md"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">{t.warranty.ticketIssue} *</label>
            <textarea
              rows={3}
              required
              value={ticketIssue}
              onChange={(e) => setTicketIssue(e.target.value)}
              placeholder="Décrivez précisément la panne constatée par le client..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setIsTicketModalOpen(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              Créer le dossier SAV
            </button>
          </div>
        </form>
      </Modal>

      {/* Resolve Ticket Modal */}
      {resolvingTicket && (
        <Modal
          isOpen={true}
          onClose={() => setResolvingTicket(null)}
          title="Clôturer le Ticket SAV"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <p className="text-neutral-300">
              Veuillez saisir les détails de la réparation effectuée pour{' '}
              <strong>{resolvingTicket.customerName}</strong>.
            </p>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {t.warranty.resolutionNotes}
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Pièce remplacée, nettoyage, test concluant..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {t.warranty.repairCost} (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={repairCost}
                onChange={(e) => setRepairCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolvingTicket(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
              >
                {t.warranty.markResolved}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
