export interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  description: string;
  cover_emoji: string;
  share_code: string;
  created_at: string;
}

export interface Member {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Activity {
  id: string;
  trip_id: string;
  date: string;
  time: string;
  title: string;
  location: string;
  notes: string;
  category: 'food' | 'sightseeing' | 'accommodation' | 'transport' | 'other';
  assigned_to: string[];
  created_at: string;
}

export interface ResearchItem {
  id: string;
  trip_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigned_to: string;
  url: string;
  place_category: 'sightseeing' | 'restaurant' | 'shopping';
  created_at: string;
}

export interface ChatMessage {
  id: string;
  trip_id: string;
  member_name: string;
  member_color: string;
  message: string;
  created_at: string;
}

export const CATEGORY_CONFIG = {
  food: { label: '식사', icon: '🍽️', color: 'bg-orange-100 text-orange-700' },
  sightseeing: { label: '관광', icon: '🎡', color: 'bg-blue-100 text-blue-700' },
  accommodation: { label: '숙박', icon: '🏨', color: 'bg-purple-100 text-purple-700' },
  transport: { label: '이동', icon: '🚌', color: 'bg-green-100 text-green-700' },
  other: { label: '기타', icon: '📌', color: 'bg-gray-100 text-gray-700' },
} as const;

export const MEMBER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export const COVER_EMOJIS = ['✈️', '🏖️', '🏔️', '🗼', '🏕️', '🌏', '🚢', '🎡', '🌸', '🍜'];
