import type { SelectHTMLAttributes } from 'react'
import type { TaskView } from '@shared/types'
import { Select } from './ui'
import { floorLabel } from '@/lib/format'

/** Select box listing leaf tasks, grouped by their position in the plan. */
export default function TaskPicker({ tasks, value, onChange, placeholder = 'Select a task…', ...rest }: { tasks: TaskView[]; value: number | null; onChange: (id: number | null) => void; placeholder?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const leaves = tasks.filter((t) => !t.hasChildren)
  const groups: { path: string; tasks: TaskView[] }[] = []
  for (const t of leaves) {
    const g = groups[groups.length - 1]
    if (g && g.path === t.path) g.tasks.push(t)
    else groups.push({ path: t.path || 'Project', tasks: [t] })
  }
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} {...rest}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.path} label={g.path}>
          {g.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.floor ? ` (${floorLabel(t.floor)})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
}
