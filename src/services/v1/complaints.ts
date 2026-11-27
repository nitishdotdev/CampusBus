import { ApiV1Error, v1Client } from './client';

export const complaintCategories = {
  DRIVER_BEHAVIOR: 'Driver behavior',
  VEHICLE_CONDITION: 'Vehicle condition',
  SCHEDULE_ISSUE: 'Schedule issue',
  CLEANLINESS: 'Cleanliness',
  SAFETY: 'Safety',
  OTHER: 'Other',
};
export const complaintPriorities = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High' };
export const complaintStatuses = { OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed' };

export type ComplaintStatus = keyof typeof complaintStatuses;
export interface ComplaintInput {
  title: string;
  description: string;
  category: keyof typeof complaintCategories;
  priority: keyof typeof complaintPriorities;
}
export interface Complaint extends ComplaintInput {
  id: string;
  studentName: string;
  status: ComplaintStatus;
  adminResponse: string | null;
  createdAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}
type Page = { items: Complaint[]; total: number; page: number; pageSize: number };

export const complaintsV1 = {
  async list(): Promise<Complaint[]> {
    const getPage = (page: number) => v1Client.get<Page>(`/api/v1/complaints?page=${page}&pageSize=100`);
    const first = await getPage(1);
    const records = new Map(first.items.map(item => [item.id, item]));
    for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
      for (const item of (await getPage(page)).items) records.set(item.id, item);
    }
    return [...records.values()];
  },
  submit: (body: ComplaintInput) => v1Client.post<Complaint>('/api/v1/complaints', body),
  update: (id: string, body: { status?: ComplaintStatus; adminResponse?: string }) =>
    v1Client.patch<Complaint>(`/api/v1/complaints/${id}`, body),
};

export function complaintError(error: unknown, fallback: string): string {
  if (error instanceof ApiV1Error && error.code === 'INVALID_COMPLAINT_TRANSITION') {
    return 'This complaint changed while you were reviewing it. Refresh the list and try again.';
  }
  return fallback;
}
