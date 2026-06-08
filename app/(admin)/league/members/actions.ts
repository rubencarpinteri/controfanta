'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

// ─── Create team (admin shortcut) ────────────────────────────────────────────

const createTeamSchema = z.object({
  team_name: z.string().min(2, 'Il nome squadra deve avere almeno 2 caratteri').max(60),
})

export interface CreateTeamState {
  error: string | null
  success: boolean
}

export async function createTeamAction(
  _prev: CreateTeamState,
  formData: FormData
): Promise<CreateTeamState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = createTeamSchema.safeParse({ team_name: formData.get('team_name') })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  const { team_name } = parsed.data

  const { error } = await supabase
    .from('fantasy_teams')
    .insert({ league_id: ctx.league.id, manager_id: ctx.userId, name: team_name })

  if (error) return { error: error.message, success: false }

  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── Invite ──────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email:            z.string().email('Email non valida'),
  full_name:        z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(60),
  username:         z.string()
    .min(2, 'Lo username deve avere almeno 2 caratteri')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, punti, trattini e underscore'),
  team_name:        z.string().max(60).optional(),
  existing_team_id: z.string().uuid().optional(),
  role:             z.enum(['manager', 'league_admin']),
}).refine(
  (d) => d.existing_team_id || (d.team_name && d.team_name.length >= 2),
  { message: 'Seleziona una squadra esistente o inserisci un nome per la nuova squadra', path: ['team_name'] }
)

export interface InviteMemberState {
  error: string | null
  success: boolean
}

export async function inviteMemberAction(
  _prev: InviteMemberState,
  formData: FormData
): Promise<InviteMemberState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    email:     formData.get('email'),
    full_name: formData.get('full_name'),
    username:  formData.get('username'),
    team_name: formData.get('team_name'),
    role:      formData.get('role'),
  }

  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  const { email, full_name, username, team_name, existing_team_id, role } = parsed.data

  // Check username isn't already taken
  const { data: existingUsername } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existingUsername) {
    return { error: `Lo username "${username}" è già in uso. Sceglierne un altro.`, success: false }
  }

  // Send invite via Admin API — triggers handle_new_user which creates the profile
  const adminClient = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://controfanta.vercel.app'

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      data: { username, full_name },
      redirectTo: `${appUrl}/auth/callback`,
    }
  )

  if (inviteError || !inviteData.user) {
    const msg = inviteError?.message ?? 'Errore sconosciuto'
    if (msg.toLowerCase().includes('already')) {
      return { error: 'Questa email è già registrata. Usa "Aggiungi esistente" se vuoi aggiungere un utente già registrato.', success: false }
    }
    return { error: `Impossibile inviare l'invito: ${msg}`, success: false }
  }

  const newUserId = inviteData.user.id

  // Create league membership
  const { error: luError } = await supabase
    .from('league_users')
    .insert({ league_id: ctx.league.id, user_id: newUserId, role })

  if (luError) {
    return { error: `Errore creazione membro: ${luError.message}`, success: false }
  }

  // Assign or create fantasy team
  if (existing_team_id) {
    // Transfer existing team to new manager
    const { error: ftError } = await supabase
      .from('fantasy_teams')
      .update({ manager_id: newUserId })
      .eq('id', existing_team_id)
      .eq('league_id', ctx.league.id)
    if (ftError) {
      return { error: `Errore assegnazione squadra: ${ftError.message}`, success: false }
    }
  } else {
    const { error: ftError } = await supabase
      .from('fantasy_teams')
      .insert({ league_id: ctx.league.id, manager_id: newUserId, name: team_name! })
    if (ftError) {
      return { error: `Errore creazione squadra: ${ftError.message}`, success: false }
    }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'user_role_change',
    entityType: 'league',
    entityId: ctx.league.id,
    afterJson: { action: 'invite', invited_email: email, role, team_name },
  })

  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── Assign / unassign team ──────────────────────────────────────────────────

const assignTeamSchema = z.object({
  team_id:        z.string().uuid('ID squadra non valido'),
  target_user_id: z.string().uuid('Membro non valido'),
})

export interface AssignTeamState {
  error: string | null
  success: boolean
}

/**
 * Reassign a Serie A fantasy team to another league member. Admin-only.
 * Used to hand a placeholder team from the admin's pool to a manager,
 * or to move a team between managers.
 */
