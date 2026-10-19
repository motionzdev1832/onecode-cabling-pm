import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Truck } from 'lucide-react'
import type { Delivery, ScopeItemProgress } from '@shared/types'
import { api, errorMessage, localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, fmtNum, fmtPct } from '@/lib/format'
import { Badge, Button, Card, ConfirmDialog, ErrorBanner, Field, Input, Loading, Meter, Modal, PageHeader, Select, Table, Textarea, td, th } from '@/components/ui'

export default function MaterialsPage() {
  const { isAdmin } = useAuth()
  const items = useFetch<ScopeItemProgress[]>('/api/scope-items')
  const deliveries = useFetch<Delivery[]>('/api/deliveries')
  const [delivery, setDelivery] = useState<Delivery | 'new' | null>(null)
  const [deletingDelivery, setDeletingDelivery] = useState<Delivery | null>(null)
  const [item, setItem] = useState<ScopeItemProgress | 'new' | null>(null)
  const [deletingItem, setDeletingItem] = useState<ScopeItemProgress | null>(null)
  const [busy, setBusy] = useState(false)

  const itemById = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data])
  const reloadAll = () => Promise.all([items.reload(), deliveries.reload()])

  const doDeleteDelivery = async () => {
    if (!deletingDelivery) return
    setBusy(true)
    try {
      await api.del(`/api/deliveries/${deletingDelivery.id}`)
      setDeletingDelivery(null)
      await reloadAll()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const doDeleteItem = async () => {
    if (!deletingItem) return
    setBusy(true)
    try {
      await api.del(`/api/scope-items/${deletingItem.id}`)
      setDeletingItem(null)
      await reloadAll()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Materials"
        description="Scope quantities, deliveries to site and installed totals"
        actions={
          isAdmin && (
            <>
              <Button onClick={() => setItem('new')}>
                <Plus className="h-4 w-4" /> Scope item
              </Button>
              <Button variant="primary" onClick={() => setDelivery('new')}>
                <Truck className="h-4 w-4" /> Record delivery
              </Button>
            </>
          )
        }
      />

      {(items.error || deliveries.error) && <ErrorBanner message={items.error ?? deliveries.error ?? ''} onRetry={() => void reloadAll()} />}
      {items.loading && !items.data && <Loading />}

      {items.data && (
        <Card title="Scope list" description="On site = delivered − installed. Remaining = scope − installed." className={cls('mb-4', items.refreshing && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={cls(th, 'text-right')}>Scope</th>
                <th className={cls(th, 'text-right')}>Allocated</th>
                <th className={cls(th, 'text-right')}>Delivered</th>
                <th className={cls(th, 'text-right')}>Installed</th>
                <th className={cls(th, 'text-right')}>On site</th>
                <th className={cls(th, 'text-right')}>Remaining</th>
                <th className={cls(th, 'w-40')}>Progress</th>
                {isAdmin && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {items.data.map((it) => {
                const onSite = it.deliveredQty - it.installedQty
                const remaining = it.totalQty - it.installedQty
                const pct = it.totalQty > 0 ? (it.installedQty / it.totalQty) * 100 : 0
                const shortfall = it.totalQty - it.deliveredQty
                return (
                  <tr key={it.id}>
                    <td className={cls(td, 'whitespace-nowrap')}>
                      <div className="font-medium text-ink">{it.name}</div>
                      <div className="text-xs text-ink-3">
                        {it.code} · {it.category === 'network' ? 'Network' : 'Cable'} · {it.unit}
                      </div>
                    </td>
                    <td className={cls(td, 'tabular text-right')}>{fmtNum(it.totalQty)}</td>
                    <td className={cls(td, 'tabular text-right', Math.abs(it.allocatedQty - it.totalQty) > 0.001 ? 'text-warn-text' : 'text-ink-2')} title={Math.abs(it.allocatedQty - it.totalQty) > 0.001 ? 'Allocation does not match scope (Plan › Quantities)' : undefined}>
                      {fmtNum(it.allocatedQty)}
                    </td>
                    <td className={cls(td, 'tabular text-right')}>
                      {fmtNum(it.deliveredQty)}
                      {shortfall > 0 && <div className="whitespace-nowrap text-[11px] text-ink-3">{fmtNum(shortfall)} not yet delivered</div>}
                    </td>
                    <td className={cls(td, 'tabular text-right font-medium')}>{fmtNum(it.installedQty)}</td>
                    <td className={cls(td, 'tabular text-right', onSite < 0 ? 'text-critical-text' : 'text-ink-2')} title={onSite < 0 ? 'Installed more than delivered: record the delivery' : undefined}>
                      {fmtNum(onSite)}
                    </td>
                    <td className={cls(td, 'tabular text-right text-ink-2')}>{fmtNum(remaining)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <Meter value={pct} thin tone={pct >= 100 ? 'good' : 'accent'} />
                        <span className="tabular w-10 text-right text-xs text-ink-2">{fmtPct(pct, 0)}</span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className={cls(td, 'whitespace-nowrap text-right')}>
                        <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setItem(it)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeletingItem(it)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card title="Deliveries" description="Material received on site" className={cls(deliveries.refreshing && 'opacity-60')}>
        {deliveries.loading && !deliveries.data && <Loading />}
        {deliveries.data && deliveries.data.length === 0 && <p className="text-[13px] text-ink-3">No deliveries recorded yet.</p>}
        {deliveries.data && deliveries.data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Item</th>
                <th className={cls(th, 'text-right')}>Qty</th>
                <th className={th}>Reference</th>
                <th className={th}>Note</th>
                {isAdmin && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {deliveries.data.map((d) => (
                <tr key={d.id}>
                  <td className={cls(td, 'whitespace-nowrap')}>{fmtDate(d.deliveryDate)}</td>
                  <td className={td}>{itemById.get(d.scopeItemId)?.name ?? `Item ${d.scopeItemId}`}</td>
                  <td className={cls(td, 'tabular text-right font-medium')}>
                    {fmtNum(d.qty)} {itemById.get(d.scopeItemId)?.unit ?? ''}
                  </td>
                  <td className={cls(td, 'text-ink-2')}>{d.reference ?? '—'}</td>
                  <td className={cls(td, 'text-ink-2')}>{d.note ?? ''}</td>
                  {isAdmin && (
                    <td className={cls(td, 'whitespace-nowrap text-right')}>
                      <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setDelivery(d)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeletingDelivery(d)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {delivery && items.data && (
        <DeliveryForm
          initial={delivery === 'new' ? null : delivery}
          items={items.data}
          onClose={() => setDelivery(null)}
          onSaved={async () => {
            setDelivery(null)
            await reloadAll()
          }}
        />
      )}
      {item && (
        <ScopeItemForm
          initial={item === 'new' ? null : item}
          onClose={() => setItem(null)}
          onSaved={async () => {
            setItem(null)
            await reloadAll()
          }}
        />
      )}
      <ConfirmDialog open={!!deletingDelivery} onClose={() => setDeletingDelivery(null)} onConfirm={doDeleteDelivery} loading={busy} title="Delete delivery" message="Remove this delivery record?" />
      <ConfirmDialog open={!!deletingItem} onClose={() => setDeletingItem(null)} onConfirm={doDeleteItem} loading={busy} title="Delete scope item" message={deletingItem ? `Delete "${deletingItem.name}" from the scope list? Its allocations and deliveries will be removed. Items with log entries cannot be deleted.` : ''} />
    </div>
  )
}

function DeliveryForm({ initial, items, onClose, onSaved }: { initial: Delivery | null; items: ScopeItemProgress[]; onClose: () => void; onSaved: () => void }) {
  const [scopeItemId, setScopeItemId] = useState<number>(initial?.scopeItemId ?? items[0]?.id ?? 0)
  const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate ?? localToday())
  const [qty, setQty] = useState(initial ? String(initial.qty) : '')
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { scopeItemId, deliveryDate, qty: Number(qty), reference: reference || null, note: note || null }
      if (initial) await api.put(`/api/deliveries/${initial.id}`, body)
      else await api.post('/api/deliveries', body)
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit delivery' : 'Record delivery'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Record'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Item">
          <Select value={scopeItemId} onChange={(e) => setScopeItemId(Number(e.target.value))}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </Field>
          <Field label="Quantity">
            <Input type="number" min={0} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
        </div>
        <Field label="Reference" hint="Delivery order, PO or invoice number">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ScopeItemForm({ initial, onClose, onSaved }: { initial: ScopeItemProgress | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<'network' | 'cable'>(initial?.category ?? 'cable')
  const [unit, setUnit] = useState(initial?.unit ?? 'Ea')
  const [totalQty, setTotalQty] = useState(initial ? String(initial.totalQty) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { code, name, category, unit, totalQty: Number(totalQty) }
      if (initial) await api.put(`/api/scope-items/${initial.id}`, body)
      else await api.post('/api/scope-items', body)
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit scope item' : 'Add scope item'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {initial && initial.installedQty > 0 && <Badge tone="warn">Installed quantities already exist for this item; changing the scope total changes its progress.</Badge>}
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <Field label="Code">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MPOPC" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MPO Patch Cord" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as 'network' | 'cable')}>
              <option value="network">Network</option>
              <option value="cable">Cable</option>
            </Select>
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Scope quantity">
            <Input type="number" min={0} step={1} inputMode="numeric" value={totalQty} onChange={(e) => setTotalQty(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
