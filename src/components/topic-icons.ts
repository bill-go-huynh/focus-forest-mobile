/**
 * The curated topic icon set (ART.3; docs/01 §5: rounded line icons, medium stroke, soft
 * terminals, simple geometry; nature motifs welcome; users pick from the set). Drawn on a
 * 24-unit grid as stroked paths; `TopicMark` paints them in the topic's color. Identifiers are
 * content ids the API stores as sent, so they never change once shipped (docs/07 §5).
 */

export interface TopicIcon {
  /** The content identifier the API stores. */
  id: string;
  /** What the icon shows, for the picker and its screen reader labels. */
  label: string;
  /** Stroked, never filled. */
  paths: readonly string[];
}

/** A circle as a path, so every icon is paths only. */
const c = (x: number, y: number, r: number) =>
  `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;

const icon = (id: string, label: string, ...paths: string[]): TopicIcon => ({ id, label, paths });

export const DEFAULT_TOPIC_ICON = icon(
  'topic.default',
  'Seed',
  'M12 4.5 C16.5 7.5 17 14 12 19.5 C7 14 7.5 7.5 12 4.5 Z',
  'M10.5 9.5 C11 8.5 12.5 8.3 13.4 9.2',
);

export const TOPIC_ICONS: readonly TopicIcon[] = [
  DEFAULT_TOPIC_ICON,
  // Study and work
  icon(
    'book',
    'Book',
    'M12 6.5 C10 5 7 4.5 3.5 5 V18.5 C7 18 10 18.5 12 20 C14 18.5 17 18 20.5 18.5 V5 C17 4.5 14 5 12 6.5 Z',
    'M12 6.5 V20',
  ),
  icon(
    'notebook',
    'Notebook',
    'M6.5 3.5 H18.5 V20.5 H6.5 Z',
    'M10 3.5 V20.5',
    'M4.5 8 H8',
    'M4.5 12 H8',
    'M4.5 16 H8',
  ),
  icon('pen', 'Pen', 'M15.5 4.5 L19.5 8.5 L9 19 L4.5 19.5 L5 15 Z', 'M13.5 6.5 L17.5 10.5'),
  icon(
    'school',
    'Graduation cap',
    'M2.5 9.5 L12 5 L21.5 9.5 L12 14 Z',
    'M6.5 11.5 V16 C8 17.5 10 18.2 12 18.2 C14 18.2 16 17.5 17.5 16 V11.5',
    'M21.5 9.5 V14.5',
  ),
  icon(
    'exam',
    'Clipboard',
    'M8 5 H6 V20.5 H18 V5 H16',
    'M9 3.5 H15 V6.5 H9 Z',
    'M9 12.5 L11 14.5 L15 10.5',
  ),
  icon('research', 'Magnifier', c(10.5, 10.5, 6), 'M15 15 L20 20'),
  icon('math', 'Sigma', 'M17 5 H7 L12.5 12 L7 19 H17'),
  icon(
    'science',
    'Flask',
    'M9.5 3.5 H14.5',
    'M10.5 3.5 V9 L5 18.5 C4.5 19.5 5 20.5 6.2 20.5 H17.8 C19 20.5 19.5 19.5 19 18.5 L13.5 9 V3.5',
    'M7.5 15 H16.5',
  ),
  icon('code', 'Code', 'M8.5 7 L3.5 12 L8.5 17', 'M15.5 7 L20.5 12 L15.5 17', 'M13.5 5 L10.5 19'),
  icon('laptop', 'Laptop', 'M5.5 6 H18.5 V15 H5.5 Z', 'M3 18.5 H21'),
  icon('briefcase', 'Briefcase', 'M3.5 8 H20.5 V19 H3.5 Z', 'M9 8 V5.5 H15 V8', 'M3.5 13 H20.5'),
  icon('chart', 'Chart', 'M4 4 V20 H20', 'M7.5 15 L11 11 L14 13.5 L19 7.5'),
  icon('calendar', 'Calendar', 'M4 6.5 H20 V19.5 H4 Z', 'M4 10.5 H20', 'M8.5 4 V8', 'M15.5 4 V8'),
  icon('clock', 'Clock', c(12, 12, 8.5), 'M12 7.5 V12 L15 14'),
  icon('mail', 'Envelope', 'M3.5 6.5 H20.5 V17.5 H3.5 Z', 'M3.5 7 L12 13 L20.5 7'),
  icon(
    'finance',
    'Coin',
    c(12, 12, 8.5),
    'M14.5 9 C14 8 13 7.5 12 7.5 C10.5 7.5 9.5 8.3 9.5 9.5 C9.5 12.5 14.5 11.2 14.5 14.3 C14.5 15.5 13.5 16.5 12 16.5 C10.8 16.5 9.8 15.9 9.3 15',
    'M12 5.8 V7.5',
    'M12 16.5 V18.2',
  ),
  icon(
    'idea',
    'Light bulb',
    'M12 3.5 C8.7 3.5 6.5 6 6.5 9 C6.5 11.3 7.8 12.6 9 13.7 V16 H15 V13.7 C16.2 12.6 17.5 11.3 17.5 9 C17.5 6 15.3 3.5 12 3.5 Z',
    'M9.5 19 H14.5',
    'M10.5 21 H13.5',
  ),
  // Languages and people
  icon(
    'globe',
    'Globe',
    c(12, 12, 8.5),
    'M3.5 12 H20.5',
    'M12 3.5 C9 6 9 18 12 20.5',
    'M12 3.5 C15 6 15 18 12 20.5',
  ),
  icon(
    'language',
    'Speech bubbles',
    'M4 5 H14 V12 H9 L6 14.5 V12 H4 Z',
    'M10 15 V17 H15 L18 19.5 V17 H20 V9 H17',
  ),
  icon('chat', 'Speech bubble', 'M4 5.5 H20 V15.5 H11 L7 19 V15.5 H4 Z'),
  icon(
    'people',
    'Two people',
    c(9, 8.5, 3),
    'M3.5 19 C3.5 15.8 6 14 9 14 C12 14 14.5 15.8 14.5 19',
    'M15.5 5.6 C17.2 5.9 18.3 7.2 18.3 8.7 C18.3 10.3 17.1 11.5 15.5 11.7',
    'M17 14.3 C19 14.8 20.5 16.5 20.5 19',
  ),
  // Arts and making
  icon(
    'palette',
    'Palette',
    'M12 3.5 C7 3.5 3.5 7 3.5 11.5 C3.5 16 7 19.5 11 19.5 C12.5 19.5 13 18.5 12.5 17.5 C12 16.3 12.8 15 14.3 15 H16.5 C18.8 15 20.5 13.3 20.5 11 C20.5 7 16.8 3.5 12 3.5 Z',
    c(8, 10, 1.2),
    c(12, 7.5, 1.2),
    c(16, 10, 1.2),
  ),
  icon(
    'brush',
    'Brush',
    'M19.5 4.5 L11.5 12.5',
    'M11.5 12.5 C9 12 7 13.5 7 16 C7 17.5 6 18.5 4.5 19.5 C9 20.5 12.5 18 11.5 12.5 Z',
  ),
  icon('camera', 'Camera', 'M4 8 H8 L9.5 5.5 H14.5 L16 8 H20 V18.5 H4 Z', c(12, 13, 3.5)),
  icon(
    'film',
    'Film',
    'M4 5.5 H20 V18.5 H4 Z',
    'M8 5.5 V18.5',
    'M16 5.5 V18.5',
    'M4 12 H8',
    'M16 12 H20',
  ),
  icon('music-note', 'Music note', 'M9 18 V6 L19 4 V16', c(6.5, 18, 2.5), c(16.5, 16, 2.5)),
  icon(
    'headphones',
    'Headphones',
    'M4.5 16 V12.5 C4.5 8 7.8 4.5 12 4.5 C16.2 4.5 19.5 8 19.5 12.5 V16',
    'M4.5 14 H7.5 V19.5 H4.5 Z',
    'M16.5 14 H19.5 V19.5 H16.5 Z',
  ),
  icon(
    'mic',
    'Microphone',
    'M12 3.5 C13.7 3.5 15 4.8 15 6.5 V11.5 C15 13.2 13.7 14.5 12 14.5 C10.3 14.5 9 13.2 9 11.5 V6.5 C9 4.8 10.3 3.5 12 3.5 Z',
    'M6 11 C6 14.5 8.7 17.5 12 17.5 C15.3 17.5 18 14.5 18 11',
    'M12 17.5 V20.5',
  ),
  icon('hammer', 'Hammer', 'M14 4.5 L19.5 10 L17.5 12 L12 6.5 Z', 'M14.5 9.5 L5 19'),
  icon(
    'wrench',
    'Wrench',
    'M14.5 3.8 C12.4 4.6 11.3 6.9 12 9.1 L4.5 16.6 C3.8 17.3 3.8 18.5 4.5 19.2 C5.2 19.9 6.4 19.9 7.1 19.2 L14.6 11.7 C16.8 12.4 19.1 11.3 19.9 9.2 L17.2 9.9 L14.6 9.1 L13.8 6.5 Z',
  ),
  icon(
    'puzzle',
    'Puzzle piece',
    'M4.5 8 H9 C9 6.5 9.8 5.5 11 5.5 C12.2 5.5 13 6.5 13 8 H17 V12 C18.5 12 19.5 12.8 19.5 14 C19.5 15.2 18.5 16 17 16 V19.5 H4.5 Z',
  ),
  icon(
    'chess',
    'Chess knight',
    'M7 19.5 H17',
    'M8 19.5 C8 16 9 14 11 12.5 L8 11 L9.5 6.5 L12 4.5 C15.5 5 17.5 8 17.5 12 V19.5',
  ),
  icon(
    'game',
    'Game controller',
    'M7 8 H17 C19.2 8 20.5 9.8 20.5 12.5 C20.5 15.5 19.5 17.5 17.8 17.5 C16.3 17.5 15.5 15.5 14 15.5 H10 C8.5 15.5 7.7 17.5 6.2 17.5 C4.5 17.5 3.5 15.5 3.5 12.5 C3.5 9.8 4.8 8 7 8 Z',
    'M8 10.5 V13.5',
    'M6.5 12 H9.5',
    c(15.5, 11, 0.6),
    c(17, 13, 0.6),
  ),
  // Body and mind
  icon(
    'run',
    'Running shoe',
    'M3.5 16 C3.5 14 4.5 11 6 9.5 L9.5 11.5 L11.5 9.5 C14 12.5 17 13.5 20.5 14 V17.5 H3.5 Z',
    'M3.5 19.5 H20.5',
  ),
  icon(
    'strength',
    'Dumbbell',
    'M3 12 H21',
    'M6 8 V16',
    'M9 6.5 V17.5',
    'M15 6.5 V17.5',
    'M18 8 V16',
  ),
  icon(
    'bike',
    'Bicycle',
    c(6.5, 16, 3.5),
    c(17.5, 16, 3.5),
    'M6.5 16 L10 9 H15 L17.5 16',
    'M10 9 L12.5 16 L15 9',
    'M8.5 6.5 H11',
  ),
  icon(
    'swim',
    'Waves',
    'M3 9 C5 7 7 7 9 9 C11 11 13 11 15 9 C17 7 19 7 21 9',
    'M3 15 C5 13 7 13 9 15 C11 17 13 17 15 15 C17 13 19 13 21 15',
  ),
  icon(
    'lotus',
    'Lotus',
    'M12 19 C9 16.5 8.5 11.5 12 7 C15.5 11.5 15 16.5 12 19 Z',
    'M12 19 C8 19 4.5 16.5 3.5 12.5 C6.5 12.5 9 13.5 10.5 15.5',
    'M12 19 C16 19 19.5 16.5 20.5 12.5 C17.5 12.5 15 13.5 13.5 15.5',
  ),
  icon(
    'heart',
    'Heart',
    'M12 19.5 C6 15.5 3.5 12.5 3.5 9.2 C3.5 6.6 5.5 4.8 7.9 4.8 C9.6 4.8 11.1 5.8 12 7.3 C12.9 5.8 14.4 4.8 16.1 4.8 C18.5 4.8 20.5 6.6 20.5 9.2 C20.5 12.5 18 15.5 12 19.5 Z',
  ),
  // Home life
  icon(
    'home',
    'House',
    'M4 11 L12 4.5 L20 11',
    'M6 9.5 V19.5 H18 V9.5',
    'M10 19.5 V14.5 H14 V19.5',
  ),
  icon(
    'cook',
    'Pot',
    'M4.5 10 H19.5 V15.5 C19.5 18 17.5 19.5 15 19.5 H9 C6.5 19.5 4.5 18 4.5 15.5 Z',
    'M2.5 10 H4.5',
    'M19.5 10 H21.5',
    'M9 7 C9 5.5 10 5.5 10 4',
    'M14 7 C14 5.5 15 5.5 15 4',
  ),
  icon(
    'coffee',
    'Cup',
    'M5 9 H16 V14 C16 17 13.8 19 11 19 H10 C7.2 19 5 17 5 14 Z',
    'M16 10.5 H17.5 C19 10.5 19.5 11.5 19.5 12.5 C19.5 13.8 18.5 14.5 17.2 14.5 H16',
    'M9 4 C9 5 10 5.5 10 6.5',
    'M12.5 4 C12.5 5 13.5 5.5 13.5 6.5',
  ),
  // Nature
  icon('leaf', 'Leaf', 'M5 19 C5 10 10 5 19 5 C19 14 14 19 5 19 Z', 'M5 19 L13 11'),
  icon(
    'sprout',
    'Sprout',
    'M12 21 V11',
    'M12 13 C8 13 5.5 10.5 5.5 7 C9 7 12 9 12 13 Z',
    'M12 11 C15.5 11 18.5 8.5 18.5 5 C15 5 12 7 12 11 Z',
  ),
  icon(
    'sun',
    'Sun',
    c(12, 12, 4),
    'M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6',
  ),
  icon('moon', 'Moon', 'M19.5 14.5 A7.5 7.5 0 1 1 9.5 4.5 A6 6 0 0 0 19.5 14.5 Z'),
  icon(
    'star',
    'Star',
    'M12 3.8 L14.4 9 L20 9.6 L15.8 13.3 L17 18.9 L12 16 L7 18.9 L8.2 13.3 L4 9.6 L9.6 9 Z',
  ),
  icon('mountain', 'Mountain', 'M3 19.5 L9.5 8 L13 14 L15.5 10.5 L21 19.5 Z'),
  icon('travel', 'Paper plane', 'M21 4 L3.5 11 L10 13.5 L12.5 20 Z', 'M10 13.5 L21 4'),
];

const BY_ID = new Map(TOPIC_ICONS.map((entry) => [entry.id, entry]));

/** The icon for an identifier, or the default for one this app does not know. */
export function topicIcon(id: string): TopicIcon {
  return BY_ID.get(id) ?? DEFAULT_TOPIC_ICON;
}
