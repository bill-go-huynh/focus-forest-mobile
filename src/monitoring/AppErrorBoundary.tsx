import { router } from 'expo-router';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../components/Button';
import { useTheme } from '../theme';

/**
 * A screen that fails shows a calm fallback (M7.2; docs/02: never alarming), never a white
 * screen: what happened in one line, that nothing is lost, "Try again", and "Go to Home". The
 * error is handed to `onError` (the crash report). Moving to another screen resets it.
 */
export class AppErrorBoundary extends Component<
  { screen: string; onError: (error: Error, info: ErrorInfo) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidUpdate(previous: { screen: string }): void {
    if (this.state.failed && previous.screen !== this.props.screen)
      this.setState({ failed: false });
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Fallback
        onRetry={() => this.setState({ failed: false })}
        onHome={() => {
          this.setState({ failed: false });
          router.replace('/');
        }}
      />
    );
  }
}

function Fallback({ onRetry, onHome }: { onRetry: () => void; onHome: () => void }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flex: 1,
        justifyContent: 'center',
        gap: theme.space[3],
        padding: theme.space[5],
        backgroundColor: theme.colors.background.primary,
      }}
    >
      <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
        Something went wrong on this screen.
      </Text>
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        Your focus and your forest are safe.
      </Text>
      <Button variant="primary" label="Try again" onPress={onRetry} />
      <Button variant="secondary" label="Go to Home" onPress={onHome} />
    </View>
  );
}
