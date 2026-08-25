import type { RealtimeChannel } from '@supabase/supabase-js';
import { cloudEnabled, requireSupabase } from './supabase';

export type CloudAccount = {
  email: string;
  handle: string;
  verified: boolean;
  verifiedAt: string;
  avatarDataUrl?: string;
};

export type CloudChatMessage = {
  id: string;
  channel: string;
  author: string;
  avatarUrl?: string;
  text: string;
  at: string;
};

export type CloudIncomingChat = {
  channel: string;
  author: string;
  text: string;
};

export type CloudOnlineUser = {
  userId: string;
  handle: string;
  avatarUrl?: string;
};

export type CloudLeaderboardRow = {
  userId: string;
  handle: string;
  avatarUrl?: string;
  points: number;
  events: number;
};

export type CloudRatingRow = { handle: string; avatarUrl?: string; rating: number; wins: number; losses: number; streak: number };

export type CloudMatchSummary = {
  id: string;
  publicId: string;
  format: '1v1' | '3v3' | '5v5';
  mode: 'ranked' | 'unranked';
  status: 'scheduled' | 'active' | 'pending_verification' | 'approved' | 'disputed' | 'cancelled';
  starCitizenMatchId?: string;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  players: Array<{ userId: string; handle: string; avatarUrl?: string; side: 1 | 2 }>;
};

export type CloudParty = {
  id: string;
  code: string;
  captainId: string;
  format: '1v1' | '3v3' | '5v5';
  members: Array<{ userId: string; handle: string; rating: number; ready: boolean; leader: boolean; avatarUrl?: string }>;
};

export type CloudQueueState = {
  partyId: string;
  format: '1v1' | '3v3' | '5v5';
  mode: 'ranked' | 'unranked';
  region: string;
  joinedAt: string;
};

export type CloudCommunityEvent = {
  id: string;
  publicId: string;
  creatorHandle: string;
  name: string;
  description: string;
  format: '1v1' | '3v3' | '5v5';
  region: string;
  startsAt: string;
  bracketSize: number;
  prizePool: string;
};

export type CloudBracketEntrant = {
  userId: string;
  handle: string;
  avatarUrl?: string;
};

export type CloudBracketDecision = {
  round: number;
  match: number;
  winnerId: string;
  decidedAt: string;
};

export type CloudBracketSnapshot = {
  sourceId: string;
  sourceKind: 'weekly' | 'community';
  bracketSize: number;
  startsAt: string;
  entrants: CloudBracketEntrant[];
  decisions: CloudBracketDecision[];
  registered: boolean;
};

export type CreateCommunityEventInput = {
  name: string;
  description: string;
  format: '1v1' | '3v3' | '5v5';
  region: string;
  startsAt: string;
  bracketSize: number;
  prizePool: string;
};

export type PlatformAccess = {
  role: 'owner' | 'admin' | 'moderator' | null;
  banned: boolean;
  banReason?: string;
  banExpiresAt?: string;
};

export type CloudAdminUser = {
  userId: string;
  handle: string;
  role: 'owner' | 'admin' | 'moderator' | null;
  banned: boolean;
  banReason?: string;
  banExpiresAt?: string;
};

export type CloudNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  entityId?: string;
  readAt?: string;
  createdAt: string;
};

export type CloudMatchDispute = {
  id: string;
  matchId: string;
  publicId: string;
  format: '1v1' | '3v3' | '5v5';
  starCitizenMatchId?: string;
  submittedResult?: Record<string, unknown>;
  reason: string;
  openedBy: string;
  players: string;
  createdAt: string;
};

type ProfileRow = { rsi_handle: string; rsi_verified_at: string; avatar_url: string | null };

const profileToAccount = (email: string, profile: ProfileRow): CloudAccount => ({
  email,
  handle: profile.rsi_handle,
  verified: Boolean(profile.rsi_verified_at),
  verifiedAt: profile.rsi_verified_at,
  avatarDataUrl: profile.avatar_url || undefined,
});

