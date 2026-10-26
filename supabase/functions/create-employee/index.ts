// Supabase Edge Function (Deno) — Create Employee Account
// Verified against active shop owner JWT, uses SUPABASE_SERVICE_ROLE_KEY server-side only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Configuration serveur Supabase incomplète.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentification requise.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Verify caller identity and check that caller is an active owner
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Jeton utilisateur invalide.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('users_profile')
      .select('role, active')
      .eq('id', callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'owner' || !callerProfile.active) {
      return new Response(
        JSON.stringify({ error: 'Accès refusé : seul le propriétaire actif peut créer un employé.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || 'Employé').trim();

    if (!email || !password || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Email valide et mot de passe (min. 8 caractères) obligatoires.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Create user with service role key (never exposed to client) using server-only app_metadata
    const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { full_name: fullName, role: 'employee', created_by_owner: true },
    });

    if (createErr || !createdAuth.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message || 'Erreur lors de la création du compte.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Upsert users_profile with role = 'employee' and active = true
    const { error: upsertErr } = await adminClient.from('users_profile').upsert(
      {
        id: createdAuth.user.id,
        email,
        full_name: fullName,
        role: 'employee',
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: upsertErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: createdAuth.user.id,
          email,
          full_name: fullName,
          role: 'employee',
          active: true,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Erreur interne du serveur.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
