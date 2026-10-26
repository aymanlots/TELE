/**
 * WhatsApp Helper Utilities & Templates
 * Generates direct wa.me links with smart Moroccan phone international conversion
 * and variable replacement.
 */

import { WhatsAppTemplates, RepairOrder, RepairStatus } from '../types';

export interface RepairTrackPayload {
  r: string; // repairNumber
  c: string; // customerName
  p?: string; // customerPhone
  d: string; // device (brand + model)
  i: string; // issue
  s: RepairStatus; // status
  t: number; // agreedPrice
  a: number; // depositAmount
  m: number; // remainingAmount
  dt: string; // intakeDate
  ed?: string; // expectedDeliveryDate
  sn?: string; // storeName
  sp?: string; // storePhone
}

/**
 * Encode a RepairOrder into a self-contained + live-syncable tracking URL
 */
export function buildRepairTrackingUrl(
  repair: RepairOrder,
  storeName?: string,
  storePhone?: string
): string {
  const payload: RepairTrackPayload = {
    r: repair.repairNumber,
    c: repair.customerName,
    p: repair.customerPhone,
    d: `${repair.brand} ${repair.model}`.trim(),
    i: repair.issue,
    s: repair.status,
    t: Number(repair.agreedPrice) || 0,
    a: Number(repair.depositAmount) || 0,
    m: repair.status === 'delivered' ? 0 : Number(repair.remainingAmount) || 0,
    dt: repair.intakeDate,
    ed: repair.expectedDeliveryDate,
    sn: storeName?.trim() || undefined,
    sp: storePhone?.trim() || undefined,
  };

  try {
    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(jsonStr));
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : '';
    return `${origin}/?track_repair=${encodeURIComponent(encoded)}&no=${encodeURIComponent(
      repair.repairNumber
    )}`;
  } catch {
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : '';
    return `${origin}/?track_repair=${encodeURIComponent(repair.repairNumber)}&no=${encodeURIComponent(
      repair.repairNumber
    )}`;
  }
}

/**
 * Decode a ?track_repair= parameter back into RepairTrackPayload
 */
export function decodeRepairTrackingPayload(rawParam: string): RepairTrackPayload | null {
  if (!rawParam) return null;
  try {
    const decodedJson = decodeURIComponent(atob(decodeURIComponent(rawParam)));
    const parsed = JSON.parse(decodedJson);
    if (parsed && typeof parsed === 'object' && parsed.r) {
      return parsed as RepairTrackPayload;
    }
  } catch {
    // Fallback if rawParam is just a repairNumber like R-0001
  }
  return null;
}

export const DEFAULT_WHATSAPP_TEMPLATES_AR: Required<WhatsAppTemplates> = {
  repairReady:
    'السلام عليكم {اسم_الزبون} 👋\nكنخبروك باللي التيليفون ديالك ({الموديل}) راه واجد للإصلاح فـ {اسم_المحل} ✅\nالمبلغ المتبقي: {الباقي} درهم.\nمرحبا بك فـ أي وقت!',
  creditReminder:
    'السلام عليكم أخي/أختي {اسم_الزبون}،\nتذكير ودي بخصوص رصيد الكريدي المتبقي: {الباقي} درهم لدى {اسم_المحل}.\nشكراً لتفهمكم ومرحباً بكم في أي وقت!',
  saleReceipt:
    'شكراً لك {اسم_الزبون} على تعاملك مع {اسم_المحل} 🛍️\nتفاصيل وصل الشراء ({رقم_البون}):\nالمجموع: {المبلغ_الإجمالي} درهم.\nالباقي: {الباقي} درهم.\nبالصحة والراحة ومرحباً بك دائماً!',
};

