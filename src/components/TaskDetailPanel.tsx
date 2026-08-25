import { useState, useEffect } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
	getTimeEntries,
	getAllowedStatuses,
	updateWorkPackage,
	parseISODuration,
	idFromHref,
} from '../api/openproject'
import type { Settings, WorkPackage, TimeEntry, Status } from '../types/openproject'
import { Play, Square, X } from 'lucide-react'

interface Props {
	wp: WorkPackage
	settings: Settings
	allStatuses: Status[]
	runningWpId: number | null
	onStartTimer: (wp: WorkPackage) => void
	onStopTimer: () => void
	onClose: () => void
	onUpdated: (wp: WorkPackage) => void
}

export function TaskDetailPanel({
	wp,
	settings,
	allStatuses,
	runningWpId,
	onStartTimer,
	onStopTimer,
	onClose,
	onUpdated,
}: Props) {
	const [entries, setEntries] = useState<TimeEntry[]>([])
	const [loadingEntries, setLoadingEntries] = useState(true)
	const [entriesError, setEntriesError] = useState('')

	const [allowedStatuses, setAllowedStatuses] = useState<Status[]>([])
	const [loadingStatuses, setLoadingStatuses] = useState(true)
	const [updatingStatus, setUpdatingStatus] = useState(false)
	const [statusError, setStatusError] = useState('')

	const isTracking = runningWpId === wp.id
	const spent = parseISODuration(wp.spentTime)
	const currentStatusId = idFromHref(wp._links.status?.href ?? '')
	const currentStatus = allStatuses.find((s) => s.id === currentStatusId)

	// Load allowed statuses and time entries in parallel
	useEffect(() => {
		setLoadingStatuses(true)
		setLoadingEntries(true)
		setEntriesError('')
		setStatusError('')

		getAllowedStatuses(settings, wp.id, wp.lockVersion).then((statuses) => {
			// If form returned nothing (old OP version), fall back to all statuses
			setAllowedStatuses(statuses.length > 0 ? statuses : allStatuses)
			setLoadingStatuses(false)
		})

		getTimeEntries(settings, wp.id)
			.then((r) => {
				const all = r._embedded.elements
				// client-side filter covers fallback mode (API returned all entries)
				setEntries(all.filter((e) => (e._links.workPackage?.href ?? '').endsWith(`/${wp.id}`)))
			})
			.catch((e) => setEntriesError(String(e)))
			.finally(() => setLoadingEntries(false))
	}, [wp.id, wp.lockVersion, settings.url, settings.apiKey])

	const handleStatusChange = async (statusId: string) => {
		setUpdatingStatus(true)
		setStatusError('')
		try {
			const updated = await updateWorkPackage(
				settings,
				wp.id,
				wp.lockVersion,
				`/api/v3/statuses/${statusId}`,
			)
			onUpdated(updated)
		} catch (e) {
			setStatusError(String(e))
		} finally {
			setUpdatingStatus(false)
		}
	}

	// Group entries by date desc
	const byDate = entries.reduce<Record<string, TimeEntry[]>>((acc, e) => {
		;(acc[e.spentOn] ??= []).push(e)
		return acc
	}, {})
	const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

	const totalHours =
		entries.length > 0
			? entries.reduce((sum, e) => sum + parseISODuration(e.hours).hours, 0)
			: spent.hours
	const totalDisplay = fmtHours(totalHours)

	const typeTitle = wp._links.type?.title ?? ''
	const projectTitle = wp._links.project?.title ?? ''
	const priorityTitle = wp._links.priority?.title ?? ''
	const assigneeTitle = wp._links.assignee?.title ?? ''

	return (
		<div className="surface flex flex-col h-full border-l w-[400px] min-w-[360px]">
			{/* Header */}
			<div className="divider flex items-center justify-between px-4 py-3.5 border-b gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<span className="brand-chip text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0">
						{typeTitle}
					</span>
					<span className="text-subtle text-xs tabular flex-shrink-0">#{wp.id}</span>
					<button
						onClick={() => openUrl(`${settings.url}/work_packages/${wp.id}`)}
						title="Open in OpenProject"
						className="text-subtle hover:text-[var(--brand)] transition-colors cursor-pointer flex-shrink-0"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</button>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{isTracking ? (
						<button
							onClick={onStopTimer}
							className="btn-danger px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
						>
							<Square size={14} /> Stop
						</button>
					) : (
						<button
							onClick={() => onStartTimer(wp)}
							className="btn-primary px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
						>
							<Play size={14} /> Track
						</button>
					)}
					<button
						onClick={onClose}
						className="text-subtle nav-idle w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer"
					>
						<X size={16} />
					</button>
				</div>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
				<h3 className="text-main text-base font-semibold leading-snug">{wp.subject}</h3>

				{/* Meta */}
				<div className="grid grid-cols-2 gap-x-4 gap-y-3">
					<MetaRow label="Project" value={projectTitle} />
					<MetaRow label="Priority" value={priorityTitle} />
					{assigneeTitle && <MetaRow label="Assignee" value={assigneeTitle} />}
					{wp.percentageDone > 0 && <MetaRow label="Progress" value={`${wp.percentageDone}%`} />}

					{/* Status select */}
					<div className="col-span-2">
						<div className="text-subtle text-[10px] font-semibold uppercase tracking-wide mb-1.5">
							Status
						</div>
						{loadingStatuses ? (
							<span className="text-subtle text-sm">Loading…</span>
						) : (
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-2">
									{currentStatus && (
										<StatusDot color={currentStatus.color} isClosed={currentStatus.isClosed} />
									)}
									<select
										className="input-field flex-1 border rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors cursor-pointer disabled:opacity-50"
										value={currentStatusId}
										onChange={(e) => handleStatusChange(e.target.value)}
										disabled={updatingStatus}
									>
										{allowedStatuses.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
									</select>
									{updatingStatus && (
										<span className="text-subtle text-xs flex-shrink-0">Saving…</span>
									)}
								</div>
								{statusError && (
									<p className="danger-chip danger-border text-xs border rounded p-2 break-all">
										{statusError}
									</p>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Description */}
				{wp.description?.raw && (
					<section>
						<SectionTitle>Description</SectionTitle>
						<div className="text-muted mt-2 text-sm whitespace-pre-wrap leading-relaxed">
							{wp.description.raw}
						</div>
					</section>
				)}

				{/* Time */}
				<section>
					<SectionTitle>
						Time Tracked
						{totalHours > 0 && (
							<span className="ml-2 text-[var(--success)] font-semibold">{totalDisplay}</span>
						)}
					</SectionTitle>

					<div className="mt-2">
						{loadingEntries && <p className="text-subtle text-sm">Loading…</p>}
						{!loadingEntries && entriesError && (
							<p className="danger-chip text-xs rounded p-2 break-all">{entriesError}</p>
						)}
						{!loadingEntries && !entriesError && entries.length === 0 && (
							<p className="text-subtle text-sm">No time logged yet</p>
						)}

						{!loadingEntries &&
							dates.map((date) => {
								const dayEntries = byDate[date]
								const dayTotal = dayEntries.reduce((s, e) => s + parseISODuration(e.hours).hours, 0)
								return (
									<div key={date} className="mb-3">
										<div className="divider flex items-center justify-between py-1.5 border-b">
											<span className="text-muted text-xs font-semibold">{formatDate(date)}</span>
											<span className="text-main text-xs font-semibold tabular">
												{fmtHours(dayTotal)}
											</span>
										</div>
										{dayEntries.map((entry) => (
											<div key={entry.id} className="flex items-start gap-2.5 py-2 pl-2">
												<span className="text-main text-xs font-semibold tabular min-w-[44px] flex-shrink-0 pt-px">
													{parseISODuration(entry.hours).display}
												</span>
												<div className="min-w-0 flex flex-col gap-0.5">
													<span className="text-muted text-xs">
														{entry._links.user?.title ?? 'Unknown'}
													</span>
													{entry.comment?.raw && (
														<span className="text-subtle text-xs line-clamp-2">
															{entry.comment.raw}
														</span>
													)}
												</div>
											</div>
										))}
									</div>
								)
							})}
					</div>
				</section>
			</div>
		</div>
	)
}

// ── Shared status dot (used in cards too) ──────────────────────────
export function StatusDot({ color, isClosed }: { color?: string; isClosed?: boolean }) {
	const bg = color ?? (isClosed ? '#6b7280' : '#6366f1')
	return (
		<span
			className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
			style={{ backgroundColor: bg }}
		/>
	)
}

// ── Helpers ────────────────────────────────────────────────────────
function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-subtle text-[10px] font-semibold uppercase tracking-wide mb-0.5">
				{label}
			</div>
			<div className="text-muted text-sm">{value || '—'}</div>
		</div>
	)
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-subtle flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
			<span className="flex-shrink-0">{children}</span>
			<div className="flex-1 h-px bg-[var(--app-border)]" />
		</div>
	)
}

function fmtHours(h: number): string {
	if (!h) return '—'
	const dH = Math.floor(h)
	const dM = Math.round((h % 1) * 60)
	return dH || dM ? `${dH}h ${dM}m` : '—'
}

function formatDate(iso: string): string {
	return new Date(iso + 'T00:00:00').toLocaleDateString('en-EN', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	})
}
