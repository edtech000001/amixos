'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Loader2,
  Mic,
  PhoneOff,
  RotateCcw,
  Send,
  BotMessageSquare,
  Volume2,
  X,
} from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { useAssistant } from './useAssistant';
import { useSpeechToText } from './useSpeechToText';
import { useVoiceCall } from './useVoiceCall';
import { MessageList } from './MessageList';

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
}

// Show the END of a long in-progress utterance, not the start.
const liveTail = (s: string, max = 90) => (s.length > max ? `…${s.slice(-max)}` : s);

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
  // Hands-free call mode: continuous listen → think → speak-aloud loop.
  // (Spoken replies happen in call mode — no separate read-aloud toggle.)
  const call = useVoiceCall({ businessId, locale, send });
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

  // The panel stays mounted while closed (to keep the transcript) — hang up
  // if the user closes it mid-call.
  useEffect(() => {
    if (!open && call.active) call.end();
  }, [open, call]);

  const callStatusLabel =
    call.status === 'connecting'
      ? t.callConnecting
      : call.status === 'thinking'
        ? t.callThinking
        : call.status === 'speaking'
          ? t.callSpeaking
          : t.callListening;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label={t.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border-soft bg-card shadow-2xl sm:w-[420px]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BotMessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            <p className="truncate text-xs text-muted">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label={t.newChat}
            title={t.newChat}
            className="rounded-lg p-2 text-faint transition-colors hover:bg-surface hover:text-muted"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={full.common.buttons.close}
            className="rounded-lg p-2 text-faint transition-colors hover:bg-surface hover:text-muted"
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
          onSend={s => void send(s)}
        />

        {/* Input — swapped for the call bar during a call so the transcript
           above stays readable while you talk (your words stream into the
           bar, then land as bubbles like a normal chat). */}
        <div className="border-t border-border-soft px-3 py-3">
          {call.active ? (
            <div
              role={call.status === 'speaking' ? 'button' : undefined}
              onClick={call.status === 'speaking' ? call.interrupt : undefined}
              className={`flex items-center gap-3 rounded-2xl bg-primary/5 px-3 py-2.5 ${
                call.status === 'speaking' ? 'cursor-pointer' : ''
              }`}
            >
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                {call.status === 'listening' && (
                  <span className="absolute h-10 w-10 animate-ping rounded-full bg-primary/25" />
                )}
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {call.status === 'thinking' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : call.status === 'speaking' ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{callStatusLabel}</p>
                <p className="truncate text-xs text-muted">
                  {call.status === 'speaking'
                    ? t.callInterrupt
                    : call.status === 'thinking'
                      ? t.callThinkingHint
                      : liveTail(call.partial) || t.callHint}
                </p>
              </div>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  call.end();
                }}
                aria-label={t.callEnd}
                title={t.callEnd}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
              >
                <PhoneOff className="h-4 w-4" />
                {t.callEnd}
              </button>
            </div>
          ) : (
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
              className="min-w-0 flex-1 resize-none rounded-2xl border border-border px-4 py-2.5 text-sm text-ink placeholder-faint focus:border-primary focus:outline-none"
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
                    : 'text-faint hover:bg-surface hover:text-muted'
                }`}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
            {call.supported && (
              <button
                type="button"
                onClick={call.start}
                aria-label={t.callButton}
                title={t.callButton}
                className="shrink-0 rounded-full p-2.5 text-faint transition-colors hover:bg-surface hover:text-muted"
              >
                <AudioLines className="h-5 w-5" />
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
          )}
        </div>
      </div>
    </>
  );
}
