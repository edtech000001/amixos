// The ONE backdrop every bottom sheet / modal uses, so they all dim the same.
// Render it as the FIRST child of the modal's root View on an absolutely
// positioned Pressable, with the card as a plain sibling after it (sheet
// contract in CLAUDE.md), inside an RNModal with animationType="fade" —
// "slide" drags the dim up with the card, which reads as a gray bar rising.
//
//   <RNModal visible={open} transparent animationType="fade" onRequestClose={close}>
//     <View className="flex-1 justify-end">
//       <Pressable onPress={close} style={SHEET_BACKDROP} />
//       <View className="bg-card rounded-t-3xl …">…</View>
//     </View>
//   </RNModal>

export const SHEET_BACKDROP = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
};
