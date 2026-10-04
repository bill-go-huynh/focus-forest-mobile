import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Input } from '../components/Input';
import { useTheme } from '../theme';
import {
  DAILY_GOAL_MAX_MINUTES,
  DAILY_GOAL_PRESETS,
  formatGoalMinutes,
  spokenMinutes,
} from './goal-format';

const isPreset = (minutes: number) => (DAILY_GOAL_PRESETS as readonly number[]).includes(minutes);

/** Whole minutes in the API's range; anything else gets a plain message and is not sent. */
export function parseGoalMinutes(
  text: string,
): { ok: true; minutes: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  const minutes = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  return minutes >= 1 && minutes <= DAILY_GOAL_MAX_MINUTES
    ? { ok: true, minutes }
    : { ok: false, message: `Enter whole minutes from 1 to ${DAILY_GOAL_MAX_MINUTES}.` };
}

/**
 * The daily goal choice (docs/05: presets plus custom), on Goals and in onboarding. It opens on
 * `initialMinutes` (the server's pending goal, else the one in effect or suggested) and only
 * answers the chosen minutes through `onSave`: it stores nothing. Selection shows by outline and
 * is announced, never by color alone; custom minutes carry their unit in the field's name.
 */
export function DailyGoalPicker({
  initialMinutes,
  saveLabel,
  onSave,
  busy = false,
  children,
}: {
  initialMinutes: number;
  saveLabel: string;
  onSave: (minutes: number) => void;
  busy?: boolean;
  /** Shown between the choice and the save button (a status). */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const [preset, setPreset] = useState<number | null>(
    isPreset(initialMinutes) ? initialMinutes : null,
  );
  const [customText, setCustomText] = useState(String(initialMinutes));
  const [customError, setCustomError] = useState<string | null>(null);
  // A second press before `busy` shows (same frame) sends nothing.
  const sending = useRef(false);
  useEffect(() => {
    if (!busy) sending.current = false;
  }, [busy]);

  const send = (minutes: number) => {
    if (sending.current || busy) return;
    sending.current = true;
    onSave(minutes);
  };

  const save = () => {
    if (preset !== null) {
      send(preset);
      return;
    }
    const custom = parseGoalMinutes(customText);
    if (custom.ok) send(custom.minutes);
    else setCustomError(custom.message);
  };

  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {DAILY_GOAL_PRESETS.map((minutes) => (
          <Chip
            key={minutes}
            label={formatGoalMinutes(minutes)}
            accessibilityLabel={`${spokenMinutes(minutes)} a day`}
            selected={preset === minutes}
            onPress={() => {
              setPreset(minutes);
              setCustomError(null);
            }}
          />
        ))}
        <Chip
          label="Custom"
          accessibilityLabel="Custom daily goal"
          selected={preset === null}
          onPress={() => {
            if (preset !== null) setCustomText(String(preset));
            setPreset(null);
          }}
        />
      </View>
      {preset === null ? (
        <Input
          label="Minutes per day"
          value={customText}
          onChangeText={(text) => {
            setCustomText(text);
            setCustomError(null);
          }}
          error={customError ?? undefined}
          helper={`Whole minutes, from 1 to ${DAILY_GOAL_MAX_MINUTES}.`}
          keyboardType="number-pad"
          inputMode="numeric"
          returnKeyType="done"
          onSubmitEditing={save}
        />
      ) : null}
      {children}
      <Button
        variant="primary"
        label={saveLabel}
        onPress={save}
        disabled={busy}
        disabledReason="Saving your goal."
      />
    </View>
  );
}
