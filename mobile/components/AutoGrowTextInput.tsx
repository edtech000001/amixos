import { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

/**
 * Multiline text box that GROWS with its content instead of scrolling inside a
 * fixed box. iOS keeps a multiline TextInput at its first height and scrolls
 * the text within it — a long job description read through a ~4-line slot
 * inside a scrolling page.
 *
 * Height comes from a hidden MIRROR of the text (same font, width, padding),
 * not from the input's own onContentSizeChange: on iOS that reports a size
 * that includes the input's current height, so "content + padding" fed back
 * into itself and the box grew in a loop until it filled the screen. The
 * mirror is independent of the input's height, so it can't loop.
 *
 * Callers style the input with `rounded-2xl border … px-4 py-3` and fontSize
 * 16 — the mirror's PAD_X / PAD_Y / FONT match that.
 */
const PAD_X = 16;
const PAD_Y = 12;
const FONT = 16;
const LINE = 21;

export const AutoGrowTextInput = forwardRef<TextInput, TextInputProps & { minHeight?: number }>(
  function AutoGrowTextInput({ minHeight = 90, style, value, placeholder, ...rest }, ref) {
    const [height, setHeight] = useState(minHeight);
    return (
      <View>
        {/* Invisible mirror: same width as the input, measures the text. The
            trailing space keeps a final empty line (after Enter) counted. */}
        <Text
          accessible={false}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, opacity: 0, paddingHorizontal: PAD_X + 1, paddingVertical: PAD_Y, fontSize: FONT, lineHeight: LINE }}
          onLayout={(e) => {
            const h = Math.max(minHeight, Math.ceil(e.nativeEvent.layout.height) + 4);
            setHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
          }}
        >
          {(value || placeholder || '') + '\n '}
        </Text>
        <TextInput
          ref={ref}
          {...rest}
          value={value}
          placeholder={placeholder}
          multiline
          scrollEnabled={false}
          style={[style, { height, lineHeight: LINE, textAlignVertical: 'top' }]}
        />
      </View>
    );
  },
);
