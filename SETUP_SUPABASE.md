# Guide de Configuration Supabase — Golden Shop Manager

1. **Création du projet Supabase et sécurisation des inscriptions** :
   - Créez un projet sur [Supabase](https://supabase.com).
   - Récupérez l'URL du projet (`VITE_SUPABASE_URL`) et la clé publique `anon` (`VITE_SUPABASE_ANON_KEY`) dans **Project Settings → API**.
   - **Important** : après l'exécution du schéma SQL, il faut **créer le compte propriétaire puis désactiver les inscriptions publiques (Authentication > Providers > Email > Disable sign ups)**. Seul le propriétaire pourra ensuite créer des comptes employés via l'Edge Function `create-employee`.

2. **Exécution du schéma SQL (`supabase/schema.sql`)** :
   - Ouvrez **SQL Editor** dans le tableau de bord Supabase.
   - Copiez et exécutez l'intégralité de `supabase/schema.sql` (564 lignes : 21 tables, 23 politiques RLS, 5 fonctions RPC atomiques `SECURITY DEFINER`, triggers `updated_at` et trigger `on_auth_user_created`).

3. **Déploiement de l'Edge Function (`create-employee`)** :
   - Installez Supabase CLI et déployez la fonction serveur qui crée les comptes employés sans jamais exposer `service_role` côté client :
     ```bash
     supabase functions deploy create-employee
     ```
   - Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par Supabase dans l'environnement Deno de l'Edge Function.

4. **Variables d'environnement Front-end (`.env.local`)** :
   - Créez un fichier `.env.local` à la racine du projet :
     ```env
     VITE_SUPABASE_URL="https://votre-projet.supabase.co"
     VITE_SUPABASE_ANON_KEY="votre-cle-anon-publique"
     ```
   - Sans ces variables, l'application fonctionne à 100 % en mode local hors-ligne avec le rôle Propriétaire.

5. **Création du Propriétaire et de l'Employé** :
   - Le **premier utilisateur** inscrit dans Supabase Auth reçoit automatiquement le rôle `owner` (`active = true`) grâce au trigger `on_auth_user_created`.
   - Depuis **Paramètres → Gestion des Utilisateurs & Cloud Supabase**, le propriétaire peut créer le compte de l'employé (via l'Edge Function `create-employee`), activer/désactiver son accès, et lancer **« Migrer toutes les données locales vers le Cloud »**.
