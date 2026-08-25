import { formatDuration } from '../api/openproject';
import { Coffee } from 'lucide-react';

interface Props {
  idleSeconds: number;
  idleStartedAt: Date;
  onKeep: () => void;
  onDeduct: () => void;
}

export function IdleDialog({ idleSeconds, idleStartedAt, onKeep, onDeduct }: Props) {
  const timeStr = idleStartedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-[360px] shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <Coffee size={22} className="mt-0.5 shrink-0 text-zinc-400" />
          <div>
            <h3 className="text-sm font-bold mb-1">Idle time detected</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No activity for{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular">
                {formatDuration(idleSeconds)}
              </span>{' '}
              since {timeStr}
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Do you want to add this idle time to the task?
        </p>

        <div className="flex gap-2.5">
          <button
            onClick={onDeduct}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            No, remove it
          </button>
          <button
            onClick={onKeep}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors cursor-pointer"
          >
            Yes, keep it
          </button>
        </div>
      </div>
    </div>
  );
}
