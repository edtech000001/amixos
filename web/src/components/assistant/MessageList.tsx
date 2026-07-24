'use client';

import { useEffect, useRef, useState } from 'react';
import { BotMessageSquare, Pencil, Check, X } from 'lucide-react';
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
  /** Edit an earlier user message and re-run from there. */
  onEditMessage?: (id: string, text: string) => void;
}

export function MessageList({
  bubbles,
  pendingDraft,
  sending,
  confirming,
  error,
  onConfirm,
  onSend,
  onEditMessage,
}: MessageListProps) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  const tc = full.common.buttons;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const saveEdit = () => {
    if (editingId && editText.trim() && onEditMessage) onEditMessage(editingId, editText.trim());
    setEditingId(null);
  };

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
        <p className="text-lg font-bold text-ink">{t.emptyTitle}</p>
        <p className="mb-6 mt-1 text-center text-sm text-muted">{t.emptyState}</p>
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
            editingId === b.id ? (
              <div key={b.id} className="self-end w-[90%] flex flex-col gap-2">
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                  rows={2}
                  autoFocus
                  className="w-full resize-none rounded-2xl border border-primary/30 bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-border-soft">
                    <X size={13} className="mr-1 inline"/>{tc.cancel}
                  </button>
                  <button type="button" onClick={saveEdit} disabled={!editText.trim()}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    <Check size={13} className="mr-1 inline"/>{tc.save}
                  </button>
                </div>
              </div>
            ) : (
              <div key={b.id} className="group flex items-center gap-1.5 self-end max-w-[90%]">
                {onEditMessage && (
                  <button type="button" onClick={() => { setEditingId(b.id); setEditText(b.content); }}
                    title={tc.edit}
                    className="shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition-opacity hover:bg-border-soft hover:text-muted group-hover:opacity-100">
                    <Pencil size={13}/>
                  </button>
                )}
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white">
                  {b.content}
                </div>
              </div>
            )
          ) : (
            <div key={b.id} className="self-start max-w-[85%]">
              <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-border-soft px-4 py-2.5 text-sm text-ink">
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
            className="self-start flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-border-soft px-4 py-3"
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