export const DEFAULT_WHATSAPP_TEMPLATES_FR: Required<WhatsAppTemplates> = {
  repairReady:
    'Bonjour {client_name} 👋,\nVotre appareil ({modele}) est réparé et prêt à être récupéré chez {nom_magasin} ✅.\nReste à régler : {reste} MAD.\nBienvenue à tout moment !',
  creditReminder:
    'Bonjour {client_name},\nRappel amical concernant votre solde restant de {reste} MAD auprès de {nom_magasin}.\nMerci pour votre fidélité et à bientôt !',
  saleReceipt:
    'Merci pour votre achat chez {nom_magasin} 🛍️ !\nRécapitulatif de votre achat ({numero_bon}) :\nTotal : {montant_total} MAD.\nReste : {reste} MAD.\nÀ très bientôt !',
};

/**
 * Format any Moroccan or international phone number to pure digits international wa.me format
 * E.g.: 0612345678 -> 212612345678
 *       0712345678 -> 212712345678
 *       +212 612-345678 -> 212612345678
 */
export function formatWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  // Strip all non-digit characters
  let clean = phone.replace(/\D/g, '');
  if (!clean) return '';

  // Moroccan local mobile format starting with 06 or 07 (10 digits)
  if ((clean.startsWith('06') || clean.startsWith('07') || clean.startsWith('05')) && clean.length === 10) {
    clean = '212' + clean.slice(1);
  } else if ((clean.startsWith('6') || clean.startsWith('7') || clean.startsWith('5')) && clean.length === 9) {
    clean = '212' + clean;
  } else if (clean.startsWith('00212')) {
    clean = clean.slice(2);
  }

  return clean;
}

export const normalizeMoroccanPhone = formatWhatsAppPhone;

export interface TemplateVariables {
  clientName?: string;
  model?: string;
  remaining?: number | string;
  total?: number | string;
  storeName?: string;
  bonNumber?: string;
  repairNumber?: string;
  dueDate?: string;
}

/**
 * Replace placeholders like {اسم_الزبون}, {الموديل}, {الباقي}, {اسم_المحل} with real values
 */
export function renderWhatsAppMessage(
  template: string,
  variables: TemplateVariables
): string {
  let message = template;

  const clientName = variables.clientName?.trim() || '';
  const model = variables.model?.trim() || '';
  const remaining = variables.remaining !== undefined ? String(variables.remaining) : '0';
  const total = variables.total !== undefined ? String(variables.total) : '0';
  const storeName = variables.storeName?.trim() || 'PhoneStore';
  const rawBon = variables.bonNumber?.trim() || '';
  const bonNumber = rawBon.startsWith('G-L-') ? `${rawBon} (N° PROVISOIRE)` : rawBon;
  const rawRepair = variables.repairNumber?.trim() || '';
  const repairNumber = rawRepair.startsWith('R-L-') ? `${rawRepair} (N° PROVISOIRE)` : rawRepair;

  // Arabic variables
  message = message.replace(/\{اسم_الزبون\}/g, clientName);
  message = message.replace(/\{الموديل\}/g, model);
  message = message.replace(/\{الباقي\}/g, remaining);
  message = message.replace(/\{المبلغ_الإجمالي\}/g, total);
  message = message.replace(/\{اسم_المحل\}/g, storeName);
  message = message.replace(/\{رقم_البون\}/g, bonNumber);
  message = message.replace(/\{رقم_الإصلاح\}/g, repairNumber);

  // French variables
  message = message.replace(/\{client_name\}/g, clientName);
  message = message.replace(/\{modele\}/g, model);
  message = message.replace(/\{reste\}/g, remaining);
  message = message.replace(/\{montant_total\}/g, total);
  message = message.replace(/\{nom_magasin\}/g, storeName);
  message = message.replace(/\{numero_bon\}/g, bonNumber);
  message = message.replace(/\{numero_reparation\}/g, repairNumber);

  return message;
}

/**
 * Build direct wa.me link
 */
export function buildWhatsAppUrl(phone: string, text: string): string {
  const formatted = formatWhatsAppPhone(phone);
  if (!formatted) return '';
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${formatted}?text=${encoded}`;
}

/**
 * Safely trigger WhatsApp chat opening via dynamic link
 */
export function openWhatsAppChat(phone: string, text: string): boolean {
  const url = buildWhatsAppUrl(phone, text);
  if (!url) return false;

  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
