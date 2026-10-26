import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Send,
  CheckCircle2,
  XCircle,
  X,
  MessageCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useAccessAuth } from '../lib/accessAuth';
import { AdminApprovalRequest, ApprovalActionType } from '../types';
import {
  db,
  getStoreSettings,
  saveStoreSettings,
  deleteProductTransaction,
  deleteSparePart,
  updateSparePart,
  updateRepairAgreedPrice,
  cancelOrDeleteRepairOrder,
  deleteSaleTransaction,
  returnSaleItemTransaction,
  queueOutboxOperation,
} from '../db';
import { openWhatsAppChat } from '../lib/whatsapp';
import { useToast } from './Toast';

interface AdminApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApproved: () => void;
  actionType: ApprovalActionType;
  title?: string;
  description?: string;
  targetLabel?: string;
  details?: string;
  targetId?: number;
  payload?: any;
}

export const AdminApprovalModal: React.FC<AdminApprovalModalProps> = ({
  isOpen,
  onClose,
  onApproved,
  actionType,
  title,
  description,
  targetLabel,
  details,
  targetId,
  payload,
}) => {
  const { verifyAdminPasswordOnly, submitAdminApprovalRequest } = useAccessAuth();
  const { success, error } = useToast();

  const [adminPassword, setAdminPassword] = useState('');
  const [workerNote, setWorkerNote] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingReq, setIsSendingReq] = useState(false);

  if (!isOpen) return null;

  const resolvedTitle = title || targetLabel || 'طلب موافقة الأدمين';
  const resolvedDescription = description || details || '';

  const handleInstantApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      error('المرجو إدخال كلمة مرور الأدمين للموافقة الفورية.');
      return;
    }
    setIsVerifying(true);
    try {
      const ok = await verifyAdminPasswordOnly(adminPassword.trim());
      if (ok) {
        success('تمت موافقة الأدمين بنجاح!');
        setAdminPassword('');
        onClose();
        onApproved();
      } else {
        error('كلمة مرور الأدمين غير صحيحة.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendApprovalRequest = async (notifyWhatsApp: boolean) => {
    setIsSendingReq(true);
    try {
      const fullDesc = workerNote.trim()
        ? `${resolvedDescription} — ملاحظة العامل: ${workerNote.trim()}`
        : resolvedDescription;

      await submitAdminApprovalRequest({
        actionType,
        title: resolvedTitle,
        description: fullDesc,
        targetId,
        payload,
      });

      if (notifyWhatsApp) {
        const settings = await getStoreSettings();
        const adminPhone = settings.adminPhone || settings.phone;
        const workerName = localStorage.getItem('golden_shop_user_name') || 'العامل';
        if (adminPhone) {
          const msg =
            `🔔 *طلب موافقة من العامل (${workerName})*\n` +
            `📌 العملية: *${resolvedTitle}*\n` +
            `📝 التفاصيل: ${fullDesc}\n\n` +
            `يرجى الدخول لحساب الأدمين للموافقة أو الرفض.`;
          openWhatsAppChat(adminPhone, msg);
        }
      }

      success('تم إرسال طلب الموافقة للأدمين بنجاح!');
      setWorkerNote('');
      onClose();
    } catch {
      error('تعذر إرسال طلب الموافقة.');
    } finally {
      setIsSendingReq(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-black/85 backdrop-blur-2xl border border-yellow-500/35 rounded-[24px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)] space-y-4 text-white">
        <div className="flex items-center justify-between border-b border-yellow-500/20 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-yellow-500/40 text-[#FFD700]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#FFD700]">موافقة الأدمين مطلوبة</h3>
              <p className="text-[11px] text-gray-300">
                العامل لا يمكنه تعديل أو حذف البيانات بدون موافقة الأدمين
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Summary Box */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-yellow-500/20 space-y-1">
          <div className="text-xs font-extrabold text-[#FFD700]">{resolvedTitle}</div>
          <div className="text-xs text-gray-200 leading-relaxed">{resolvedDescription}</div>
        </div>

        {/* Option 1: Instant Admin Password Override */}
        <form onSubmit={handleInstantApprove} className="p-4 rounded-2xl bg-black/70 border border-yellow-500/25 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-black text-white">
            <KeyRound className="w-4 h-4 text-[#FFD700]" />
            <span>الخيار 1: موافقة فورية بكلمة مرور الأدمين</span>
          </div>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="أدخل كلمة مرور أو كود الأدمين هنا..."
            className="w-full bg-black/80 border border-yellow-500/30 focus:border-[#FFD700] rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-gray-500 focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={isVerifying}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black text-xs shadow-[0_4px_15px_rgba(255,215,0,0.3)] hover:from-yellow-400 hover:to-amber-200 transition cursor-pointer"
          >
            {isVerifying ? 'جاري التحقق...' : 'تأكيد موافقة الأدمين وتنفيذ التعديل الآن'}
          </button>
        </form>

        {/* Option 2: Send Request to Admin Queue (+ Optional WhatsApp) */}
        <div className="p-4 rounded-2xl bg-black/70 border border-white/15 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-400">
            <Send className="w-4 h-4" />
            <span>الخيار 2: إرسال طلب موافقة للأدمين عن بعد</span>
          </div>
          <input
            type="text"
            value={workerNote}
            onChange={(e) => setWorkerNote(e.target.value)}
            placeholder="سبب التعديل أو ملاحظة للأدمين (اختياري)..."
            className="w-full bg-black/80 border border-white/15 focus:border-emerald-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-hidden"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isSendingReq}
              onClick={() => handleSendApprovalRequest(false)}
              className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-yellow-500/30 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>إرسال الطلب للتطبيق</span>
            </button>
            <button
              type="button"
              disabled={isSendingReq}
              onClick={() => handleSendApprovalRequest(true)}
              className="py-2.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>إرسال + إشعار واتساب</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface AdminApprovalsQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: AdminApprovalRequest[];
}

export const AdminApprovalsQueueModal: React.FC<AdminApprovalsQueueModalProps> = ({
  isOpen,
  onClose,
  requests,
}) => {
  const { success, error } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const pendingList = requests.filter((r) => r.status === 'pending');

  const handleResolveRequest = async (req: AdminApprovalRequest, approve: boolean) => {
    setProcessingId(req.id);
    try {
      if (approve) {
        // Execute the requested operation if payload/targetId is provided
        if (req.actionType === 'delete_product' && req.targetId) {
          await deleteProductTransaction(req.targetId);
        } else if (req.actionType === 'edit_product' && req.targetId && req.payload) {
          await db.products.put({ ...req.payload, id: req.targetId });
          await queueOutboxOperation('products', 'update', { ...req.payload, id: req.targetId });
        } else if (req.actionType === 'delete_spare_part' && req.targetId) {
          await deleteSparePart(req.targetId);
        } else if (req.actionType === 'edit_spare_part' && req.targetId && req.payload) {
          await updateSparePart(req.targetId, req.payload);
        } else if (req.actionType === 'edit_repair_price' && req.targetId && req.payload) {
          await updateRepairAgreedPrice(
            req.targetId,
            Number(req.payload.agreedPrice) || 0,
            req.payload.technicianNotes
          );
        } else if (req.actionType === 'delete_repair' && req.targetId) {
          await cancelOrDeleteRepairOrder(req.targetId);
        } else if (req.actionType === 'delete_sale' && req.targetId) {
          await deleteSaleTransaction(req.targetId);
        } else if (
          req.actionType === 'return_sale_item' &&
          req.targetId &&
          req.payload?.itemIndex !== undefined
        ) {
          await returnSaleItemTransaction(
            req.targetId,
            req.payload.itemIndex,
            req.payload.notes || ''
          );
        }
      }

      const settings = await getStoreSettings();
      const updated = (settings.pendingApprovals || []).map((item) =>
        item.id === req.id
          ? { ...item, status: (approve ? 'approved' : 'rejected') as 'approved' | 'rejected' }
          : item
      );
      await saveStoreSettings({ ...settings, pendingApprovals: updated });

      success(
        approve
          ? `تمت الموافقة وتنفيذ الطلب: ${req.title}`
          : `تم رفض طلب العامل: ${req.title}`
      );
    } catch (err: any) {
      error(err?.message || 'حدث خطأ أثناء معالجة الطلب.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-black/85 backdrop-blur-2xl border border-yellow-500/35 rounded-[24px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)] space-y-4 text-white max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-yellow-500/20 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-yellow-500/40 text-[#FFD700]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#FFD700]">
                طلبات موافقة العمال ({pendingList.length})
              </h3>
              <p className="text-[11px] text-gray-300">
                راجع طلبات التعديل أو الحذف المرسلة من طرف العامل ووافق عليها بكليكة واحدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pe-1">
          {pendingList.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
              <p className="font-bold text-white">لا توجد طلبات معلقة حالياً</p>
              <p>جميع عمليات التعديل تحت سيطرة الأدمين.</p>
            </div>
          ) : (
            pendingList.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-black/70 border border-yellow-500/25 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-[#FFD700]">{req.title}</span>
                  <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#FFD700]" />
                    <span>{new Date(req.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>
                <p className="text-xs text-gray-200 leading-relaxed">{req.description}</p>
                <div className="text-[11px] text-gray-400">
                  مرسل من طرف: <span className="font-bold text-white">{req.requestedBy}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    disabled={processingId === req.id}
                    onClick={() => handleResolveRequest(req, true)}
                    className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                    <span>موافقة وتنفيذ</span>
                  </button>
                  <button
                    type="button"
                    disabled={processingId === req.id}
                    onClick={() => handleResolveRequest(req, false)}
                    className="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>رفض الطلب</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
