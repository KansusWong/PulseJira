export interface SignalSource {
  id: string;
  platform: string;
  identifier: string;
  label: string;
  keywords: string[];
  interval_minutes: number;
  active: boolean;
  last_fetched_at: string | null;
  created_at: string;
  config?: Record<string, unknown> | null;
}

export interface CollectedSignalItem {
  externalId?: string;
  url: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface PreferenceSourceSeed {
  idSuffix: string;
  identifier: string;
  label: string;
  keywords: string[];
  intervalMinutes?: number;
}

