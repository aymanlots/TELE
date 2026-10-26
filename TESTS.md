# Guide des Tests — Golden Shop Manager

## Scénarios de Test Manuels

1. **Vente à crédit sans client** :
   - Tenter de valider une vente au POS avec un montant restant > 0 sans sélectionner de client.
   - Résultat attendu : Refus avec message d'erreur clair en FR et AR.

2. **Retour d'article** :
   - Effectuer une vente avec remise et articles multiples, puis retourner un article.
   - Résultat attendu : Recalcul automatique du total net, prorata de la remise, et exclusion des articles retournés du chiffre d'affaires et du bénéfice.

3. **Paiement client en mode FIFO** :
   - Enregistrer un versement supérieur au total dû ou avec un surplus.
   - Résultat attendu : Demande de confirmation explicite ou refus du surplus si non affecté.

4. **Réparation et Acompte** :
   - Créer une réparation avec acompte, puis livrer la réparation.
   - Résultat attendu : L'acompte est enregistré à sa date, le solde à la livraison, et le bénéfice net est compté une seule fois sans double comptabilisation.

5. **Sécurité PIN et Rôles** :
   - Configurer un PIN à 6 chiffres. Tenter 5 mauvais codes pour vérifier le verrouillage temporaire.
   - Se connecter en tant qu'employé pour vérifier que les prix d'achat, bénéfices, rapports et paramètres sont masqués ou inaccessibles.

6. **Synchronisation Hors-Ligne** :
   - Effectuer des ventes et modifications en mode hors-ligne, vérifier la génération des numéros G-L-xxxx, puis reconnecter Internet pour observer la resynchronisation automatique avec Supabase.

7. **Livraison avec solde partiel refusée** :
   - Créer une réparation avec `agreedPrice = 300 DH` et `depositAmount = 100 DH` (`remainingAmount = 200 DH`).
   - Tenter d'appeler `deliverRepairOrder` avec un montant encaissé différent de `200 DH` (ex. `150 DH`).
   - Résultat attendu : Refus avec l'erreur `"Le solde doit être encaissé en totalité. Pour accorder une remise, modifiez d'abord le prix convenu."`. Si une remise est souhaitée, modifier d'abord `agreedPrice` à `250 DH` via la modale de modification (ce qui recalcule `remainingAmount = 150 DH`), puis encaisser `150 DH` à la livraison.

8. **Retour partiel puis vérification du Dashboard le jour du retour** :
   - Jour J1 : Enregistrer une vente de 2 articles à `500 DH` chacun (`originalTotalAmount = 1000 DH`, coût total = `600 DH`). Le CA de J1 est `1000 DH` et le bénéfice de J1 est `400 DH`.
   - Jour J2 : Retourner 1 article (`amount = 500 DH`, `costAmount = 300 DH`, `refundedCash = 500 DH`).
   - Résultat attendu : Le bon affiche un Net à payer (`getNetTotal`) de `500 DH` tandis que `originalTotalAmount` reste `1000 DH`. Le Dashboard à J1 conserve le CA brut de `1000 DH` ; le Dashboard à J2 déduit `-500 DH` du CA du jour, `-200 DH` du bénéfice net (`500 - 300`), et déduit `500 DH` du montant attendu en espèces dans la clôture de caisse de J2.

9. **2 appareils hors-ligne puis en ligne (renumérotation et recherche)** :
   - Mettre l'Appareil A et l'Appareil B hors-ligne (mode Cloud configuré).
   - Créer une vente sur l'Appareil A (`G-L-AAAA-0001`, imprimée avec la mention `(N° PROVISOIRE)`) et une réparation sur l'Appareil B (`R-L-BBBB-0001`).
   - Reconnecter les deux appareils et lancer la synchronisation.
   - Résultat attendu : `renumberProvisionalDocuments` attribue des numéros séquentiels définitifs sans collision via les RPC (`G-0121`, `R-0045`), met à jour toutes les tables liées (`warranties`, `savTickets`, `customerPayments`, `REP-`, `outbox`), et conserve l'ancien numéro dans `provisionalNumber` afin qu'une recherche sur `G-L-AAAA-0001` ou `R-L-BBBB-0001` retrouve immédiatement le document.

10. **Migration vers le cloud avec 120 bons existants** :
    - En mode local contenant déjà 120 bons (`G-0001` à `G-0120`), des réparations et des bons d'achat, configurer Supabase et cliquer sur **"Migrer les données locales vers le cloud"**.
    - Résultat attendu : `migrateAllLocalDataToCloud` appelle d'abord le RPC `set_counters_if_greater(120, maxRepair, maxPo)` pour positionner `bon_seq >= 120` sur le serveur (sans pousser les clés locales `seq_*`, `access_security_state` ni `lastBackup*`), pousse les enregistrements locaux, et garantit que le prochain bon créé dans le cloud reçoit `G-0121` sans jamais réutiliser `G-0001`..`G-0120`.

