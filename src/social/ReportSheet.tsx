import { useState } from 'react';
import { Text, View } from 'react-native';

import { NetworkError, REPORT_CATEGORIES, type ReportCategory } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Input } from '../components/Input';
import { Sheet } from '../components/Sheet';
import { useTheme } from '../theme';
import { useReport } from './queries';

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  account: 'Account',
  username: 'Username',
  avatar: 'Avatar',
  bio: 'Bio',
  behavior: 'Behavior',
};

const DETAILS_MAX = 500;

/**
 * Reporting is simple and reachable from any profile (docs/02 Privacy, spec §19.3): what is
 * wrong, and optional words for the moderators. Filing twice about the same thing is harmless:
 * the server keeps the first.
 */
export function ReportSheet({
  visible,
  userId,
  name,
  onClose,
}: {
  visible: boolean;
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const report = useReport();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');

  const close = () => {
    setCategory(null);
    setDetails('');
    report.reset();
    onClose();
  };

  return (
    <Sheet visible={visible} title={`Report ${name}`} onRequestClose={close}>
      {report.isSuccess ? (
        <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
          Thank you. A moderator will look at it.
        </Text>
      ) : (
        <View style={{ gap: theme.space[3] }}>
          <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
            What is the problem?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            {REPORT_CATEGORIES.map((value) => (
              <Chip
                key={value}
                label={CATEGORY_LABEL[value]}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </View>
          <Input
            label="Anything we should know? (optional)"
            value={details}
            onChangeText={setDetails}
            maxLength={DETAILS_MAX}
            multiline
          />
          {report.isError ? (
            <FormMessage
              message={
                report.error instanceof NetworkError
                  ? "We couldn't send your report. Check your connection and try again."
                  : "We couldn't send your report. Please try again."
              }
            />
          ) : null}
          <Button
            variant="primary"
            label="Send report"
            disabled={category === null || report.isPending}
            onPress={() => {
              if (category === null) return;
              report.mutate({ userId, category, details: details.trim() || null });
            }}
          />
        </View>
      )}
    </Sheet>
  );
}
