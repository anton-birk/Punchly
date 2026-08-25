import { useState, useEffect, useCallback } from 'react'
import { getWorkPackages, getStatuses, getProjects, parseISODuration } from '../api/openproject'
import type { Settings, WorkPackage, Status, Project } from '../types/openproject'
import { CreateTaskModal } from './CreateTaskModal'
import { TaskDetailPanel, StatusDot } from './TaskDetailPanel'
import { Clock, Play, Square } from 'lucide-react'

interface Props {
	settings: Settings
	onlyMine: boolean
	currentUserId: number | null
	runningWpId: number | null
	onStartTimer: (wp: WorkPackage) => void
	onStopTimer: () => void
}

const PAGE_SIZE = 30

const priorityColor: Record<string, string> = {
	immediate: 'danger-chip',
	urgent: 'danger-chip',
	high: 'warning-chip',
	normal: 'brand-chip',
	low: 'surface-muted text-subtle',
}

export function TasksView({
	settings,
	onlyMine,
	currentUserId,
	runningWpId,
	onStartTimer,
	onStopTimer,
}: Props) {
	const [tasks, setTasks] = useState<WorkPackage[]>([])
	const [statuses, setStatuses] = useState<Status[]>([])
	const [projects, setProjects] = useState<Project[]>([])
	const [loading, setLoading] = useState(false)
	const [total, setTotal] = useState(0)
	const [offset, setOffset] = useState(1)
	const [search, setSearch] = useState('')
	const [filterStatus, setFilterStatus] = useState('')
	const [filterProject, setFilterProject] = useState('')
	const [showModal, setShowModal] = useState(false)
	const [selectedWp, setSelectedWp] = useState<WorkPackage | null>(null)
	const [loadError, setLoadError] = useState('')

	useEffect(() => {
		Promise.all([getStatuses(settings), getProjects(settings)]).then(([s, p]) => {
			setStatuses(s._embedded.elements)
			setProjects(p._embedded.elements.filter((x) => x.active))
		})
	}, [settings.url, settings.apiKey])

	const buildFilters = useCallback(() => {
		const filters: object[] = []
		if (onlyMine && currentUserId) {
			filters.push({ assignee: { operator: '=', values: [String(currentUserId)] } })
		}
		if (filterStatus) {
			filters.push({ status: { operator: '=', values: [filterStatus] } })
		} else {
			filters.push({ status: { operator: 'o' } })
		}
		if (filterProject) {
			filters.push({ project: { operator: '=', values: [filterProject] } })
		}
		if (search.trim()) {
			filters.push({ subject: { operator: '~', values: [search.trim()] } })
		}
		return filters
	}, [onlyMine, currentUserId, filterStatus, filterProject, search])

	const load = useCallback(
		async (page = 1, append = false) => {
			setLoading(true)
			try {
				const result = await getWorkPackages(settings, buildFilters(), PAGE_SIZE, page)
				const elements = result._embedded.elements
				setTasks((prev) => (append ? [...prev, ...elements] : elements))
				setTotal(result.total)
				setOffset(page)
				setLoadError('')
			} catch (e) {
				setLoadError(String(e))
			} finally {
				setLoading(false)
			}
		},
		[settings, buildFilters],
	)

	useEffect(() => {
		if (onlyMine && currentUserId === null) return
		load(1)
	}, [settings.url, settings.apiKey, onlyMine, currentUserId, filterStatus, filterProject])

	// Keep selected panel in sync when task is updated
	const handleTaskUpdated = (updated: WorkPackage) => {
		setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
		setSelectedWp(updated)
	}

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault()
		load(1)
	}

	const selectCls =
		'input-field h-9 border rounded-md px-2.5 text-sm outline-none hover:border-[var(--app-border-strong)] transition-colors cursor-pointer flex-shrink-0'

	const hasMore = tasks.length < total

	return (
		<div className="flex h-full overflow-hidden">
			{/* Task list column */}
			<div className="flex flex-col flex-1 min-w-0 overflow-hidden">
				<div data-tauri-drag-region className="h-7 cursor-grab active:cursor-grabbing" />
				{/* Header */}
				<div className="flex items-center justify-between px-6 pb-0">
					<h2 className="text-main text-lg font-bold">{onlyMine ? 'My Tasks' : 'All Tasks'}</h2>
					<button
						onClick={() => setShowModal(true)}
						className="btn-primary px-4 py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer"
					>
						+ New Task
					</button>
				</div>

				{/* Filters */}
				<div className="divider flex items-center gap-2.5 px-6 py-3.5 border-b">
					<form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
						<input
							className="input-field flex-1 min-w-0 h-9 border rounded-md px-3 text-sm outline-none transition-colors"
							placeholder="Search tasks…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<button
							type="submit"
							className="btn-ghost h-9 px-3.5 text-sm font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap"
						>
							Search
						</button>
					</form>

					<select
						className={selectCls}
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
					>
						<option value="">Open</option>
						{statuses.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>

					<select
						className={selectCls}
						value={filterProject}
						onChange={(e) => setFilterProject(e.target.value)}
					>
						<option value="">All Projects</option>
						{projects.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</div>

				{/* List */}
				<div className="flex-1 overflow-y-auto px-6 py-3 flex flex-col gap-1.5">
					{loadError && (
						<div className="warning-chip warning-border flex items-center gap-2 text-xs border rounded-md px-3 py-2 mt-1">
							<span className="flex-1">{loadError}</span>
							<button
								onClick={() => load(1)}
								className="underline hover:opacity-80 cursor-pointer whitespace-nowrap"
							>
								Retry
							</button>
						</div>
					)}
					{loading && tasks.length === 0 && (
						<div className="text-subtle flex items-center justify-center py-16 text-sm">
							Loading…
						</div>
					)}
					{!loading && tasks.length === 0 && !loadError && (
						<div className="text-subtle flex items-center justify-center py-16 text-sm">
							No tasks found
						</div>
					)}

					{tasks.map((wp) => {
						const isTracking = runningWpId === wp.id
						const isSelected = selectedWp?.id === wp.id
						const projectTitle = wp._links.project?.title ?? ''
						const priorityTitle = wp._links.priority?.title ?? ''
						const typeTitle = wp._links.type?.title ?? ''
						const statusTitle = wp._links.status?.title ?? ''
						const pKey = priorityTitle.toLowerCase()
						const spent = parseISODuration(wp.spentTime)
						const statusObj = statuses.find((s) => s.name === statusTitle)

						const taskStateCls =
							isTracking && isSelected
								? 'task-card-tracking-selected'
								: isTracking
									? 'task-card-tracking'
									: isSelected
										? 'task-card-selected'
										: 'surface hover:border-[var(--app-border-strong)]'

						return (
							<div
								key={wp.id}
								onClick={() => setSelectedWp(isSelected ? null : wp)}
								className={` flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${taskStateCls}`}
							>
								{/* Timer button */}
								<button
									title={isTracking ? 'Stop timer' : 'Start timer'}
									onClick={(e) => {
										e.stopPropagation()
										isTracking ? onStopTimer() : onStartTimer(wp)
									}}
									className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-[11px] transition-colors cursor-pointer ${
										isTracking
											? 'success-chip success-border'
											: 'text-subtle border-[var(--app-border-strong)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-soft)]'
									}`}
								>
									{isTracking ? <Square size={22} /> : <Play size={22} />}
								</button>

								{/* Task info */}
								<div className="flex-1 min-w-0 flex flex-col gap-1">
									<div className="flex items-center gap-2 min-w-0">
										<span className="brand-chip text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0">
											{typeTitle}
										</span>
										<span className="text-subtle text-[11px] tabular flex-shrink-0">#{wp.id}</span>
										<span className="text-subtle text-[11px] ml-auto truncate max-w-[110px] flex-shrink-0">
											{projectTitle}
										</span>
									</div>

									<div className="text-main text-sm font-medium truncate">{wp.subject}</div>

									<div className="flex items-center gap-2 flex-wrap">
										<span
											className={`text-[11px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${priorityColor[pKey] ?? priorityColor['normal']}`}
										>
											{priorityTitle}
										</span>
										{/* Status — dot + text */}
										<span className="flex items-center gap-1 flex-shrink-0">
											<StatusDot color={statusObj?.color} isClosed={statusObj?.isClosed} />
											<span className="text-subtle text-[11px]">{statusTitle}</span>
										</span>
										{wp.percentageDone > 0 && (
											<span className="text-subtle text-[11px] flex-shrink-0">
												{wp.percentageDone}%
											</span>
										)}
										{spent.hours > 0 && (
											<span className="success-chip ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded tabular flex-shrink-0">
												<Clock size={11} className="inline mr-0.5" /> {spent.display}
											</span>
										)}
									</div>
								</div>
							</div>
						)
					})}

					{hasMore && (
						<button
							onClick={() => load(offset + 1, true)}
							disabled={loading}
							className="text-subtle mt-2 w-full py-2.5 text-sm border border-dashed border-[var(--app-border-strong)] rounded-lg hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40 transition-colors cursor-pointer"
						>
							{loading ? 'Loading…' : `Load more (${total - tasks.length} remaining)`}
						</button>
					)}
				</div>
			</div>

			{/* Detail panel */}
			{selectedWp && (
				<TaskDetailPanel
					wp={selectedWp}
					settings={settings}
					allStatuses={statuses}
					runningWpId={runningWpId}
					onStartTimer={onStartTimer}
					onStopTimer={onStopTimer}
					onClose={() => setSelectedWp(null)}
					onUpdated={handleTaskUpdated}
				/>
			)}

			{showModal && (
				<CreateTaskModal
					settings={settings}
					onClose={() => setShowModal(false)}
					onCreated={() => load(1)}
				/>
			)}
		</div>
	)
}
