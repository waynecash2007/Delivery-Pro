
export interface DeliveryPoint {
  id: string;
  address: string;
  status: 'pending' | 'completed' | 'current';
  order: number;
  lat?: number;
  lng?: number;
  distanceToPrev?: string;
  notes?: string;
  photoUrl?: string;
}

export interface StagedPhoto {
  id: string;
  data: string;
  address: string;
  status: 'processing' | 'done' | 'error';
}

export interface AddressExtractionResult {
  addresses: string[];
}
