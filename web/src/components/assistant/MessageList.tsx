'use client';

import { useEffect, useRef } from 'react';
import { BotMessageSquare } from 'lucide-react';
import type { AssistantBubble } from '@amixos/shared/assistant/useAssistantCore';
import type { JobDraft } from '@amixos/shared/assistant/types';
import { useLang } from '@/i18n/LangProvider';
import { JobDraftCard } from './JobDraftCard';

interface MessageListProps {
  bubbles: AssistantBubble[];
  pendingDraft: JobDraft | null;
  sending: boolean;
  confirming: boolean;
  error: boolean;
  onConfirm: () => void;
  /** Sends a suggestion chip's text as a message (empty state). */
  onSend: (text: string) => void;
}

export function MessageList({
  bubbles,
  pendingDraft,
  sending,
  confirming,
  error,
  onConfirm,
  onSend,
}: MessageListProps) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stick to the bottom as bubbles / typing indicator / error appear.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles.length, sending, error]);

  if (bubbles.length === 0 && !sending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <BotMessageSquare size={30} className="text-primary" />
        </div>
        <p className="text-lg font-bold text-gray-900">{t.emptyTitle}</p>
        <p className="mb-6 mt-1 text-center text-sm text-gray-500">{t.emptyState}</p>
        {/* Tappable examples — one click sends the question. */}
        <div className="flex w-full flex-col gap-2.5">
          {[t.suggestion1, t.suggestion2, t.suggestion3].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onSend(s)}
              className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-col gap-3">
        {bubbles.map(b =>
          b.role === 'user' ? (
            <div
              key={b.id}
              className="self-end max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white"
            >
              {b.content}
            </div>
          ) : (
            <div key={b.id} className="self-start max-w-[85%]">
              <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5 text-sm text-gray-900">
                {b.content}
              </div>
              {b.draft && (
                <JobDraftCard
                  draft={b.draft}
                  active={!b.createdJobId && b.draft.job_id === pendingDraft?.job_id}
                  createdJobId={b.createdJobId}
                  onConfirm={onConfirm}
                  confirming={confirming}
                />
              )}
            </div>
          ),
        )}

        {sending && (
          <div
            aria-label={t.thinking}
            className="self-start flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3"
          >
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}

        {error && <p className="self-start px-1 text-xs text-red-600">{t.errorMsg}</p>}
      </div>
    </div>
  );
}
