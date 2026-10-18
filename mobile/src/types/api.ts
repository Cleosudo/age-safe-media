/** Response types mirroring the FastAPI schemas in backend/app/schemas.py. */

export type MediaType = 'book' | 'video';
export type DisplayMode = 'summary' | 'title';
export type SortMode = 'relevance' | 'newest' | 'oldest';
export type FeedbackRating = 'up' | 'down';
export type ReportRange = 'daily' | 'weekly' | 'monthly';

export interface Parent {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  last_seen_at: string;
}

export interface OutputPreferences {
  max_recommendations: number;
  display_mode: DisplayMode;
  sort: SortMode;
  show_explanations: boolean;
}

export interface Child {
  id: string;
  parent_id: string;
  name: string;
  age: number;
  avatar: string;
  age_band: string;
  blocked_categories: string[];
  age_band_depth: 1 | 2 | 3;
  preferences: OutputPreferences;
  created_at: string;
  updated_at: string;
}

export interface ExternalLinks {
  nlb?: string;
  open_library?: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  type: MediaType;
  category: string;
  age_min: number;
  age_max: number;
  age_range: string;
  summary: string;
  tags: string[];
  year: number;
  publisher: string;
  language: string;
  sensitivity: string[];
  popularity: number;
  cover_emoji: string;
  external_links: ExternalLinks;
}

export interface Recommendation extends CatalogItem {
  score: number;
  matched_tags: string[];
  match_type: 'topic' | 'discovery';
  explanation: string;
  is_favourite: boolean;
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
  recommendations: Recommendation[];
  topics: string[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  age_window: [number, number];
  safety: { blocked: boolean; reason: string | null };
  preferences_applied: OutputPreferences;
  favourite_ids: string[];
  feedback: Record<string, FeedbackRating>;
  suggested_replies: string[];
  timing_ms: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  recommendations?: Recommendation[];
  suggestions?: string[];
  blocked?: boolean;
}

export interface AccountMeta {
  app_name: string;
  dev_auth: boolean;
  firebase_configured: boolean;
  active_model: string | null;
  sensitivity_categories: string[];
  max_recommendations: number;
  default_recommendations: number;
  suggested_replies: string[];
}

export interface AccountPayload {
  parent: Parent;
  children: Child[];
  children_count: number;
  meta: AccountMeta;
}

export interface Favourite {
  id: string;
  item_id: string;
  child_id: string;
  created_at: string;
  item: CatalogItem;
}

export interface FavouritesResponse {
  favourites: Favourite[];
  count: number;
}

export interface FavouriteMutation {
  favourite?: { id: string; item_id: string; child_id: string; created_at: string };
  favourite_ids: string[];
  removed?: boolean;
}

export interface FeedbackMutation {
  feedback: { id: string; item_id: string; rating: FeedbackRating; reason: string; created_at: string };
  feedback_map: Record<string, FeedbackRating>;
}

export interface ReportBucket {
  key: string;
  label: string;
  searches: number;
  recommendations: number;
  favourites: number;
  searches_pct?: number;
}

export interface TopicCount {
  topic: string;
  count: number;
  kind: 'searched' | 'recommended';
}

export interface ReportTotals {
  searches: number;
  recommendations: number;
  favourites: number;
  positive_feedback: number;
  negative_feedback: number;
  active_days: number;
}

export interface Report {
  child_id: string;
  range: ReportRange;
  range_title: string;
  totals: ReportTotals;
  series: ReportBucket[];
  topics: TopicCount[];
  generated_at: string;
}

export interface ChildMetaOption {
  value?: number;
  id?: string;
  label: string;
  description?: string;
}

export interface ChildMeta {
  age_bands: { id: string; label: string; min: number; max: number }[];
  sensitivity_categories: { id: string; label: string; emoji: string; description: string }[];
  avatars: string[];
  depth_options: { value: 1 | 2 | 3; label: string; description: string }[];
}

export interface StoredRecommendationMeta {
  id: string;
  explanation?: string;
  matched_tags?: string[];
  match_type?: 'topic' | 'discovery';
}

export interface ChatMessageMeta {
  recommendations?: StoredRecommendationMeta[];
  recommendation_ids?: string[];
  topics?: string[];
  blocked?: boolean;
}

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta: ChatMessageMeta;
  created_at: string;
}

export interface ChatHistoryResponse {
  conversation_id: string | null;
  messages: HistoryMessage[];
}

export interface SuggestionsResponse {
  suggested_replies: string[];
  topics: string[];
}

export interface ServerConfig {
  app_name: string;
  max_recommendations: number;
  default_recommendations: number;
  dev_auth: boolean;
  firebase_configured: boolean;
}

export interface ChildInput {
  name: string;
  age: number;
  avatar?: string;
  blocked_categories?: string[];
  age_band_depth?: 1 | 2 | 3;
  preferences?: Partial<OutputPreferences>;
}
