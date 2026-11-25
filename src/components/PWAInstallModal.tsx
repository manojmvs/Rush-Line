import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  MoreVertical,
  QrCode,
  RefreshCw,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

const GAME_ICON_SRC = `${import.meta.env.BASE_URL}assets/aistudio/ICON_49f818b7.jpeg`;

interface PWAInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function PWAInstallModal({ open, onClose }: PWAInstallModalProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, inIframe, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showQrOnMobile, setShowQrOnMobile] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const appUrl =
    typeof window !== 'undefined' ? new URL('./', window.location.href).href : '';
  const isMobileBrowser = isAndroid || isIOS;

  useEffect(() => {
    if (!open || !appUrl) return;
    let active = true;
    QRCode.toDataURL(appUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0B1220',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [open, appUrl]);

  if (!open) return null;

  const handleNativeInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await install();
      if (accepted) {
        onClose();
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050A14]/84 p-2.5 sm:p-4">
      <div className="w-full max-w-2xl max-h-[94dvh] flex flex-col rounded-lg bg-[#0B1424] border border-white/18 shadow-2xl overflow-hidden">
        {/* Header featuring the official RUSH LINE Android Game Icon */}
        <div className="shrink-0 flex items-center justify-between px-3.5 sm:px-5 py-2.5 sm:py-3 border-b-2 border-[#FFD014] bg-[#08101E]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src={GAME_ICON_SRC}
              alt="RUSH LINE Game Icon"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl border-2 border-[#FFD014] shadow-md object-cover shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-display italic font-black text-sm sm:text-lg text-white leading-tight truncate">
                INSTALL RUSH LINE ON ANDROID
              </h2>
              <div className="text-[10px] sm:text-[11px] font-display italic font-bold text-slate-300 truncate">
                Home Screen App · Full-Screen Landscape · Live Auto-Updates
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install dialog"
            className="-skew-x-10 w-8 h-8 sm:w-9 sm:h-9 bg-[#14223A] hover:bg-[#E5252B] border border-white/18 flex items-center justify-center text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 skew-x-10" />
          </button>
        </div>

        <div className="p-3 sm:p-5 overflow-y-auto custom-scroll space-y-3 sm:space-y-4 text-xs sm:text-sm">
          {/* Android Home Screen Preview + One-Tap Native Install CTA */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-[#111D33] border border-[#FFD014]/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative shrink-0">
                <img
                  src={GAME_ICON_SRC}
                  alt="RUSH LINE Android Home Screen Icon"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-lg object-cover border border-white/20"
                />
                <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-[#FFD014] text-[#0B1220] text-[8px] sm:text-[9px] font-display font-black leading-none">
                  APP
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-display italic font-black text-sm text-white">
                  RUSH LINE — 3D Racing
                </div>
                <div className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-snug">
                  {isInstalled
                    ? 'Installed & connected — new game updates sync automatically.'
                    : isInstallable
                      ? 'Ready! Tap the yellow button to install on Android — future updates sync automatically.'
                      : isAndroid
                        ? 'Install via Chrome ⋮ menu — future game updates will reflect automatically.'
                        : 'Open on your Android phone via the QR code or link below to install.'}
                </div>
              </div>
            </div>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                disabled={installing}
                onClick={handleNativeInstall}
                className="w-full sm:w-auto h-10 sm:h-11 px-5 -skew-x-10 bg-[#FFD014] hover:bg-[#ffe04d] disabled:opacity-50 text-[#0B1220] font-display italic font-black text-xs flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(255,208,20,0.45)] transition-colors shrink-0"
              >
                <span className="skew-x-10 flex items-center gap-1.5 whitespace-nowrap">
                  <Download className="w-4 h-4" />
                  {installing ? 'INSTALLING...' : 'INSTALL ON ANDROID NOW'}
                </span>
              </button>
            )}

            {isInstalled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-display italic font-bold shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                <span>INSTALLED</span>
              </div>
            )}
          </div>

          {/* Direct Android Chrome Action Card when already on Android phone & native prompt hasn't appeared yet */}
          {isAndroid && !isInstalled && !isInstallable && (
            <div className="p-3.5 rounded-xl bg-[#16243C] border border-[#FFD014]/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display italic font-black text-xs sm:text-sm text-[#FFD014] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>INSTALL RIGHT NOW IN ANDROID CHROME (2 TAPS)</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-display italic font-bold text-white flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className="w-3 h-3 text-[#FFD014]" />
                  RELOAD FOR 1-TAP
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] sm:text-xs text-slate-200">
                <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0D1626] border border-white/10">
                  <span className="w-5 h-5 rounded-full bg-[#FFD014] text-[#0B1220] font-black flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <span>
                    Tap Chrome&apos;s <strong className="inline-flex items-center align-middle px-1 rounded bg-white/15"><MoreVertical className="w-3 h-3" /></strong> menu icon at the top-right corner of your browser.
                  </span>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-lg bg-[#0D1626] border border-white/10">
                  <span className="w-5 h-5 rounded-full bg-[#FFD014] text-[#0B1220] font-black flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <span>
                    Tap <strong>Add to Home screen</strong> → <strong>Install</strong> to add RUSH LINE with its game icon.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Desktop View: QR Code + Link + Platform Guides; Mobile View: Optional QR toggle */}
          {(!isMobileBrowser || showQrOnMobile) && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
              {/* Left Column: Scannable Android QR Code */}
              <div className="md:col-span-5 flex flex-col items-center text-center p-3.5 rounded-xl bg-[#111C30] border border-white/12">
                <div className="flex items-center gap-1.5 text-xs font-display italic font-black text-[#FFD014] mb-2.5">
                  <QrCode className="w-4 h-4" />
                  <span>SCAN ON ANDROID PHONE</span>
                </div>

                <div className="w-[164px] h-[164px] rounded-lg bg-white p-2 flex items-center justify-center shadow-lg">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR code to install RUSH LINE on Android mobile"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500">Generating QR...</div>
                  )}
                </div>

                <p className="text-[11px] text-slate-300 mt-2.5 leading-relaxed">
                  Scan with your Android camera or Google Lens to open RUSH LINE in Chrome and install.
                </p>
              </div>

              {/* Right Column: Direct Link + Android / iOS Steps */}
              <div className="md:col-span-7 space-y-2.5">
                {!isInstalled && !isInstallable && inIframe && (
                  <div className="p-2.5 rounded-lg bg-[#FFD014]/10 border border-[#FFD014]/35 text-[11px] text-amber-100 leading-relaxed">
                    Scan the QR code with your Android phone or open the direct link below in <strong>Google Chrome</strong> on Android.
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-display italic font-bold text-slate-300 mb-1">
                    DIRECT ANDROID MOBILE LINK
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={appUrl}
                      aria-label="Mobile App URL"
                      className="flex-1 h-9 px-3 rounded-lg bg-[#142036] border border-white/15 text-xs font-mono-tabular text-slate-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="h-9 px-3 rounded-lg bg-[#FFD014] hover:bg-[#ffe04d] text-[#0B1220] text-xs font-display italic font-black flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    className={`p-2.5 rounded-lg border ${
                      isAndroid || !isIOS
                        ? 'bg-[#17253D] border-[#FFD014]/75'
                        : 'bg-[#111C30] border-white/12'
                    }`}
                  >
                    <div className="font-display italic font-black text-xs text-[#FFD014] flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>ANDROID (CHROME)</span>
                    </div>
                    <ol className="mt-1 space-y-0.5 text-[11px] text-slate-200 list-decimal list-inside leading-relaxed">
                      <li>Open in <strong>Chrome</strong> on Android.</li>
                      <li>Tap <strong>INSTALL ON ANDROID</strong> or menu (<strong>⋮</strong>).</li>
                      <li>Tap <strong>Install app</strong> / <strong>Add to Home screen</strong>.</li>
                    </ol>
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border ${
                      isIOS
                        ? 'bg-[#17253D] border-[#FFD014]/75'
                        : 'bg-[#111C30] border-white/12'
                    }`}
                  >
                    <div className="font-display italic font-black text-xs text-white flex items-center gap-1.5">
                      <Share className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>IPHONE &amp; IPAD (SAFARI)</span>
                    </div>
                    <ol className="mt-1 space-y-0.5 text-[11px] text-slate-300 list-decimal list-inside leading-relaxed">
                      <li>Open in <strong>Safari</strong> on iPhone/iPad.</li>
                      <li>Tap the <strong>Share</strong> icon in Safari.</li>
                      <li>Tap <strong>Add to Home Screen</strong>.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* On Mobile: compact Copy Link + Toggle QR row */}
          {isMobileBrowser && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-display italic font-bold text-white flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'LINK COPIED' : 'COPY LINK'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrOnMobile((s) => !s)}
                className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-display italic font-bold text-[#FFD014] flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQrOnMobile ? 'HIDE QR CODE' : 'SHOW QR FOR ANOTHER PHONE'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed top-16 right-4 z-40 flex items-center gap-2 rounded-lg bg-[#1C1917] border border-[#FFD014]/50 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-[#FFD014] shrink-0" />
      <span>Offline Mode — Quick Race &amp; Garage available</span>
    </div>
  );
}
