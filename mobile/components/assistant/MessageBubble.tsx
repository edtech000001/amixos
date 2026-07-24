import { Pressable, Text, View } from 'react-native';
import type { AssistantBubble } from '@amixos/shared/assistant/useAssistantCore';
import { isJobUpdateDraft } from '@amixos/shared/assistant/types';
import { JobDraftCard } from './JobDraftCard';
import { JobUpdateCard } from './JobUpdateCard';

interface Props {
  bubble: AssistantBubble;
  /** job_id of the draft the core still holds as pending (Confirmar shows
   *  only on the bubble carrying it). */
  activeDraftId: string | null;
  confirming: boolean;
  onConfirm: () => void;
  onNavigate: () => void;
  /** Long-press a user bubble to edit + re-run from there. */
  onEdit?: () => void;
}

// One chat turn. User bubbles hug the right in primary; assistant bubbles hug
// the left in gray and may carry a JobDraftCard under the text.
export function MessageBubble({ bubble, activeDraftId, confirming, onConfirm, onNavigate, onEdit }: Props) {
  if (bubble.role === 'user') {
    return (
      <Pressable
        onLongPress={onEdit}
        delayLongPress={300}
        className="self-end bg-primary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] mb-2 active:opacity-80"
      >
        <Text className="text-[15px] text-white">{bubble.content}</Text>
      </Pressable>
    );
  }
  return (
    <View className="self-start max-w-[85%] mb-2">
      <View className="bg-border-soft rounded-2xl rounded-bl-md px-4 py-2.5">
        <Text className="text-[15px] text-ink">{bubble.content}</Text>
      </View>
      {bubble.draft ? (
        isJobUpdateDraft(bubble.draft) ? (
          <JobUpdateCard
            draft={bubble.draft}
            active={!bubble.createdJobId && bubble.draft.job_id === activeDraftId}
            createdJobId={bubble.createdJobId}
            confirming={confirming}
            onConfirm={onConfirm}
            onNavigate={onNavigate}
          />
        ) : (
          <JobDraftCard
            draft={bubble.draft}
            active={!bubble.createdJobId && bubble.draft.job_id === activeDraftId}
            createdJobId={bubble.createdJobId}
            confirming={confirming}
            onConfirm={onConfirm}
            onNavigate={onNavigate}
          />
        )
      ) : null}
    </View>
  );
}
