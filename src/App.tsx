import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Activity, AlertTriangle, Bell, ChevronDown, ChevronRight, CircleHelp,
  ClipboardCheck, Clock3, Crosshair, Crown, Flag, Gamepad2,
  Headphones, Home, Info, LayoutGrid, LockKeyhole, Medal, Menu,
  MessageSquare, Orbit, Play, Radio, Search,
  Settings, ShieldCheck, Swords, Target, Trophy, UserPlus,
  Users, UsersRound, X, Zap, Send, Upload, Trash2, LogOut,
  Camera, FolderOpen, Keyboard, Image as ImageIcon, LoaderCircle, Maximize2, Minimize2, Minus, UserRound, Plus, UserMinus,
} from 'lucide-react';
import { backend, type CloudAdminUser, type CloudBracketEntrant, type CloudBracketSnapshot, type CloudChatChannel, type CloudChatMember, type CloudCommunityEvent, type CloudLeaderboardRow, type CloudMatchDispute, type CloudMatchSummary, type CloudNotification, type CloudOnlineUser, type CloudParty, type CloudRatingRow, type PlatformAccess } from './lib/backend';

type Page = 'Play' | 'Matches' | 'Tournaments' | 'Rankings' | 'Organizations' | 'Missions' | 'Admin';
type ThemeMode = 'standard' | 'night';
type MatchmakingMode = 'ranked' | 'unranked';
type SeenSection = 'missions' | 'channels';

const SECTION_REVISIONS: Record<SeenSection, string> = {
  missions: 'weekly-missions-2026-08-24',
  channels: 'public-channels-initial',
};
type Account = { email: string; handle: string; verified: boolean; verifiedAt: string; avatarDataUrl?: string };
type ChatMessage = { id: string; channel: string; author: string; avatarUrl?: string; text: string; at: string };
type PartyMember = { userId?: string; handle: string; rating: number; ready: boolean; leader?: boolean; avatarDataUrl?: string };
type PanelMode = 'search'|'party-finder'|'settings'|'support'|'notifications'|'match-rules'|'match-room'|'create-event'|'event-details'|'organization'|'create-organization';
type BracketEventRef = {
  kind: 'weekly'|'community'; key: string; name: string; format: '1v1'|'3v3'|'5v5'; required: number;
  bracketSize: number; region: string; startsAt: string; prizePool?: string; creatorHandle?: string; description?: string;
};
type PanelState = { mode: PanelMode; title?: string; event?: BracketEventRef };

const publicChatChannels: CloudChatChannel[] = [
  { key: 'general', name: 'general', kind: 'public', memberCount: 0 },
  { key: 'looking-for-crew', name: 'looking-for-crew', kind: 'public', memberCount: 0 },
  { key: 'tournament-lounge', name: 'tournament-lounge', kind: 'public', memberCount: 0 },
];

const queues = [
  { id: 'duel', name: 'Arena Commander Duel', mode: '1v1 · Duel', region: 'US East', rating: 'Ranked', accent: 'cyan' },
  { id: 'skirmish', name: 'Squadron Skirmish', mode: '3v3 · Best of 3', region: 'US East', rating: 'Ranked', accent: 'lime' },
  { id: 'squadron', name: 'Squadron Battle', mode: '5v5 · Best of 3', region: 'US East', rating: 'Ranked', accent: 'orange' },
];
const queueCapacity = (queueId: string) => queueId === 'duel' ? 1 : queueId === 'skirmish' ? 3 : 5;
const queueFormat = (queueId: string): '1v1'|'3v3'|'5v5' => queueId === 'duel' ? '1v1' : queueId === 'skirmish' ? '3v3' : '5v5';
const DEFAULT_FONT_SCALE = 1.2;
const clampFontScale = (scale: number) => Math.max(0.9, Math.min(1.3, Math.round(scale * 20) / 20));
const formatQueueElapsed = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
const backendErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  return fallback;
};
const platformRoleLabel = (role: PlatformAccess['role']) => role === 'owner' ? 'HEAD ADMIN' : role?.toUpperCase() || 'USER';
const weeklyCircuit = [
  { slug: 'friday-duel', day: 5, name: 'FRIDAY DUEL NIGHT', format: '1v1', mode: 'Arena Commander Duel', required: 1, accent: 'cyan' },
  { slug: 'saturday-skirmish', day: 6, name: 'SATURDAY SKIRMISH', format: '3v3', mode: 'Squadron Skirmish', required: 3, accent: 'lime' },
  { slug: 'sunday-squadron', day: 0, name: 'SUNDAY SQUADRON CUP', format: '5v5', mode: 'Squadron Battle', required: 5, accent: 'orange' },
];
const nextWeeklyStart = (weekday: number, now = new Date()) => {
  const next = new Date(now); next.setHours(20, 0, 0, 0);
  let offset = (weekday - now.getDay() + 7) % 7;
  if (offset === 0 && now >= next) offset = 7;
  next.setDate(now.getDate() + offset); return next;
};
const countdownTo = (target: Date, now: Date) => {
  const totalMinutes = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
  const days = Math.floor(totalMinutes / 1440); const hours = Math.floor((totalMinutes % 1440) / 60); const minutes = totalMinutes % 60;
  return days > 0 ? `${days}D ${hours}H` : `${hours}H ${minutes}M`;
};
const defaultEventStartValue = () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(20, 0, 0, 0);
  const localTime = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
};

const matchStatusLabel = (status: CloudMatchSummary['status']) => ({
  scheduled: 'SCHEDULED', active: 'ACTIVE', pending_verification: 'PENDING VERIFICATION',
  approved: 'APPROVED', disputed: 'DISPUTED', cancelled: 'CANCELLED',
})[status];
const matchAge = (date: string) => new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const nav: { label: Page; icon: typeof Home }[] = [
  { label: 'Play', icon: Play },
  { label: 'Matches', icon: Swords },
  { label: 'Tournaments', icon: Trophy },
  { label: 'Rankings', icon: Medal },
  { label: 'Organizations', icon: UsersRound },
  { label: 'Missions', icon: Target },
];

function WindowTitleBar({showBrand = true}:{showBrand?:boolean}) {
  const desktop = window.starladderDesktop;
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop.windowIsMaximized().then(value => { if (active) setMaximized(value); });
    const remove = desktop.onWindowMaximizedChange(value => { if (active) setMaximized(value); });
    return () => { active = false; remove(); };
  }, [desktop]);
  if (!desktop) return null;
  const toggleMaximize = async () => setMaximized(await desktop.windowToggleMaximize());
  return <header className="starladder-titlebar">
    <div className="starladder-titlebar-drag" onDoubleClick={()=>void toggleMaximize()}>
      {showBrand && <><img src="./starladder-icon-32.png" alt=""/><b>STARLADDER</b><span>STAR CITIZEN COMPETITIVE</span></>}
    </div>
    <div className="starladder-window-controls">
      <button aria-label="Minimize STARLADDER" onClick={()=>void desktop.windowMinimize()}><Minus/></button>
      <button aria-label={maximized?'Restore STARLADDER':'Maximize STARLADDER'} onClick={()=>void toggleMaximize()}>{maximized?<Minimize2/>:<Maximize2/>}</button>
      <button className="window-close" aria-label="Close STARLADDER" onClick={()=>void desktop.windowClose()}><X/></button>
    </div>
  </header>;
}

function AppFrame({children,showTitleBrand = true}:{children:ReactNode;showTitleBrand?:boolean}) {
  return <><WindowTitleBar showBrand={showTitleBrand}/>{children}</>;
}

function App() {
  const previewCaptureSetup = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'capture-setup';
  const [account, setAccount] = useState<Account | null>(() => {
    if (backend.enabled) return null;
    try { return JSON.parse(localStorage.getItem('nexus-account') || 'null'); } catch { return null; }
  });
  const [booting, setBooting] = useState(backend.enabled);

  useEffect(() => {
    if (!backend.enabled) return;
    let active = true;
    backend.currentAccount().then((next) => {
      if (!active) return;
      setAccount(next);
      if (next) localStorage.setItem('nexus-account', JSON.stringify(next));
      else localStorage.removeItem('nexus-account');
    }).catch(() => {
      if (active) setAccount(null);
    }).finally(() => {
      if (active) setBooting(false);
    });
    return () => { active = false; };
  }, []);

  const completeAccount = (next: Account) => {
    localStorage.setItem('nexus-account', JSON.stringify(next));
    setAccount(next);
  };

  const updateAccount = async (next: Account): Promise<Account> => {
    let saved = next;
    if (backend.enabled && next.avatarDataUrl !== account?.avatarDataUrl) {
      if (next.avatarDataUrl?.startsWith('data:')) saved = { ...next, avatarDataUrl: await backend.uploadAvatar(next.avatarDataUrl) };
      else if (!next.avatarDataUrl) await backend.removeAvatar();
    }
    localStorage.setItem('nexus-account', JSON.stringify(saved));
    setAccount(saved);
    return saved;
  };

  const logout = async () => {
    await backend.signOut();
    localStorage.removeItem('nexus-account');
    setAccount(null);
  };

  if (previewCaptureSetup) return <AppFrame><CaptureSetup onComplete={() => undefined} /></AppFrame>;

  if (booting) return <AppFrame><div className="alpha-boot"><Orbit size={34}/><b>STARLADDER ALPHA</b><span>CONNECTING TO COMPETITIVE NETWORK</span></div></AppFrame>;

  if (!account?.verified) {
    return <AppFrame><AuthFlow onComplete={completeAccount} /></AppFrame>;
  }

  return <AppFrame showTitleBrand={false}><StarLadderApp account={account} onAccountUpdate={updateAccount} onLogout={logout} /></AppFrame>;
}

