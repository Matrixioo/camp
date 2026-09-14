import type { Board, FieldErrors, Reservation, ReservationInput, Unit } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, errors: FieldErrors) {
    super('API request failed');
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body as FieldErrors);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function fetchBoards(): Promise<Board[]> {
  return request<Board[]>('/boards/');
}

export function createBoard(name: string): Promise<Board> {
  return request<Board>('/boards/', { method: 'POST', body: JSON.stringify({ name }) });
}

export function deleteBoard(id: number): Promise<void> {
  return request<void>(`/boards/${id}/`, { method: 'DELETE' });
}

export function updateBoard(id: number, payload: Partial<Omit<Board, 'id' | 'created_at'>>): Promise<Board> {
  return request<Board>(`/boards/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function reorderBoards(order: number[]): Promise<Board[]> {
  return request<Board[]>('/boards/reorder/', { method: 'POST', body: JSON.stringify({ order }) });
}

export function fetchUnits(boardId: number): Promise<Unit[]> {
  return request<Unit[]>(`/units/?board=${boardId}`);
}

export function createUnit(unit: Omit<Unit, 'id'>): Promise<Unit> {
  return request<Unit>('/units/', { method: 'POST', body: JSON.stringify(unit) });
}

export function updateUnit(id: number, payload: Partial<Omit<Unit, 'id'>>): Promise<Unit> {
  return request<Unit>(`/units/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function reorderUnits(boardId: number, order: number[]): Promise<Unit[]> {
  return request<Unit[]>('/units/reorder/', { method: 'POST', body: JSON.stringify({ board: boardId, order }) });
}

export function deleteUnit(id: number): Promise<void> {
  return request<void>(`/units/${id}/`, { method: 'DELETE' });
}

export function fetchReservations(boardId: number, from: string, to: string): Promise<Reservation[]> {
  return request<Reservation[]>(`/reservations/?board=${boardId}&from=${from}&to=${to}`);
}

export function fetchUnassigned(boardId: number): Promise<Reservation[]> {
  return request<Reservation[]>(`/reservations/?board=${boardId}&unassigned=1`);
}

export function searchReservations(boardId: number, query: string): Promise<Reservation[]> {
  return request<Reservation[]>(`/reservations/?board=${boardId}&search=${encodeURIComponent(query)}`);
}

export function createReservation(payload: ReservationInput): Promise<Reservation> {
  return request<Reservation>('/reservations/', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateReservation(id: number, payload: Partial<ReservationInput>): Promise<Reservation> {
  return request<Reservation>(`/reservations/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteReservation(id: number): Promise<void> {
  return request<void>(`/reservations/${id}/`, { method: 'DELETE' });
}

export function linkReservationToBoard(id: number, boardId: number, unitId: number | null): Promise<Reservation> {
  return request<Reservation>(`/reservations/${id}/link_board/`, {
    method: 'POST',
    body: JSON.stringify({ board: boardId, unit: unitId }),
  });
}

export function unlinkReservation(id: number, linkedReservationId: number): Promise<Reservation> {
  return request<Reservation>(`/reservations/${id}/unlink/`, {
    method: 'POST',
    body: JSON.stringify({ reservation_id: linkedReservationId }),
  });
}
