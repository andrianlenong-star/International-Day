import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Send,
  ExternalLink,
  QrCode,
  Globe,
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneNumber: number;
  countryName: string;
  language: 'id' | 'en';
  isDarkMode: boolean;
}

/**
 * Bulletproof copy utility that works in any browser, iframe, or restricted context
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  // Method 1: Modern navigator.clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Method 2: Fallback using document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch {
    // ignore
  }

  return false;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  sceneNumber,
  countryName,
  language,
  isDarkMode,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedScene, setSelectedScene] = useState<number>(sceneNumber);
  const [selectedLang, setSelectedLang] = useState<'id' | 'en'>(language);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Resolve public accessible URL for students (avoiding private aistudio developer portal 403 error)
  const getPublicBaseUrl = () => {
    if (typeof window !== 'undefined') {
      const { origin, hostname, pathname } = window.location;
      // If viewed inside developer studio or on aistudio.google.com, use public shared app domain
      if (hostname.includes('aistudio.google.com') || origin.includes('google.com/applet')) {
        return 'https://ais-pre-n5pn4ytraybjp4nfwkg4i6-496673436177.asia-southeast1.run.app';
      }
      return `${origin}${pathname}`;
    }
    return 'https://ais-pre-n5pn4ytraybjp4nfwkg4i6-496673436177.asia-southeast1.run.app';
  };

  const baseUrl = getPublicBaseUrl().replace(/\/+$/, '');
  const shareUrl = `${baseUrl}?country=${encodeURIComponent(countryName)}&scene=${selectedScene}&lang=${selectedLang}`;

  const handleCopy = async () => {
    const success = await copyTextSafely(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const shareText =
    language === 'id'
      ? `Halo siswa! Tonton modul pembelajaran dokumenter interaktif ${countryName} (Scene ${selectedScene}) di EduZone: ${shareUrl}`
      : `Hello students! Explore the interactive documentary learning module for ${countryName} (Scene ${selectedScene}) on EduZone: ${shareUrl}`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${
          isDarkMode
            ? 'bg-stone-900 border-stone-800 text-stone-100'
            : 'bg-white border-amber-200 text-stone-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDarkMode ? 'border-stone-800 bg-stone-950/60' : 'border-amber-100 bg-amber-50/70'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 text-white shadow">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">
                {language === 'id' ? 'Bagikan Modul ke Siswa' : 'Share Module with Students'}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {language === 'id'
                  ? `Kirim tautan langsung untuk pembelajaran negara ${countryName}`
                  : `Direct student link for ${countryName} documentary learning`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Share Modal"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Quick Scene & Language Filters */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                {language === 'id' ? 'Mulai di Scene:' : 'Start at Scene:'}
              </label>
              <select
                value={selectedScene}
                onChange={(e) => setSelectedScene(parseInt(e.target.value, 10))}
                className="w-full p-2 rounded-xl border border-stone-700 bg-stone-950 text-stone-200 font-semibold focus:outline-none focus:border-amber-500"
              >
                {[1, 2, 3, 4, 5, 6].map((s) => (
                  <option key={s} value={s}>
                    Scene {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                {language === 'id' ? 'Bahasa Tampilan:' : 'Language:'}
              </label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value as 'id' | 'en')}
                className="w-full p-2 rounded-xl border border-stone-700 bg-stone-950 text-stone-200 font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Direct Link Box with Bulletproof Copy */}
          <div>
            <label className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-1.5">
              {language === 'id' ? 'Tautan Langsung Siswa:' : 'Direct Student URL:'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 p-2.5 rounded-xl border border-stone-700 bg-stone-950 text-xs font-mono text-stone-300 focus:outline-none focus:border-amber-500 select-all"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-stone-950 bg-amber-400 hover:bg-amber-300 transition active:scale-95 shadow shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-800 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? (language === 'id' ? 'Tersalin!' : 'Copied!') : (language === 'id' ? 'Salin Tautan' : 'Copy Link')}</span>
              </button>
            </div>
            {copied && (
              <p className="mt-1.5 text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>
                  {language === 'id'
                    ? 'Tautan berhasil disalin ke papan klip! Siap dibagikan ke siswa.'
                    : 'Link successfully copied to clipboard! Ready to send to students.'}
                </span>
              </p>
            )}
          </div>

          {/* Social / Messaging Direct Share Shortcuts */}
          <div className="pt-2 border-t border-stone-800 space-y-2">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
              {language === 'id' ? 'Kirim Cepat ke Platform Belajar:' : 'Quick Share to Learning Platforms:'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 text-xs font-bold transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>WhatsApp Grup Kelas</span>
              </a>

              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-200 hover:bg-stone-700 text-xs font-bold transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>Google Classroom / LMS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3 border-t flex justify-end ${
            isDarkMode ? 'border-stone-800 bg-stone-950/60' : 'border-amber-100 bg-amber-50/70'
          }`}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition"
          >
            {language === 'id' ? 'Tutup' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
