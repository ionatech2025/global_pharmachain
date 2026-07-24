"use client";

import {
  DISPUTE_STATUS_LABELS,
  FREIGHT_MODE_LABELS,
  FREIGHT_MODES,
  type FreightMode,
  LOGISTICS_ROLE_LABELS,
  LOGISTICS_ROLES,
  type LogisticsRole,
  SHIPMENT_EXCEPTION_LABELS,
  SHIPMENT_EXCEPTIONS,
  type ShipmentException,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pharmachain/ui/components/dialog";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { Switch } from "@pharmachain/ui/components/switch";
import { Textarea } from "@pharmachain/ui/components/textarea";
import {
  AlertTriangle,
  Eraser,
  MapPin,
  PenLine,
  ShieldAlert,
  Ship,
  Snowflake,
  UserRoundPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { AppointmentRow, DisputeRow, LocationRow, OrderDetail } from "@/lib/api/types";
import { fmtDate, fmtDateTime } from "@/lib/format";

const inputClass =
  "h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

// ─── Appointments (buyer manages; Phase 2 §2) ────────────────────────────────

export function AppointPartnerButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<LogisticsRole>("FORWARDER");
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; country: string }>>(
    [],
  );
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<Array<{ id: string; name: string; country: string }>>(
        `/logistics/companies?role=${role}`,
      )
      .then((list) => {
        setCompanies(list);
        setCompanyId(list[0]?.id ?? "");
      })
      .catch(() => setCompanies([]));
  }, [open, role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/appointments`, { role, companyId });
      toast.success(`${LOGISTICS_ROLE_LABELS[role]} appointed — their team now has access`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserRoundPlus className="size-4" /> Appoint partner
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appoint a logistics partner</DialogTitle>
          <DialogDescription>
            One active partner per role; appointing again replaces the current one. Appointees gain
            access to this shipment only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="appoint-role">Role</Label>
            <select
              id="appoint-role"
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as LogisticsRole)}
            >
              {LOGISTICS_ROLES.map((r) => (
                <option key={r} value={r}>
                  {LOGISTICS_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appoint-company">Verified company</Label>
            <select
              id="appoint-company"
              className={inputClass}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.length === 0 && <option value="">No verified companies yet</option>}
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.country}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !companyId}>
              {busy ? "Appointing…" : "Appoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeAppointmentButton({
  orderId,
  appointment,
}: {
  orderId: string;
  appointment: AppointmentRow;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function revoke() {
    setBusy(true);
    try {
      await api.delete(`/orders/${orderId}/appointments/${appointment.role}`);
      toast.success(`${LOGISTICS_ROLE_LABELS[appointment.role]} appointment revoked`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={revoke} disabled={busy}>
      Revoke
    </Button>
  );
}

// ─── Freight metadata (seller/forwarder; Phase 2 §2–3) ───────────────────────

export function FreightButton({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FreightMode | "">(order.freightMode ?? "");
  const [coldChain, setColdChain] = useState(order.coldChain);
  const [dispatch, setDispatch] = useState(
    order.dispatchDate ? order.dispatchDate.slice(0, 10) : "",
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/orders/${order.id}/shipment`, {
        ...(mode ? { freightMode: mode } : {}),
        coldChain,
        ...(dispatch ? { dispatchDate: new Date(`${dispatch}T12:00:00Z`).toISOString() } : {}),
      });
      toast.success("Freight details updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Ship className="size-4" /> Freight details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Freight details</DialogTitle>
          <DialogDescription>
            Mode, cold chain and dispatch date — visible to every shipment party.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="freight-mode">Freight mode</Label>
            <select
              id="freight-mode"
              className={inputClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as FreightMode)}
            >
              <option value="">Not set</option>
              {FREIGHT_MODES.map((m) => (
                <option key={m} value={m}>
                  {FREIGHT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="cold-chain" className="flex items-center gap-1.5">
              <Snowflake className="size-4 text-info" /> Cold chain (2–8 °C)
            </Label>
            <Switch id="cold-chain" checked={coldChain} onCheckedChange={setColdChain} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispatch-date">Dispatch date</Label>
            <Input
              id="dispatch-date"
              type="date"
              value={dispatch}
              onChange={(e) => setDispatch(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Exceptions (Phase 2 §4) ─────────────────────────────────────────────────

export function ExceptionButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ShipmentException>("DELAYED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/exceptions`, { kind, note });
      toast.success("Exception recorded — all parties are alerted");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <AlertTriangle className="size-4" /> Report exception
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Report a shipment exception</DialogTitle>
          <DialogDescription>
            Delay, customs rejection or a failed delivery attempt — annotates the timeline and
            alerts buyer, seller and logistics partners.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="exception-kind">Type</Label>
            <select
              id="exception-kind"
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as ShipmentException)}
            >
              {SHIPMENT_EXCEPTIONS.map((k) => (
                <option key={k} value={k}>
                  {SHIPMENT_EXCEPTION_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exception-note">What happened?</Label>
            <Textarea
              id="exception-note"
              rows={3}
              minLength={5}
              maxLength={500}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || note.trim().length < 5}>
              {busy ? "Recording…" : "Record exception"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── GPS tracking (Phase 2 §3) ───────────────────────────────────────────────

function RoutePlot({ locations, upTo }: { locations: LocationRow[]; upTo: number }) {
  const points = locations.slice(0, upTo);
  const { path, dots } = useMemo(() => {
    if (points.length === 0) return { path: "", dots: [] as Array<{ x: number; y: number }> };
    const lats = points.map((p) => Number(p.lat));
    const lngs = points.map((p) => Number(p.lng));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = Math.max(maxLat - minLat, 0.0001);
    const spanLng = Math.max(maxLng - minLng, 0.0001);
    const dots = points.map((p) => ({
      x: 16 + ((Number(p.lng) - minLng) / spanLng) * 288,
      y: 16 + ((maxLat - Number(p.lat)) / spanLat) * 128,
    }));
    return {
      path: dots
        .map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(1)},${d.y.toFixed(1)}`)
        .join(" "),
      dots,
    };
  }, [points]);

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No locations yet.</p>;
  }
  const last = dots[dots.length - 1];
  return (
    <svg
      viewBox="0 0 320 160"
      className="w-full rounded-lg border bg-muted/30"
      role="img"
      aria-label="Route plot of recorded GPS positions"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots.map((d, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: positional plot
          key={i}
          cx={d.x}
          cy={d.y}
          r={i === 0 ? 4 : 2.5}
          fill={i === 0 ? "var(--color-success)" : "var(--color-primary)"}
        />
      ))}
      {last && <circle cx={last.x} cy={last.y} r="6" fill="var(--color-primary)" opacity="0.25" />}
    </svg>
  );
}

export function LocationsCard({ order, canRecord }: { order: OrderDetail; canRecord: boolean }) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [upTo, setUpTo] = useState(0);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<LocationRow[]>(`/orders/${order.id}/locations`)
      .then((rows) => {
        setLocations(rows);
        setUpTo(rows.length);
      })
      .catch(() => setLocations([]));
  }, [order.id]);

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => toast.error("Could not read your device location"),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // X-Offline-Queue: the service worker queues this capture in IndexedDB
      // when offline and replays it once connectivity returns (Phase 4 §1).
      const result = await api.post<{ queued?: boolean }>(
        `/orders/${order.id}/locations`,
        { lat: Number(lat), lng: Number(lng), note: note || undefined },
        { headers: { "X-Offline-Queue": "1" } },
      );
      toast.success(result?.queued ? "Offline — location saved, will sync" : "Location recorded");
      setLat("");
      setLng("");
      setNote("");
      const rows = await api.get<LocationRow[]>(`/orders/${order.id}/locations`);
      setLocations(rows);
      setUpTo(rows.length);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (locations === null) {
    return <p className="text-sm text-muted-foreground">Loading route…</p>;
  }
  const shown = locations.slice(0, upTo);
  const latest = shown[shown.length - 1];
  return (
    <div className="space-y-3">
      <RoutePlot locations={locations} upTo={upTo} />
      {locations.length > 1 && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={locations.length}
            value={upTo}
            onChange={(e) => setUpTo(Number(e.target.value))}
            className="flex-1 accent-[var(--color-primary)]"
            aria-label="Route playback"
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {upTo}/{locations.length}
          </span>
        </div>
      )}
      {latest && (
        <p className="text-xs text-muted-foreground">
          <MapPin className="mr-1 inline size-3.5" />
          {Number(latest.lat).toFixed(4)}, {Number(latest.lng).toFixed(4)} ·{" "}
          {fmtDateTime(latest.createdAt)} · {latest.recordedBy.name}
          {latest.note ? ` — ${latest.note}` : ""}
        </p>
      )}
      {canRecord && (
        <form onSubmit={submit} className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Latitude"
            required
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="Latitude"
          />
          <Input
            placeholder="Longitude"
            required
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            aria-label="Longitude"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={useMyLocation}>
              <MapPin className="size-4" /> Use mine
            </Button>
            <Button type="submit" size="sm" disabled={busy || !lat || !lng}>
              Record
            </Button>
          </div>
          <Input
            className="sm:col-span-3"
            placeholder="Note (optional) — e.g. Cleared Malaba border"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Location note"
          />
        </form>
      )}
    </div>
  );
}

// ─── Proof of delivery (Phase 2 §3) ──────────────────────────────────────────

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
    drawn.current = true;
  }
  function end() {
    drawing.current = false;
    if (drawn.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawn.current = false;
    onChange(null);
  }

  return (
    <div className="grid gap-1.5">
      <canvas
        ref={canvasRef}
        width={360}
        height={120}
        className="w-full touch-none rounded-lg border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        aria-label="Draw signature"
      />
      <Button type="button" size="sm" variant="ghost" className="justify-self-end" onClick={clear}>
        <Eraser className="size-3.5" /> Clear
      </Button>
    </div>
  );
}

export function PodButton({
  order,
  photoDocs,
}: {
  order: OrderDetail;
  photoDocs: Array<{ id: string; fileName: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState(photoDocs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.post<{ queued?: boolean }>(
        `/orders/${order.id}/pod`,
        {
          signedByName: name,
          note: note || undefined,
          signatureData: signature ?? undefined,
          photoDocumentId: photoId || undefined,
        },
        { headers: { "X-Offline-Queue": "1" } },
      );
      toast.success(
        result?.queued ? "Offline — POD saved, will sync" : "Proof of delivery captured",
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PenLine className="size-4" /> Capture proof of delivery
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proof of delivery</DialogTitle>
          <DialogDescription>
            Signature and/or photo, stored against the shipment. To attach a photo, upload a "Proof
            of Delivery (photo)" document first.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pod-name">Received by (full name)</Label>
            <Input
              id="pod-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Signature (draw)</Label>
            <SignaturePad onChange={setSignature} />
          </div>
          {photoDocs.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="pod-photo">Delivery photo</Label>
              <select
                id="pod-photo"
                className={inputClass}
                value={photoId}
                onChange={(e) => setPhotoId(e.target.value)}
              >
                <option value="">No photo</option>
                {photoDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pod-note">Note (optional)</Label>
            <Textarea
              id="pod-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? "Saving…" : "Capture"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Disputes (Phase 2 §4) ───────────────────────────────────────────────────

export function DisputeButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [legal, setLegal] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/disputes`, {
        subject,
        body,
        legalReference: legal || undefined,
      });
      toast.success("Dispute raised — all parties are notified");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ShieldAlert className="size-4" /> Raise a dispute
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raise a dispute</DialogTitle>
          <DialogDescription>
            A formal complaint on this shipment. You can escalate it to the platform team if the
            parties cannot resolve it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="dispute-subject">Subject</Label>
            <Input
              id="dispute-subject"
              required
              minLength={5}
              maxLength={140}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispute-body">Details</Label>
            <Textarea
              id="dispute-body"
              rows={4}
              required
              minLength={10}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dispute-legal">Legal / arbitration reference (optional)</Label>
            <Input
              id="dispute-legal"
              maxLength={300}
              placeholder="e.g. Contract clause 12.3, UNCITRAL case ref"
              value={legal}
              onChange={(e) => setLegal(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Raising…" : "Raise dispute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DisputeRowActions({
  dispute,
  viewerCompanyId,
}: {
  dispute: DisputeRow;
  viewerCompanyId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const mine = viewerCompanyId !== null && dispute.company.id === viewerCompanyId;

  async function act(path: string, message: string) {
    setBusy(true);
    try {
      await api.post(path, {});
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  if (!mine || dispute.status === "RESOLVED" || dispute.status === "WITHDRAWN") return null;
  return (
    <div className="flex gap-2">
      {dispute.status === "OPEN" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => act(`/disputes/${dispute.id}/escalate`, "Escalated to the platform team")}
        >
          Escalate to platform
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => act(`/disputes/${dispute.id}/withdraw`, "Dispute withdrawn")}
      >
        Withdraw
      </Button>
    </div>
  );
}

export function DisputeStatusBadge({ status }: { status: DisputeRow["status"] }) {
  const variant =
    status === "OPEN"
      ? ("warning" as const)
      : status === "ESCALATED"
        ? ("destructive" as const)
        : status === "RESOLVED"
          ? ("success" as const)
          : ("secondary" as const);
  return <Badge variant={variant}>{DISPUTE_STATUS_LABELS[status]}</Badge>;
}

export function DisputeList({
  disputes,
  viewerCompanyId,
}: {
  disputes: DisputeRow[];
  viewerCompanyId: string | null;
}) {
  if (disputes.length === 0) {
    return <p className="text-sm text-muted-foreground">No disputes on this shipment.</p>;
  }
  return (
    <ul className="space-y-3">
      {disputes.map((d) => (
        <li key={d.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{d.subject}</span>
            <DisputeStatusBadge status={d.status} />
          </div>
          <p className="mt-1 text-muted-foreground">{d.body}</p>
          {d.legalReference && (
            <p className="mt-1 text-xs text-muted-foreground">Reference: {d.legalReference}</p>
          )}
          {d.resolution && (
            <p className="mt-1.5 rounded-md bg-success/10 p-2 text-xs">
              Platform resolution: {d.resolution}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {d.company.name} · {fmtDate(d.createdAt)}
            </span>
            <DisputeRowActions dispute={d} viewerCompanyId={viewerCompanyId} />
          </div>
        </li>
      ))}
    </ul>
  );
}
