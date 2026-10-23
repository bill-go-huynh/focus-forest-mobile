import { useState } from 'react';

import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { BadgeUnlock } from './BadgeUnlock';
import type { UnlockMoment } from './unlocks';

const keyOf = (moment: UnlockMoment) =>
  `${moment.featured?.id ?? ''}|${moment.caption}|${moment.line ?? ''}`;

/**
 * What an action just unlocked, in a modal the person closes (owner, 2026-10-23): the badge's
 * reveal (docs/04 → Badge unlock) with its words, then Done. It comes only after the moment that
 * earned it, as before; closed once, the same moment does not open again.
 */
export function UnlockModal({ moment }: { moment: UnlockMoment | null }) {
  const [closed, setClosed] = useState<string | null>(null);
  if (!moment) return null;
  const key = keyOf(moment);
  const close = () => setClosed(key);
  return (
    <Modal visible={closed !== key} title="Unlocked" onRequestClose={close}>
      <BadgeUnlock moment={moment} reveal />
      <Button variant="primary" label="Done" onPress={close} />
    </Modal>
  );
}
