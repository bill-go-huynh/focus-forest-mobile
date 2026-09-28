import { TOPIC_COLORS, type Topic } from '../api/topics';

/** A topic exactly as the API sends it (A2.2 and A2.8): every topic operation answers this shape. */
export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
    name: 'Reading',
    icon: 'book',
    color: TOPIC_COLORS[0],
    description: 'Novels',
    status: 'active',
    archivedAt: null,
    createdAt: '2026-09-27T09:00:00.000Z',
    updatedAt: '2026-09-27T09:00:00.000Z',
    lastUsedAt: '2026-09-27T10:00:00.000Z',
    lastPlannedMinutes: 45,
    ...overrides,
  };
}
