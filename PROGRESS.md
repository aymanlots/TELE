# PROGRESS - Golden Shop Manager

## PARTIE A : GARDES CÔTÉ BASE (`src/db/index.ts`)
- [x] A1. `createSaleTransaction` : gardes `Number.isFinite`, quantité <= 0, prix < 0, recalcul côté DB de `subtotal` / `totalAmount` / `remainingAmount`, `paidAmount > totalAmount`, `paidAmount < 0`, contrôle IMEI (non vide, pas de doublon dans le panier, `in_stock`), stock insuffisant, `remainingAmount > 0` sans client (`src/db/index.ts:720-785, 805-836`)
- [x] A2. `deliverRepairOrder` : anti double-livraison (`repair.status === 'delivered'`), vérification du montant restant, vente `REP-` avec `costPrice: partsCost` et `saleKind: 'repair_delivery'`, bénéfice compté une seule fois au jour et au mois (`src/db/index.ts:2463-2556` & `src/pages/DashboardPage.tsx:100-175`)
- [x] A3. Transactions atomiques : `returnSaleItemTransaction` (`src/db/index.ts:957-1093`), `registerCustomerPaymentAdvancedTransaction` (`src/db/index.ts:1197-1421`), `getNextBonNumber` / `getNextRepairNumber` / `getNextPurchaseOrderNumber` appelés uniquement à l'intérieur des transactions Dexie (`src/db/index.ts:801, 1816, 2368`)

## PARTIE B : DATES (`src/lib/dateUtils.ts`)
- [x] B1. Remplacement des occurrences métier de `toISOString` par `todayMA()` / `monthMA()` / `nowMA()`. Seules les occurrences techniques (`created_at`, `updated_at`, `deleted_at`, `detectedAt`) subsistent.

## PARTIE C : PERMISSIONS (`src/lib/permissions.ts`)
- [x] C1. `src/lib/permissions.ts` source unique (`hasPermission`, `isOwnerRole`, `canAccessTab`), mode local = `owner` (`src/lib/permissions.ts:1-66`, `src/lib/accessAuth.tsx:419-424`)
- [x] C2. Protection dans `src/App.tsx` de l'accès direct aux onglets réservés au propriétaire (`dashboard`, `reports`, `expenses`, `suppliers`, `settings`, `activity`) avec redirection vers `pos` (`src/App.tsx:49-53, 211-235`)
- [x] C3. Masquage pour l'employé : prix d'achat/coût, bénéfice, suppression de bon/article/réparation, annulation/modification de paiement, import/export/effacement, gestion des utilisateurs (`58` vérifications `can(...)` dans `src/`)
- [x] C4. Accès direct au Journal d'activité dans le menu propriétaire (`src/components/Sidebar.tsx:48`, `src/components/BottomNav.tsx:50`, `src/App.tsx:230-231`)

## PARTIE D & S1 & N1 : SUPABASE, NUMÉROTATION ET RLS (`supabase/`, `src/db/index.ts`, `src/lib/supabaseSync.ts`)
- [x] N1. Numérotation :
  - Mode local : compteurs `seq_bon_g`, `seq_repair_r`, `seq_po_ba` initialisés une seule fois par curseur `.each(...)` sans `.toArray()` (`src/db/index.ts:605-698`).
  - Mode cloud : `reserveNumber(kind)` appelée AVANT toute transaction Dexie avec délai de 3 s sur RPC (`next_bon_number`, `next_repair_number`, `next_purchase_order_number`) et repli sur provisoire `G-L-<4 chars deviceId>-0001` (`src/db/index.ts:535-599, 785, 1798, 2362`, `src/pages/PosPage.tsx:510`, `src/pages/RepairsPage.tsx:200`, `src/pages/SuppliersPage.tsx:209`).
  - Renumérotation à la synchronisation dans l'ordre de `createdAt` avec propagation vers `warranties.bonNumber`, `savTickets.bonNumber`, `customerPayments.bonNumber` & `appliedBons`, `creditAuditLogs`, `activityLogs`, `stockMovements.reason`, `products.imeiList` et `outbox` (`src/lib/supabaseSync.ts:288-589`).
  - Pull : collision de `bonNumber` / `repairNumber` avec un autre `uuid` enregistrée dans `syncConflicts` et document entrant renommé provisoirement sans crash (`src/lib/supabaseSync.ts:721-759`).