function StarLadderApp({ account, onAccountUpdate, onLogout }: { account: Account; onAccountUpdate: (account: Account) => Promise<Account>; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('Play');
  const [selectedQueue, setSelectedQueue] = useState(queues[0]);
  const [matchmakingMode,setMatchmakingMode]=useState<MatchmakingMode>('ranked');
  const [queued, setQueued] = useState(false);
  const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
  const [communityEventRevision, setCommunityEventRevision] = useState(0);
  const [platformAccess, setPlatformAccess] = useState<PlatformAccess>({role:null,banned:false});
  const [platformAccessLoaded, setPlatformAccessLoaded] = useState(!backend.enabled);
  const [onlineUsers, setOnlineUsers] = useState<CloudOnlineUser[]>([]);
  const [chatChannels, setChatChannels] = useState<CloudChatChannel[]>(publicChatChannels);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyMembers, setPartyMembersState] = useState<PartyMember[]>(() => {
    if (backend.enabled) return [{handle:account.handle,rating:1500,ready:true,leader:true,avatarDataUrl:account.avatarDataUrl}];
    try {
      const saved = JSON.parse(localStorage.getItem('nexus-party') || 'null') as PartyMember[] | null;
      if (saved?.length) return [{handle:account.handle,rating:1500,ready:true,leader:true,avatarDataUrl:account.avatarDataUrl},...saved.filter(member=>member.handle!==account.handle)];
    } catch { /* start with the verified player */ }
    return [{handle:account.handle,rating:1500,ready:true,leader:true,avatarDataUrl:account.avatarDataUrl}];
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [captureSetupComplete, setCaptureSetupComplete] = useState(() => !window.starladderDesktop || Boolean(localStorage.getItem('nexus-capture-setup-v1')));
  const [captureSetupResolved, setCaptureSetupResolved] = useState(() => !window.starladderDesktop);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [cloudNotifications, setCloudNotifications] = useState<CloudNotification[]>([]);
  const seenSectionsKey = `nexus-seen-sections:${account.handle.toLowerCase()}`;
  const [seenSections, setSeenSections] = useState<Partial<Record<SeenSection, string>>>(() => {
    try { return JSON.parse(localStorage.getItem(seenSectionsKey) || '{}'); } catch { return {}; }
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try { return JSON.parse(localStorage.getItem('nexus-settings') || '{}').theme === 'night' ? 'night' : 'standard'; } catch { return 'standard'; }
  });
  const [fontScale, setFontScaleState] = useState(() => {
    try { return clampFontScale(Number(JSON.parse(localStorage.getItem('nexus-settings') || '{}').fontScale) || DEFAULT_FONT_SCALE); } catch { return DEFAULT_FONT_SCALE; }
  });
  const [backgroundChatNotifications,setBackgroundChatNotifications]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('nexus-settings')||'{}').backgroundChatNotifications!==false}catch{return true}
  });

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };
  const markSectionSeen = (section: SeenSection) => {
    if (seenSections[section] === SECTION_REVISIONS[section]) return;
    const next = { ...seenSections, [section]: SECTION_REVISIONS[section] };
    setSeenSections(next);
    localStorage.setItem(seenSectionsKey, JSON.stringify(next));
  };
  const sectionIsUnseen = (section: SeenSection) => seenSections[section] !== SECTION_REVISIONS[section];
  const openChat = (channel: string) => {
    if (!channel.startsWith('dm:')) markSectionSeen('channels');
    setChatChannel(channel);
  };
  const refreshChatChannels = async () => {
    if (!backend.enabled) { setChatChannels(publicChatChannels); return; }
    const channels = await backend.listChatChannels();
    setChatChannels(channels.length ? channels : publicChatChannels);
  };
  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    const current = (() => { try { return JSON.parse(localStorage.getItem('nexus-settings') || '{}'); } catch { return {}; } })();
    localStorage.setItem('nexus-settings', JSON.stringify({ ...current, theme: nextTheme }));
  };
  const setFontScale = (nextScale: number) => {
    const safeScale = clampFontScale(nextScale);
    setFontScaleState(safeScale);
    const current = (() => { try { return JSON.parse(localStorage.getItem('nexus-settings') || '{}'); } catch { return {}; } })();
    localStorage.setItem('nexus-settings', JSON.stringify({ ...current, fontScale: safeScale }));
  };
  const markNotificationsRead = async (notificationId?: string) => {
    try {
      if (backend.enabled) {
        await backend.markNotificationsRead(notificationId);
        setCloudNotifications(current=>{
          const next=current.map(item=>!notificationId||item.id===notificationId?{...item,readAt:new Date().toISOString()}:item);
          setHasUnreadNotifications(next.some(item=>!item.readAt));
          return next;
        });
      } else {
        localStorage.setItem('nexus-notifications-read', 'true');
        setHasUnreadNotifications(false);
      }
      if (!notificationId) notify('Notifications marked as read.');
    } catch (error) {
      notify(backendErrorMessage(error, 'Notifications could not be updated.'));
    }
  };
  const setPartyMembers = (members: PartyMember[]) => {
    setPartyMembersState(members);
    if (!backend.enabled) localStorage.setItem('nexus-party', JSON.stringify(members));
  };
  useEffect(() => {
    if (!backend.enabled) return;
    let active = true;
    Promise.all([backend.getMyParty(), backend.getMyQueue()]).then(([party, activeQueue]) => {
      if (!active) return;
      if (party) {
        setPartyMembersState(party.members.map(member => ({
          userId: member.userId,
          handle: member.handle,
          rating: member.rating,
          ready: member.ready,
          leader: member.leader,
          avatarDataUrl: member.avatarUrl,
        })));
      }
      if (activeQueue) {
        const queue = queues.find(item => queueFormat(item.id) === activeQueue.format);
        if (queue) setSelectedQueue({ ...queue, region: activeQueue.region });
        setMatchmakingMode(activeQueue.mode);
        const restoredStart = Date.parse(activeQueue.joinedAt);
        setQueueStartedAt(Number.isFinite(restoredStart) ? restoredStart : Date.now());
        setQueued(true);
      } else {
        setQueueStartedAt(null);
        setQueued(false);
      }
    }).catch(error => {
      if (active) notify(backendErrorMessage(error, 'Matchmaking state could not be restored.'));
    });
    return () => { active = false; };
  }, [account.handle]);
  useEffect(()=>{
    if(!backend.enabled)return;
    let active=true;
    const refreshAccess=()=>backend.getMyPlatformAccess().then(access=>{if(active){setPlatformAccess(access);setPlatformAccessLoaded(true)}}).catch(error=>{if(active){setPlatformAccessLoaded(true);notify(backendErrorMessage(error,'Account permissions could not be checked.'))}});
    void refreshAccess();
    const timer=window.setInterval(refreshAccess,30000);
    return()=>{active=false;window.clearInterval(timer)};
  },[account.handle]);
  useEffect(()=>{
    if(!backend.enabled||!platformAccessLoaded||platformAccess.banned)return;
    let active=true;
    let presenceChannel:RealtimeChannel|null=null;
    void backend.subscribeOnline(users=>{if(active)setOnlineUsers(users)}).then(channel=>{
      if(active)presenceChannel=channel;
      else void backend.unsubscribe(channel);
    });
    return()=>{active=false;setOnlineUsers([]);void backend.unsubscribe(presenceChannel)};
  },[account.handle,platformAccessLoaded,platformAccess.banned]);
  useEffect(()=>{
    if(!backend.enabled||!platformAccessLoaded||platformAccess.banned)return;
    let active=true;
    const refresh=()=>refreshChatChannels().catch(error=>{if(active)notify(backendErrorMessage(error,'Channels could not be loaded.'))});
    void refresh();
    const subscription=backend.subscribeChatChannels(refresh);
    return()=>{active=false;void backend.unsubscribe(subscription)};
  },[account.handle,platformAccessLoaded,platformAccess.banned]);
  useEffect(()=>{
    if(!backend.enabled||!window.starladderDesktop||!backgroundChatNotifications||platformAccess.banned)return;
    let active=true;
    let chatNotificationChannel:RealtimeChannel|null=null;
    void backend.subscribeIncomingChat(message=>{
      if(active)void window.starladderDesktop?.showBackgroundChatNotification({author:message.author,channel:message.channel,body:message.text});
    }).then(channel=>{
      if(active)chatNotificationChannel=channel;
      else void backend.unsubscribe(channel);
    });
    return()=>{active=false;void backend.unsubscribe(chatNotificationChannel)};
  },[account.handle,backgroundChatNotifications,platformAccess.banned]);
  useEffect(()=>{
    if(!window.starladderDesktop)return;
    const remove=window.starladderDesktop.onOpenChatChannel(channel=>openChat(channel));
    return remove;
  },[]);
  useEffect(()=>{
    const updateBackgroundState=()=>document.documentElement.classList.toggle('starladder-background',document.hidden);
    updateBackgroundState();
    document.addEventListener('visibilitychange',updateBackgroundState);
    return()=>document.removeEventListener('visibilitychange',updateBackgroundState);
  },[]);
  useEffect(()=>{
    if(!backend.enabled||!platformAccessLoaded||platformAccess.banned)return;
    let active=true;
    let notificationChannel:RealtimeChannel|null=null;
    const refreshNotifications=()=>backend.listNotifications().then(items=>{
      if(!active)return;
      setCloudNotifications(items);
      setHasUnreadNotifications(items.some(item=>!item.readAt));
    }).catch(error=>{if(active)notify(backendErrorMessage(error,'Notifications could not be loaded.'))});
    void refreshNotifications();
    void backend.subscribeNotifications(()=>void refreshNotifications()).then(channel=>{
      if(active)notificationChannel=channel;
      else void backend.unsubscribe(channel);
    });
    return()=>{active=false;void backend.unsubscribe(notificationChannel)};
  },[account.handle,platformAccessLoaded,platformAccess.banned]);
  useEffect(()=>{
    const handleShortcut=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setPanel({mode:'search'})}
      if(event.key==='Escape'){setPanel(null);setChatChannel(null);setProfileOpen(false);setPartyOpen(false)}
    };
    window.addEventListener('keydown',handleShortcut);return()=>window.removeEventListener('keydown',handleShortcut);
  },[]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--starladder-font-scale', String(fontScale));
    if (window.starladderDesktop) {
      document.documentElement.style.removeProperty('zoom');
      window.starladderDesktop.setUiScale(fontScale);
    } else {
      document.documentElement.style.setProperty('zoom', String(fontScale));
    }
  }, [fontScale]);
  useEffect(() => {
    if (!window.starladderDesktop) return;
    void window.starladderDesktop.getCaptureSettings().then((settings) => {
      if (settings.configured) {
        const remembered = localStorage.getItem('nexus-capture-setup-v1');
        if (!remembered) {
          localStorage.setItem('nexus-capture-setup-v1', JSON.stringify({ completedAt: new Date().toISOString(), accelerator: settings.accelerator, folder: settings.folder, restored: true }));
        }
        setCaptureSetupComplete(true);
      }
    }).finally(() => setCaptureSetupResolved(true));
  }, []);
  useEffect(() => {
    if (!window.starladderDesktop) return;
    const removeComplete = window.starladderDesktop.onCaptureComplete((result) => {
      if (result.ok && result.record) notify(`Evidence saved locally${result.record.matchId ? ` for ${result.record.matchId}` : ''}.`);
    });
    const removeFailed = window.starladderDesktop.onCaptureFailed((result) => notify(result.reason || 'Screenshot capture failed.'));
    return () => { removeComplete(); removeFailed(); };
  }, []);

  if (!platformAccessLoaded) return <div className="alpha-boot"><ShieldCheck size={34}/><b>CHECKING ACCOUNT ACCESS</b></div>;
  if (platformAccess.banned) return <AccessRestricted account={account} access={platformAccess} onLogout={onLogout}/>;
  if (!captureSetupResolved) return <div className="alpha-boot"><Camera size={34}/><b>LOADING CAPTURE HOTKEY</b></div>;

  if (!captureSetupComplete && window.starladderDesktop) {
    return <CaptureSetup onComplete={() => setCaptureSetupComplete(true)} />;
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="rail">
        <button className="brand" onClick={() => setPage('Play')} aria-label="STARLADDER home">
          <span className="brand-mark"><img src="./starladder-icon-512-cyan.png" alt="" /></span>
          <span>SL</span>
        </button>
        <nav className="primary-nav">
          <p className="eyebrow nav-label">COMPETE</p>
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} className={page === label ? 'active' : ''} onClick={() => { if (label === 'Missions') markSectionSeen('missions'); setPage(label); }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Missions' && sectionIsUnseen('missions') && <b className="live-dot" />}
            </button>
          ))}
          {platformAccess.role&&<><p className="eyebrow nav-label community-label">CONTROL</p><button className={page==='Admin'?'active':''} onClick={()=>setPage('Admin')}><ShieldCheck size={18}/><span>Admin</span></button></>}
          <p className="eyebrow nav-label community-label">COMMUNITY</p>
          <button onClick={() => setPanel({mode:'party-finder'})}><Users size={18} /><span>Party Finder</span></button>
          <button onClick={() => openChat('general')}><MessageSquare size={18} /><span>Channels</span>{sectionIsUnseen('channels') && <b className="live-dot" />}</button>
        </nav>
        <div className="rail-bottom">
          <button onClick={()=>setPanel({mode:'support'})}><CircleHelp size={18} /><span>Support</span></button>
          <button onClick={()=>setPanel({mode:'settings'})}><Settings size={18} /><span>Settings</span></button>
          <div className="connection"><span /><div><b>{backend.enabled?'ALPHA CLOUD':'LOCAL ALPHA'}</b><small>{backend.enabled?'Services connected':'Setup credentials to connect'}</small></div></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="search" onClick={()=>setPanel({mode:'search'})}><Search size={17} /><span>Search pilots, orgs, tournaments...</span><kbd>Ctrl K</kbd></button>
          <div className="top-actions">
            <button className="icon-button" aria-label="Local match evidence" onClick={()=>setEvidenceOpen(true)}><Camera size={18}/></button>
            <button className="icon-button" aria-label={hasUnreadNotifications?'Notifications, unread items':'Notifications'} onClick={()=>setPanel({mode:'notifications'})}><Bell size={18} />{hasUnreadNotifications&&<i />}</button>
            <button className="profile-chip" onClick={() => setProfileOpen(true)}>
              <Avatar account={account} />
              <span><b>{account.handle}</b><small><i /> {platformAccess.role==='owner'?'Head Admin · RSI verified':'RSI verified'}</small></span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        <div className="page-wrap">
          {page === 'Play' && <PlayPage selectedQueue={selectedQueue} setSelectedQueue={setSelectedQueue} matchmakingMode={matchmakingMode} setMatchmakingMode={setMatchmakingMode} queued={queued} setQueued={setQueued} queueStartedAt={queueStartedAt} setQueueStartedAt={setQueueStartedAt} setPartyOpen={setPartyOpen} partySize={partyMembers.length} notify={notify} openPanel={(mode,title)=>setPanel({mode,title})} viewMatches={()=>setPage('Matches')} />}
          {page === 'Matches' && <MatchesPage openPanel={(mode,title)=>setPanel({mode,title})} openEvidence={()=>setEvidenceOpen(true)} />}
          {page === 'Tournaments' && <TournamentsPage notify={notify} openPanel={(mode,title,event)=>setPanel({mode,title,event})} partySize={partyMembers.length} refreshKey={communityEventRevision} />}
          {page === 'Rankings' && <RankingsPage />}
          {page === 'Organizations' && <OrganizationsPage />}
          {page === 'Missions' && <MissionsPage />}
          {page === 'Admin' && platformAccess.role && <AdminPage access={platformAccess} notify={notify} onEventsChanged={()=>setCommunityEventRevision(value=>value+1)} />}
        </div>
      </main>

      <SocialRail accountHandle={account.handle} onlineUsers={onlineUsers} channels={chatChannels} notify={notify} onOpenChat={openChat} onOpenParty={() => setPartyOpen(true)} onSearch={()=>setPanel({mode:'search'})} partySize={partyMembers.length} />
      {partyOpen && <PartyDrawer account={account} selectedQueue={selectedQueue} matchmakingMode={matchmakingMode} members={partyMembers} setMembers={setPartyMembers} setQueued={setQueued} setQueueStartedAt={setQueueStartedAt} close={() => setPartyOpen(false)} notify={notify} />}
      {profileOpen && <ProfileDrawer account={account} close={() => setProfileOpen(false)} save={onAccountUpdate} onLogout={onLogout} notify={notify} />}
      {chatChannel && <ChatDrawer account={account} onlineUsers={onlineUsers} channels={chatChannels} channel={chatChannel} setChannel={openChat} refreshChannels={refreshChatChannels} close={() => setChatChannel(null)} notify={notify} />}
      {evidenceOpen && <EvidenceDrawer matchId="" close={()=>setEvidenceOpen(false)} notify={notify} reconfigure={()=>{localStorage.removeItem('nexus-capture-setup-v1');setEvidenceOpen(false);setCaptureSetupComplete(false)}} />}
      {panel && <UtilityPanel panel={panel} account={account} access={platformAccess} selectedQueue={selectedQueue} members={partyMembers} setPage={setPage} close={()=>setPanel(null)} notify={notify} theme={theme} setTheme={setTheme} fontScale={fontScale} setFontScale={setFontScale} backgroundChatNotifications={backgroundChatNotifications} setBackgroundChatNotifications={setBackgroundChatNotifications} onCommunityEventCreated={()=>setCommunityEventRevision(value=>value+1)} hasUnreadNotifications={hasUnreadNotifications} cloudNotifications={cloudNotifications} markNotificationsRead={markNotificationsRead} />}
      {toast && <div className="toast"><ShieldCheck size={18} />{toast}</div>}
    </div>
  );
}

const hotkeyLabel = (accelerator: string) => accelerator.replace('Control', 'Ctrl').replace('Super', 'Win').split('+').join(' + ');

const acceleratorFromEvent = (event: KeyboardEvent) => {
  const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);
  if (modifierKeys.has(event.key)) return '';
  const modifiers = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean) as string[];
  if (!modifiers.length) return '';
  let key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (key === 'PrintScreen') key = 'PrintScreen';
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|PrintScreen)$/.test(key)) return '';
  return [...modifiers, key].join('+');
};

function CaptureSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [accelerator, setAccelerator] = useState('Control+Shift+F12');
  const [folder, setFolder] = useState('Pictures\\StarLadder\\Captures');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testCapture, setTestCapture] = useState<LocalCapture | null>(null);

  useEffect(() => {
    void window.starladderDesktop?.getCaptureSettings().then(settings => {
      if (settings.accelerator) setAccelerator(settings.accelerator);
      if (settings.folder) setFolder(settings.folder);
    });
  }, []);
  useEffect(() => {
    if (!recording) return;
    const listen = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { setRecording(false); return; }
      const next = acceleratorFromEvent(event);
      if (next) { setAccelerator(next); setRecording(false); setError(''); }
    };
    window.addEventListener('keydown', listen, true);
    return () => window.removeEventListener('keydown', listen, true);
  }, [recording]);
  useEffect(() => {
    if (step !== 1 || !window.starladderDesktop) return;
    const remove = window.starladderDesktop.onCaptureComplete(result => {
      if (result.ok && result.record) { setTestCapture(result.record); setError(''); }
    });
    const removeFailed = window.starladderDesktop.onCaptureFailed(result => setError(result.reason || 'The test capture failed.'));
    return () => { remove(); removeFailed(); };
  }, [step]);

  const configure = async () => {
    setBusy(true); setError('');
    const result = await window.starladderDesktop!.configureCaptureShortcut(accelerator);
    setBusy(false);
    if (!result.ok) { setError(result.reason || 'Could not register that hotkey.'); return; }
    if (result.folder) setFolder(result.folder);
    setStep(1);
  };
  const finish = () => {
    localStorage.setItem('nexus-capture-setup-v1', JSON.stringify({ completedAt: new Date().toISOString(), accelerator, folder, version: 2 }));
    onComplete();
  };

  return <div className="capture-setup-shell">
    <div className="capture-setup-brand"><span className="brand-mark"><img src="./starladder-icon-512.png" alt=""/></span><b>STARLADDER</b><span>INITIAL PILOT SETUP</span></div>
    <section className="capture-setup-card">
      <div className="setup-progress"><span className={step>=0?'active':''}>1</span><i/><span className={step>=1?'active':''}>2</span><i/><span className={step>=2?'active':''}>3</span></div>
      {step===0&&<>
        <span className="eyebrow">LOCAL MATCH EVIDENCE</span><h1>SET YOUR CAPTURE HOTKEY</h1>
        <p>STARLADDER can take a full-resolution screenshot of the display under your cursor—even while Star Citizen is focused. Captures stay on this PC until you choose to submit them.</p>
        <button className={`hotkey-recorder ${recording?'recording':''}`} onClick={()=>setRecording(true)}><Keyboard size={24}/><span>{recording?'PRESS YOUR KEY COMBINATION':hotkeyLabel(accelerator)}</span><small>{recording?'Escape cancels':'Click to change'}</small></button>
        <div className="setup-note"><ShieldCheck/><span><b>PRIVATE BY DEFAULT</b><small>Nothing is uploaded automatically. STARLADDER only stores PNG files in your Pictures folder.</small></span></div>
        {error&&<div className="setup-error"><AlertTriangle/>{error}</div>}
        <button className="primary setup-next" disabled={busy||recording} onClick={()=>void configure()}>{busy?'REGISTERING...':'REGISTER HOTKEY'} <ChevronRight/></button>
      </>}
      {step===1&&<>
        <span className="eyebrow">HOTKEY TEST</span><h1>TAKE A TEST CAPTURE</h1>
        <p>Press <kbd>{hotkeyLabel(accelerator)}</kbd> now. During a match, use the same shortcut whenever the scoreboard or result screen is visible. Borderless or fullscreen-windowed mode gives Windows the most reliable capture.</p>
        <div className={`capture-test-zone ${testCapture?'success':''}`}>{testCapture?<><img src={testCapture.thumbnail} alt="Test screenshot preview"/><div><ShieldCheck/><b>CAPTURE SAVED</b><span>{new Date(testCapture.takenAt).toLocaleString()}</span></div></>:<><Crosshair size={42}/><b>WAITING FOR HOTKEY</b><span>STARLADDER can remain in the background.</span></>}</div>
        <div className="setup-actions"><button className="secondary" onClick={()=>void window.starladderDesktop?.captureEvidenceNow()}><Camera/> TAKE TEST WITH BUTTON</button><button className="primary" disabled={!testCapture} onClick={()=>setStep(2)}>CONTINUE <ChevronRight/></button></div>
        {error&&<div className="setup-error"><AlertTriangle/>{error}</div>}
      </>}
      {step===2&&<>
        <span className="eyebrow">READY FOR COMPETITION</span><h1>EVIDENCE CAPTURE IS READY</h1>
        <div className="setup-complete-icon"><ShieldCheck/></div>
        <div className="setup-summary"><div><Keyboard/><span><small>GLOBAL HOTKEY</small><b>{hotkeyLabel(accelerator)}</b></span></div><div><FolderOpen/><span><small>LOCAL STORAGE</small><b>{folder}</b></span></div></div>
        <p>When a STARLADDER match is active, new screenshots are linked to that match automatically. Open Match Center to review them before confirming or disputing a result.</p>
        <button className="primary setup-next" onClick={finish}>ENTER STARLADDER <ChevronRight/></button>
      </>}
    </section>
  </div>;
}

