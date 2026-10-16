import type { Paper } from './schemas';
import type { RecordData } from './store';
export type RunnerView = {
  status: 'loading' | 'active' | 'finalizing' | 'pending' | 'submitted' | 'recovery' | 'blocked';
  row: RecordData | null;
  paper: Paper | null;
  message: string;
  seconds: number;
  saving: boolean;
  uploading: boolean;
};
export const initialView: RunnerView = {
  status: 'loading',
  row: null,
  paper: null,
  message: '',
  seconds: 0,
  saving: false,
  uploading: false,
};
export type RunnerEvent = { type: 'patch'; value: Partial<RunnerView> } | { type: 'freeze' };
export function runnerReducer(state: RunnerView, event: RunnerEvent): RunnerView {
  if (event.type === 'freeze')
    return { ...state, status: 'finalizing', message: 'Freezing your final answers…' };
  const next = { ...state, ...event.value };
  if (next.status === 'active' && next.row?.final) return { ...next, status: 'pending' };
  return next;
}