- [x] S1. RLS et Sync Employé :
  - `settings` : lecture pour tous les membres actifs (`key <> 'access_security_state'`), écriture propriétaire seulement (`supabase/schema.sql:495-503`).
  - L'employé ne synchronise jamais `expenses`, `recurring_expenses`, `suppliers`, `supplier_payments`, `supplier_purchase_orders`, `cash_closures` (`src/lib/supabaseSync.ts:34-41, 113-122, 661-664, 690`).
  - `handle_new_auth_user` lit exclusivement `new.raw_app_meta_data` (jamais `raw_user_meta_data`) (`supabase/schema.sql:577-613`) et `supabase/functions/create-employee/index.ts` écrit `app_metadata` côté serveur (`supabase/functions/create-employee/index.ts:84-90`).
  - `SETUP_SUPABASE.md` étape 1 mise à jour (création du compte propriétaire puis désactivation des inscriptions publiques `Disable sign ups`).
- [x] R1. Retours :
  - Ne modifie plus `totalAmount` ni `paidAmount` du bon d'origine ; conserve `originalTotalAmount` et ajoute à `returns[]` `{date: todayMA(), itemIndex, amount, costAmount, refundedCash, debtReduction}` (`src/db/index.ts:957-1093`).
  - Migration Dexie additive `version(9)` pour les bons existants (`returns = []`, `originalTotalAmount`) (`src/db/index.ts:354-371`).
  - `refundedCash` déduit en sortie de caisse à la date du retour dans `CashClosureModal.tsx:83-94`, et CA/bénéfice diminués à la date du retour dans `DashboardPage.tsx:67-149` et `ReportsPage.tsx:174-200`.
- [x] P1. Paiements :
  - `registerCustomerPaymentAdvancedTransaction` : refuse `applyMode === 'specific'` sans `specificSaleId`, client supprimé, bon supprimé, bon `returned`, `sale.customerId !== customerId`, ajoute `logShopActivity('payment')`, et si `allowFifoSurplus` est vrai, réduit `customer.totalCredit` uniquement du montant réellement affecté aux bons (`creditReduction = actualAppliedAmount`) (`src/db/index.ts:1229-1453`).
- [x] L1. Livraison de réparation et modification du prix convenu :
  - `deliverRepairOrder` (`src/db/index.ts:2538-2639`) : refuse si `repair.status === 'delivered'` ou `'cancelled'` ou `repair.deleted_at`, exige l'encaissement intégral du solde (`Math.abs(revenueAmount - repair.remainingAmount) > 0.01` lève `"Le solde doit être encaissé en totalité. Pour accorder une remise, modifiez d'abord le prix convenu. / يجب تحصيل المبلغ المتبقي بالكامل. لمنح تخفيض، يرجى تعديل الثمن المتفق عليه أولاً."`).
  - `updateRepairAgreedPrice` (`src/db/index.ts:2474-2528`) et modale de modification dans `src/pages/RepairsPage.tsx:1423-1507` (recalcule `remainingAmount = agreedPrice - depositAmount` et `netProfit = agreedPrice - totalPartsCost`).