function EvidenceDrawer({matchId,close,notify,reconfigure}:{matchId:string;close:()=>void;notify:(message:string)=>void;reconfigure:()=>void}) {
  const [captures,setCaptures]=useState<LocalCapture[]>([]);
  const [settings,setSettings]=useState<CaptureSettings|null>(null);
  const [loading,setLoading]=useState(true);
  const refresh=async()=>{
    if(!window.starladderDesktop){setLoading(false);return;}
    const [nextCaptures,nextSettings]=await Promise.all([window.starladderDesktop.listLocalCaptures(matchId||undefined),window.starladderDesktop.getCaptureSettings()]);
    setCaptures(nextCaptures);setSettings(nextSettings);setLoading(false);
  };
  useEffect(()=>{void refresh();const remove=window.starladderDesktop?.onCaptureComplete(()=>void refresh());return()=>remove?.()},[matchId]);
  const capture=async()=>{const result=await window.starladderDesktop?.captureEvidenceNow();if(!result?.ok)notify(result?.reason||'Capture failed.');};
  const importBrowserEvidence=async(files:FileList|null)=>{
    const selected=Array.from(files||[]).filter(file=>['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size<=20*1024*1024).slice(0,8);
    const imported=await Promise.all(selected.map(file=>new Promise<LocalCapture>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({id:`web-${file.name}-${file.lastModified}`,name:file.name,path:'',takenAt:new Date(file.lastModified||Date.now()).toISOString(),size:file.size,matchId,thumbnail:String(reader.result)});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})));
    setCaptures(current=>[...imported,...current]);
    if(imported.length)notify(`${imported.length} screenshot${imported.length===1?'':'s'} ready for this match.`);
  };
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="evidence-drawer" onMouseDown={event=>event.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">LOCAL EVIDENCE</span><h2>{matchId||'RECENT CAPTURES'}</h2></div><button onClick={close}><X/></button></div>
    {window.starladderDesktop?<><div className="evidence-toolbar"><div><Keyboard/><span><small>CAPTURE HOTKEY</small><b>{settings?.accelerator?hotkeyLabel(settings.accelerator):'NOT CONFIGURED'}</b></span></div><button onClick={reconfigure}>CHANGE</button></div><div className="evidence-privacy"><LockKeyhole/><span><b>STORED LOCALLY</b><small>These files are not uploaded until an evidence submission is confirmed.</small></span></div><div className="evidence-actions"><button className="primary" onClick={()=>void capture()}><Camera/> CAPTURE NOW</button><button className="secondary" onClick={()=>void window.starladderDesktop?.openCapturesFolder()}><FolderOpen/> OPEN FOLDER</button></div></>:<><div className="web-evidence-notice"><Upload/><span><b>WEB EVIDENCE</b><small>Browsers cannot register a system-wide hotkey. Take the screenshot with Windows, then select it here for the match.</small></span></div><div className="evidence-actions"><label className="primary web-file-button"><Upload/> SELECT SCREENSHOTS<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>void importBrowserEvidence(event.target.files)}/></label></div></>}
    <div className="evidence-list">{loading?<div className="evidence-empty"><Orbit/><b>LOADING CAPTURES</b></div>:captures.length===0?<div className="evidence-empty"><ImageIcon/><b>NO LOCAL EVIDENCE YET</b><span>{window.starladderDesktop?'Use your hotkey while the match result is visible.':'Select screenshots taken with Windows, Game Bar, or another capture tool.'}</span></div>:captures.map(capture=><button key={capture.id} className="evidence-item" onClick={()=>capture.path&&void window.starladderDesktop?.revealLocalCapture(capture.path)}><img src={capture.thumbnail} alt="Local match evidence"/><span><b>{new Date(capture.takenAt).toLocaleString()}</b><small>{capture.matchId||'UNASSIGNED'} · {(capture.size/1024/1024).toFixed(1)} MB</small></span>{capture.path?<FolderOpen/>:<ShieldCheck/>}</button>)}</div>
    <p className="evidence-footnote">For disputes, select the relevant local captures in the submission flow. Automatic uploading remains disabled during alpha.</p>
  </aside></div>;
}