export const backend = {
  enabled: cloudEnabled,

  async currentAccount(): Promise<CloudAccount | null> {
    if (!cloudEnabled) return null;
    const client = requireSupabase();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return null;
    const { data, error } = await client.from('profiles').select('rsi_handle,rsi_verified_at,avatar_url').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    return data ? profileToAccount(session.user.email || '', data as ProfileRow) : null;
  },

  async register(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await requireSupabase().auth.signUp({ email, password });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  },

  async signIn(email: string, password: string): Promise<CloudAccount | null> {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('rsi_handle,rsi_verified_at,avatar_url').eq('user_id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    return profile ? profileToAccount(data.user.email || email, profile as ProfileRow) : null;
  },

  async verifyRsi(handle: string, code: string): Promise<CloudAccount> {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke('verify-rsi', { body: { handle, code } });
    if (error) {
      const context = error.context as Response | undefined;
      if (context) {
        try { const body = await context.json(); throw new Error(body.reason || error.message); } catch (parseError) {
          if (parseError instanceof Error && parseError.message !== 'Unexpected end of JSON input') throw parseError;
        }
      }
      throw error;
    }
    if (!data?.ok) throw new Error(data?.reason || 'RSI verification failed.');
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Your session expired. Sign in again.');
    return { email: user.email || '', handle: data.handle, verified: true, verifiedAt: data.verifiedAt };
  },

  async signOut(): Promise<void> {
    if (cloudEnabled) await requireSupabase().auth.signOut();
  },

  async uploadAvatar(dataUrl: string): Promise<string> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before updating your avatar.');
    const blob = await (await fetch(dataUrl)).blob();
    const objectPath = `${user.id}/avatar.webp`;
    const { error: uploadError } = await client.storage.from('avatars').upload(objectPath, blob, {
      contentType: 'image/webp', cacheControl: '3600', upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = client.storage.from('avatars').getPublicUrl(objectPath);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: profileError } = await client.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', user.id);
    if (profileError) throw profileError;
    return avatarUrl;
  },

  async removeAvatar(): Promise<void> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    await client.storage.from('avatars').remove([`${user.id}/avatar.webp`]);
    const { error } = await client.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
    if (error) throw error;
  },

  async profileByHandle(handle: string): Promise<CloudOnlineUser | null> {
    const { data, error } = await requireSupabase().from('profiles')
      .select('user_id,rsi_handle,avatar_url').eq('rsi_handle', handle).maybeSingle();
    if (error) throw error;
    return data ? { userId: data.user_id, handle: data.rsi_handle, avatarUrl: data.avatar_url || undefined } : null;
  },

  async subscribeOnline(onChange: (users: CloudOnlineUser[]) => void): Promise<RealtimeChannel | null> {
    if (!cloudEnabled) return null;
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    let refreshVersion = 0;
    const channel = client.channel('nexus:online-users', { config: { presence: { key: user.id } } });
    const refresh = async () => {
      const version = ++refreshVersion;
      const userIds = Object.keys(channel.presenceState());
      if (!userIds.length) { onChange([]); return; }
      const { data, error } = await client.from('profiles')
        .select('user_id,rsi_handle,avatar_url').in('user_id', userIds).order('rsi_handle');
      if (error || version !== refreshVersion) return;
      onChange((data || []).map(profile => ({
        userId: profile.user_id,
        handle: profile.rsi_handle,
        avatarUrl: profile.avatar_url || undefined,
      })));
    };
    channel.on('presence', { event: 'sync' }, () => { void refresh(); });
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') void channel.track({ userId: user.id, onlineAt: new Date().toISOString() });
    });
    return channel;
  },

  async listChat(channel: string): Promise<CloudChatMessage[]> {
    const { data, error } = await requireSupabase().from('chat_messages')
      .select('id,channel,body,created_at,profiles!chat_messages_author_id_fkey(rsi_handle,avatar_url)')
      .eq('channel', channel).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).reverse().map((row: any) => ({
      id: row.id,
      channel: row.channel,
      author: row.profiles?.rsi_handle || 'Unknown Pilot',
      avatarUrl: row.profiles?.avatar_url || undefined,
      text: row.body,
      at: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
  },

  async sendChat(channel: string, text: string): Promise<void> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Sign in to send messages.');
    const { error } = await client.from('chat_messages').insert({ channel, body: text.slice(0, 500), author_id: user.id });
    if (error) throw error;
  },

  subscribeChat(channel: string, onChange: () => void): RealtimeChannel | null {
    if (!cloudEnabled) return null;
    return requireSupabase().channel(`chat:${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${channel}` }, onChange)
      .subscribe();
  },

  async subscribeIncomingChat(onMessage: (message: CloudIncomingChat) => void): Promise<RealtimeChannel | null> {
    if (!cloudEnabled) return null;
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const authorCache = new Map<string, string>();
    return client.channel(`incoming-chat:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const row = payload.new as { author_id?: string; channel?: string; body?: string };
        if (!row.author_id || row.author_id === user.id || !row.channel || !row.body) return;
        void (async () => {
          let author = authorCache.get(row.author_id!);
          if (!author) {
            const { data } = await client.from('profiles').select('rsi_handle').eq('user_id', row.author_id).maybeSingle();
            author = data?.rsi_handle || 'Verified pilot';
          }
          const resolvedAuthor = author || 'Verified pilot';
          authorCache.set(row.author_id!, resolvedAuthor);
          onMessage({ channel: row.channel!, author: resolvedAuthor, text: row.body!.slice(0, 180) });
        })();
      })
      .subscribe();
  },

  async unsubscribe(channel: RealtimeChannel | null): Promise<void> {
    if (channel && cloudEnabled) await requireSupabase().removeChannel(channel);
  },

  async getMyParty(): Promise<CloudParty | null> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data: membership, error: membershipError } = await client.from('party_members')
      .select('party_id').eq('user_id', user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return null;
    const { data: party, error: partyError } = await client.from('parties')
      .select('id,invite_code,captain_id,format').eq('id', membership.party_id).single();
    if (partyError) throw partyError;
    const { data: members, error: membersError } = await client.from('party_members')
      .select('user_id,ready,profiles!party_members_user_id_fkey(rsi_handle,avatar_url)')
      .eq('party_id', party.id).order('joined_at');
    if (membersError) throw membersError;
    const ids = (members || []).map((member: any) => member.user_id);
    const { data: ratingRows } = ids.length ? await client.from('ratings').select('user_id,rating').in('user_id', ids).eq('format', party.format) : { data: [] };
    const ratings = new Map((ratingRows || []).map((row: any) => [row.user_id, Number(row.rating)]));
    return {
      id: party.id, code: party.invite_code, captainId: party.captain_id, format: party.format,
      members: (members || []).map((member: any) => ({
        userId: member.user_id,
        handle: member.profiles?.rsi_handle || 'Unknown Pilot',
        avatarUrl: member.profiles?.avatar_url || undefined,
        rating: ratings.get(member.user_id) || 1500,
        ready: Boolean(member.ready),
        leader: member.user_id === party.captain_id,
      })),
    };
  },

  async createOrGetPartyId(format: '1v1' | '3v3' | '5v5'): Promise<string> {
    const { data, error } = await requireSupabase().rpc('create_or_get_party', { requested_format: format });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const partyId = row?.party_id;
    if (!partyId) throw new Error('The party could not be created.');
    return String(partyId);
  },

  async createOrGetParty(format: '1v1' | '3v3' | '5v5'): Promise<CloudParty> {
    await this.createOrGetPartyId(format);
    const party = await this.getMyParty();
    if (!party) throw new Error('The party could not be created.');
    return party;
  },

  async joinParty(code: string): Promise<CloudParty> {
    const { error } = await requireSupabase().rpc('join_party_by_code', { submitted_code: code });
    if (error) throw error;
    const party = await this.getMyParty();
    if (!party) throw new Error('The party could not be joined.');
    return party;
  },

  async setPartyFormat(partyId: string, format: '1v1' | '3v3' | '5v5'): Promise<void> {
    const { error } = await requireSupabase().rpc('set_party_format', { target_party: partyId, requested_format: format });
    if (error) throw error;
  },

  async removePartyMember(partyId: string, userId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('remove_party_member', { target_party: partyId, target_user: userId });
    if (error) throw error;
  },

  async queueParty(partyId: string, format: '1v1' | '3v3' | '5v5', mode: 'ranked' | 'unranked', region = 'US East'): Promise<void> {
    const { error } = await requireSupabase().rpc('queue_current_party_v2', {
      target_party: partyId, requested_format: format, requested_mode: mode, requested_region: region,
    });
    if (error) throw error;
  },

  async getMyQueue(): Promise<CloudQueueState | null> {
    const party = await this.getMyParty();
    if (!party) return null;
    const { data, error } = await requireSupabase().from('queue_entries')
      .select('party_id,format,mode,region,joined_at')
      .eq('party_id', party.id).eq('status', 'searching')
      .order('joined_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? {
      partyId: data.party_id,
      format: data.format,
      mode: data.mode,
      region: data.region,
      joinedAt: data.joined_at,
    } : null;
  },

  async getMyRating(format: '1v1' | '3v3' | '5v5'): Promise<CloudRatingRow | null> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client.from('ratings')
      .select('rating,wins,losses,streak,profiles!ratings_user_id_fkey(rsi_handle,avatar_url)')
      .eq('user_id', user.id).eq('format', format).maybeSingle();
    if (error) throw error;
    return data ? {
      handle: (data as any).profiles?.rsi_handle || 'Unknown Pilot',
      avatarUrl: (data as any).profiles?.avatar_url || undefined,
      rating: Number((data as any).rating), wins: Number((data as any).wins),
      losses: Number((data as any).losses), streak: Number((data as any).streak),
    } : null;
  },

  async listMyMatches(limit = 50): Promise<CloudMatchSummary[]> {
    const { data, error } = await requireSupabase().from('matches')
      .select('id,public_id,format,mode,status,star_citizen_match_id,result,created_at,updated_at,match_players(user_id,side,profiles!match_players_user_id_fkey(rsi_handle,avatar_url))')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id, publicId: row.public_id, format: row.format, mode: row.mode, status: row.status,
      starCitizenMatchId: row.star_citizen_match_id || undefined,
      result: row.result || undefined, createdAt: row.created_at, updatedAt: row.updated_at,
      players: (row.match_players || []).map((player: any) => ({
        userId: player.user_id, handle: player.profiles?.rsi_handle || 'Unknown Pilot',
        avatarUrl: player.profiles?.avatar_url || undefined, side: Number(player.side) as 1 | 2,
      })),
    }));
  },

  async cancelMyQueue(): Promise<void> {
    const party = await this.getMyParty();
    if (!party) return;
    const { error } = await requireSupabase().rpc('cancel_current_queue', { target_party: party.id });
    if (error) throw error;
  },

  async listCommunityEvents(): Promise<CloudCommunityEvent[]> {
    const { data, error } = await requireSupabase().from('community_events')
      .select('id,public_id,name,description,format,region,starts_at,bracket_size,prize_pool,profiles!community_events_creator_id_fkey(rsi_handle)')
      .eq('status', 'published').gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true }).limit(50);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      publicId: row.public_id,
      creatorHandle: row.profiles?.rsi_handle || 'Verified organizer',
      name: row.name,
      description: row.description || '',
      format: row.format,
      region: row.region,
      startsAt: row.starts_at,
      bracketSize: Number(row.bracket_size),
      prizePool: row.prize_pool,
    }));
  },

  async createCommunityEvent(input: CreateCommunityEventInput): Promise<string> {
    const { data, error } = await requireSupabase().rpc('create_community_event', {
      submitted_name: input.name,
      submitted_description: input.description,
      submitted_format: input.format,
      submitted_region: input.region,
      submitted_starts_at: input.startsAt,
      submitted_bracket_size: input.bracketSize,
      submitted_prize_pool: input.prizePool,
    });
    if (error) throw error;
    return String(data);
  },

  async loadCompetitionBracket(sourceKind: 'weekly' | 'community', sourceKey: string, requestedSize = 8): Promise<CloudBracketSnapshot> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Authentication required');
    let sourceId = sourceKey;
    let startsAt = '';
    let registrationTable = 'community_event_registrations';
    let sourceColumn = 'event_id';
    let profileRelation = 'profiles!community_event_registrations_captain_id_fkey(rsi_handle,avatar_url)';

    if (sourceKind === 'weekly') {
      const { data: tournament, error: tournamentError } = await client.from('tournaments')
        .select('id,starts_at').eq('template_slug', sourceKey).gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true }).limit(1).maybeSingle();
      if (tournamentError) throw tournamentError;
      if (!tournament) throw new Error('No upcoming tournament bracket is available.');
      sourceId = tournament.id;
      startsAt = tournament.starts_at;
      registrationTable = 'tournament_registrations';
      sourceColumn = 'tournament_id';
      profileRelation = 'profiles!tournament_registrations_captain_id_fkey(rsi_handle,avatar_url)';
    } else {
      const { data: event, error: eventError } = await client.from('community_events')
        .select('starts_at,bracket_size').eq('id', sourceKey).single();
      if (eventError) throw eventError;
      startsAt = event.starts_at;
      requestedSize = Number(event.bracket_size);
    }

    const { data: registrations, error: registrationsError } = await client.from(registrationTable)
      .select(`captain_id,status,registered_at,${profileRelation}`).eq(sourceColumn, sourceId)
      .neq('status', 'withdrawn').order('registered_at', { ascending: true });
    if (registrationsError) throw registrationsError;
    const entrants = (registrations || []).map((row: any) => ({
      userId: row.captain_id,
      handle: row.profiles?.rsi_handle || 'Verified Pilot',
      avatarUrl: row.profiles?.avatar_url || undefined,
    }));
    let bracketSize = sourceKind === 'community' ? requestedSize : 8;
    while (bracketSize < entrants.length && bracketSize < 64) bracketSize *= 2;

    const { data: decisions, error: decisionsError } = await client.from('competition_bracket_matches')
      .select('round_number,match_number,winner_id,decided_at')
      .eq('competition_kind', sourceKind).eq('competition_id', sourceId)
      .order('round_number').order('match_number');
    if (decisionsError) throw decisionsError;
    return {
      sourceId,
      sourceKind,
      bracketSize,
      startsAt,
      entrants,
      decisions: (decisions || []).map((row: any) => ({
        round: Number(row.round_number), match: Number(row.match_number), winnerId: row.winner_id, decidedAt: row.decided_at,
      })),
      registered: entrants.some(entrant => entrant.userId === user.id),
    };
  },

  async registerCommunityEvent(eventId: string, format: '1v1' | '3v3' | '5v5', rosterSize: number): Promise<void> {
    await this.createOrGetParty(format);
    const { error } = await requireSupabase().rpc('register_community_event', {
      target_event: eventId, submitted_roster_size: rosterSize,
    });
    if (error) throw error;
  },

  async withdrawCommunityEvent(eventId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('withdraw_community_event', { target_event: eventId });
    if (error) throw error;
  },

  async recordBracketWinner(sourceKind: 'weekly' | 'community', sourceId: string, round: number, match: number, winnerId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('record_bracket_winner', {
      submitted_kind: sourceKind,
      submitted_competition: sourceId,
      submitted_round: round,
      submitted_match: match,
      submitted_winner: winnerId,
    });
    if (error) throw error;
  },

  async getMyPlatformAccess(): Promise<PlatformAccess> {
    const { data, error } = await requireSupabase().rpc('get_my_platform_access');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      role: row?.access_role || null,
      banned: Boolean(row?.banned),
      banReason: row?.ban_reason || undefined,
      banExpiresAt: row?.ban_expires_at || undefined,
    };
  },

  async listPendingCommunityEvents(): Promise<CloudCommunityEvent[]> {
    const { data, error } = await requireSupabase().from('community_events')
      .select('id,public_id,name,description,format,region,starts_at,bracket_size,prize_pool,profiles!community_events_creator_id_fkey(rsi_handle)')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      publicId: row.public_id,
      creatorHandle: row.profiles?.rsi_handle || 'Verified organizer',
      name: row.name,
      description: row.description || '',
      format: row.format,
      region: row.region,
      startsAt: row.starts_at,
      bracketSize: Number(row.bracket_size),
      prizePool: row.prize_pool,
    }));
  },

  async reviewCommunityEvent(eventId: string, decision: 'approve' | 'reject', note = ''): Promise<void> {
    const { error } = await requireSupabase().rpc('review_community_event', {
      target_event: eventId, decision, submitted_note: note,
    });
    if (error) throw error;
  },

  async listAdminUsers(): Promise<CloudAdminUser[]> {
    const { data, error } = await requireSupabase().rpc('list_admin_users');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      userId: row.account_id,
      handle: row.handle,
      role: row.platform_role || null,
      banned: Boolean(row.banned),
      banReason: row.ban_reason || undefined,
      banExpiresAt: row.ban_expires_at || undefined,
    }));
  },

  async setPlatformRole(userId: string, role: 'admin' | 'moderator' | null): Promise<void> {
    const { error } = await requireSupabase().rpc('set_platform_role', {
      target_user: userId, new_role: role,
    });
    if (error) throw error;
  },

  async banUser(userId: string, reason: string, expiresAt?: string): Promise<void> {
    const { error } = await requireSupabase().rpc('ban_platform_user', {
      target_user: userId, submitted_reason: reason, submitted_expires_at: expiresAt || null,
    });
    if (error) throw error;
  },

  async unbanUser(userId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('revoke_platform_ban', { target_user: userId });
    if (error) throw error;
  },

  async listNotifications(): Promise<CloudNotification[]> {
    const { data, error } = await requireSupabase().from('notifications')
      .select('id,title,body,kind,entity_id,read_at,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      kind: row.kind || 'general',
      entityId: row.entity_id || undefined,
      readAt: row.read_at || undefined,
      createdAt: row.created_at,
    }));
  },

  async markNotificationsRead(notificationId?: string): Promise<void> {
    let query = requireSupabase().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (notificationId) query = query.eq('id', notificationId);
    const { error } = await query;
    if (error) throw error;
  },

  async subscribeNotifications(onChange: () => void): Promise<RealtimeChannel | null> {
    if (!cloudEnabled) return null;
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    return client.channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, onChange)
      .subscribe();
  },

  async listOpenMatchDisputes(): Promise<CloudMatchDispute[]> {
    const { data, error } = await requireSupabase().rpc('list_open_match_disputes');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.dispute_id,
      matchId: row.match_id,
      publicId: row.public_id,
      format: row.match_format,
      starCitizenMatchId: row.star_citizen_match_id || undefined,
      submittedResult: row.submitted_result || undefined,
      reason: row.dispute_reason,
      openedBy: row.opened_by_handle,
      players: row.player_handles,
      createdAt: row.disputed_at,
    }));
  },

  async resolveMatchDispute(disputeId: string, decision: 'approve_result' | 'void_match', note = ''): Promise<void> {
    const { error } = await requireSupabase().rpc('review_match_dispute', {
      target_dispute: disputeId,
      decision,
      submitted_note: note,
    });
    if (error) throw error;
  },

  async registeredTournamentSlugs(): Promise<string[]> {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return [];
    const { data, error } = await client.from('tournament_registrations')
      .select('status,tournaments!inner(template_slug,starts_at)').eq('captain_id', user.id).neq('status', 'withdrawn')
      .gt('tournaments.starts_at', new Date().toISOString());
    if (error) throw error;
    return [...new Set((data || []).map((row: any) => row.tournaments?.template_slug).filter(Boolean))];
  },

  async registerTournament(slug: string, rosterSize: number): Promise<void> {
    const format = slug === 'friday-duel' ? '1v1' : slug === 'saturday-skirmish' ? '3v3' : '5v5';
    await this.createOrGetParty(format);
    const { error } = await requireSupabase().rpc('register_weekly_tournament', {
      template_key: slug, submitted_roster_size: rosterSize,
    });
    if (error) throw error;
  },

  async withdrawTournament(slug: string): Promise<void> {
    const { error } = await requireSupabase().rpc('withdraw_weekly_tournament', { template_key: slug });
    if (error) throw error;
  },

  async circuitLeaderboard(): Promise<CloudLeaderboardRow[]> {
    const { data, error } = await requireSupabase().from('weekly_circuit_leaderboard')
      .select('user_id,handle,avatar_url,points,events').order('points', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      userId: row.user_id, handle: row.handle, avatarUrl: row.avatar_url || undefined,
      points: Number(row.points || 0), events: Number(row.events || 0),
    }));
  },

  async rankedLeaderboard(format: '1v1' | '3v3' | '5v5'): Promise<CloudRatingRow[]> {
    const { data, error } = await requireSupabase().from('ratings')
      .select('rating,wins,losses,streak,profiles!ratings_user_id_fkey(rsi_handle,avatar_url)')
      .eq('format', format).order('rating', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      handle: row.profiles?.rsi_handle || 'Unknown Pilot', avatarUrl: row.profiles?.avatar_url || undefined,
      rating: Number(row.rating), wins: Number(row.wins), losses: Number(row.losses), streak: Number(row.streak),
    }));
  },
};
