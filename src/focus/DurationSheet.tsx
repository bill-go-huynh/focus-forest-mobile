import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Input } from '../components/Input';
import { Sheet } from '../components/Sheet';
import { useTheme } from '../theme';
import {
  DURATION_PRESETS,
  FIRST_SESSION_MINUTES,
  formatMinutes,
  isPresetDuration,
  isSelectableDuration,
  parseCustomMinutes,
} from './duration';

export interface DurationSheetProps {
  visible: boolean;
  /** The selection it opens with, usually from `initialDurationForTopic`. */
  initialMinutes: number;
  /** The confirm button's label, chosen by the flow that opens it. */
  confirmLabel: string;
  /** Called once with a selectable duration (5–180 minutes in 5-minute steps). */
  onConfirm: (minutes: number) => void;
  /** Close, back, escape, or the backdrop. Nothing is kept. */
  onCancel: () => void;
}

/**
 * The duration choice (docs/05 → Duration sheet; docs/02: presets first, Custom one tap
 * away). It only answers the chosen minutes: it starts nothing and stores nothing, so a
 * duration chosen and then abandoned is never remembered. Each opening starts from
 * `initialMinutes`.
 */
export function DurationSheet({
  visible,
  initialMinutes,
  confirmLabel,
  onConfirm,
  onCancel,
}: DurationSheetProps) {
  // A new choice every time the sheet opens.
  const [opening, setOpening] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpening(opening + 1);
  }

  return (
    <Sheet visible={visible} onRequestClose={onCancel} title="Duration">
      <DurationChoice
        key={opening}
        initialMinutes={initialMinutes}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
      />
    </Sheet>
  );
}

function DurationChoice({
  initialMinutes,
  confirmLabel,
  onConfirm,
}: Pick<DurationSheetProps, 'initialMinutes' | 'confirmLabel' | 'onConfirm'>) {
  const theme = useTheme();
  const start = isSelectableDuration(initialMinutes) ? initialMinutes : FIRST_SESSION_MINUTES;
  const [preset, setPreset] = useState<number | null>(isPresetDuration(start) ? start : null);
  const [customText, setCustomText] = useState(String(start));
  const [customError, setCustomError] = useState<string | null>(null);

  const confirm = () => {
    if (preset !== null) {
      onConfirm(preset);
      return;
    }
    const custom = parseCustomMinutes(customText);
    if (custom.ok) onConfirm(custom.minutes);
    else setCustomError(custom.message);
  };

  const openCustom = () => {
    if (preset !== null) setCustomText(String(preset));
    setPreset(null);
  };

  return (
    <View style={{ gap: theme.space[4] }}>
      {/* The minutes are the name, and the selection shows by outline, never color alone. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {DURATION_PRESETS.map((minutes) => (
          <Chip
            key={minutes}
            label={formatMinutes(minutes)}
            selected={preset === minutes}
            onPress={() => {
              setPreset(minutes);
              setCustomError(null);
            }}
          />
        ))}
        <Chip label="Custom" selected={preset === null} onPress={openCustom} />
      </View>
      {preset === null ? (
        <Input
          label="Minutes"
          value={customText}
          onChangeText={(text) => {
            setCustomText(text);
            setCustomError(null);
          }}
          error={customError ?? undefined}
          helper="From 5 to 180, in 5-minute steps."
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={confirm}
        />
      ) : null}
      <Button variant="primary" label={confirmLabel} onPress={confirm} />
    </View>
  );
}
