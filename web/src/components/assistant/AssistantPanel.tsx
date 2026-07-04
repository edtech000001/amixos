'use client';

import { useRef, useState } from 'react';
import { Mic, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { useAssistant } from './useAssistant';
import { useSpeechToText } from './useSpeechToText';
import { MessageList } from './MessageList';

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
}

/**
 * Right slide-over hosting the Ami chat. Stays mounted while closed so the
 * conversation survives open/close cycles; only "new chat" resets it.
 */
export function AssistantPanel({ open, onClose, businessId }: AssistantPanelProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.assistant;
  const { bubbles, pendingDraft, sending, confirming, error, send, confirm, reset } =
    useAssistant(businessId);

  const [input, setInput] = useState('');
  // Text that was already in the box when dictation started — the live
  // transcript is appended after it rather than replacing it.
  const dictationBaseRef = useRef('');
  const { supported, listening, start, stop } = useSpeechToText({
    lang: locale === 'en' ? 'en-US' : 'es-US',
    onResult: text => {
      const base = dictationBaseRef.current;
      setInput(base ? `${base} ${text}` : text);
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    if (listening) stop();
    setInput('');
    dictationBaseRef.current = '';
    void send(text);
  };

  const handleMic = () => {
    if (listening) {
      stop();
    } else {
      dictationBaseRef.current = input.trim();
      start();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label={t.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-100 bg-white shadow-2xl sm:w-[420px]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{t.title}</p>
            <p className="truncate text-xs text-gray-500">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label={t.newChat}
            title={t.newChat}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={full.common.buttons.close}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <MessageList
          bubbles={bubbles}
          pendingDraft={pendingDraft}
          sending={sending}
          confirming={confirming}
          error={error}
          onConfirm={() => void confirm()}
        />

        {/* Input */}
        <div className="border-t border-gray-100 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={Math.min(3, Math.max(1, input.split('\n').length))}
              placeholder={listening ? t.listening : t.placeholder}
              className="min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none"
            />
            {supported && (
              <button
                type="button"
                onClick={handleMic}
                aria-label={listening ? t.listening : t.send}
                title={listening ? t.listening : undefined}
                className={`shrink-0 rounded-full p-2.5 transition-colors ${
                  listening
                    ? 'animate-pulse bg-red-100 text-red-600'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              aria-label={t.send}
              title={t.send}
              className="shrink-0 rounded-full bg-primary p-2.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
