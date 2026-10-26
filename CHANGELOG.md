# Changelog — Golden Shop Manager

## [2.2.0] - 2026-10-21
### Réparations, Ventes & Retours (`src/db/index.ts`, `src/pages/RepairsPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/ReportsPage.tsx`)
- **Livraison de réparation (`deliverRepairOrder`)** : Obligation d'encaisser le solde restant en totalité (`|revenueAmount - remainingAmount| <= 0.01`), refus des réparations annulées ou déjà livrées, et ajout de `updateRepairAgreedPrice` (avec modale dédiée) pour modifier le prix convenu avant livraison.
- **Gardes `createSaleTransaction`** : Quantité forcée à `1` pour la catégorie `phone`, validation du crédit sans client sur `computedRemainingAmount`, persistance des montants recalculés (`computedSubtotal`, `computedDiscount`, `computedTotalAmount`, `computedPaidAmount`, `computedRemainingAmount`), et vérification de l'existence/non-suppression du client à l'intérieur de la transaction Dexie.
- **Affichage et comptabilité des retours (`getNetTotal` & `returns[]`)** : Utilisation de `getNetTotal(sale)` partout où le total net d'un bon est affiché ou exporté. Comptabilisation de la vente brute à sa date d'origine et déduction du chiffre d'affaires (`ret.amount`) et du coût (`ret.costAmount`) à la date du retour (`ret.date`) dans le Dashboard (`dayStats` / `monthStats`), les Rapports et la Clôture de caisse. Exclusion des acomptes/livraisons de réparation (`repair_deposit`, `repair_delivery`, `REP-`) du bénéfice par produit et par catégorie.

### Cloud, Numérotation & Sécurité (`src/lib/supabaseSync.ts`, `supabase/schema.sql`, `supabase/functions/create-employee/index.ts`)
- **Isolation des paramètres locaux** : Exclusion stricte de `access_security_state`, `seq_*` et `lastBackup*` lors du push, du pull et de la migration initiale.
- **Migration des compteurs (`set_counters_if_greater`)** : RPC `SECURITY DEFINER` réservé au propriétaire alignant `bon_seq`, `repair_seq` et `po_seq` sur les plus grands numéros locaux (`G-`, `R-`, `BA-`) avant la migration vers le cloud.
- **Renumérotation provisoire complète (`renumberProvisionalDocuments`)** : Prise en charge des bons `G-L-`, réparations `R-L-`, bons d'achat `BA-L-` et bons dérivés `REP-<repairNumber>`, conservation de `provisionalNumber` pour la recherche (globale, historique, réparations, garanties), et mention `(N° PROVISOIRE)` sur les PDF, tickets et messages WhatsApp.
- **Validation pré-réservation & Clôture employé** : Toutes les validations UI (y compris plafond de crédit client) s'exécutent dans `PosPage.tsx` avant `reserveNumber('bon')`. Les employés actifs peuvent créer et synchroniser `cash_closures`. Mot de passe employé porté à 8 caractères minimum côté UI et Edge Function.

## [2.1.0] - 2026-10-20
### Sécurité & Gardes Base de Données (`src/db/index.ts`)
- **Gardes `createSaleTransaction`** : Validation stricte côté base de données (quantité > 0, prix >= 0, montant payé entre 0 et total net, stock suffisant, et client obligatoire si reste à payer > 0).
- **Gardes `deliverRepairOrder`** : Protection anti double-livraison (`repair.status === 'delivered'`), validation du solde restant, et comptabilisation unique du bénéfice net (`agreedPrice - totalPartsCost`).
- **Numérotation atomique dans la transaction Dexie** : `getNextBonNumber`, `getNextRepairNumber` et `getNextPurchaseOrderNumber` s'exécutent à l'intérieur de la transaction Dexie de création afin d'éviter tout trou ou doublon.
- **Suppression de bon (`deleteSaleTransaction`)** : Réservée au propriétaire (`can('delete_records')`), avec remise en stock des articles non retournés et ajustement du crédit client.

### Fuseau Horaire Maroc (`src/lib/dateUtils.ts`)
- **Normalisation `Africa/Casablanca`** : Utilisation de `todayMA()`, `monthMA()` et `nowMA()` pour toutes les dates métier (ventes, dépenses, versements, clôtures, échéances, garanties, rapports, sauvegardes et audits de crédit). `toISOString()` est conservé uniquement pour les horodatages techniques (`created_at` / `updated_at` / `deleted_at`).

### Permissions & Rôles (`src/lib/permissions.ts`, `src/lib/accessAuth.tsx`)
- **Source unique des permissions** : `src/lib/permissions.ts` centralise `hasPermission`, `isOwnerRole` et `canAccessTab`. En mode local sans Supabase, le rôle actif est `owner`.
- **Protection des routes (`src/App.tsx`)** : Redirection automatique vers la Caisse (`pos`) si l'employé tente d'accéder au Dashboard financier, Rapports, Dépenses, Fournisseurs, Journal d'activité ou Paramètres.
- **Masquage employé (58 points de contrôle)** : Masquage des prix d'achat, coûts des pièces, marges/bénéfices, suppressions d'articles/bons/réparations, annulations de paiements, sauvegardes et gestion des utilisateurs.

### Synchronisation Cloud Supabase (`supabase/schema.sql`, `src/lib/supabaseSync.ts`)
- **Edge Function `supabase/functions/create-employee/index.ts`** : Création sécurisée du compte employé côté serveur avec `SUPABASE_SERVICE_ROLE_KEY` après vérification du profil `owner` actif de l'appelant.
- **Triggers SQL** : Trigger automatique `updated_at` sur les 21 tables et trigger `on_auth_user_created` sur `auth.users` (premier compte = `owner` actif, suivants = `employee`).
- **RPC Atomiques** : `next_bon_number`, `next_repair_number`, `next_purchase_order_number`, `next_trade_in_number` et `get_server_time` avec `SECURITY DEFINER` et `set search_path = public`.
- **Fusion Stock par Mouvements** : Calcul de la quantité produit lors de la synchronisation à partir des mouvements de stock (`previousQty + sum(quantityDelta)`).

### Performance & PWA
- **Lazy Loading** : Chargement dynamique des pages (`React.lazy` + `Suspense`) et import dynamique de `jspdf` / `jspdf-autotable` uniquement lors de la génération d'un PDF.
- **Icônes PWA** : Génération des icônes PNG `public/pwa-192x192.png` et `public/pwa-512x512.png` (monogramme Or/Noir "GS").

