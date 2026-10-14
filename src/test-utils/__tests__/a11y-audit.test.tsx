import { render } from '@testing-library/react-native';
import { Pressable, Text, TextInput, View } from 'react-native';

import { accessibilityProblems } from '../a11y-audit';

/** M7.3 The audit itself: it finds what the checklist forbids, and accepts what it allows. */
describe('accessibilityProblems (M7.3)', () => {
  it('accepts a screen with a heading, named controls, and labelled fields', () => {
    const view = render(
      <View>
        <Text accessibilityRole="header">Settings</Text>
        <Pressable accessibilityRole="button" onPress={() => undefined}>
          <Text>Save</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => undefined}
        />
        <TextInput accessibilityLabel="Name" />
        <View accessibilityElementsHidden>
          <Pressable onPress={() => undefined} />
        </View>
      </View>,
    );
    expect(accessibilityProblems(view.toJSON())).toEqual([]);
  });

  it('names what is missing', () => {
    const view = render(
      <View>
        <Pressable onPress={() => undefined}>
          <Text>Go</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => undefined} />
        <TextInput placeholder="Search" />
      </View>,
    );
    expect(accessibilityProblems(view.toJSON())).toEqual([
      'A control without a role: "Go"',
      'A button without a name',
      'A text field without a label (placeholder "Search")',
      'No heading on the screen',
    ]);
  });
});