export async function assignTeamToMemberAction(
  _prev: AssignTeamState,
  formData: FormData
): Promise<AssignTeamState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = assignTeamSchema.safeParse({
    team_id:        formData.get('team_id'),
    target_user_id: formData.get('target_user_id'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, target_user_id } = parsed.data

  // Verify the team is in this league
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id')
    .eq('id', team_id)
    .eq('league_id', ctx.league.id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }

  // Verify the target is a member of this league
  const { data: lu } = await supabase
    .from('league_users')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('user_id', target_user_id)
    .maybeSingle()
  if (!lu) return { error: 'Il destinatario non è membro della Lega.', success: false }

  if (team.manager_id === target_user_id) {
    return { error: 'La squadra è già assegnata a questo membro.', success: false }
  }

  const previousManagerId = team.manager_id
  const { error } = await supabase
    .from('fantasy_teams')
    .update({ manager_id: target_user_id })
    .eq('id', team_id)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team_id,
    afterJson:   {
      action:           'team_reassigned',
      team_name:        team.name,
      from_user_id:     previousManagerId,
      to_user_id:       target_user_id,
    },
  })

  revalidatePath('/league/members')
  return { error: null, success: true }
}

/**
 * Revert a Serie A fantasy team back to the current admin's pool of
 * unassigned placeholder teams. Admin-only.
 */
export async function unassignTeamAction(
  _prev: AssignTeamState,
  formData: FormData
): Promise<AssignTeamState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = z.object({ team_id: z.string().uuid() }).safeParse({
    team_id: formData.get('team_id'),
  })
  if (!parsed.success) return { error: 'Dati non validi', success: false }
  const { team_id } = parsed.data

  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id')
    .eq('id', team_id)
    .eq('league_id', ctx.league.id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }

  if (team.manager_id === ctx.userId) {
    return { error: 'La squadra è già nel tuo pool.', success: false }
  }

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ manager_id: ctx.userId })
    .eq('id', team_id)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team_id,
    afterJson:   {
      action:       'team_unassigned',
      team_name:    team.name,
      from_user_id: team.manager_id,
    },
  })

  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── Remove member ────────────────────────────────────────────────────────────

export interface MemberActionState {
  error: string | null
  success: boolean
}

export async function removeMemberAction(
  memberId: string
): Promise<MemberActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Prevent self-removal
  if (memberId === ctx.userId) {
    return { error: 'Non puoi rimuovere te stesso dalla lega.', success: false }
  }

  // Ensure the member belongs to this league
  const { data: lu } = await supabase
    .from('league_users')
    .select('id, role')
    .eq('league_id', ctx.league.id)
    .eq('user_id', memberId)
    .single()

  if (!lu) return { error: 'Membro non trovato.', success: false }

  // Remove fantasy team first (FK constraint)
  await supabase
    .from('fantasy_teams')
    .delete()
    .eq('league_id', ctx.league.id)
    .eq('manager_id', memberId)

  // Remove league membership
  const { error } = await supabase
    .from('league_users')
    .delete()
    .eq('league_id', ctx.league.id)
    .eq('user_id', memberId)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'user_role_change',
    entityType: 'league',
    entityId: ctx.league.id,
    afterJson: { action: 'remove', removed_user_id: memberId },
  })

  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── Change role ──────────────────────────────────────────────────────────────

const changeRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(['manager', 'league_admin']),
})

export async function changeRoleAction(
  _prev: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = changeRoleSchema.safeParse({
    memberId: formData.get('memberId'),
    role:     formData.get('role'),
  })
  if (!parsed.success) return { error: 'Dati non validi.', success: false }

  const { memberId, role } = parsed.data

  if (memberId === ctx.userId) {
    return { error: 'Non puoi cambiare il tuo stesso ruolo.', success: false }
  }

  const { error } = await supabase
    .from('league_users')
    .update({ role })
    .eq('league_id', ctx.league.id)
    .eq('user_id', memberId)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'user_role_change',
    entityType: 'league',
    entityId: ctx.league.id,
    afterJson: { action: 'role_change', user_id: memberId, new_role: role },
  })

  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── Invite token (shareable join link) ──────────────────────────────────────

function generateInviteToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function regenerateInviteTokenAction() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const token = generateInviteToken()
  const { error } = await supabase
    .from('leagues')
    .update({
      invite_token: token,
      invite_token_created_by: ctx.userId,
    })
    .eq('id', ctx.league.id)

  if (error) throw new Error(error.message)

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'user_role_change',
    entityType: 'league',
    entityId: ctx.league.id,
    afterJson: { action: 'invite_token_regenerated' },
  })

  revalidatePath('/league')
  revalidatePath('/league/members')
}

export async function revokeInviteTokenAction() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('leagues')
    .update({
      invite_token: null,
      invite_token_created_by: null,
    })
    .eq('id', ctx.league.id)

  if (error) throw new Error(error.message)

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'user_role_change',
    entityType: 'league',
    entityId: ctx.league.id,
    afterJson: { action: 'invite_token_revoked' },
  })

  revalidatePath('/league')
  revalidatePath('/league/members')
}
