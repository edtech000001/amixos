import { type ReactNode } from 'react';
import Sortable from 'react-native-sortables';
import { useSettingsScrollRef } from '@/components/SettingsPageWrapper';

// Vertical sortable list for the mobile Settings screens. Caller provides items
// with stable ids and a render function.
//
// Uses react-native-sortables (same library as the dashboard widgets): drag
// only activates after a LONG-PRESS, so a normal swipe scrolls the settings
// page instead of grabbing a row. It also auto-scrolls while dragging near an
// edge via the page's scroll ref. This replaces react-native-draggable-flatlist,
// whose NestableScrollContainer made the page hard/impossible to scroll.
//
// `drag`/`isActive` in the render callback are kept for API compatibility but
// are no-ops now — the whole row is the drag target (long-press anywhere) and
// the library applies its own active-item styling.

interface Props<T extends { id: string }> {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (
    item: T,
    index: number,
    handle: { drag: () => void; isActive: boolean },
  ) => ReactNode;
}

const noop = () => {};

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: Props<T>) {
  const scrollRef = useSettingsScrollRef();
  return (
    <Sortable.Grid
      data={items}
      columns={1}
      rowGap={0}
      keyExtractor={(it) => it.id}
      dragActivationDelay={200}
      scrollableRef={scrollRef ?? undefined}
      onDragEnd={({ data }) => onReorder(data)}
      renderItem={({ item, index }) => renderItem(item, index, { drag: noop, isActive: false }) as JSX.Element}
    />
  );
}
