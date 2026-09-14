export interface Board {
  id: number;
  name: string;
  order: number;
  default_check_in_time: string;
  default_check_out_time: string;
  created_at: string;
}

export interface Unit {
  id: number;
  board: number;
  name: string;
  category: string;
  capacity: number | null;
  order: number;
}

export type DocumentType = 'passport' | 'id_card' | 'drivers_license' | '';

export interface Guest {
  id?: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;

  date_of_birth: string | null;
  birth_country: string;
  birth_city: string;

  residence_street: string;
  residence_building: string;
  residence_city: string;
  residence_postal_code: string;
  residence_country: string;

  document_type: DocumentType;
  document_number: string;
  document_country: string;
  visa_number: string;
}

export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out';

export interface LinkedReservation {
  id: number;
  board: number;
  board_name: string;
  unit: number | null;
  unit_name: string | null;
  date_from: string;
  date_to: string;
  lead_guest_name: string;
  status: ReservationStatus;
}

export interface Reservation {
  id: number;
  board: number;
  unit: number | null;
  status: ReservationStatus;
  guests: Guest[];
  lead_guest_name: string;
  date_from: string;
  date_to: string;
  check_in_time: string | null;
  check_out_time: string | null;
  ref_number: string;
  agency: string;
  notes_general: string;
  notes_reception: string;
  notes_kitchen: string;
  notes_housekeeping: string;
  notes_system: string;
  notes_parking: string;
  requested_category: string;
  linked_reservations: LinkedReservation[];
  created_at: string;
}

export type NotesCategory =
  | 'notes_reception'
  | 'notes_kitchen'
  | 'notes_housekeeping'
  | 'notes_system'
  | 'notes_parking';

export type ReservationInput = Omit<
  Reservation,
  'id' | 'created_at' | 'lead_guest_name' | 'linked_reservations'
>;

export type FieldErrors = Record<string, unknown>;
