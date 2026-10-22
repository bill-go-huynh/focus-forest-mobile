// @ts-expect-error React Native ships this parser without types.
import processTransformOrigin from 'react-native/Libraries/StyleSheet/processTransformOrigin';

import { pivotOrigin } from '../TreeArt';

describe('the tree sway pivot', () => {
  it('stays valid when the pivot is not a whole percent (Collection Book crash)', () => {
    // 110 / 240 = 45.8333…%: the string form split this into "45" and "8333…%".
    const origin = pivotOrigin({ x: 110, y: 200 }, 240, 240);
    expect(() => processTransformOrigin(origin)).not.toThrow();
    expect(processTransformOrigin(origin)).toEqual([
      `${(110 / 240) * 100}%`,
      `${(200 / 240) * 100}%`,
      0,
    ]);
  });
});
