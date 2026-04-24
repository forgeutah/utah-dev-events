
export const RECORDING_STATUS = {
  Pending: 'pending',
  Approved: 'approved',
} as const;
export type RecordingStatus = typeof RECORDING_STATUS[keyof typeof RECORDING_STATUS];

export interface Event {
  id: string;
  title: string;
  event_date: string;
  start_time?: string;
  location?: string;
  venue_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  link?: string;
  description?: string;
  tags?: string[];
  recording_url?: string | null;
  recording_status?: RecordingStatus | null;
  groups?: {
    name: string;
    status: string;
    tags?: string[];
  } | null;
  group_id?: string;
}

export type UtahRegion = 'Salt Lake County' | 'Utah County' | 'Northern Utah' | 'Southern Utah' | 'Unknown';

export interface LocationFilter {
  regions: UtahRegion[];
  excludeOnline: boolean;
}

export interface Group {
  id: string;
  name: string;
  tags?: string[];
}

export interface EventsSectionProps {
  events: Event[];
  groups: Group[];
  isLoading: boolean;
  error: any;
  allTags: string[];
}
