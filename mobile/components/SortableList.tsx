import { type ReactNode } from 'react';
import { NestableDraggableFlatList, type RenderItemParams } from 'react-native-draggable-flatlist';

// Vertical sortable list for the mobile Settings screens. Caller provides
// items with stable ids and a render function that gets `drag` + `isActive`.
//
// Uses NestableDraggableFlatList so it can live inside the existing
// SettingsPageWrapper's NestableScrollContainer (DnD inside a scrollable
// settings page without the usual nested-FlatList warnings).

interface Props<T extends { id: string }> {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (
    item: T,
    index: number,
    handle: { drag: () => void; isActive: boolean },
  ) => ReactNode;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: Props<T>) {
  const render = ({ item, drag, isActive, getIndex }: RenderItemParams<T>) =>
    renderItem(item, getIndex() ?? 0, { drag, isActive }) as JSX.Element;

  return (
    <NestableDraggableFlatList
      data={items}
      keyExtractor={(it) => it.id}
      onDragEnd={({ data }) => onReorder(data)}
      renderItem={render}
      activationDistance={6}
    />
  );
}
