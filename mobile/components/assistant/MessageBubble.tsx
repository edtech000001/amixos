import { Text, View } from 'react-native';
import type { AssistantBubble } from '@amixos/shared/assistant/useAssistantCore';
import { JobDraftCard } from './JobDraftCard';

interface Props {
  bubble: AssistantBubble;
  /** job_id of the draft the core still holds as pending (Confirmar shows
   *  only on the bubble carrying it). */
  activeDraftId: string | null;
  confirming: boolean;
  onConfirm: () => void;
  onNavigate: () => void;
}

// One chat turn. User bubbles hug the right in primary; assistant bubbles hug
// the left in gray and may carry a JobDraftCard under the text.
export function MessageBubble({ bubble, activeDraftId, confirming, onConfirm, onNavigate }: Props) {
  if (bubble.role === 'user') {
    return (
      <View className="self-end bg-primary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] mb-2">
        <Text className="text-[15px] text-white">{bubble.content}</Text>
      </View>
    );
  }
  return (
    <View className="self-start max-w-[85%] mb-2">
      <View className="bg-border-soft rounded-2xl rounded-bl-md px-4 py-2.5">
        <Text className="text-[15px] text-ink">{bubble.content}</Text>
      </View>
      {bubble.draft ? (
        <JobDraftCard
          draft={bubble.draft}
          active={!bubble.createdJobId && bubble.draft.job_id === activeDraftId}
          createdJobId={bubble.createdJobId}
          confirming={confirming}
          onConfirm={onConfirm}
          onNavigate={onNavigate}
        />
      ) : null}
    </View>
  );
}
