# Actions Restantes Côté Utilisateur (TODO_USER) — Golden Shop Manager

Ces opérations nécessitent vos accès externes ou du matériel physique et ne peuvent pas être exécutées dans cet environnement de build hors-ligne :

1. **Créer et configurer le projet Supabase en ligne** :
   - Créer un projet sur `https://supabase.com`.
   - Exécuter le script `supabase/schema.sql` dans l'éditeur SQL Supabase.
2. **Déployer l'Edge Function `create-employee`** :
   - Exécuter `supabase functions deploy create-employee` avec Supabase CLI sur votre projet pour permettre la création de comptes employés avec la clé `SUPABASE_SERVICE_ROLE_KEY` côté serveur.
3. **Configurer `.env.local` en production / sur vos appareils** :
   - Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (ne jamais mettre la clé `service_role` dans `.env.local`).
4. **Tests en conditions réelles multi-appareils & matériel** :
   - Tester la synchronisation en temps réel entre le téléphone du Propriétaire et le téléphone de l'Employé (création de bons hors-ligne `G-L-xxxx` puis reconnexion).
   - Tester l'impression thermique 58mm/80mm et le lecteur de codes-barres caméra sur téléphone réel.
