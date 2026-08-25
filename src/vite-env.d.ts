/// <reference types="vite/client" />

interface Window {
  nexusDesktop?: {
    platform: string;
    desktop: boolean;
    windowMinimize: () => Promise<boolean>;
    windowToggleMaximize: () => Promise<boolean>;
    windowIsMaximized: () => Promise<boolean>;
    windowClose: () => Promise<boolean>;
    showBackgroundChatNotification: (payload: { author: string; channel: string; body: string }) => Promise<{ shown: boolean }>;
    testBackgroundChatNotification: () => Promise<{ scheduled?: boolean; shown?: boolean }>;
    onOpenChatChannel: (callback: (channel: string) => void) => () => void;
    onWindowMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    setUiScale: (scale: number) => number;
    verifyRsiProfile: (handle: string, code: string) => Promise<{ ok: boolean; reason?: string; profileUrl?: string }>;
    getCaptureSettings: () => Promise<CaptureSettings>;
    configureCaptureShortcut: (accelerator: string) => Promise<CaptureActionResult>;
    captureEvidenceNow: () => Promise<CaptureActionResult>;
    setActiveMatchContext: (matchId?: string) => Promise<{ ok: boolean; matchId: string }>;
    listLocalCaptures: (matchId?: string) => Promise<LocalCapture[]>;
    openCapturesFolder: () => Promise<{ ok: boolean; reason?: string }>;
    revealLocalCapture: (filePath: string) => Promise<{ ok: boolean; reason?: string }>;
    onCaptureComplete: (callback: (result: CaptureActionResult) => void) => () => void;
    onCaptureFailed: (callback: (result: CaptureActionResult) => void) => () => void;
  };
}

type CaptureSettings = { accelerator: string; folder: string; configured: boolean; registered: boolean };
type LocalCapture = { id: string; name: string; path: string; takenAt: string; size: number; matchId: string; thumbnail: string };
type CaptureActionResult = { ok: boolean; reason?: string; accelerator?: string; folder?: string; source?: string; record?: LocalCapture };