function AuthFlow({ onComplete }: { onComplete: (account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [step, setStep] = useState<'account' | 'verify'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [code] = useState(() => `SL-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`);
  const [checking, setChecking] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const continueAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (!backend.enabled) { setStep('verify'); return; }
    setAccountBusy(true);
    try {
      if (mode === 'register') {
        const result = await backend.register(email.trim(), password);
        if (result.needsEmailConfirmation) {
          setMode('login');
          setError('Check your email to confirm the account, then sign in here to finish RSI verification.');
          return;
        }
        setStep('verify');
      } else {
        const existing = await backend.signIn(email.trim(), password);
        if (existing?.verified) onComplete(existing);
        else setStep('verify');
      }
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Could not access the STARLADDER account service.');
    } finally {
      setAccountBusy(false);
    }
  };

  const verify = async () => {
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(handle.trim())) {
      setError('Enter your exact public RSI handle.');
      return;
    }
    setChecking(true); setError('');
    try {
      if (backend.enabled) {
        const verified = await backend.verifyRsi(handle.trim(), code);
        onComplete(verified);
        return;
      }
      const dossierCheck: Promise<{ ok: boolean; reason?: string }> = window.starladderDesktop
        ? window.starladderDesktop.verifyRsiProfile(handle.trim(), code)
        : new Promise<{ok:boolean}>((resolve) => window.setTimeout(() => resolve({ok:true}), 900));
      const clientTimeout = new Promise<never>((_resolve, reject) =>
        window.setTimeout(() => reject(new Error('The dossier check timed out. Please retry.')), 15000),
      );
      const result = await Promise.race([dossierCheck, clientTimeout]);
      if (!result.ok) { setError(result.reason || 'Verification failed.'); return; }
      onComplete({ email, handle: handle.trim(), verified: true, verifiedAt: new Date().toISOString() });
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Verification failed. Please retry.');
    } finally {
      setChecking(false);
    }
  };

  return <div className="auth-shell">
    <div className="auth-grid" />
    <div className="auth-orbit auth-orbit-a" /><div className="auth-orbit auth-orbit-b" />
    <header className="auth-header"><div className="brand"><span className="brand-mark"><img src="./starladder-icon-512.png" alt=""/></span><span>STARLADDER</span></div><span>STAR CITIZEN COMPETITIVE NETWORK</span></header>
    <section className="auth-story">
      <span className="season-tag"><span/> VERIFIED COMPETITION</span>
      <h1>ONE CITIZEN.<br/><em>ONE RECORD.</em></h1>
      <p>Every STARLADDER competitor is connected to a public RSI identity. Verified pilots protect matchmaking, rankings, and tournament integrity.</p>
      <div className="trust-list"><div><ShieldCheck/><span><b>RSI IDENTITY</b><small>Public profile ownership check</small></span></div><div><Medal/><span><b>TRUSTED RANKINGS</b><small>One competitive record per citizen</small></span></div><div><Swords/><span><b>FAIR COMPETITION</b><small>Account-level sanctions and history</small></span></div></div>
    </section>
    <section className="auth-card">
      <div className="auth-stepper"><span className="done">1</span><i className={step==='verify'?'done':''}/><span className={step==='verify'?'done':''}>2</span><div><small>ACCOUNT</small><small>RSI VERIFICATION</small></div></div>
      {step === 'account' ? <>
        <div className="auth-title"><span className="eyebrow">ACCESS STARLADDER</span><h2>{mode === 'register' ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</h2><p>{mode === 'register' ? 'Your competitive identity starts here.' : 'Sign in to continue your competitive record.'}</p></div>
        <div className="auth-switch"><button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>REGISTER</button><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>SIGN IN</button></div>
        <form onSubmit={continueAccount}>
          <label>EMAIL ADDRESS<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pilot@example.com" autoComplete="email"/></label>
          <label>PASSWORD<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 characters minimum" autoComplete={mode==='register'?'new-password':'current-password'}/></label>
          {error && <div className="auth-error"><AlertTriangle size={15}/>{error}</div>}
          <button className="primary auth-submit" type="submit" disabled={accountBusy}>{accountBusy?<><Activity className="spin" size={16}/> CONNECTING...</> : <>{mode==='register'?'CREATE ACCOUNT':'SIGN IN'} <ChevronRight size={16}/></>}</button>
        </form>
        <p className="auth-legal">By continuing, you agree to the STARLADDER Terms of Service and Competitive Code.</p>
      </> : <>
        <button className="auth-back" onClick={()=>{setStep('account');setError('')}}>← BACK TO ACCOUNT</button>
        <div className="auth-title"><span className="eyebrow">OWNERSHIP CHECK</span><h2>VERIFY STAR CITIZEN</h2><p>Place your unique code anywhere in the Bio field of your public RSI Citizen Dossier.</p></div>
        <div className="verify-steps">
          <div><span>01</span><p>Open <b>RSI Account → Profile</b> and find the Bio field.</p><a href="https://robertsspaceindustries.com/account/profile" target="_blank" rel="noreferrer">OPEN RSI PROFILE <ChevronRight size={13}/></a></div>
          <div><span>02</span><p>Paste this unique ownership code into your bio and save it.</p><button className="bio-code" onClick={async()=>{await navigator.clipboard.writeText(code);setCopied(true)}}><code>{code}</code><b>{copied?'COPIED':'COPY'}</b></button></div>
          <div><span>03</span><p>Enter your exact RSI handle, then let STARLADDER check the public dossier.</p><label>RSI HANDLE<input value={handle} onChange={e=>setHandle(e.target.value)} placeholder="Example: ArcRunner"/></label></div>
        </div>
        {error && <div className="auth-error"><AlertTriangle size={15}/>{error}</div>}
        <button className="primary auth-submit" onClick={verify} disabled={checking}>{checking ? <><Activity className="spin" size={16}/> CHECKING PUBLIC DOSSIER...</> : <><ShieldCheck size={16}/> VERIFY OWNERSHIP</>}</button>
        <div className="verify-note"><Info size={14}/><p>Your password is never shared with RSI. STARLADDER only reads the public Citizen Dossier at <b>/citizens/{handle || 'YourHandle'}</b>. You can remove the code after verification.</p></div>
      </>}
    </section>
    <footer className="auth-footer"><span>STARLADDER ALPHA 8.0</span><span>SYSTEM STATUS <i/> OPERATIONAL</span></footer>
  </div>;
}

function PlayPage({ selectedQueue, setSelectedQueue, matchmakingMode, setMatchmakingMode, queued, setQueued, queueStartedAt, setQueueStartedAt, setPartyOpen, partySize, notify, openPanel, viewMatches }: {
  selectedQueue: typeof queues[number]; setSelectedQueue: (q: typeof queues[number]) => void;
  matchmakingMode:MatchmakingMode;setMatchmakingMode:(mode:MatchmakingMode)=>void;queued: boolean; setQueued: (v: boolean) => void; queueStartedAt:number|null;setQueueStartedAt:(value:number|null)=>void;setPartyOpen: (v: boolean) => void; partySize: number; notify: (s: string) => void; openPanel:(mode:PanelMode,title?:string)=>void;viewMatches:()=>void;
}) {
  const [queuePhase,setQueuePhase]=useState<'idle'|'joining'|'leaving'>('idle');
  const [queueClock,setQueueClock]=useState(Date.now());
  const [myRating,setMyRating]=useState<CloudRatingRow|null>(null);
  const [myMatches,setMyMatches]=useState<CloudMatchSummary[]>([]);
  const [activityLoading,setActivityLoading]=useState(backend.enabled);
  const queueBusy=queuePhase!=='idle';
  useEffect(()=>{
    let active=true;
    setActivityLoading(backend.enabled);
    if(!backend.enabled){setMyRating(null);setMyMatches([]);setActivityLoading(false);return()=>{active=false}}
    Promise.all([matchmakingMode==='ranked'?backend.getMyRating(queueFormat(selectedQueue.id)):Promise.resolve(null),backend.listMyMatches(20)])
      .then(([rating,matches])=>{if(active){setMyRating(rating);setMyMatches(matches.filter(match=>match.mode===matchmakingMode).slice(0,5))}})
      .catch(()=>{if(active){setMyRating(null);setMyMatches([])}})
      .finally(()=>{if(active)setActivityLoading(false)});
    return()=>{active=false};
  },[selectedQueue.id,matchmakingMode]);
  useEffect(()=>{
    if(!queued)return;
    let timer=0;
    const update=()=>{setQueueClock(Date.now());timer=window.setTimeout(update,document.hidden?15000:1000)};
    const handleVisibility=()=>{window.clearTimeout(timer);update()};
    update();document.addEventListener('visibilitychange',handleVisibility);
    return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',handleVisibility)};
  },[queued,queueStartedAt]);
  const elapsedSeconds=queued&&queueStartedAt?Math.floor((queueClock-queueStartedAt)/1000):0;
  const cancelQueue=async()=>{
    if(queueBusy)return;
    const previousStart=queueStartedAt;
    setQueuePhase('leaving');
    setQueueStartedAt(null);
    setQueued(false);
    try{
      if(backend.enabled)await backend.cancelMyQueue();
      notify('Your party left the queue.');
    }catch(error){
      setQueueStartedAt(previousStart||Date.now());
      setQueued(true);
      notify(backendErrorMessage(error,'Queue cancellation failed.'));
    }finally{setQueuePhase('idle')}
  };
  const queueOperation=async(q:typeof queues[number])=>{
    if(queueBusy)return;
    const required=queueCapacity(q.id);
    if(partySize!==required){if(!queued)setSelectedQueue(q);notify(`${q.mode.split(' · ')[0]} requires exactly ${required} pilot${required===1?'':'s'}. Your party has ${partySize}.`);return}
    if(queued&&selectedQueue.id===q.id){notify(`Already searching ${q.name}.`);return}
    const previousQueue=selectedQueue;
    const previousStart=queueStartedAt;
    const wasQueued=queued;
    const optimisticStart=Date.now();
    setSelectedQueue(q);
    setQueueStartedAt(optimisticStart);
    setQueueClock(optimisticStart);
    setQueued(true);
    setQueuePhase('joining');
    try{
      if(backend.enabled){
        if(wasQueued)await backend.cancelMyQueue();
        const partyId=await backend.createOrGetPartyId(queueFormat(q.id));
        await backend.queueParty(partyId,queueFormat(q.id),matchmakingMode,q.region);
      }
      notify(`Searching ${matchmakingMode} ${q.name} with ${partySize} pilot${partySize===1?'':'s'}…`);
    }catch(error){
      setSelectedQueue(previousQueue);
      setQueueStartedAt(previousStart);
      setQueued(wasQueued);
      notify(backendErrorMessage(error,'The party could not enter the queue.'));
    }finally{setQueuePhase('idle')}
  };
  return <>
    <section className="hero">
      <div className="hero-grid" />
      <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
      <div className="hero-content">
        <div className="season-tag"><span /> SEASON 01 · FIRST CONTACT</div>
        <h1>YOUR NEXT<br/><em>ENGAGEMENT</em></h1>
        <p>Queue into structured Star Citizen competition. Every outcome matters. Every rating is earned.</p>
        <div className="hero-actions">
          <button className={`${queued ? 'primary danger' : 'primary'} ${queueBusy?'queue-syncing':''}`} aria-disabled={queueBusy} onClick={() => queued?void cancelQueue():void queueOperation(selectedQueue)}>
            {queuePhase==='joining'?<><span className="queue-sync-dot"/> CONNECTING</>:queuePhase==='leaving'?<><span className="queue-sync-dot"/> LEAVING</>:queued ? <><X size={18} /> LEAVE QUEUE</> : <><Zap size={18} fill="currentColor" /> {partySize>1?`QUEUE ${matchmakingMode.toUpperCase()} PARTY`:`FIND ${matchmakingMode.toUpperCase()} MATCH`}</>}
          </button>
          <button className="secondary" onClick={() => setPartyOpen(true)}><UserPlus size={18} /> {partySize>1?`PARTY ${partySize}/5`:'CREATE PARTY'}</button>
        </div>
      </div>
      <div className="rank-card">
        <div className="rank-emblem">{matchmakingMode==='ranked'?<Crown size={28}/>:<Gamepad2 size={28}/>}<b>{queueFormat(selectedQueue.id)}</b></div>
        {matchmakingMode==='ranked'?<><div><small>LIVE RANKED RATING</small><strong>{activityLoading?'—':(myRating?.rating??1500).toLocaleString()}</strong><span><i /> {myRating?`${myRating.wins} wins · ${myRating.losses} losses`:'No rated matches yet'}</span></div><div className="rank-progress"><span style={{width: myRating?`${Math.min(100,Math.round((myRating.wins/Math.max(1,myRating.wins+myRating.losses))*100))}%`:'0%'}} /></div><p>{myRating?<><b>{myRating.streak}</b> CURRENT WIN STREAK</>:'COMPLETE A VERIFIED MATCH TO BUILD YOUR RECORD'}</p></>:<><div><small>UNRANKED PRACTICE</small><strong>NO ELO</strong><span><i/> Match results do not affect rating</span></div><div className="rank-progress"><span style={{width:'100%'}}/></div><p>TRAIN, TEST ROSTERS, AND PLAY WITHOUT LADDER PRESSURE</p></>}
      </div>
    </section>

    {queued && <div className={`queue-banner ${queuePhase==='joining'?'syncing':''}`}>
      <div className="radar"><span /><i /></div>
      <div><b>{queuePhase==='joining'?`CONNECTING TO ${matchmakingMode.toUpperCase()} MATCHMAKING`:`${matchmakingMode.toUpperCase()} MATCHMAKING ACTIVE`}</b><small>{selectedQueue.name} · {selectedQueue.region}</small></div>
      <div className="queue-time"><small>ELAPSED</small><b>{formatQueueElapsed(elapsedSeconds)}</b></div>
      <div className="queue-time"><small>AVERAGE</small><b>BUILDING DATA</b></div>
      <button aria-disabled={queueBusy} onClick={() => void cancelQueue()}>{queuePhase==='joining'?'SYNCING':'CANCEL'}</button>
    </div>}

    <div className="section-heading play-matchmaking-head"><div><span className="eyebrow">MATCHMAKING</span><h2>SELECT AN OPERATION</h2></div><div className="matchmaking-mode-tabs"><button className={matchmakingMode==='ranked'?'active':''} disabled={queued||queueBusy} onClick={()=>setMatchmakingMode('ranked')}><Crown size={14}/> RANKED</button><button className={matchmakingMode==='unranked'?'active':''} disabled={queued||queueBusy} onClick={()=>setMatchmakingMode('unranked')}><Gamepad2 size={14}/> UNRANKED</button></div></div>
    <div className="queue-grid">
      {queues.map(q => <button key={q.id} aria-disabled={queueBusy} className={`queue-card ${q.accent} ${selectedQueue.id === q.id ? 'selected' : ''} ${queued&&selectedQueue.id===q.id?'searching':''} ${queueBusy?'queue-syncing':''}`} onClick={() => void queueOperation(q)}>
        <div className="queue-art"><Crosshair size={38} /><span className="queue-rating">{matchmakingMode}</span></div>
        <div className="queue-body"><small>{q.mode}</small><h3>{q.name}</h3><div className="queue-meta"><span><Radio size={13}/>{q.region}</span><span><Users size={13}/>ROSTER {queueCapacity(q.id)}</span></div></div>
        <div className="queue-footer"><span>{queued&&selectedQueue.id===q.id?(queuePhase==='joining'?'CONNECTING':'SEARCHING'):partySize===queueCapacity(q.id)?'CLICK TO QUEUE':`REQUIRES ${queueCapacity(q.id)} PILOTS`}</span>{queued&&selectedQueue.id===q.id?(queuePhase==='joining'?<span className="queue-sync-dot"/>:<Radio size={17}/>):<ChevronRight size={18}/>}</div>
      </button>)}
    </div>

    <div className="dashboard-grid">
      <section className="panel recent-panel">
        <div className="panel-title"><div><span className="eyebrow">COMBAT LOG</span><h3>RECENT MATCHES</h3></div><button onClick={viewMatches}>View all <ChevronRight size={15}/></button></div>
        {activityLoading?<LiveEmpty icon={<Orbit/>} title="LOADING MATCH HISTORY" detail="Reading your verified STARLADDER match records."/>:myMatches.length===0?<LiveEmpty icon={<Swords/>} title="NO MATCHES RECORDED" detail="Your queued and verified matches will appear here."/>:myMatches.map(m => <div className="match-row" key={m.id}>
          <span className={`result-mark ${m.status==='approved'?'win':''}`}><Swords size={16}/></span>
          <div className="match-name"><b>{m.format} {m.mode==='ranked'?'Ranked':'Unranked'}</b><small>{m.publicId} · {matchAge(m.updatedAt)}</small></div>
          <span className={`result-text ${m.status==='approved'?'win':''}`}>{matchStatusLabel(m.status)}</span><ChevronRight size={16}/>
        </div>)}
      </section>
      <section className="panel pulse-panel">
        <div className="panel-title"><div><span className="eyebrow">PERFORMANCE</span><h3>{matchmakingMode==='ranked'?'LIVE RANKED RECORD':'UNRANKED ACTIVITY'}</h3></div></div>
        {activityLoading?<LiveEmpty icon={<Orbit/>} title="LOADING ACTIVITY" detail={`Reading the current ${matchmakingMode} record.`}/>:matchmakingMode==='ranked'?<div className="pulse-stats"><div><small>WIN RATE</small><b>{myRating&&myRating.wins+myRating.losses?`${Math.round(myRating.wins/(myRating.wins+myRating.losses)*100)}%`:'—'}</b><span>{queueFormat(selectedQueue.id)}</span></div><div><small>RECORD</small><b>{myRating?`${myRating.wins}-${myRating.losses}`:'0-0'}</b><span>verified results</span></div><div><small>MATCHES</small><b>{myRating?myRating.wins+myRating.losses:0}</b><span>{myRating?`${myRating.wins} won`:'No data yet'}</span></div></div>:<div className="pulse-stats unranked-stats"><div><small>RATING EFFECT</small><b>NONE</b><span>ladder unchanged</span></div><div><small>FORMAT</small><b>{queueFormat(selectedQueue.id)}</b><span>same match rules</span></div><div><small>RECENT MATCHES</small><b>{myMatches.length}</b><span>practice activity</span></div></div>}
      </section>
    </div>
  </>;
}

function MatchesPage({openPanel,openEvidence}:{openPanel:(mode:PanelMode,title?:string)=>void;openEvidence:()=>void}) {
  const [activeTab,setActiveTab]=useState<'Active'|'Upcoming'|'Completed'|'Disputes'>('Active');
  const [matches,setMatches]=useState<CloudMatchSummary[]>([]);
  const [loading,setLoading]=useState(backend.enabled);
  useEffect(()=>{let active=true;if(!backend.enabled){setLoading(false);return()=>{active=false}}backend.listMyMatches().then(items=>{if(active)setMatches(items)}).catch(()=>{if(active)setMatches([])}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  const visible=matches.filter(match=>activeTab==='Active'?['active','pending_verification'].includes(match.status):activeTab==='Upcoming'?match.status==='scheduled':activeTab==='Completed'?['approved','cancelled'].includes(match.status):match.status==='disputed');
  return <div className="standard-page">
    <PageTitle eyebrow="MATCH CENTER" title="YOUR MATCHES" description="Only matches linked to your verified STARLADDER account appear here." action={<button className="secondary" onClick={()=>openPanel('match-rules')}><ClipboardCheck size={17}/> MATCH RULES</button>} />
    <div className="tabs">{(['Active','Upcoming','Completed','Disputes'] as const).map(tab=>{const count=matches.filter(match=>tab==='Active'?['active','pending_verification'].includes(match.status):tab==='Upcoming'?match.status==='scheduled':tab==='Completed'?['approved','cancelled'].includes(match.status):match.status==='disputed').length;return <button className={activeTab===tab?'active':''} onClick={()=>setActiveTab(tab)} key={tab}>{tab}{count>0&&<span>{count}</span>}</button>})}</div>
    <section className="panel history-panel clean-match-list">
      <div className="panel-title"><div><span className="eyebrow">LIVE DATA</span><h3>{activeTab.toUpperCase()} MATCHES</h3></div>{activeTab==='Active'&&<button onClick={openEvidence}>LOCAL CAPTURES <Camera size={15}/></button>}</div>
      {loading?<LiveEmpty icon={<Orbit/>} title="LOADING MATCHES" detail="Reading matches available to your account."/>:visible.length===0?<LiveEmpty icon={<ShieldCheck/>} title={`NO ${activeTab.toUpperCase()} MATCHES`} detail="This list will update when real matchmaking creates or changes a match."/>:visible.map(match=><article className="live-match-row" key={match.id}>
        <span className={`result-mark ${match.status==='approved'?'win':match.status==='disputed'?'loss':''}`}>{match.status==='disputed'?<AlertTriangle size={16}/>:<Swords size={16}/>}</span>
        <div className="match-name"><b>{match.format} {match.mode.toUpperCase()}</b><small>{match.publicId} · {matchAge(match.updatedAt)}</small></div>
        <div className="match-pilots">{match.players.map(player=><span key={player.userId} className={`avatar ${player.avatarUrl?'custom-avatar':''}`} title={`${player.handle} · Side ${player.side}`}>{player.avatarUrl?<img src={player.avatarUrl} alt=""/>:player.handle.slice(0,2).toUpperCase()}</span>)}</div>
        <span className={`result-text ${match.status==='approved'?'win':match.status==='disputed'?'loss':''}`}>{matchStatusLabel(match.status)}</span>
        <small>{match.starCitizenMatchId||'SC MATCH ID PENDING'}</small>
      </article>)}
    </section>
  </div>;
}

function AccessRestricted({account,access,onLogout}:{account:Account;access:PlatformAccess;onLogout:()=>Promise<void>}){
  return <div className="moderation-lock"><ShieldCheck size={42}/><span className="eyebrow">ACCOUNT ENFORCEMENT</span><h1>ACCESS SUSPENDED</h1><p><b>{account.handle}</b>, this STARLADDER account is currently banned.</p><div><small>REASON</small><strong>{access.banReason||'Platform rules violation'}</strong><small>EXPIRATION</small><strong>{access.banExpiresAt?new Date(access.banExpiresAt).toLocaleString():'Permanent'}</strong></div><button className="secondary" onClick={()=>void onLogout()}><LogOut size={15}/> SIGN OUT</button></div>;
}

function AdminPage({access,notify,onEventsChanged}:{access:PlatformAccess;notify:(message:string)=>void;onEventsChanged:()=>void}){
  const [tab,setTab]=useState<'disputes'|'events'|'users'>('disputes');
  const [disputes,setDisputes]=useState<CloudMatchDispute[]>([]);
  const [pendingEvents,setPendingEvents]=useState<CloudCommunityEvent[]>([]);
  const [users,setUsers]=useState<CloudAdminUser[]>([]);
  const [busy,setBusy]=useState('');
  const [query,setQuery]=useState('');
  const [banTarget,setBanTarget]=useState<CloudAdminUser|null>(null);
  const [banReason,setBanReason]=useState('');
  const [banDuration,setBanDuration]=useState('permanent');
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const refresh=async()=>{try{const [openDisputes,events,nextUsers]=await Promise.all([backend.listOpenMatchDisputes(),backend.listPendingCommunityEvents(),backend.listAdminUsers()]);setDisputes(openDisputes);setPendingEvents(events);setUsers(nextUsers)}catch(error){notify(backendErrorMessage(error,'Admin data could not be loaded.'))}};
  useEffect(()=>{void refresh()},[]);
  const resolveDispute=async(dispute:CloudMatchDispute,decision:'approve_result'|'void_match')=>{setBusy(dispute.id);try{await backend.resolveMatchDispute(dispute.id,decision,reviewNotes[dispute.id]||'');setDisputes(current=>current.filter(item=>item.id!==dispute.id));notify(`${dispute.publicId} ${decision==='approve_result'?'result approved':'voided'}.`)}catch(error){notify(backendErrorMessage(error,'Dispute review failed.'))}finally{setBusy('')}};
  const review=async(event:CloudCommunityEvent,decision:'approve'|'reject')=>{setBusy(event.id);try{await backend.reviewCommunityEvent(event.id,decision,reviewNotes[event.id]||'');setPendingEvents(current=>current.filter(item=>item.id!==event.id));onEventsChanged();notify(`${event.name} ${decision==='approve'?'approved and published':'rejected'}.`)}catch(error){notify(backendErrorMessage(error,'Event review failed.'))}finally{setBusy('')}};
  const changeRole=async(user:CloudAdminUser,role:'admin'|'moderator'|null)=>{setBusy(user.userId);try{await backend.setPlatformRole(user.userId,role);await refresh();notify(`${user.handle} is now ${role||'a standard user'}.`)}catch(error){notify(backendErrorMessage(error,'Role update failed.'))}finally{setBusy('')}};
  const applyBan=async()=>{if(!banTarget||banReason.trim().length<3)return;setBusy(banTarget.userId);try{const days=banDuration==='permanent'?0:Number(banDuration);const expiresAt=days?new Date(Date.now()+days*86400000).toISOString():undefined;await backend.banUser(banTarget.userId,banReason.trim(),expiresAt);setBanTarget(null);setBanReason('');await refresh();notify(`${banTarget.handle} was banned.`)}catch(error){notify(backendErrorMessage(error,'Ban failed.'))}finally{setBusy('')}};
  const unban=async(user:CloudAdminUser)=>{setBusy(user.userId);try{await backend.unbanUser(user.userId);await refresh();notify(`${user.handle} was unbanned.`)}catch(error){notify(backendErrorMessage(error,'Unban failed.'))}finally{setBusy('')}};
  const filteredUsers=users.filter(user=>user.handle.toLowerCase().includes(query.toLowerCase()));
  return <div className="standard-page admin-page">
    <PageTitle eyebrow={access.role==='owner'?'HEAD ADMIN · PLATFORM CONTROL':'PLATFORM CONTROL'} title="ADMIN CONSOLE" description="Review disputed match results, community events, staff access, and account enforcement."/>
    <div className="tabs">
      <button className={tab==='disputes'?'active':''} onClick={()=>setTab('disputes')}>MATCH DISPUTES <span>{disputes.length}</span></button>
      <button className={tab==='events'?'active':''} onClick={()=>setTab('events')}>EVENT APPROVALS <span>{pendingEvents.length}</span></button>
      <button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>USER MODERATION <span>{users.filter(user=>user.banned).length}</span></button>
    </div>
    {tab==='disputes'&&<section className="admin-list admin-disputes">{disputes.length===0?<div className="admin-empty"><ShieldCheck/><b>NO DISPUTED RESULTS</b><span>Normal result submissions auto-approve and never enter this queue.</span></div>:disputes.map(dispute=><article className="admin-dispute" key={dispute.id}>
      <div className="admin-dispute-head"><span><AlertTriangle size={17}/><b>{dispute.publicId}</b></span><time>{new Date(dispute.createdAt).toLocaleString()}</time></div>
      <div className="admin-dispute-grid"><div><small>FORMAT</small><b>{dispute.format}</b></div><div><small>SC MATCH ID</small><b>{dispute.starCitizenMatchId||'NOT PROVIDED'}</b></div><div><small>OPENED BY</small><b>{dispute.openedBy}</b></div><div><small>PLAYERS</small><b>{dispute.players}</b></div></div>
      <div className="admin-dispute-reason"><small>DISPUTE REASON</small><p>{dispute.reason}</p></div>
      {dispute.submittedResult&&<div className="admin-result-json"><small>SUBMITTED RESULT</small><code>{JSON.stringify(dispute.submittedResult)}</code></div>}
      <textarea value={reviewNotes[dispute.id]||''} maxLength={500} onChange={e=>setReviewNotes(notes=>({...notes,[dispute.id]:e.target.value}))} placeholder="Optional staff resolution note"/>
      <div className="admin-dispute-actions"><button className="secondary" disabled={busy===dispute.id} onClick={()=>void resolveDispute(dispute,'void_match')}>VOID MATCH</button><button className="primary" disabled={busy===dispute.id} onClick={()=>void resolveDispute(dispute,'approve_result')}>APPROVE SUBMITTED RESULT</button></div>
    </article>)}</section>}
    {tab==='events'&&<section className="admin-list">{pendingEvents.length===0?<div className="admin-empty"><ShieldCheck/><b>NO EVENTS AWAITING REVIEW</b><span>The approval queue is clear.</span></div>:pendingEvents.map(event=><article className="admin-event" key={event.id}><div><span className="eyebrow">{event.publicId} · HOSTED BY {event.creatorHandle}</span><h3>{event.name}</h3><p>{event.description||'No description provided.'}</p><small>{event.format} · {event.region} · {event.bracketSize} entries · {new Date(event.startsAt).toLocaleString()}</small><strong>PRIZE: {event.prizePool}</strong></div><input value={reviewNotes[event.id]||''} maxLength={500} onChange={e=>setReviewNotes(notes=>({...notes,[event.id]:e.target.value}))} placeholder="Optional approval/rejection note"/><div><button className="secondary" disabled={busy===event.id} onClick={()=>void review(event,'reject')}>REJECT</button><button className="primary" disabled={busy===event.id} onClick={()=>void review(event,'approve')}>APPROVE &amp; PUBLISH</button></div></article>)}</section>}
    {tab==='users'&&<section><label className="utility-search admin-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search verified RSI handles"/></label><div className="admin-users">{filteredUsers.map(user=><article key={user.userId}><span className="avatar">{user.handle.slice(0,2).toUpperCase()}</span><div><b>{user.handle}</b><small>{platformRoleLabel(user.role)}{user.banned?` · BANNED${user.banExpiresAt?` UNTIL ${new Date(user.banExpiresAt).toLocaleDateString()}`:' PERMANENTLY'}`:''}</small>{user.banReason&&<p>{user.banReason}</p>}</div>{access.role==='owner'&&user.role!=='owner'&&<select value={user.role||'user'} disabled={busy===user.userId} onChange={e=>void changeRole(user,e.target.value==='user'?null:e.target.value as 'admin'|'moderator')}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select>}{user.role!=='owner'&&(user.banned?<button className="secondary" disabled={busy===user.userId} onClick={()=>void unban(user)}>UNBAN</button>:<button className="danger-outline" disabled={busy===user.userId} onClick={()=>setBanTarget(user)}>BAN</button>)}</article>)}</div>{banTarget&&<div className="ban-editor"><div><span className="eyebrow">ENFORCEMENT ACTION</span><h3>BAN {banTarget.handle.toUpperCase()}</h3></div><label>REASON<textarea value={banReason} maxLength={500} onChange={e=>setBanReason(e.target.value)} placeholder="Required moderation reason"/></label><label>DURATION<select value={banDuration} onChange={e=>setBanDuration(e.target.value)}><option value="1">24 hours</option><option value="7">7 days</option><option value="30">30 days</option><option value="permanent">Permanent</option></select></label><div><button className="secondary" onClick={()=>setBanTarget(null)}>CANCEL</button><button className="primary danger" disabled={banReason.trim().length<3||busy===banTarget.userId} onClick={()=>void applyBan()}>CONFIRM BAN</button></div></div>}</section>}
  </div>;
}

function TournamentsPage({notify,openPanel,partySize,refreshKey}:{notify:(s:string)=>void;openPanel:(mode:PanelMode,title?:string,event?:BracketEventRef)=>void;partySize:number;refreshKey:number}) {
  const [region,setRegion]=useState('All regions');
  const [now,setNow]=useState(new Date());
  const [registrations,setRegistrations]=useState<string[]>(()=>{try{return (JSON.parse(localStorage.getItem('nexus-weekly-registrations')||'[]') as string[]).map(value=>weeklyCircuit.find(event=>event.name===value)?.slug||value)}catch{return[]}});
  const [cloudLeaders,setCloudLeaders]=useState<CloudLeaderboardRow[]>([]);
  const [communityEvents,setCommunityEvents]=useState<CloudCommunityEvent[]>([]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{
    let active=true;
    if(!backend.enabled){try{setCommunityEvents(JSON.parse(localStorage.getItem('nexus-community-events')||'[]'))}catch{setCommunityEvents([])}return()=>{active=false}}
    Promise.all([backend.registeredTournamentSlugs().catch(()=>[]),backend.circuitLeaderboard().catch(()=>[]),backend.listCommunityEvents()]).then(([registered,leaderboard,createdEvents])=>{if(active){setRegistrations(registered);setCloudLeaders(leaderboard);setCommunityEvents(createdEvents)}}).catch(error=>notify(backendErrorMessage(error,'Community events are temporarily unavailable.')));
    return()=>{active=false}
  },[refreshKey]);
  const schedule=useMemo(()=>weeklyCircuit.map(event=>({...event,start:nextWeeklyStart(event.day,now)})),[now]);
  const circuitLeaders=cloudLeaders.map((leader,index)=>({rank:index+1,name:leader.handle,format:'CIRCUIT',played:leader.events,wins:'—',podiums:'—',points:leader.points,avatarUrl:leader.avatarUrl}));
  const openWeeklyBracket=(event:(typeof schedule)[number])=>openPanel('event-details',event.name,{kind:'weekly',key:event.slug,name:event.name,format:event.format as '1v1'|'3v3'|'5v5',required:event.required,bracketSize:8,region:'US East',startsAt:event.start.toISOString()});
  const openCommunityBracket=(event:CloudCommunityEvent)=>openPanel('event-details',event.name,{kind:'community',key:event.id,name:event.name,format:event.format,required:event.format==='1v1'?1:event.format==='3v3'?3:5,bracketSize:event.bracketSize,region:event.region,startsAt:event.startsAt,prizePool:event.prizePool,creatorHandle:event.creatorHandle,description:event.description});
  const toggleRegistration=async(event:typeof weeklyCircuit[number])=>{
    if(partySize!==event.required){notify(`${event.format} registration requires exactly ${event.required} pilot${event.required===1?'':'s'}; your party has ${partySize}.`);return}
    const wasRegistered=registrations.includes(event.slug);
    try{
      if(backend.enabled){if(wasRegistered)await backend.withdrawTournament(event.slug);else await backend.registerTournament(event.slug,partySize)}
      const next=wasRegistered?registrations.filter(slug=>slug!==event.slug):[...registrations,event.slug];
      setRegistrations(next);if(!backend.enabled)localStorage.setItem('nexus-weekly-registrations',JSON.stringify(next));
      notify(`${event.name} ${wasRegistered?'registration cancelled':'registration confirmed'}.`);
    }catch(error){notify(error instanceof Error?error.message:'Registration could not be updated.')}
  };
  return <div className="standard-page">
    <PageTitle eyebrow="COMPETITION" title="TOURNAMENTS" description="Enter open brackets, qualify for premier events, and represent your organization." action={<button className="primary" onClick={()=>openPanel('create-event')}><Trophy size={17}/> CREATE EVENT</button>}/>
    <div className="section-heading"><div><span className="eyebrow">AUTOMATED WEEKLY CIRCUIT</span><h2>EVERY WEEKEND · 20:00 ET</h2></div><span className="reset-time"><Activity size={14}/> BRACKETS AUTO-GENERATE AFTER CHECK-IN</span></div>
    <div className="weekly-grid">{schedule.map(event=>{const registered=registrations.includes(event.slug);const exactRoster=partySize===event.required;return <article className={`weekly-card ${event.accent} clickable-event`} key={event.name} role="button" tabIndex={0} onClick={()=>openWeeklyBracket(event)} onKeyDown={key=>{if(key.key==='Enter'||key.key===' ')openWeeklyBracket(event)}}><div className="weekly-day"><span>{event.start.toLocaleDateString(undefined,{weekday:'long'}).toUpperCase()}</span><b>{event.start.toLocaleDateString(undefined,{month:'short',day:'numeric'}).toUpperCase()}</b></div><div className="weekly-format"><strong>{event.format}</strong><span>{event.mode}</span></div><h3>{event.name}</h3><div className="weekly-auto"><span><Clock3/> STARTS IN <b>{countdownTo(event.start,now)}</b></span><span><Users/> ROSTER <b>{event.required}</b></span></div><div className="weekly-actions"><button className="bracket-link" onClick={click=>{click.stopPropagation();openWeeklyBracket(event)}}>VIEW BRACKET</button><button className={registered?'registered':''} onClick={click=>{click.stopPropagation();void toggleRegistration(event)}}>{registered?'REGISTERED':exactRoster?'REGISTER NOW':`NEED ${event.required} PILOT${event.required===1?'':'S'}`}</button></div></article>})}</div>
    <div className="automation-strip"><div><ShieldCheck/><span><b>MONDAY</b><small>Registration opens automatically</small></span></div><ChevronRight/><div><ClipboardCheck/><span><b>30 MIN BEFORE</b><small>Mandatory roster check-in</small></span></div><ChevronRight/><div><Swords/><span><b>START TIME</b><small>Bracket and match rooms generated</small></span></div><ChevronRight/><div><Medal/><span><b>AFTER FINALS</b><small>Circuit points update automatically</small></span></div></div>
    <div className="section-heading"><div><span className="eyebrow">DISCOVER</span><h2>UPCOMING EVENTS</h2></div><button onClick={()=>setRegion(region==='All regions'?'US East':region==='US East'?'Europe':'All regions')}>{region} <ChevronDown size={14}/></button></div>
    <div className="event-list">{communityEvents.filter(event=>region==='All regions'||event.region===region).map((event,index)=>{const start=new Date(event.startsAt);return <div className="event-row community-event-row clickable-event" role="button" tabIndex={0} key={event.id} onClick={()=>openCommunityBracket(event)} onKeyDown={key=>{if(key.key==='Enter'||key.key===' ')openCommunityBracket(event)}}><div className="event-date"><b>{start.toLocaleDateString(undefined,{day:'2-digit'})}</b><span>{start.toLocaleDateString(undefined,{month:'short'}).toUpperCase()}</span></div><span className={`event-icon event-${index%3}`}><Trophy/></span><div><h3>{event.name}</h3><p>{event.format} · {event.region} · Hosted by {event.creatorHandle}</p></div><div><small>CAPACITY</small><b>{event.bracketSize}</b></div><div><small>PRIZE</small><b>{event.prizePool}</b></div><button onClick={click=>{click.stopPropagation();openCommunityBracket(event)}}>BRACKET <ChevronRight size={15}/></button></div>})}{communityEvents.filter(event=>region==='All regions'||event.region===region).length===0&&<LiveEmpty icon={<Trophy/>} title="NO APPROVED COMMUNITY EVENTS" detail="Admin-approved events matching this region will appear here."/>}</div>
    <div className="section-heading"><div><span className="eyebrow">SEASON 01</span><h2>WEEKLY CIRCUIT LEADERBOARD</h2></div><span className="reset-time"><Trophy size={14}/> TOP 16 QUALIFY FOR THE MONTHLY FINAL</span></div>
    <section className="circuit-board"><div className="circuit-head"><span>RANK</span><span>COMPETITOR</span><span>BEST FORMAT</span><span>PLAYED</span><span>WINS</span><span>PODIUMS</span><span>POINTS</span></div>{circuitLeaders.length===0?<LiveEmpty icon={<Medal/>} title="NO CIRCUIT RESULTS YET" detail="Standings begin when verified weekly tournament results are recorded."/>:circuitLeaders.map(leader=><div className={`circuit-row ${leader.rank<=3?'top':''}`} key={leader.name}><b>{String(leader.rank).padStart(2,'0')}</b><div><span className={`avatar ${leader.avatarUrl?'custom-avatar':''}`}>{leader.avatarUrl?<img src={leader.avatarUrl} alt=""/>:leader.name.slice(0,2).toUpperCase()}</span><strong>{leader.name}</strong></div><span>{leader.format}</span><span>{leader.played}</span><span>{leader.wins}</span><span>{leader.podiums}</span><strong>{leader.points.toLocaleString()}</strong></div>)}</section>
    <div className="points-key"><span>WIN <b>100 PTS</b></span><span>RUNNER-UP <b>60 PTS</b></span><span>TOP 4 <b>35 PTS</b></span><span>PARTICIPATION <b>10 PTS</b></span></div>
  </div>;
}

function RankingsPage(){
  const [format,setFormat]=useState('5v5 Squadron');
  const [cloudRatings,setCloudRatings]=useState<CloudRatingRow[]>([]);
  const [loading,setLoading]=useState(backend.enabled);
  useEffect(()=>{if(!backend.enabled){setCloudRatings([]);setLoading(false);return}const selected=format.startsWith('1v1')?'1v1':format.startsWith('3v3')?'3v3':'5v5';let active=true;setLoading(true);backend.rankedLeaderboard(selected).then(rows=>{if(active)setCloudRatings(rows)}).catch(()=>{if(active)setCloudRatings([])}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[format]);
  const displayed=cloudRatings.map((row,index)=>({rank:index+1,name:row.handle,elo:row.rating,streak:row.streak,avatarUrl:row.avatarUrl,record:`${row.wins}W · ${row.losses}L`}));
  return <div className="standard-page"><PageTitle eyebrow="GLOBAL NETWORK" title="RANKINGS" description="Live standings calculated from approved ranked match results."/><div className="ranking-filters">{['5v5 Squadron','3v3 Skirmish','1v1 Duel'].map(item=><button key={item} className={format===item?'active':''} onClick={()=>setFormat(item)}>{item}</button>)}</div><div className="ranking-context"><b>{format}</b><span>GLOBAL · CURRENT ALPHA</span></div><section className="leaderboard"><div className="leader-head"><span>RANK</span><span>PILOT</span><span>RECORD</span><span>WIN STREAK</span><span>RATING</span></div>{loading?<LiveEmpty icon={<Orbit/>} title="LOADING STANDINGS" detail="Reading approved ranked results."/>:displayed.length===0?<LiveEmpty icon={<Medal/>} title="NO RANKED RESULTS YET" detail="The leaderboard starts when this format has approved matches."/>:displayed.map((l,i)=><div className={`leader-row ${i<3?'podium':''}`} key={l.name}><b className="rank-number">{String(l.rank).padStart(2,'0')}</b><div className="pilot-cell"><span className={`avatar ${l.avatarUrl?'custom-avatar':''}`}>{l.avatarUrl?<img src={l.avatarUrl} alt=""/>:l.name.slice(0,2).toUpperCase()}</span><div><b>{l.name}</b><small>RSI VERIFIED</small></div></div><span className="org-tag">{l.record}</span><span className="streak"><Zap size={14}/>{l.streak} WINS</span><strong>{l.elo.toLocaleString()}</strong></div>)}</section></div>}

function OrganizationsPage(){return <div className="standard-page"><PageTitle eyebrow="COMMUNITIES" title="ORGANIZATIONS" description="Organization rosters and standings are not connected in this alpha yet."/><section className="panel alpha-feature-state"><LiveEmpty icon={<UsersRound/>} title="ORGANIZATION SERVICE COMING LATER" detail="No placeholder organizations are shown. This section will open when persistent rosters, permissions, and standings are backed by live services."/></section></div>}

function MissionsPage(){return <div className="standard-page"><PageTitle eyebrow="ALPHA SYSTEM" title="MISSIONS" description="Season missions will activate after their progression rules are connected to verified match results."/><section className="panel alpha-feature-state"><LiveEmpty icon={<Target/>} title="NO LIVE MISSIONS CONFIGURED" detail="STARLADDER will never show fabricated progress. Real objectives and rewards will appear here when the mission service launches."/></section></div>}

function SocialRail({accountHandle,onlineUsers,channels,notify,onOpenChat,onOpenParty,onSearch,partySize}:{accountHandle:string;onlineUsers:CloudOnlineUser[];channels:CloudChatChannel[];notify:(s:string)=>void;onOpenChat:(channel:string)=>void;onOpenParty:()=>void;onSearch:()=>void;partySize:number}) {
  const users=onlineUsers;
  const visibleChannels=channels.slice(0,6);
  return <aside className="social-rail">
    <div className="social-head"><b>SOCIAL</b><button onClick={onSearch}><UserPlus size={16}/></button></div>
    <button className="party-card" onClick={onOpenParty}><span><Headphones size={17}/></span><div><b>YOUR PARTY</b><small>{partySize} / 5 members</small></div><ChevronRight size={16}/></button>
    <div className="social-section"><span>ONLINE — {users.length}</span>{users.length===0?<div className="online-empty">NO PILOTS ONLINE</div>:users.map(user=><button className="friend" key={user.userId} onClick={()=>user.handle===accountHandle?notify('This is your online presence.'):onOpenChat(`dm:${user.handle}`)}><span className={`avatar ${user.avatarUrl?'custom-avatar':''}`}>{user.avatarUrl?<img src={user.avatarUrl} alt={`${user.handle} avatar`}/>:user.handle.slice(0,2).toUpperCase()}<i/></span><div><b>{user.handle}</b><small>{user.handle===accountHandle?'You · Online':'Online'}</small></div></button>)}</div>
    <div className="social-section channels"><span className="channel-section-head"><i>CHANNELS</i><button onClick={()=>onOpenChat('channels:new')} aria-label="Create channel"><Plus size={13}/></button></span>{visibleChannels.map(item=><button key={item.key} onClick={()=>onOpenChat(item.key)} title={item.organizationName||item.name}><i className="hash">{item.kind==='public'?'#':item.kind==='organization'?'◈':'◇'}</i><span>{item.name}</span>{item.kind!=='public'&&<b>{item.memberCount}</b>}</button>)}{channels.length>visibleChannels.length&&<button className="more-channels" onClick={()=>onOpenChat(channels[visibleChannels.length].key)}>+ {channels.length-visibleChannels.length} MORE</button>}</div>
    <div className="voice-bar"><MessageSquare size={16}/><div><b>TEXT COMMS READY</b><small>{channels.length} accessible channel{channels.length===1?'':'s'}</small></div><Radio size={17}/></div>
  </aside>;
}
function PartyDrawer({account,selectedQueue,matchmakingMode,members,setMembers,setQueued,setQueueStartedAt,close,notify}:{account:Account;selectedQueue:typeof queues[number];matchmakingMode:MatchmakingMode;members:PartyMember[];setMembers:(members:PartyMember[])=>void;setQueued:(queued:boolean)=>void;setQueueStartedAt:(value:number|null)=>void;close:()=>void;notify:(s:string)=>void}){
  const [inviteOpen,setInviteOpen]=useState(false);
  const [partyId,setPartyId]=useState('');
  const [partyCode,setPartyCode]=useState('------');
  const [joinCode,setJoinCode]=useState('');
  const [partyBusy,setPartyBusy]=useState(false);
  const maxSize=queueCapacity(selectedQueue.id);
  const applyCloudParty=(party:CloudParty)=>{setPartyId(party.id);setPartyCode(party.code);setMembers(party.members.map(member=>({userId:member.userId,handle:member.handle,rating:member.rating,ready:member.ready,leader:member.leader,avatarDataUrl:member.avatarUrl})))};
  useEffect(()=>{if(!backend.enabled)return;let active=true;setPartyBusy(true);backend.createOrGetParty(queueFormat(selectedQueue.id)).then(party=>{if(active)applyCloudParty(party)}).catch(error=>notify(error instanceof Error?error.message:'Party service unavailable.')).finally(()=>{if(active)setPartyBusy(false)});return()=>{active=false}},[selectedQueue.id]);
  const removeMember=async(member:PartyMember)=>{try{if(backend.enabled&&partyId&&member.userId){await backend.removePartyMember(partyId,member.userId);const party=await backend.getMyParty();if(party)applyCloudParty(party)}else setMembers(members.filter(item=>item.handle!==member.handle));notify(`${member.handle} was removed from the party.`)}catch(error){notify(error instanceof Error?error.message:'The pilot could not be removed.')}};
  const joinParty=async()=>{if(!joinCode.trim())return;setPartyBusy(true);try{const party=await backend.joinParty(joinCode.trim());applyCloudParty(party);setJoinCode('');notify(`Joined ${party.members.find(member=>member.leader)?.handle||'pilot'}'s party.`)}catch(error){notify(error instanceof Error?error.message:'The party could not be joined.')}finally{setPartyBusy(false)}};
  const queueParty=async()=>{if(members.length!==maxSize){notify(`${selectedQueue.mode.split(' · ')[0]} requires exactly ${maxSize} pilot${maxSize===1?'':'s'}.`);return}try{if(backend.enabled){if(!partyId)throw new Error('Party is still connecting.');await backend.queueParty(partyId,queueFormat(selectedQueue.id),matchmakingMode,selectedQueue.region)}const activeQueue=backend.enabled?await backend.getMyQueue().catch(()=>null):null;const cloudStart=activeQueue?Date.parse(activeQueue.joinedAt):NaN;setQueueStartedAt(Number.isFinite(cloudStart)?cloudStart:Date.now());setQueued(true);notify(`${members.length}-pilot party joined ${matchmakingMode} ${selectedQueue.name}.`);close()}catch(error){notify(backendErrorMessage(error,'The party could not enter the queue.'))}};
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="party-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">STRIKE TEAM</span><h2>YOUR PARTY</h2></div><button onClick={close}><X/></button></div>
    <div className="party-queue-target"><Crosshair size={20}/><div><span>SELECTED {matchmakingMode.toUpperCase()} QUEUE</span><b>{selectedQueue.name}</b><small>{selectedQueue.mode} · Party limit {maxSize}</small></div><strong>{members.length}/{maxSize}</strong></div>
    <div className="invite-code"><span>PARTY CODE</span><b>{partyBusy?'SYNCING':partyCode}</b><button onClick={async()=>{await navigator.clipboard.writeText(partyCode);notify('Party code copied.')}} disabled={partyBusy}>COPY</button></div>
    {backend.enabled&&<div className="join-party-code"><input value={joinCode} onChange={event=>setJoinCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ENTER PARTY CODE"/><button onClick={()=>void joinParty()} disabled={partyBusy||joinCode.trim().length<6}>JOIN</button></div>}
    <div className="party-roster">{members.map(member=><div className="party-member" key={member.handle}>{member.leader?<Avatar account={account}/>:<span className={`avatar ${member.avatarDataUrl?'custom-avatar':''}`}>{member.avatarDataUrl?<img src={member.avatarDataUrl} alt=""/>:member.handle.slice(0,2).toUpperCase()}</span>}<div><b>{member.handle} {member.leader&&<Crown size={13}/>}</b><small>{member.rating.toLocaleString()} · {member.leader?'PARTY CAPTAIN':'PILOT'}</small></div><span className="ready">READY</span>{!member.leader&&members.some(item=>item.leader&&item.handle===account.handle)&&<button className="member-remove" onClick={()=>void removeMember(member)} aria-label={`Remove ${member.handle}`}><X size={13}/></button>}</div>)}</div>
    {Array.from({length:Math.max(0,maxSize-members.length)}).map((_,index)=><button className="empty-slot" key={index} onClick={()=>setInviteOpen(true)}><UserPlus/><span>INVITE PILOT</span></button>)}
    {inviteOpen&&maxSize>members.length&&<div className="invite-list"><div><b>{backend.enabled?'SHARE PARTY CODE':'PARTY SERVICE OFFLINE'}</b><button onClick={()=>setInviteOpen(false)}><X size={13}/></button></div><p className="invite-share">{backend.enabled?<>Send <b>{partyCode}</b> in chat. Verified pilots can enter it above to join instantly.</>:`Cloud credentials are required before another real player can join this party.`}</p></div>}
    {maxSize===1&&<div className="solo-notice"><Info size={15}/>1v1 is a solo queue. Choose 3v3 or 5v5 to bring teammates.</div>}
    <div className="party-footer-actions"><button className="primary wide" onClick={()=>void queueParty()} disabled={partyBusy||members.length!==maxSize}><Zap size={15}/> {members.length===maxSize?(members.length>1?'QUEUE PARTY':'QUEUE SOLO'):members.length>maxSize?`REMOVE ${members.length-maxSize} PILOT${members.length-maxSize===1?'':'S'}`:`NEED ${maxSize-members.length} PILOT${maxSize-members.length===1?'':'S'}`}</button></div>
  </aside></div>;
}

function Avatar({account,large=false}:{account:Account;large?:boolean}) {
  return <span className={`avatar ${large?'avatar-large':''} ${account.avatarDataUrl?'custom-avatar':''}`}>
    {account.avatarDataUrl ? <img src={account.avatarDataUrl} alt={`${account.handle} avatar`}/> : account.handle.slice(0,2).toUpperCase()}
  </span>;
}

function ProfileDrawer({account,close,save,onLogout,notify}:{account:Account;close:()=>void;save:(account:Account)=>Promise<Account>;onLogout:()=>Promise<void>;notify:(s:string)=>void}) {
  const [preview,setPreview]=useState(account.avatarDataUrl || '');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const selectAvatar=async(file?:File)=>{
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){setError('Use a PNG, JPG, WebP, or GIF image.');return;}
    if(file.size>20*1024*1024){setError('Avatar source images must be smaller than 20 MB.');return;}
    try{
      const bitmap=await createImageBitmap(file);
      const size=768;
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const context=canvas.getContext('2d');if(!context)throw new Error('Image processing unavailable.');
      const sourceSize=Math.min(bitmap.width,bitmap.height);
      const sourceX=(bitmap.width-sourceSize)/2;const sourceY=(bitmap.height-sourceSize)/2;
      context.drawImage(bitmap,sourceX,sourceY,sourceSize,sourceSize,0,0,size,size);bitmap.close();
      setPreview(canvas.toDataURL('image/webp',.88));setError('');
    }catch{setError('That image could not be processed. Try another PNG, JPG, WebP, or GIF.');}
  };
  const saveProfile=async()=>{setSaving(true);setError('');try{await save({...account,avatarDataUrl:preview||undefined});notify('Profile avatar updated.');close()}catch(saveError){setError(saveError instanceof Error?saveError.message:'Could not save the avatar.')}finally{setSaving(false)}};
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="party-drawer profile-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">VERIFIED IDENTITY</span><h2>YOUR PROFILE</h2></div><button onClick={close}><X/></button></div>
    <div className="avatar-editor"><span className={`avatar avatar-preview ${preview?'custom-avatar':''}`}>{preview?<img src={preview} alt="Avatar preview"/>:account.handle.slice(0,2).toUpperCase()}</span><div><h3>{account.handle}</h3><p>Your public name is locked to your verified RSI handle.</p></div></div>
    <div className="avatar-actions"><label htmlFor="avatar-upload"><Upload size={15}/> CHOOSE IMAGE</label><input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>selectAvatar(e.target.files?.[0])}/><button onClick={()=>{setPreview('');setError('')}}><Trash2 size={15}/> REMOVE</button></div>
    <p className="avatar-hint">PNG, JPG, WebP, or GIF · Up to 20 MB · Automatically cropped and optimized to 768 × 768</p>
    {error&&<div className="auth-error"><AlertTriangle size={15}/>{error}</div>}
    <div className="profile-fields"><label>RSI HANDLE<div><ShieldCheck size={14}/>{account.handle}<span>VERIFIED</span></div></label><label>ACCOUNT EMAIL<div>{account.email}</div></label></div>
    <button className="primary wide profile-save" onClick={saveProfile} disabled={saving}>{saving?'UPLOADING...':'SAVE PROFILE'}</button>
    <button className="signout-button" onClick={()=>void onLogout()}><LogOut size={15}/> SIGN OUT OF STARLADDER</button>
  </aside></div>;
}

function ChatDrawer({account,onlineUsers,channels,channel,setChannel,refreshChannels,close,notify}:{account:Account;onlineUsers:CloudOnlineUser[];channels:CloudChatChannel[];channel:string;setChannel:(channel:string)=>void;refreshChannels:()=>Promise<void>;close:()=>void;notify:(message:string)=>void}) {
  const [messages,setMessages]=useState<ChatMessage[]>(()=>{try{return JSON.parse(localStorage.getItem('nexus-chat-messages')||'[]')}catch{return[]}});
  const [draft,setDraft]=useState('');
  const [chatError,setChatError]=useState('');
  const [view,setView]=useState<'chat'|'create'|'members'>(()=>channel==='channels:new'?'create':'chat');
  const [newName,setNewName]=useState('');
  const [newKind,setNewKind]=useState<'personal'|'organization'>('personal');
  const [organizationName,setOrganizationName]=useState('');
  const [members,setMembers]=useState<CloudChatMember[]>([]);
  const [inviteHandle,setInviteHandle]=useState('');
  const [busy,setBusy]=useState(false);
  const isDirectMessage=channel.startsWith('dm:');
  const selectedChannel=channels.find(item=>item.key===channel);
  const peerHandle=isDirectMessage?channel.slice(3):'';
  const [peerAvatar,setPeerAvatar]=useState<string|undefined>(()=>onlineUsers.find(user=>user.handle===peerHandle)?.avatarUrl);
  const sharedChannel=backend.enabled&&!isDirectMessage&&channel!=='channels:new';
  const canManage=selectedChannel?.role==='owner'||selectedChannel?.role==='admin';

  useEffect(()=>{setView(channel==='channels:new'?'create':'chat');setChatError('')},[channel]);
  useEffect(()=>{
    if(!peerHandle){setPeerAvatar(undefined);return}
    let active=true;
    const onlineAvatar=onlineUsers.find(user=>user.handle.toLowerCase()===peerHandle.toLowerCase())?.avatarUrl;
    setPeerAvatar(onlineAvatar);
    if(backend.enabled)void backend.profileByHandle(peerHandle).then(profile=>{if(active)setPeerAvatar(profile?.avatarUrl)}).catch(()=>undefined);
    return()=>{active=false};
  },[peerHandle,onlineUsers]);
  useEffect(()=>{
    if(!sharedChannel)return;
    let active=true;
    const refresh=()=>backend.listChat(channel).then(next=>{if(active){setMessages(next);setChatError('')}}).catch(error=>{if(active)setChatError(backendErrorMessage(error,'Chat is temporarily unavailable.'))});
    void refresh();
    const subscription=backend.subscribeChat(channel,refresh);
    return()=>{active=false;void backend.unsubscribe(subscription)};
  },[channel,sharedChannel]);

  const loadMembers=async()=>{
    if(!selectedChannel||selectedChannel.kind==='public')return;
    setBusy(true);setChatError('');
    try{setMembers(await backend.listChatChannelMembers(selectedChannel.key));setView('members')}
    catch(error){setChatError(backendErrorMessage(error,'Channel members could not be loaded.'))}
    finally{setBusy(false)}
  };
  const createChannel=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!backend.enabled){setChatError('Connect the alpha backend before creating a shared private channel.');return}
    setBusy(true);setChatError('');
    try{
      const key=await backend.createChatChannel(newName.trim(),newKind,newKind==='organization'?organizationName.trim():undefined);
      await refreshChannels();
      notify(`${newKind==='organization'?'Organization':'Personal'} channel created.`);
      setChannel(key);
    }catch(error){setChatError(backendErrorMessage(error,'The channel could not be created.'))}
    finally{setBusy(false)}
  };
  const inviteMember=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selectedChannel||!inviteHandle.trim())return;
    setBusy(true);setChatError('');
    try{await backend.inviteChatChannelMember(selectedChannel.key,inviteHandle.trim());setInviteHandle('');setMembers(await backend.listChatChannelMembers(selectedChannel.key));await refreshChannels();notify('Pilot added to the channel and notified.')}
    catch(error){setChatError(backendErrorMessage(error,'The pilot could not be invited.'))}
    finally{setBusy(false)}
  };
  const changeRole=async(member:CloudChatMember)=>{
    if(!selectedChannel)return;setBusy(true);setChatError('');
    try{await backend.setChatChannelMemberRole(selectedChannel.key,member.userId,member.role==='admin'?'member':'admin');setMembers(await backend.listChatChannelMembers(selectedChannel.key));notify(`${member.handle} is now ${member.role==='admin'?'a member':'a channel admin'}.`)}
    catch(error){setChatError(backendErrorMessage(error,'The member role could not be changed.'))}
    finally{setBusy(false)}
  };
  const removeMember=async(member:CloudChatMember)=>{
    if(!selectedChannel)return;setBusy(true);setChatError('');
    try{await backend.removeChatChannelMember(selectedChannel.key,member.userId);setMembers(await backend.listChatChannelMembers(selectedChannel.key));await refreshChannels();notify(`${member.handle} was removed from the channel.`)}
    catch(error){setChatError(backendErrorMessage(error,'The pilot could not be removed.'))}
    finally{setBusy(false)}
  };
  const timeoutMember=async(member:CloudChatMember,minutes:0|10|60|1440|10080)=>{
    if(!selectedChannel)return;setBusy(true);setChatError('');
    try{
      const until=await backend.timeoutChatChannelMember(selectedChannel.key,member.userId,minutes);
      setMembers(await backend.listChatChannelMembers(selectedChannel.key));
      notify(minutes===0?`${member.handle}'s timeout was lifted.`:`${member.handle} cannot post until ${new Date(until!).toLocaleString()}.`);
    }catch(error){setChatError(backendErrorMessage(error,'The posting timeout could not be updated.'))}
    finally{setBusy(false)}
  };
  const leaveChannel=async()=>{
    if(!selectedChannel)return;const self=members.find(member=>member.handle.toLowerCase()===account.handle.toLowerCase());if(!self)return;
    setBusy(true);setChatError('');
    try{await backend.removeChatChannelMember(selectedChannel.key,self.userId);await refreshChannels();notify(`You left #${selectedChannel.name}.`);setChannel('general')}
    catch(error){setChatError(backendErrorMessage(error,'The channel could not be left.'))}
    finally{setBusy(false)}
  };
  const deleteChannel=async()=>{
    if(!selectedChannel||!window.confirm(`Delete #${selectedChannel.name} and all of its messages? This cannot be undone.`))return;
    setBusy(true);setChatError('');
    try{await backend.deleteChatChannel(selectedChannel.key);await refreshChannels();notify(`#${selectedChannel.name} was deleted.`);setChannel('general')}
    catch(error){setChatError(backendErrorMessage(error,'The channel could not be deleted.'))}
    finally{setBusy(false)}
  };
  const commitMessage=async()=>{
    const text=draft.trim();if(!text)return;
    if(sharedChannel){
      setDraft('');setChatError('');
      try{await backend.sendChat(channel,text);setMessages(await backend.listChat(channel))}catch(error){setDraft(text);setChatError(backendErrorMessage(error,'Message could not be sent.'))}
      return;
    }
    const next=[...messages,{id:crypto.randomUUID(),channel,author:account.handle,avatarUrl:account.avatarDataUrl,text:text.slice(0,500),at:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}];
    setMessages(next);localStorage.setItem('nexus-chat-messages',JSON.stringify(next));setDraft('');
  };
  const sendMessage=(event:React.FormEvent)=>{event.preventDefault();void commitMessage()};
  const visible=messages.filter(message=>message.channel===channel);
  const title=isDirectMessage?peerHandle:selectedChannel?`# ${selectedChannel.name}`:'CHANNELS';
  if(view==='members'&&selectedChannel){
    return <div className="drawer-backdrop chat-backdrop" onMouseDown={close}><aside className="chat-drawer channel-drawer" onMouseDown={event=>event.stopPropagation()}>
      <div className="drawer-head"><div><span className="eyebrow">CHANNEL CONTROL</span><h2>CHANNEL CREW</h2><small className="channel-org-label">{selectedChannel.organizationName||`# ${selectedChannel.name}`}</small></div><div className="channel-head-actions">{selectedChannel.role==='owner'&&<button className="channel-delete-head" onClick={()=>void deleteChannel()} disabled={busy} aria-label={`Delete ${selectedChannel.name}`}><Trash2 size={17}/><span>DELETE</span></button>}<button onClick={close}><X/></button></div></div>
      <div className="channel-members-view channel-moderation-view">
        <button className="channel-back" onClick={()=>setView('chat')}><ChevronRight size={14}/> BACK TO CHANNEL</button>
        <div className="channel-summary channel-summary-prominent"><div><span className="eyebrow">{selectedChannel.kind==='organization'?'ORGANIZATION CHANNEL':'PERSONAL CHANNEL'}</span><h3># {selectedChannel.name}</h3><p>{members.length} member{members.length===1?'':'s'} · {selectedChannel.role?.toUpperCase()} ACCESS</p></div>{selectedChannel.role==='owner'&&<button className="channel-delete-prominent" onClick={()=>void deleteChannel()} disabled={busy}><Trash2 size={15}/> DELETE CHANNEL</button>}</div>
        <div className="channel-permission-note"><ShieldCheck size={16}/><span><b>MODERATION PERMISSIONS</b><small>The creator can kick or time out any non-owner. Channel admins can invite, kick, and time out ordinary members.</small></span></div>
        {canManage&&<form className="channel-invite-form" onSubmit={inviteMember}><input value={inviteHandle} onChange={event=>setInviteHandle(event.target.value)} placeholder="Verified RSI handle"/><button disabled={busy||!inviteHandle.trim()}><UserPlus size={14}/> INVITE</button></form>}
        <div className="channel-member-list moderation-member-list">{members.map(member=>{const isSelf=member.handle.toLowerCase()===account.handle.toLowerCase();const timedOut=Boolean(member.timedOutUntil&&Date.parse(member.timedOutUntil)>Date.now());const canModerate=!isSelf&&member.role!=='owner'&&Boolean(selectedChannel.role==='owner'||(selectedChannel.role==='admin'&&member.role==='member'));return <div key={member.userId}><span className={`avatar ${member.avatarUrl?'custom-avatar':''}`}>{member.avatarUrl?<img src={member.avatarUrl} alt={`${member.handle} avatar`}/>:member.handle.slice(0,2).toUpperCase()}</span><span className="channel-member-identity"><b>{member.handle}</b><small>{member.role.toUpperCase()}{timedOut&&member.timedOutUntil?` · TIMED OUT UNTIL ${new Date(member.timedOutUntil).toLocaleString()}`:''}</small></span><div className="channel-member-controls">{selectedChannel.role==='owner'&&member.role!=='owner'&&<button className="permission" onClick={()=>void changeRole(member)} disabled={busy}>{member.role==='admin'?'REVOKE ADMIN':'GRANT ADMIN'}</button>}{canModerate&&<select aria-label={`Timeout ${member.handle}`} disabled={busy} defaultValue="" onChange={event=>{const minutes=Number(event.target.value) as 0|10|60|1440|10080;if(event.target.value!=='')void timeoutMember(member,minutes);event.currentTarget.value=''}}><option value="" disabled>TIMEOUT…</option>{timedOut&&<option value="0">LIFT TIMEOUT</option>}<option value="10">10 MINUTES</option><option value="60">1 HOUR</option><option value="1440">24 HOURS</option><option value="10080">7 DAYS</option></select>}{canModerate&&<button className="kick" onClick={()=>void removeMember(member)} disabled={busy}><UserMinus size={13}/> KICK</button>}</div></div>})}</div>
        {chatError&&<div className="chat-error"><AlertTriangle size={13}/>{chatError}</div>}
        {selectedChannel.role!=='owner'&&<div className="channel-danger-actions"><button onClick={()=>void leaveChannel()} disabled={busy}><LogOut size={14}/> LEAVE CHANNEL</button></div>}
      </div>
    </aside></div>;
  }
  return <div className="drawer-backdrop chat-backdrop" onMouseDown={close}><aside className="chat-drawer channel-drawer" onMouseDown={event=>event.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">STARLADDER COMMS</span><h2>{view==='create'?'CREATE CHANNEL':view==='members'?'CHANNEL CREW':title}</h2>{selectedChannel?.organizationName&&view!=='create'&&<small className="channel-org-label">{selectedChannel.organizationName}</small>}</div><div className="channel-head-actions">{selectedChannel?.role==='owner'&&view==='chat'&&<button className="channel-delete-head" onClick={()=>void deleteChannel()} aria-label={`Delete ${selectedChannel.name}`}><Trash2 size={16}/><span>DELETE</span></button>}{selectedChannel&&selectedChannel.kind!=='public'&&view==='chat'&&<button onClick={()=>void loadMembers()} aria-label="Manage channel members"><UsersRound size={18}/></button>}<button onClick={close}><X/></button></div></div>
    {!isDirectMessage&&<div className="chat-channel-tabs">{channels.map(item=><button className={channel===item.key&&view==='chat'?'active':''} key={item.key} onClick={()=>setChannel(item.key)} title={item.organizationName||item.name}>{item.kind==='organization'?'◈ ':item.kind==='personal'?'◇ ':'# '}{item.name}</button>)}<button className={view==='create'?'active channel-add-tab':'channel-add-tab'} onClick={()=>setView('create')}><Plus size={12}/> NEW</button></div>}
    {view==='create'?<form className="channel-create-form" onSubmit={createChannel}><div className="channel-form-intro"><Plus/><b>OPEN A PRIVATE COMMS CHANNEL</b><span>Invite verified RSI pilots after creation. Only members can discover or read it.</span></div><label>CHANNEL NAME<input value={newName} onChange={event=>setNewName(event.target.value)} maxLength={48} placeholder="Squad tactics" autoFocus/></label><div className="channel-kind-grid"><button type="button" className={newKind==='personal'?'active':''} onClick={()=>setNewKind('personal')}><UserRound/><b>PERSONAL</b><span>Your private invite-only space.</span></button><button type="button" className={newKind==='organization'?'active':''} onClick={()=>setNewKind('organization')}><UsersRound/><b>ORGANIZATION</b><span>A member channel branded for your org.</span></button></div>{newKind==='organization'&&<label>ORGANIZATION NAME<input value={organizationName} onChange={event=>setOrganizationName(event.target.value)} maxLength={60} placeholder="Your Star Citizen organization"/></label>}{chatError&&<div className="chat-error"><AlertTriangle size={13}/>{chatError}</div>}<button className="primary wide" type="submit" disabled={busy||newName.trim().length<3||(newKind==='organization'&&organizationName.trim().length<2)}>{busy?'CREATING...':'CREATE CHANNEL'}</button></form>:view==='members'&&selectedChannel?<div className="channel-members-view"><button className="channel-back" onClick={()=>setView('chat')}><ChevronRight size={14}/> BACK TO CHANNEL</button><div className="channel-summary"><span className="eyebrow">{selectedChannel.kind==='organization'?'ORGANIZATION CHANNEL':'PERSONAL CHANNEL'}</span><h3># {selectedChannel.name}</h3><p>{selectedChannel.organizationName||'Invite-only STARLADDER comms'} · {members.length} member{members.length===1?'':'s'}</p></div>{canManage&&<form className="channel-invite-form" onSubmit={inviteMember}><input value={inviteHandle} onChange={event=>setInviteHandle(event.target.value)} placeholder="Verified RSI handle"/><button disabled={busy||!inviteHandle.trim()}><UserPlus size={14}/> INVITE</button></form>}<div className="channel-member-list">{members.map(member=><div key={member.userId}><span className={`avatar ${member.avatarUrl?'custom-avatar':''}`}>{member.avatarUrl?<img src={member.avatarUrl} alt={`${member.handle} avatar`}/>:member.handle.slice(0,2).toUpperCase()}</span><span><b>{member.handle}</b><small>{member.role.toUpperCase()}</small></span><div>{selectedChannel.role==='owner'&&member.role!=='owner'&&<button onClick={()=>void changeRole(member)} disabled={busy}>{member.role==='admin'?'DEMOTE':'MAKE ADMIN'}</button>}{canManage&&member.role!=='owner'&&member.handle.toLowerCase()!==account.handle.toLowerCase()&&<button className="remove" onClick={()=>void removeMember(member)} disabled={busy} aria-label={`Remove ${member.handle}`}><UserMinus size={14}/></button>}</div></div>)}</div>{chatError&&<div className="chat-error"><AlertTriangle size={13}/>{chatError}</div>}<div className="channel-danger-actions">{selectedChannel.role==='owner'?<button onClick={()=>void deleteChannel()} disabled={busy}><Trash2 size={14}/> DELETE CHANNEL</button>:<button onClick={()=>void leaveChannel()} disabled={busy}><LogOut size={14}/> LEAVE CHANNEL</button>}</div></div>:<><div className="chat-messages">{visible.length===0?<div className="chat-empty">{peerHandle&&<span className={`avatar dm-avatar ${peerAvatar?'custom-avatar':''}`}>{peerAvatar?<img src={peerAvatar} alt={`${peerHandle} avatar`}/>:peerHandle.slice(0,2).toUpperCase()}</span>}<MessageSquare/><b>NO TRANSMISSIONS YET</b><span>Start the conversation.</span></div>:visible.map(message=>{const avatarUrl=message.author===account.handle?account.avatarDataUrl||message.avatarUrl:message.avatarUrl||(message.author.toLowerCase()===peerHandle.toLowerCase()?peerAvatar:onlineUsers.find(user=>user.handle.toLowerCase()===message.author.toLowerCase())?.avatarUrl);return <div className={`chat-message ${message.author===account.handle?'mine':''}`} key={message.id}><span className={`avatar ${avatarUrl?'custom-avatar':''}`}>{avatarUrl?<img src={avatarUrl} alt={`${message.author} avatar`}/>:message.author.slice(0,2).toUpperCase()}</span><div><p><b>{message.author}</b><time>{message.at}</time></p><span>{message.text}</span></div></div>})}</div>{chatError&&<div className="chat-error"><AlertTriangle size={13}/>{chatError}</div>}<form className="chat-compose" onSubmit={sendMessage}><input value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void commitMessage()}}} maxLength={500} autoFocus placeholder={`Message ${title}`}/><button type="submit" disabled={!draft.trim()}><Send size={17}/></button></form></>}
  </aside></div>;
}

function TournamentBracket({event,account,access,partySize,notify,onChanged}:{event:BracketEventRef;account:Account;access:PlatformAccess;partySize:number;notify:(message:string)=>void;onChanged:()=>void}){
  const [snapshot,setSnapshot]=useState<CloudBracketSnapshot|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const storageKey=`nexus-bracket:${event.kind}:${event.key}`;
  const localSnapshot=():CloudBracketSnapshot=>{const saved=(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{return{}}})();return{sourceId:event.key,sourceKind:event.kind,bracketSize:event.bracketSize,startsAt:event.startsAt,entrants:Array.isArray(saved.entrants)?saved.entrants:[],decisions:Array.isArray(saved.decisions)?saved.decisions:[],registered:Array.isArray(saved.entrants)&&saved.entrants.some((entrant:CloudBracketEntrant)=>entrant.userId===account.handle)}};
  const load=async(silent=false)=>{if(!silent)setLoading(true);try{setSnapshot(backend.enabled?await backend.loadCompetitionBracket(event.kind,event.key,event.bracketSize):localSnapshot());setError('')}catch(loadError){setError(backendErrorMessage(loadError,'The live bracket could not be loaded.'))}finally{if(!silent)setLoading(false)}};
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(true),10000);return()=>window.clearInterval(timer)},[event.kind,event.key]);
  const toggleRegistration=async()=>{if(!snapshot||busy)return;if(!snapshot.registered&&partySize!==event.required){setError(`This ${event.format} event requires exactly ${event.required} pilot${event.required===1?'':'s'} in your party.`);return}setBusy(true);setError('');try{if(backend.enabled){if(event.kind==='weekly'){if(snapshot.registered)await backend.withdrawTournament(event.key);else await backend.registerTournament(event.key,partySize)}else{if(snapshot.registered)await backend.withdrawCommunityEvent(event.key);else await backend.registerCommunityEvent(event.key,event.format,partySize)}}else{const next={...snapshot,entrants:snapshot.registered?snapshot.entrants.filter(entrant=>entrant.userId!==account.handle):[...snapshot.entrants,{userId:account.handle,handle:account.handle,avatarUrl:account.avatarDataUrl}],registered:!snapshot.registered};localStorage.setItem(storageKey,JSON.stringify(next));setSnapshot(next)}notify(snapshot.registered?'Tournament registration withdrawn.':'Tournament registration confirmed.');onChanged();await load(true)}catch(actionError){setError(backendErrorMessage(actionError,'Registration could not be updated.'))}finally{setBusy(false)}};
  const rounds=Math.max(1,Math.log2(snapshot?.bracketSize||event.bracketSize));
  const decision=(round:number,match:number)=>snapshot?.decisions.find(item=>item.round===round&&item.match===match);
  const entrantById=(id?:string)=>snapshot?.entrants.find(entrant=>entrant.userId===id);
  const slotEntrant=(round:number,slot:number):CloudBracketEntrant|undefined=>{if(!snapshot)return;if(round===0)return snapshot.entrants[slot];return entrantById(decision(round-1,Math.floor(slot/2))?.winnerId)};
  const canManage=Boolean(access.role)||(event.kind==='community'&&event.creatorHandle?.toLowerCase()===account.handle.toLowerCase());
  const advance=async(round:number,match:number,entrant?:CloudBracketEntrant)=>{if(!canManage||!snapshot||!entrant||busy)return;setBusy(true);setError('');try{if(backend.enabled)await backend.recordBracketWinner(event.kind,snapshot.sourceId,round,match,entrant.userId);else{const nextDecisions=[...snapshot.decisions.filter(item=>item.round!==round||item.match!==match),{round,match,winnerId:entrant.userId,decidedAt:new Date().toISOString()}];const next={...snapshot,decisions:nextDecisions};localStorage.setItem(storageKey,JSON.stringify(next));setSnapshot(next)}notify(`${entrant.handle} advanced in ${event.name}.`);await load(true)}catch(actionError){setError(backendErrorMessage(actionError,'The winner could not be recorded.'))}finally{setBusy(false)}};
  if(loading)return <LiveEmpty icon={<LoaderCircle className="spin"/>} title="LOADING LIVE BRACKET" detail="Synchronizing entrants and match progression."/>;
  if(!snapshot)return <LiveEmpty icon={<AlertTriangle/>} title="BRACKET UNAVAILABLE" detail={error||'Try opening this event again.'}/>;
  const champion=entrantById(decision(rounds-1,0)?.winnerId);
  return <div className="tournament-bracket">
    <div className="bracket-summary"><div><span className="eyebrow">{event.format} · {event.region}</span><h3>{event.name}</h3><p>{event.description||`${snapshot.bracketSize}-entry single-elimination bracket.`}</p></div><div className="bracket-stats"><span><b>{snapshot.entrants.length}/{snapshot.bracketSize}</b> ENTRIES</span><span><b>{new Date(snapshot.startsAt).toLocaleString()}</b> START</span>{event.prizePool&&<span><b>{event.prizePool}</b> PRIZE</span>}</div></div>
    <div className="bracket-toolbar"><span><i/> LIVE · UPDATES EVERY 10 SECONDS</span><button className={snapshot.registered?'secondary':'primary'} disabled={busy||(!snapshot.registered&&partySize!==event.required)||snapshot.entrants.length>=snapshot.bracketSize} onClick={()=>void toggleRegistration()}>{busy?'UPDATING...':snapshot.registered?'WITHDRAW':'JOIN TOURNAMENT'}</button></div>
    {error&&<div className="auth-error"><AlertTriangle size={15}/>{error}</div>}
    <div className="bracket-scroll"><div className="bracket-rounds">{Array.from({length:rounds},(_,round)=>{const matchCount=snapshot.bracketSize/2**(round+1);const label=round===rounds-1?'FINAL':round===rounds-2?'SEMIFINALS':round===rounds-3?'QUARTERFINALS':`ROUND ${round+1}`;return <section className="bracket-round" key={round}><header><span>{label}</span><b>{matchCount} MATCH{matchCount===1?'':'ES'}</b></header><div className="bracket-match-list">{Array.from({length:matchCount},(_,match)=>{const selected=decision(round,match)?.winnerId;return <article className="bracket-match" key={match}><small>MATCH {match+1}</small>{[0,1].map(side=>{const slot=match*2+side;const entrant=slotEntrant(round,slot);const won=Boolean(entrant&&selected===entrant.userId);return <button className={`${entrant?'filled':'placeholder'} ${won?'winner':''}`} key={side} disabled={!entrant||!canManage||busy} onClick={()=>void advance(round,match,entrant)} title={canManage&&entrant?'Select as match winner':undefined}><span className={`avatar ${entrant?.avatarUrl?'custom-avatar':''}`}>{entrant?.avatarUrl?<img src={entrant.avatarUrl} alt={`${entrant.handle} avatar`}/>:entrant?entrant.handle.slice(0,2).toUpperCase():<UserRound size={14}/>}</span><b>{entrant?.handle||(round===0?`OPEN SLOT ${String(slot+1).padStart(2,'0')}`:'AWAITING WINNER')}</b>{won&&<Trophy size={13}/>}</button>})}</article>})}</div></section>})}{champion&&<section className="bracket-champion"><Trophy/><span>CHAMPION</span><div><span className={`avatar ${champion.avatarUrl?'custom-avatar':''}`}>{champion.avatarUrl?<img src={champion.avatarUrl} alt={`${champion.handle} avatar`}/>:champion.handle.slice(0,2).toUpperCase()}</span><b>{champion.handle}</b></div></section>}</div></div>
    {canManage&&<p className="bracket-admin-note"><ShieldCheck size={13}/> Organizer controls enabled: click a pilot in a match to advance them.</p>}
  </div>;
}

