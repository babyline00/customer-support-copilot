'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  Headphones,
  FileText,
  Inbox,
  MessageSquare,
  ListChecks,
  History,
  Plus,
  Send,
  Check,
  X,
  Trash2,
  Upload,
  Building2,
  User as UserIcon,
  ChevronDown,
  Shield,
  Pencil,
  Sparkles,
  ListTree,
} from 'lucide-react'

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
type Role = 'admin' | 'agent'

interface User { id: string; name: string; role: Role }

interface Org {
  id: string
  name: string
  slug: string
  styleGuide: string | null
  createdAt: string
  _count?: { docs: number; tickets: number; drafts: number; macros: number }
}

interface Doc { id: string; title: string; content: string; createdAt: string; chunkCount: number }

interface PastTicket { id: string; subject: string; body: string; resolution: string; createdAt: string }

type DraftStatus = 'draft' | 'approved' | 'sent' | 'rejected'

interface Citation { id: string; label: string; source: 'doc' | 'ticket'; preview: string }

interface Draft {
  id: string
  ticketSubject: string
  ticketBody: string
  replyContent: string
  tonePreset: string
  status: DraftStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  citations?: string // JSON
}

interface Macro { id: string; name: string; body: string; createdAt: string }

interface AuditEntry {
  id: string
  userId: string
  action: string
  actionLabel: string
  entityId: string | null
  entityType: string | null
  createdAt: string
  summary: string
}

interface Stats {
  orgs: number
  docs: number
  tickets: number
  drafts: number
  macros: number
  draftsByStatus?: Record<string, number>
}

const USERS: User[] = [
  { id: 'demo-admin', name: 'Demo Admin', role: 'admin' },
  { id: 'demo-agent', name: 'Demo Agent', role: 'agent' },
]

type NavId = 'docs' | 'tickets' | 'drafts' | 'macros' | 'audit'

const NAV: { id: NavId; label: string; icon: typeof FileText }[] = [
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'tickets', label: 'Past tickets', icon: Inbox },
  { id: 'drafts', label: 'Drafts queue', icon: MessageSquare },
  { id: 'macros', label: 'Macros', icon: ListChecks },
  { id: 'audit', label: 'Audit', icon: History },
]

