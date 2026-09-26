import { Animated } from 'react-native';

type TimingConfig = Animated.TimingAnimationConfig;
type EndCallback = Animated.EndCallback;

/**
 * Replaces Animated.timing with animations the test finishes by hand, so it can check
 * what happens during and after a transition. `finishAll()` completes every pending one.
 */
export function mockControlledTiming() {
  const pending: { value: Animated.Value; config: TimingConfig; callback?: EndCallback }[] = [];
  const spy = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: (callback?: EndCallback) => {
      pending.push({ value: value as Animated.Value, config, callback });
    },
    stop: () => undefined,
    reset: () => undefined,
  }));
  return {
    spy,
    finishAll() {
      for (const animation of pending.splice(0)) {
        animation.value.setValue(animation.config.toValue as number);
        animation.callback?.({ finished: true });
      }
    },
  };
}