function UtilityPanel({panel,account,access,selectedQueue,members,setPage,close,notify,theme,setTheme,fontScale,setFontScale,backgroundChatNotifications,setBackgroundChatNotifications,onCommunityEventCreated,hasUnreadNotifications,cloudNotifications,markNotificationsRead}:{panel:PanelState;account:Account;access:PlatformAccess;selectedQueue:typeof queues[number];members:PartyMember[];setPage:(page:Page)=>void;close:()=>void;notify:(message:string)=>void;theme:ThemeMode;setTheme:(theme:ThemeMode)=>void;fontScale:number;setFontScale:(scale:number)=>void;backgroundChatNotifications:boolean;setBackgroundChatNotifications:(enabled:boolean)=>void;onCommunityEventCreated:()=>void;hasUnreadNotifications:boolean;cloudNotifications:CloudNotification[];markNotificationsRead:(notificationId?:string)=>Promise<void>}){
  const titles:Record<PanelMode,string>={search:'NAVIGATE STARLADDER','party-finder':'PARTY FINDER',settings:'SETTINGS',support:'SUPPORT CENTER',notifications:'NOTIFICATIONS','match-rules':'RANKED MATCH RULES','match-room':'MATCH ROOM','create-event':'CREATE TOURNAMENT','event-details':panel.title||'TOURNAMENT DETAILS',organization:panel.title||'ORGANIZATION','create-organization':'CREATE ORGANIZATION'};
  const [query,setQuery]=useState('');const [saved,setSaved]=useState(false);const [formValue,setFormValue]=useState('');const [region,setRegion]=useState(()=>{try{return JSON.parse(localStorage.getItem('nexus-settings')||'{}').region||'US East'}catch{return'US East'}});const [desktopNotifications,setDesktopNotifications]=useState(()=>{try{return JSON.parse(localStorage.getItem('nexus-settings')||'{}').notifications!==false}catch{return true}});
  const [eventDescription,setEventDescription]=useState('');const [eventFormat,setEventFormat]=useState<'1v1'|'3v3'|'5v5'>('1v1');const [eventBracketSize,setEventBracketSize]=useState(8);const [eventStart,setEventStart]=useState(defaultEventStartValue);const [eventPrizePool,setEventPrizePool]=useState('');const [eventBusy,setEventBusy]=useState(false);const [eventError,setEventError]=useState('');
  const searchResults=[...nav,{label:'Admin' as Page,icon:ShieldCheck}].map(item=>({name:item.label,type:'STARLADDER section',page:item.label})).filter(item=>!query||item.name.toLowerCase().includes(query.toLowerCase()));
  const submitRecord=(key:string,value:unknown,message:string)=>{const existing=(()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}})();localStorage.setItem(key,JSON.stringify([...existing,value]));setSaved(true);notify(message)};
  const saveSettings=()=>{const current=(()=>{try{return JSON.parse(localStorage.getItem('nexus-settings')||'{}')}catch{return{}}})();localStorage.setItem('nexus-settings',JSON.stringify({...current,region,notifications:desktopNotifications,backgroundChatNotifications,theme,fontScale}));setSaved(true);notify('Settings saved.')};
  const createCommunityEvent=async()=>{
    const startsAt=new Date(eventStart);
    if(formValue.trim().length<3){setEventError('Enter an event name with at least 3 characters.');return}
    if(!eventPrizePool.trim()){setEventError('Describe the prize pool, or enter “No prize”.');return}
    if(!Number.isFinite(startsAt.getTime())||startsAt.getTime()<Date.now()+30*60*1000){setEventError('Schedule the event at least 30 minutes from now.');return}
    setEventBusy(true);setEventError('');
    try{
      const event:CloudCommunityEvent={id:crypto.randomUUID(),publicId:`LOCAL-${Date.now()}`,creatorHandle:account.handle,name:formValue.trim(),description:eventDescription.trim(),format:eventFormat,region,startsAt:startsAt.toISOString(),bracketSize:eventBracketSize,prizePool:eventPrizePool.trim()};
      if(backend.enabled){event.id=await backend.createCommunityEvent(event)}else{const existing=(()=>{try{return JSON.parse(localStorage.getItem('nexus-community-events')||'[]')}catch{return[]}})();localStorage.setItem('nexus-community-events',JSON.stringify([...existing,event]))}
      setSaved(true);onCommunityEventCreated();notify(`${event.name} submitted for admin approval.`);
    }catch(error){setEventError(backendErrorMessage(error,'The tournament could not be created.'))}finally{setEventBusy(false)}
  };
  const body=(()=>{
    if(panel.mode==='search')return <><label className="utility-search"><Search/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a STARLADDER section"/></label><div className="utility-results">{searchResults.map(result=><button key={result.name} onClick={()=>{setPage(result.page);close()}}><span className="avatar">{result.name.slice(0,2).toUpperCase()}</span><div><b>{result.name}</b><small>{result.type}</small></div><ChevronRight/></button>)}</div><p className="utility-copy">Pilot, organization, and event directory search will be enabled when its live index is ready.</p></>;
    if(panel.mode==='party-finder')return <><p className="utility-copy">Your party currently has {members.length} member{members.length===1?'':'s'} for <b>{selectedQueue.mode}</b>.</p><LiveEmpty icon={<Users/>} title="NO LIVE PARTY LISTINGS" detail="Public party listings are not connected yet. Share the real party code from Your Party to invite verified pilots."/></>;
    if(panel.mode==='settings')return <div className="utility-form">
      <label>DEFAULT REGION<select value={region} onChange={e=>setRegion(e.target.value)}><option>US East</option><option>US Central</option><option>US West</option><option>Europe</option></select></label>
      <div className="font-scale-setting"><div><b>TEXT &amp; INTERFACE SIZE</b><span>Changes immediately and stays set after restarting.</span></div><div className="font-scale-controls"><button onClick={()=>setFontScale(fontScale-.05)} disabled={fontScale<=.9} aria-label="Decrease text size">−</button><input type="range" min="0.9" max="1.3" step="0.05" value={fontScale} onChange={e=>setFontScale(Number(e.target.value))} aria-label="Text and interface size"/><strong>{Math.round(fontScale*100)}%</strong><button onClick={()=>setFontScale(fontScale+.05)} disabled={fontScale>=1.3} aria-label="Increase text size">+</button></div></div>
      <label className="toggle-row theme-toggle">PURE BLACK NIGHT MODE<span>Removes tinted panels and glow for lower-light use.</span><input type="checkbox" checked={theme==='night'} onChange={e=>setTheme(e.target.checked?'night':'standard')}/></label>
      <label className="toggle-row">DESKTOP NOTIFICATIONS<input type="checkbox" checked={desktopNotifications} onChange={e=>setDesktopNotifications(e.target.checked)}/></label>
      <label className="toggle-row background-chat-toggle">BACKGROUND CHAT NOTIFICATIONS<span>Shows Windows alerts for new channel messages while minimized.</span><input type="checkbox" checked={backgroundChatNotifications} onChange={e=>setBackgroundChatNotifications(e.target.checked)}/></label>
      {window.starladderDesktop&&<button className="secondary background-chat-test" disabled={!backgroundChatNotifications} onClick={()=>void window.starladderDesktop?.testBackgroundChatNotification()}>MINIMIZE &amp; TEST CHAT ALERT</button>}
      <label className="toggle-row">MATCH READY SOUND<input type="checkbox" defaultChecked/></label>{window.starladderDesktop&&<label className="toggle-row">LAUNCH AT WINDOWS STARTUP<input type="checkbox"/></label>}
      <button className="primary" onClick={saveSettings}>SAVE SETTINGS</button>{saved&&<span className="saved-state"><ShieldCheck/> SETTINGS SAVED</span>}
    </div>;
    if(panel.mode==='support')return <div className="utility-form"><p className="utility-copy">Describe the problem and a local support ticket will be created for tracking.</p><label>CATEGORY<select><option>Account & verification</option><option>Match dispute</option><option>Technical issue</option><option>Report a player</option></select></label><label>DETAILS<textarea value={formValue} onChange={e=>setFormValue(e.target.value)} placeholder="What happened?"/></label><button className="primary" disabled={formValue.trim().length<10} onClick={()=>submitRecord('starladder-support-tickets',{id:`SL-${Date.now().toString().slice(-6)}`,text:formValue,createdAt:new Date().toISOString()},'Support ticket created.')}>SUBMIT TICKET</button>{saved&&<span className="saved-state"><ClipboardCheck/> TICKET SAVED LOCALLY</span>}</div>;
    if(panel.mode==='notifications')return <div className={`notification-list ${hasUnreadNotifications?'':'all-read'}`}>{cloudNotifications.length===0?<div className="notification-empty"><ShieldCheck/><span><b>ALL CAUGHT UP</b><small>Real account and dispute activity will appear here.</small></span></div>:cloudNotifications.map(item=><button className={`notification-item ${item.readAt?'read':'unread'}`} key={item.id} onClick={()=>{void markNotificationsRead(item.id);if(item.kind==='match_dispute'){setPage('Admin');close()}}}>{item.kind==='match_dispute'?<AlertTriangle/>:<ShieldCheck/>}<span><b>{item.title}</b><small>{item.body}</small><time>{new Date(item.createdAt).toLocaleString()}</time></span>{!item.readAt&&<i/>}</button>)}{hasUnreadNotifications?<button className="mark-all-read" onClick={()=>{void markNotificationsRead();close()}}>MARK ALL READ</button>:cloudNotifications.length>0&&<span className="saved-state"><ShieldCheck/> ALL CAUGHT UP</span>}</div>;
    if(panel.mode==='match-rules')return <div className="rules-list"><div><b>01</b><p>Only verified RSI identities may enter STARLADDER matchmaking.</p></div><div><b>02</b><p>Ranked results affect rating and leaderboards; Unranked results never change ELO.</p></div><div><b>03</b><p>Captains submit the Star Citizen match ID and final score. Results auto-approve unless disputed during review.</p></div><div><b>04</b><p>No-shows, false reports, cheating, or harassment may result in sanctions in either mode.</p></div></div>;
    if(panel.mode==='match-room')return <LiveEmpty icon={<Swords/>} title="NO MATCH SELECTED" detail="Open a live match from Match Center when a match room has been created."/>;
    if(panel.mode==='create-event')return <div className="utility-form event-create-form"><label>EVENT NAME<input value={formValue} maxLength={80} onChange={e=>setFormValue(e.target.value)} placeholder="Your tournament name"/></label><label>DESCRIPTION<textarea value={eventDescription} maxLength={500} onChange={e=>setEventDescription(e.target.value)} placeholder="Rules, game mode, and anything entrants should know."/></label><div className="event-form-grid"><label>FORMAT<select value={eventFormat} onChange={e=>setEventFormat(e.target.value as '1v1'|'3v3'|'5v5')}><option value="1v1">1v1 Duel</option><option value="3v3">3v3 Skirmish</option><option value="5v5">5v5 Squadron Battle</option></select></label><label>BRACKET SIZE<select value={eventBracketSize} onChange={e=>setEventBracketSize(Number(e.target.value))}><option value={8}>8 entries</option><option value={16}>16 entries</option><option value={32}>32 entries</option><option value={64}>64 entries</option></select></label></div><div className="event-form-grid"><label>REGION<select value={region} onChange={e=>setRegion(e.target.value)}><option>US East</option><option>US Central</option><option>US West</option><option>Europe</option></select></label><label>START DATE &amp; TIME<input type="datetime-local" value={eventStart} onChange={e=>setEventStart(e.target.value)}/></label></div><label>PRIZE POOL<input value={eventPrizePool} maxLength={80} onChange={e=>setEventPrizePool(e.target.value)} placeholder="$500, 5M aUEC, ship package, or No prize"/></label><p className="event-prize-note"><Info size={14}/>Prize pools are declared and fulfilled by the organizer. STARLADDER does not hold or guarantee community-event prizes.</p>{eventError&&<div className="auth-error"><AlertTriangle size={15}/>{eventError}</div>}<button className="primary" disabled={eventBusy||saved||formValue.trim().length<3||!eventPrizePool.trim()} onClick={()=>void createCommunityEvent()}>{eventBusy?'SUBMITTING...':saved?'AWAITING APPROVAL':'SUBMIT FOR APPROVAL'}</button>{saved&&<span className="saved-state"><Trophy/> ADMIN REVIEW REQUIRED BEFORE LISTING</span>}</div>;
    if(panel.mode==='event-details')return panel.event?<TournamentBracket event={panel.event} account={account} access={access} partySize={members.length} notify={notify} onChanged={onCommunityEventCreated}/>:<LiveEmpty icon={<Trophy/>} title="EVENT UNAVAILABLE" detail="Open an event from the tournament list to view its bracket."/>;
    return <LiveEmpty icon={<UsersRound/>} title="ORGANIZATION SERVICE OFFLINE" detail="Organization creation, rosters, and applications will activate after persistent backend support is ready."/>;
  })();
  return <div className="utility-backdrop" onMouseDown={close}><section className={`utility-panel ${panel.mode==='event-details'?'bracket-panel':''}`} onMouseDown={event=>event.stopPropagation()}><div className="utility-head"><div><span className="eyebrow">STARLADDER COMMAND</span><h2>{titles[panel.mode]}</h2></div><button onClick={close}><X/></button></div><div className="utility-body">{body}</div></section></div>;
}

function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>}
function LiveEmpty({icon,title,detail}:{icon:ReactNode;title:string;detail:string}){return <div className="live-empty"><span>{icon}</span><b>{title}</b><small>{detail}</small></div>}
export default App;