const STATUS_BADGE: Record<DraftStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  sent: { label: 'Sent', variant: 'outline' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'warm', label: 'Warm' },
  { value: 'apology', label: 'Apology' },
]

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------
export default function Page() {
  const { toast } = useToast()

  const [orgs, setOrgs] = useState<Org[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [user, setUser] = useState<User>(USERS[0])
  const [nav, setNav] = useState<NavId>('drafts')

  const [docs, setDocs] = useState<Doc[]>([])
  const [tickets, setTickets] = useState<PastTicket[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [macros, setMacros] = useState<Macro[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)

  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [docDragging, setDocDragging] = useState(false)

  const [ticketCsv, setTicketCsv] = useState('')

  const [draftStatusFilter, setDraftStatusFilter] = useState<DraftStatus | 'all'>('all')
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [editingReply, setEditingReply] = useState('')
  const [newDraftOpen, setNewDraftOpen] = useState(false)
  const [ndSubject, setNdSubject] = useState('')
  const [ndBody, setNdBody] = useState('')
  const [ndTone, setNdTone] = useState('warm')
  const [generating, setGenerating] = useState(false)

  const [macroName, setMacroName] = useState('')
  const [macroBody, setMacroBody] = useState('')

  const [styleGuide, setStyleGuide] = useState('')
  const [styleGuideOpen, setStyleGuideOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? null

  // ----- fetch wrapper -----------------------------------------------------
  const api = useCallback(async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.set('x-user-id', user.id)
    headers.set('x-user-role', user.role)
    headers.set('x-user-name', user.name)
    if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    const res = await fetch(path, { ...init, headers })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json())?.error ?? detail } catch {}
      throw new Error(detail)
    }
    if (res.status === 204) return null
    const ct = res.headers.get('content-type') ?? ''
    return ct.includes('application/json') ? res.json() : res.text()
  }, [user])

  // ----- initial load ------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const { orgs } = await api('/api/orgs')
        setOrgs(orgs)
        if (orgs.length && !currentOrgId) setCurrentOrgId(orgs[0].id)
      } catch (e) { toast({ title: 'Failed to load orgs', description: (e as Error).message, variant: 'destructive' }) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- refresh stats whenever user toggles -------------------------------
  useEffect(() => {
    (async () => {
      try { setStats((await api('/api/stats')) as Stats) } catch {}
    })()
  }, [user, drafts, docs, tickets, macros, api])

  // ----- per-org data load -------------------------------------------------
  const loadOrgData = useCallback(async (orgId: string) => {
    try {
      const [d, t, dr, m, a] = await Promise.all([
        api(`/api/orgs/${orgId}/docs`),
        api(`/api/orgs/${orgId}/tickets`),
        api(`/api/orgs/${orgId}/drafts`),
        api(`/api/orgs/${orgId}/macros`),
        api(`/api/orgs/${orgId}/audit`),
      ])
      setDocs(d.docs); setTickets(t.tickets); setDrafts(dr.drafts); setMacros(m.macros); setAudit(a.entries)
    } catch (e) { toast({ title: 'Failed to load org data', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, toast])

  useEffect(() => {
    if (!currentOrgId) return
    loadOrgData(currentOrgId)
    // also fetch the org's style guide (already in `orgs`)
    const org = orgs.find((o) => o.id === currentOrgId)
    setStyleGuide(org?.styleGuide ?? '')
  }, [currentOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- doc upload --------------------------------------------------------
  const uploadDoc = useCallback(async (title: string, content: string) => {
    if (!currentOrgId || !title.trim() || !content.trim()) return
    try {
      await api(`/api/orgs/${currentOrgId}/docs`, { method: 'POST', body: JSON.stringify({ title, content }) })
      toast({ title: 'Doc uploaded', description: `"${title}" chunked & embedded.` })
      setDocTitle(''); setDocContent('')
      await loadOrgData(currentOrgId)
    } catch (e) { toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, toast])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDocDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const file = files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      setDocContent(content)
      if (!docTitle) setDocTitle(file.name.replace(/\.(md|markdown|txt)$/i, ''))
    }
    reader.readAsText(file)
  }, [docTitle])

  // ----- ticket ingest -----------------------------------------------------
  const ingestTickets = useCallback(async () => {
    if (!currentOrgId || !ticketCsv.trim()) return
    try {
      const res = await api(`/api/orgs/${currentOrgId}/tickets/ingest`, {
        method: 'POST',
        body: JSON.stringify({ csv: ticketCsv }),
      }) as { ingested: number }
      toast({ title: 'Tickets ingested', description: `${res.ingested} past tickets embedded.` })
      setTicketCsv('')
      await loadOrgData(currentOrgId)
    } catch (e) { toast({ title: 'Ingest failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, toast, ticketCsv])

  // ----- draft generation --------------------------------------------------
  const generateDraft = useCallback(async () => {
    if (!currentOrgId || !ndSubject.trim() || !ndBody.trim()) return
    setGenerating(true)
    try {
      await api(`/api/orgs/${currentOrgId}/drafts`, {
        method: 'POST',
        body: JSON.stringify({ ticketSubject: ndSubject, ticketBody: ndBody, tonePreset: ndTone }),
      })
      toast({ title: 'Draft generated', description: `Tone: ${ndTone}. Open the Drafts queue to review.` })
      setNewDraftOpen(false); setNdSubject(''); setNdBody('')
      setNav('drafts'); setDraftStatusFilter('draft')
      await loadOrgData(currentOrgId)
    } catch (e) { toast({ title: 'Generation failed', description: (e as Error).message, variant: 'destructive' }) }
    finally { setGenerating(false) }
  }, [api, currentOrgId, ndBody, ndSubject, ndTone, loadOrgData, toast])

  // ----- draft actions -----------------------------------------------------
  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null

  useEffect(() => {
    if (selectedDraft) setEditingReply(selectedDraft.replyContent)
  }, [selectedDraftId, selectedDraft])

  const saveReply = useCallback(async () => {
    if (!selectedDraft) return
    try {
      await api(`/api/drafts/${selectedDraft.id}`, { method: 'PATCH', body: JSON.stringify({ replyContent: editingReply }) })
      toast({ title: 'Reply saved' })
      await loadOrgData(currentOrgId!)
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, editingReply, loadOrgData, selectedDraft, toast])

  const transitionDraft = useCallback(async (to: DraftStatus) => {
    if (!selectedDraft) return
    try {
      await api(`/api/drafts/${selectedDraft.id}`, { method: 'PATCH', body: JSON.stringify({ status: to }) })
      toast({ title: `Draft ${STATUS_BADGE[to].label.toLowerCase()}` })
      await loadOrgData(currentOrgId!)
    } catch (e) { toast({ title: 'Transition failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, selectedDraft, toast])

  const deleteDraft = useCallback(async (id: string) => {
    try {
      await api(`/api/drafts/${id}`, { method: 'DELETE' })
      if (selectedDraftId === id) setSelectedDraftId(null)
      await loadOrgData(currentOrgId!)
    } catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, selectedDraftId, toast])

  const deleteDoc = useCallback(async (id: string) => {
    try {
      await api(`/api/docs/${id}`, { method: 'DELETE' })
      toast({ title: 'Doc removed' })
      await loadOrgData(currentOrgId!)
    } catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, toast])

  // ----- macros ------------------------------------------------------------
  const createMacro = useCallback(async () => {
    if (!currentOrgId || !macroName.trim() || !macroBody.trim()) return
    try {
      await api(`/api/orgs/${currentOrgId}/macros`, { method: 'POST', body: JSON.stringify({ name: macroName, body: macroBody }) })
      toast({ title: 'Macro created', description: `"${macroName}"` })
      setMacroName(''); setMacroBody('')
      await loadOrgData(currentOrgId)
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, macroBody, macroName, toast])

  // ----- style guide -------------------------------------------------------
  const saveStyleGuide = useCallback(async () => {
    if (!currentOrgId) return
    try {
      const { org } = await api(`/api/orgs/${currentOrgId}`, { method: 'PATCH', body: JSON.stringify({ styleGuide }) }) as { org: Org }
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, styleGuide: org.styleGuide } : o)))
      setStyleGuideOpen(false)
      toast({ title: 'Style guide saved' })
      await loadOrgData(currentOrgId)
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }) }
  }, [api, currentOrgId, loadOrgData, styleGuide, toast])

  // ----- derived -----------------------------------------------------------
  const visibleDrafts = drafts.filter((d) => draftStatusFilter === 'all' || d.status === draftStatusFilter)
  const citedItems: Citation[] = (() => {
    if (!selectedDraft) return []
    try { return selectedDraft.citations ? (JSON.parse(selectedDraft.citations) as Citation[]) : [] } catch { return [] }
  })()

  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Headphones className="size-4" /></div>
            <span className="hidden sm:inline">Customer Support Copilot</span>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-6" />

          {/* Org switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Building2 className="size-4" />
                <span className="max-w-[140px] truncate">{currentOrg?.name ?? 'Select org'}</span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Organizations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {orgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => { setCurrentOrgId(o.id); setSelectedDraftId(null); setNav('drafts') }} className="justify-between">
                  <span className="truncate">{o.name}</span>
                  {o.id === currentOrgId && <Check className="size-3" />}
                </DropdownMenuItem>
              ))}
              {orgs.length === 0 && <DropdownMenuItem disabled>No orgs seeded yet</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* New draft button */}
          <Button size="sm" className="gap-2 ml-auto" onClick={() => setNewDraftOpen(true)} disabled={!currentOrgId}>
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">New draft</span>
          </Button>

          {/* User switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="gap-1">
                  {user.role === 'admin' ? <Shield className="size-3" /> : <UserIcon className="size-3" />}
                  {user.role}
                </Badge>
                <span className="hidden md:inline text-muted-foreground">{user.name}</span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Switch user (demo RBAC)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {USERS.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => setUser(u)} className="justify-between">
                  <span className="truncate">{u.name}</span>
                  <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body: 3-column */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left sidebar */}
        <aside className="lg:w-56 border-r bg-card/50 shrink-0">
          <nav className="flex lg:flex-col gap-1 p-2 overflow-x-auto">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = nav === item.id
              return (
                <Button
                  key={item.id}
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-start gap-2 lg:w-full shrink-0"
                  onClick={() => { setNav(item.id); setSelectedDraftId(null) }}
                >
                  <Icon className="size-4" />
                  {item.label}
                  {item.id === 'drafts' && drafts.length > 0 && (
                    <Badge variant="outline" className="ml-auto text-[10px]">{drafts.length}</Badge>
                  )}
                </Button>
              )
            })}
          </nav>
          <div className="hidden lg:block p-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Tenant isolation</p>
            <p className="text-[11px] leading-snug text-muted-foreground/80">
              Each org's docs, past tickets, and drafts live in separate rows scoped by <code className="font-mono">orgId</code>. Retrieval never crosses tenants.
            </p>
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 min-w-0 p-4 lg:p-6">
          {!currentOrg ? (
            <EmptyState title="No organization selected" desc="Seed the demo (scripts/seed.ts) and pick an org from the header." />
          ) : nav === 'docs' ? (
            <DocsView
              docs={docs}
              docTitle={docTitle} setDocTitle={setDocTitle}
              docContent={docContent} setDocContent={setDocContent}
              docDragging={docDragging} setDocDragging={setDocDragging}
              onDrop={handleFileDrop} onUpload={uploadDoc}
              onDelete={deleteDoc} fileInputRef={fileInputRef}
              styleGuide={styleGuide} setStyleGuide={setStyleGuide}
              styleGuideOpen={styleGuideOpen} setStyleGuideOpen={setStyleGuideOpen}
              onSaveStyleGuide={saveStyleGuide}
            />
          ) : nav === 'tickets' ? (
            <TicketsView tickets={tickets} csv={ticketCsv} setCsv={setTicketCsv} onIngest={ingestTickets} />
          ) : nav === 'drafts' ? (
            <DraftsView
              drafts={visibleDrafts} allDrafts={drafts}
              filter={draftStatusFilter} setFilter={setDraftStatusFilter}
              selectedId={selectedDraftId} onSelect={setSelectedDraftId}
              selectedDraft={selectedDraft}
              editingReply={editingReply} setEditingReply={setEditingReply}
              onSaveReply={saveReply} onTransition={transitionDraft} onDeleteDraft={deleteDraft}
              citedItems={citedItems}
              user={user}
            />
          ) : nav === 'macros' ? (
            <MacrosView
              macros={macros}
              macroName={macroName} setMacroName={setMacroName}
              macroBody={macroBody} setMacroBody={setMacroBody}
              onCreate={createMacro}
            />
          ) : (
            <AuditView entries={audit} />
          )}
        </main>

        {/* Right sidebar */}
        <aside className="lg:w-72 border-t lg:border-t-0 lg:border-l bg-card/50 shrink-0 p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ListTree className="size-4" /> Org stats</CardTitle>
              <CardDescription className="text-xs">{currentOrg?.name}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Docs" value={currentOrg?._count?.docs ?? docs.length} />
              <Stat label="Past tickets" value={currentOrg?._count?.tickets ?? tickets.length} />
              <Stat label="Drafts" value={currentOrg?._count?.drafts ?? drafts.length} />
              <Stat label="Macros" value={currentOrg?._count?.macros ?? macros.length} />
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Drafts by status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {(['draft', 'approved', 'sent', 'rejected'] as DraftStatus[]).map((s) => (
                  <div key={s} className="flex items-center justify-between">
                    <Badge variant={STATUS_BADGE[s].variant}>{STATUS_BADGE[s].label}</Badge>
                    <span className="font-mono text-xs">{stats.draftsByStatus?.[s] ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ListChecks className="size-4" /> Macros quick-list</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {macros.length === 0 && <p className="text-xs text-muted-foreground">No macros yet for this org.</p>}
              <ScrollArea className="max-h-72">
                <div className="space-y-2 pr-2">
                  {macros.map((m) => (
                    <div key={m.id} className="rounded-md border p-2 text-xs">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-muted-foreground line-clamp-2 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t bg-card/50 px-4 py-3 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span>Customer Support Copilot — multi-tenant RAG copilot for support teams.</span>
        <span>Retrieval: BM25 + vector + RRF · Draft approval queue · Audit logged</span>
      </footer>

      {/* New draft dialog */}
      {newDraftOpen && (
        <DialogOverlay onClose={() => setNewDraftOpen(false)}>
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="size-4" /> Generate a reply draft</CardTitle>
              <CardDescription className="text-xs">Retrieves from {currentOrg?.name}'s docs + past tickets, then drafts a cited reply.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nd-subject" className="text-xs">Ticket subject</Label>
                <Input id="nd-subject" value={ndSubject} onChange={(e) => setNdSubject(e.target.value)} placeholder="e.g. Where is my refund?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nd-body" className="text-xs">Ticket body</Label>
                <Textarea id="nd-body" value={ndBody} onChange={(e) => setNdBody(e.target.value)} rows={5} placeholder="The customer's message…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tone preset</Label>
                <Select value={ndTone} onValueChange={setNdTone}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewDraftOpen(false)} disabled={generating}>Cancel</Button>
              <Button size="sm" onClick={generateDraft} disabled={generating || !ndSubject.trim() || !ndBody.trim()}>
                {generating ? <><span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Generating…</> : <><Sparkles className="size-4" /> Generate</>}
              </Button>
            </CardFooter>
          </Card>
        </DialogOverlay>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Sub-views
// --------------------------------------------------------------------------
function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center text-center p-8">
      <Inbox className="size-10 text-muted-foreground/50 mb-3" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{desc}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-mono">{value}</div>
    </div>
  )
}

function DocsView(props: {
  docs: Doc[]
  docTitle: string; setDocTitle: (v: string) => void
  docContent: string; setDocContent: (v: string) => void
  docDragging: boolean; setDocDragging: (v: boolean) => void
  onDrop: (e: React.DragEvent) => void
  onUpload: (title: string, content: string) => void
  onDelete: (id: string) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  styleGuide: string; setStyleGuide: (v: string) => void
  styleGuideOpen: boolean; setStyleGuideOpen: (v: boolean) => void
  onSaveStyleGuide: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="size-4" /> Knowledge base docs</CardTitle>
          <CardDescription className="text-xs">Upload markdown / text — chunked & embedded for hybrid retrieval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); props.setDocDragging(true) }}
            onDragLeave={() => props.setDocDragging(false)}
            onDrop={props.onDrop}
            className={`rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${props.docDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <Upload className="size-5 mx-auto mb-1 text-muted-foreground" />
            <p>Drag &amp; drop a markdown/text file here, or paste content below.</p>
            <input ref={props.fileInputRef} type="file" accept=".md,.markdown,.txt,text/*" className="hidden" />
          </div>
          <div className="grid gap-2">
            <Input placeholder="Doc title (e.g. Refund Policy)" value={props.docTitle} onChange={(e) => props.setDocTitle(e.target.value)} />
            <Textarea placeholder="Doc content (markdown)" rows={6} value={props.docContent} onChange={(e) => props.setDocContent(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => props.onUpload(props.docTitle, props.docContent)} disabled={!props.docTitle.trim() || !props.docContent.trim()}>
            <Upload className="size-4" /> Upload &amp; embed
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Style guide</CardTitle>
          <CardDescription className="text-xs">Tone, signature, and escalation policy for this org — wrapped into every draft's system prompt.</CardDescription>
        </CardHeader>
        <CardContent>
          {props.styleGuideOpen ? (
            <div className="space-y-2">
              <Textarea rows={6} value={props.styleGuide} onChange={(e) => props.setStyleGuide(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => props.setStyleGuideOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={props.onSaveStyleGuide}>Save</Button>
              </div>
            </div>
          ) : (
            <div>
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground min-h-16 font-sans">{props.styleGuide || 'No style guide set for this org.'}</pre>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => props.setStyleGuideOpen(true)}><Pencil className="size-3" /> Edit</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Uploaded docs ({props.docs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {props.docs.length === 0 ? <p className="text-xs text-muted-foreground">No docs yet.</p> : (
            <ul className="divide-y">
              {props.docs.map((d) => (
                <li key={d.id} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.chunkCount} chunks · {new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => props.onDelete(d.id)}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TicketsView(props: { tickets: PastTicket[]; csv: string; setCsv: (v: string) => void; onIngest: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Inbox className="size-4" /> Ingest past resolved tickets</CardTitle>
          <CardDescription className="text-xs">CSV with columns: subject, body, resolution. Embedded as a separate "ticket corpus" for similar-ticket retrieval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={6} value={props.csv} onChange={(e) => props.setCsv(e.target.value)} placeholder={'subject,body,resolution\n"Refund not received","I asked 2 weeks ago...","Issued a refund via Stripe..."}'} className="font-mono text-xs" />
          <Button size="sm" onClick={props.onIngest} disabled={!props.csv.trim()}><Upload className="size-4" /> Ingest &amp; embed</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Past tickets ({props.tickets.length})</CardTitle></CardHeader>
        <CardContent>
          {props.tickets.length === 0 ? <p className="text-xs text-muted-foreground">No past tickets yet.</p> : (
            <ScrollArea className="max-h-96">
              <ul className="divide-y pr-2">
                {props.tickets.map((t) => (
                  <li key={t.id} className="py-2">
                    <p className="font-medium text-sm">{t.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.body}</p>
                    <p className="text-xs mt-1"><span className="text-muted-foreground">Resolution:</span> {t.resolution}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DraftsView(props: {
  drafts: Draft[]; allDrafts: Draft[]
  filter: DraftStatus | 'all'; setFilter: (f: DraftStatus | 'all') => void
  selectedId: string | null; onSelect: (id: string) => void
  selectedDraft: Draft | null
  editingReply: string; setEditingReply: (v: string) => void
  onSaveReply: () => void; onTransition: (to: DraftStatus) => void
  onDeleteDraft: (id: string) => void
  citedItems: Citation[]
  user: User
}) {
  const STATUS_FILTERS: (DraftStatus | 'all')[] = ['all', 'draft', 'approved', 'sent', 'rejected']
  if (props.selectedDraft) {
    const d = props.selectedDraft
    const canEdit = d.status === 'draft' || d.status === 'approved'
    const isAdmin = props.user.role === 'admin'
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => props.onSelect('')} className="gap-1 -ml-2"><ChevronDown className="size-4 rotate-90" /> Back to queue</Button>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{d.ticketSubject}</CardTitle>
                <CardDescription className="text-xs mt-1">Tone: {d.tonePreset} · Created by {d.createdBy} · {new Date(d.createdAt).toLocaleString()}</CardDescription>
              </div>
              <Badge variant={STATUS_BADGE[d.status].variant}>{STATUS_BADGE[d.status].label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Customer ticket</p>
              <div className="rounded-md border bg-muted/30 p-2 text-sm whitespace-pre-wrap">{d.ticketBody}</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Drafted reply {canEdit ? '(editable)' : '(read-only — terminal status)'}</p>
                {canEdit && <Button variant="outline" size="sm" onClick={props.onSaveReply}><Check className="size-3" /> Save</Button>}
              </div>
              <Textarea rows={10} value={props.editingReply} onChange={(e) => props.setEditingReply(e.target.value)} disabled={!canEdit} className="font-mono text-xs" />
            </div>
            {props.citedItems.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Citations ({props.citedItems.length})</p>
                <ul className="space-y-1">
                  {props.citedItems.map((c) => (
                    <li key={c.id} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant={c.source === 'doc' ? 'secondary' : 'outline'} className="text-[10px]">{c.source}</Badge>
                        <span className="font-medium">{c.label}</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">{c.preview}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => props.onDeleteDraft(d.id)}><Trash2 className="size-4" /> Delete</Button>
            {d.status === 'draft' && isAdmin && <Button variant="outline" size="sm" onClick={() => props.onTransition('rejected')}><X className="size-4" /> Reject</Button>}
            {d.status === 'draft' && isAdmin && <Button size="sm" onClick={() => props.onTransition('approved')}><Check className="size-4" /> Approve</Button>}
            {d.status === 'approved' && isAdmin && <Button variant="outline" size="sm" onClick={() => props.onTransition('rejected')}><X className="size-4" /> Reject</Button>}
            {d.status === 'approved' && isAdmin && <Button size="sm" onClick={() => props.onTransition('sent')}><Send className="size-4" /> Send</Button>}
            {!isAdmin && <p className="text-xs text-muted-foreground">Status transitions require admin role.</p>}
          </CardFooter>
        </Card>
      </div>
    )
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="size-4" /> Drafts queue</CardTitle>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button key={f} variant={props.filter === f ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs capitalize" onClick={() => props.setFilter(f)}>
                {f} <span className="ml-1 text-muted-foreground">{f === 'all' ? props.allDrafts.length : props.allDrafts.filter((x) => x.status === f).length}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {props.drafts.length === 0 ? (
          <EmptyState title="No drafts here yet" desc="Click 'New draft' in the header to generate a cited reply for a customer ticket." />
        ) : (
          <ul className="divide-y">
            {props.drafts.map((d) => (
              <li key={d.id} className="py-3 cursor-pointer hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors" onClick={() => props.onSelect(d.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.ticketSubject}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{d.replyContent.slice(0, 140)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{d.tonePreset} · {new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[d.status].variant}>{STATUS_BADGE[d.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function MacrosView(props: { macros: Macro[]; macroName: string; setMacroName: (v: string) => void; macroBody: string; setMacroBody: (v: string) => void; onCreate: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="size-4" /> Create a macro</CardTitle>
          <CardDescription className="text-xs">Short pre-canned reply for common cases. Use <code>{'{{customer_name}}'}</code>, <code>{'{{agent_name}}'}</code>, <code>{'{{order_id}}'}</code> placeholders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Macro name (e.g. Refund issued)" value={props.macroName} onChange={(e) => props.setMacroName(e.target.value)} />
          <Textarea rows={4} placeholder="Hi {{customer_name}}, ..." value={props.macroBody} onChange={(e) => props.setMacroBody(e.target.value)} />
          <Button size="sm" onClick={props.onCreate} disabled={!props.macroName.trim() || !props.macroBody.trim()}><Plus className="size-4" /> Create macro</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Macros ({props.macros.length})</CardTitle></CardHeader>
        <CardContent>
          {props.macros.length === 0 ? <p className="text-xs text-muted-foreground">No macros yet.</p> : (
            <ul className="divide-y">
              {props.macros.map((m) => (
                <li key={m.id} className="py-2">
                  <p className="font-medium text-sm">{m.name}</p>
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans mt-0.5">{m.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AuditView(props: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><History className="size-4" /> Audit log</CardTitle>
        <CardDescription className="text-xs">Last 50 actions on this org (create / approve / send / reject / ingest).</CardDescription>
      </CardHeader>
      <CardContent>
        {props.entries.length === 0 ? <p className="text-xs text-muted-foreground">No audit entries yet.</p> : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y pr-2">
              {props.entries.map((e) => (
                <li key={e.id} className="py-2 flex items-start gap-2">
                  <div className="size-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{e.summary}</p>
                    <p className="text-[11px] text-muted-foreground">by {e.userId} · {new Date(e.createdAt).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

// Minimal inline dialog overlay (avoids importing the full Dialog primitives).
function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">{children}</div>
    </div>
  )
}
