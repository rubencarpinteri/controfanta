'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLeagueContext } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

export interface RenameTeamState {
  error: string | null
  success: boolean
}

const renameSchema = z.object({
  team_id: z.string().uuid('ID squadra non valido'),
  name:    z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri').max(60, 'Massimo 60 caratteri'),
})

/** Rename a Serie A fantasy team owned by the current user. */
export async function renameSerieATeamAction(
  _prev: RenameTeamState,
  formData: FormData
): Promise<RenameTeamState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = renameSchema.safeParse({
    team_id: formData.get('team_id'),
    name:    formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, name } = parsed.data

  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id, league_id')
    .eq('id', team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi rinominare solo le tue squadre.', success: false }
  }
  if (team.name === name) {
    return { error: null, success: true }
  }

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ name })
    .eq('id', team_id)

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una squadra con questo nome nella Lega.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team_id,
    afterJson:   { action: 'rename', old: team.name, new: name },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

/** Rename a ControFanta Mondiale fantasy team owned by the current user. */
export async function renameFMTeamAction(
  _prev: RenameTeamState,
  formData: FormData
): Promise<RenameTeamState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = renameSchema.safeParse({
    team_id: formData.get('team_id'),
    name:    formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, name } = parsed.data

  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id, name, manager_id')
    .eq('id', team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi rinominare solo le tue squadre.', success: false }
  }
  if (team.name === name) {
    return { error: null, success: true }
  }

  // RLS on fm_fantasy_team only permits writes by super admins; a regular
  // manager's update would silently match zero rows. Ownership is already
  // verified above, so perform the write with the service client.
  const service = createServiceClient()
  const { error } = await service
    .from('fm_fantasy_team')
    .update({ name })
    .eq('id', team_id)

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una squadra con questo nome in questa competizione.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fm_fantasy_team',
    entityId:    team_id,
    afterJson:   { action: 'rename', old: team.name, new: name },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UpdateProfileState {
  error: string | null
  success: boolean
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri').max(60),
  username:  z.string()
    .trim()
    .min(2, 'Lo username deve avere almeno 2 caratteri')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, punti, trattini e underscore'),
})