- [x] L2. Gardes `createSaleTransaction` (`src/db/index.ts:733-969`) :
  - (a) Quantité exactement égale à `1` pour tout article `category === 'phone'` (`src/db/index.ts:748-752, 830-834`).
  - (b) Contrôle crédit sans client basé sur `computedRemainingAmount` (`src/db/index.ts:796-800`).
  - (c) Enregistrement de `Sale` avec `computedSubtotal`, `computedDiscount`, `computedTotalAmount`, `computedPaidAmount`, `computedRemainingAmount` (`src/db/index.ts:873-887`).
  - (d) Vérification dans la transaction Dexie que le client (`customerId > 0`) existe et n'a pas `deleted_at` (`src/db/index.ts:812-818, 918-922`).
- [x] L3. Retours dans l'affichage et les rapports :
  - Fonction `getNetTotal(sale)` = `totalAmount - sum(returns[].amount)` (`src/db/index.ts:721-728`) utilisée dans `pdfGenerator.ts:281-342, 1000`, `ReceiptPrintModal.tsx:518-542`, `BonsHistoryPage.tsx:138, 454, 575, 778`, `CustomersPage.tsx:971`, `DashboardPage.tsx:589, 643`, `ReportsPage.tsx:299, 410`, `GlobalSearchModal.tsx:272`.
  - `dayStats` et `monthStats` en `useMemo` dans `src/pages/DashboardPage.tsx:103-236` : vente comptée à sa date au montant brut (`originalTotalAmount ?? totalAmount`) et coût complet (incluant `'active'`, `'returned'`, `'partially_returned'`), chaque élément de `returns[]` diminuant le CA de `amount` et le coût de `costAmount` à `returns[].date`.
  - Exclusion de `saleKind === 'repair_deposit'`, `saleKind === 'repair_delivery'` et `bonNumber.startsWith('REP-')` du bénéfice par produit et par catégorie dans `src/pages/ReportsPage.tsx:122-127, 223-275`.
- [x] N2. Cloud, numérotation provisoire et RLS :
  - Filtre `isLocalOnlySettingKey` excluant `'access_security_state'`, `'seq_*'`, `'lastBackup*'` en push, pull et migration (`src/lib/supabaseSync.ts:54-61, 736-743, 790-793, 1020-1022` et `supabase/schema.sql:523-529`).
  - RPC `public.set_counters_if_greater(p_bon, p_repair, p_po)` (`supabase/schema.sql:169-191`) appelé au début de `migrateAllLocalDataToCloud` (`src/lib/supabaseSync.ts:965-1007`).
  - `renumberProvisionalDocuments` (`src/lib/supabaseSync.ts:415-635`) traite `G-L-`, `R-L-`, `BA-L-` et les bons dérivés `REP-<repairNumber>` / `REP-DEP-<repairNumber>`, conserve `provisionalNumber` (recherchable dans `GlobalSearchModal.tsx:86-109`, `BonsHistoryPage.tsx:282`, `RepairsPage.tsx:142`, `WarrantySavPage.tsx:78-96`), et affiche `(N° PROVISOIRE)` sur les reçus/PDF/WhatsApp (`pdfGenerator.ts:170, 1261, 1524`, `ReceiptPrintModal.tsx:395, 616`, `whatsapp.ts:76`).
  - `PosPage.tsx:461-548` : toutes les validations UI (y compris plafond de crédit et téléphone `quantity === 1`) s'exécutent avant `reserveNumber('bon')`.
  - `cash_closures` autorisé en lecture/écriture aux membres actifs (`supabase/schema.sql:548-549`, `src/lib/supabaseSync.ts:45-51`).
  - Mot de passe employé >= 8 caractères dans `supabase/functions/create-employee/index.ts:76-81` et `src/pages/SettingsPage.tsx:979-982`.
- [x] FIN. Documentation et build (`PROGRESS.md`, `CHANGELOG.md`, `TESTS.md`, `npx tsc --noEmit`, `npm run build`).
- [~] D4. Tests réels contre une instance Supabase Cloud en ligne et déploiement CLI de l'Edge Function (documentés dans `TODO_USER.md` et `SETUP_SUPABASE.md`).