export async function updateProfileAction(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name'),
    username:  formData.get('username'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { full_name, username } = parsed.data

  const { data: current } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', ctx.userId)
    .single()

  // Username uniqueness check (only if changed)
  if (current?.username !== username) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', ctx.userId)
      .maybeSingle()
    if (existing) {
      return { error: `Lo username "${username}" è già in uso.`, success: false }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name, username })
    .eq('id', ctx.userId)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

// ─── Team transfer (consent-required) ────────────────────────────────────────

export interface TransferActionState {
  error: string | null
  success: boolean
}

const offerSchema = z.object({
  team_id:        z.string().uuid('ID squadra non valido'),
  to_user_id:     z.string().uuid('Allenatore non valido'),
  message:        z.string().trim().max(280).optional(),
})

/**
 * Offer to hand a Serie A team you currently manage to another member of
 * the same Lega. Creates a pending transfer_request the recipient can
 * accept or reject. Manager_id only moves on accept.
 */
export async function offerTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = offerSchema.safeParse({
    team_id:    formData.get('team_id'),
    to_user_id: formData.get('to_user_id'),
    message:    (formData.get('message') as string | null)?.trim() || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, to_user_id, message } = parsed.data

  if (to_user_id === ctx.userId) {
    return { error: 'Non puoi assegnare una squadra a te stesso.', success: false }
  }

  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id, league_id')
    .eq('id', team_id)
    .eq('league_id', ctx.league.id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi assegnare solo le squadre che gestisci.', success: false }
  }

  const { data: targetMember } = await supabase
    .from('league_users')
    .select('user_id')
    .eq('league_id', ctx.league.id)
    .eq('user_id', to_user_id)
    .maybeSingle()
  if (!targetMember) {
    return { error: "L'allenatore scelto non è membro di questa Lega.", success: false }
  }

  const { error } = await supabase
    .from('fantasy_team_transfer_request')
    .insert({
      league_id:    ctx.league.id,
      team_id,
      from_user_id: ctx.userId,
      to_user_id,
      message:      message ?? null,
    })

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una richiesta in attesa per questa squadra.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team_id,
    afterJson:   {
      action:     'transfer_offered',
      team_name:  team.name,
      to_user_id,
    },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

const requestIdSchema = z.object({ request_id: z.string().uuid() })

export async function cancelTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fantasy_team_transfer_request')
    .select('id, from_user_id, status, team_id, league_id')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.from_user_id !== ctx.userId) {
    return { error: 'Puoi annullare solo le richieste che hai inviato.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  const { error } = await supabase
    .from('fantasy_team_transfer_request')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', req.id)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

export async function rejectTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fantasy_team_transfer_request')
    .select('id, to_user_id, status')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.to_user_id !== ctx.userId) {
    return { error: 'Solo il destinatario può rifiutare la richiesta.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  const { error } = await supabase
    .from('fantasy_team_transfer_request')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', req.id)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

export async function acceptTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fantasy_team_transfer_request')
    .select('id, team_id, from_user_id, to_user_id, league_id, status')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.to_user_id !== ctx.userId) {
    return { error: 'Solo il destinatario può accettare la richiesta.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  // Re-confirm the team is still managed by the original sender before moving.
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id, league_id')
    .eq('id', req.team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.league_id !== req.league_id) {
    return { error: 'Inconsistenza: la squadra non appartiene più a questa Lega.', success: false }
  }
  if (team.manager_id !== req.from_user_id) {
    return {
      error: 'Il mittente non gestisce più questa squadra. La richiesta non è più valida.',
      success: false,
    }
  }

  // The transfer + the request close must succeed atomically from the user's
  // point of view. fantasy_teams.manager_id is normally writable only by the
  // current manager or a league admin (the recipient is neither), so we
  // perform the team update with the service client. The request close uses
  // the user-scoped client (RLS already allows the recipient to update).
  const service = createServiceClient()
  const { error: teamError } = await service
    .from('fantasy_teams')
    .update({ manager_id: ctx.userId })
    .eq('id', team.id)
  if (teamError) return { error: `Trasferimento fallito: ${teamError.message}`, success: false }

  const { error: reqError } = await supabase
    .from('fantasy_team_transfer_request')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', req.id)
  if (reqError) {
    // Team already moved; surface the warning but don't roll back to avoid
    // leaving the request stuck pending with the wrong manager.
    return {
      error: `Squadra trasferita ma chiusura richiesta fallita: ${reqError.message}.`,
      success: false,
    }
  }

  await writeAuditLog({
    supabase,
    leagueId:    req.league_id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team.id,
    afterJson:   {
      action:       'transfer_accepted',
      team_name:    team.name,
      from_user_id: req.from_user_id,
      to_user_id:   ctx.userId,
    },
  })

  revalidatePath('/le-mie-squadre')
  revalidatePath('/league/members')
  return { error: null, success: true }
}

// ─── FM (ControFanta Mondiale) team transfer ─────────────────────────────────

const offerFMSchema = z.object({
  team_id:    z.string().uuid('ID squadra non valido'),
  to_user_id: z.string().uuid('Allenatore non valido'),
  message:    z.string().trim().max(280).optional(),
})

/**
 * Offer to hand a CFM (FM) fantasy team you currently manage to another
 * member of the same Lega. Same consent-required flow as Serie A.
 */
export async function offerFMTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = offerFMSchema.safeParse({
    team_id:    formData.get('team_id'),
    to_user_id: formData.get('to_user_id'),
    message:    (formData.get('message') as string | null)?.trim() || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, to_user_id, message } = parsed.data

  if (to_user_id === ctx.userId) {
    return { error: 'Non puoi assegnare una squadra a te stesso.', success: false }
  }

  // Resolve the team + its league_competition + verify same Lega.
  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select(`
      id,
      name,
      manager_id,
      league_competition_id,
      fm_league_competition!inner ( league_id )
    `)
    .eq('id', team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi assegnare solo le squadre che gestisci.', success: false }
  }
  const join = Array.isArray(team.fm_league_competition)
    ? team.fm_league_competition[0]
    : team.fm_league_competition
  if (!join || join.league_id !== ctx.league.id) {
    return { error: 'La squadra non appartiene a questa Lega.', success: false }
  }

  const { data: targetMember } = await supabase
    .from('league_users')
    .select('user_id')
    .eq('league_id', ctx.league.id)
    .eq('user_id', to_user_id)
    .maybeSingle()
  if (!targetMember) {
    return { error: "L'allenatore scelto non è membro di questa Lega.", success: false }
  }

  const { error } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .insert({
      league_id:              ctx.league.id,
      league_competition_id:  team.league_competition_id,
      team_id,
      from_user_id:           ctx.userId,
      to_user_id,
      message:                message ?? null,
    })

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una richiesta in attesa per questa squadra.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fm_fantasy_team',
    entityId:    team_id,
    afterJson:   {
      action:     'transfer_offered',
      team_name:  team.name,
      to_user_id,
    },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

export async function cancelFMTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .select('id, from_user_id, status')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.from_user_id !== ctx.userId) {
    return { error: 'Puoi annullare solo le richieste che hai inviato.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  const { error } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', req.id)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

export async function rejectFMTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .select('id, to_user_id, status')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.to_user_id !== ctx.userId) {
    return { error: 'Solo il destinatario può rifiutare la richiesta.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  const { error } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', req.id)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

export async function acceptFMTeamTransferAction(
  _prev: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = requestIdSchema.safeParse({ request_id: formData.get('request_id') })
  if (!parsed.success) return { error: 'Richiesta non valida.', success: false }

  const { data: req } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .select('id, team_id, from_user_id, to_user_id, league_id, league_competition_id, status')
    .eq('id', parsed.data.request_id)
    .maybeSingle()
  if (!req) return { error: 'Richiesta non trovata.', success: false }
  if (req.to_user_id !== ctx.userId) {
    return { error: 'Solo il destinatario può accettare la richiesta.', success: false }
  }
  if (req.status !== 'pending') {
    return { error: 'Questa richiesta non è più in attesa.', success: false }
  }

  // Re-confirm the team is still managed by the sender within the same tournament.
  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id, name, manager_id, league_competition_id')
    .eq('id', req.team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.league_competition_id !== req.league_competition_id) {
    return { error: 'Inconsistenza: la squadra non appartiene più a questa competizione.', success: false }
  }
  if (team.manager_id !== req.from_user_id) {
    return {
      error: 'Il mittente non gestisce più questa squadra. La richiesta non è più valida.',
      success: false,
    }
  }

  // Reject if the recipient already has a CFM team in this competition.
  const { data: existing } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('league_competition_id', req.league_competition_id)
    .eq('manager_id', ctx.userId)
    .maybeSingle()
  if (existing) {
    return {
      error: 'Hai già una squadra in questa competizione internazionale. Non puoi gestirne due.',
      success: false,
    }
  }

  // Service client moves manager_id (recipient is not the current manager,
  // so the user-scoped client cannot write fm_fantasy_team under RLS).
  const service = createServiceClient()
  const { error: teamError } = await service
    .from('fm_fantasy_team')
    .update({ manager_id: ctx.userId })
    .eq('id', team.id)
  if (teamError) return { error: `Trasferimento fallito: ${teamError.message}`, success: false }

  const { error: reqError } = await supabase
    .from('fm_fantasy_team_transfer_request')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', req.id)
  if (reqError) {
    return {
      error: `Squadra trasferita ma chiusura richiesta fallita: ${reqError.message}.`,
      success: false,
    }
  }

  await writeAuditLog({
    supabase,
    leagueId:    req.league_id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fm_fantasy_team',
    entityId:    team.id,
    afterJson:   {
      action:       'transfer_accepted',
      team_name:    team.name,
      from_user_id: req.from_user_id,
      to_user_id:   ctx.userId,
    },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}
