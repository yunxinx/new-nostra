import type { PointerEvent as ReactPointerEvent } from "react";

import { cn } from "cn";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  GripVertical,
  Search,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  Provider,
  ProviderListItem,
  ProviderPreset,
  UnifiedMember,
  UnifiedModel,
  UnifiedModelDraft,
} from "@/types/ipc";

import { DataTablePanel } from "@/components/common/DataTablePanel";
import {
  FacetedFilter,
  type FacetedFilterOption,
} from "@/components/common/FacetedFilter";
import { ProtocolIcon } from "@/components/common/ProtocolIcon";
import { VendorIcon } from "@/components/common/VendorIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateUnifiedModel,
  useProviderPresets,
  useUpdateUnifiedModel,
} from "@/hooks/use-providers";
import { presetIdForBaseUrl } from "@/lib/brand-marks";
import { isDeepEqual } from "@/lib/deep-equal";
import {
  type AggregateRow,
  matchesModelFilters,
  modelDisplayName,
  sectionRows,
  unifiedCandidateRows,
  unifiedMemberParts,
} from "@/lib/model-catalog";

import { DirtyNotice } from "../../components/DirtyNotice";
import { RevertButton } from "../../components/RevertButton";
import { SettingsRow } from "../../components/SettingsRow";
import { useDraftGuard } from "../../hooks/use-draft-guard";
import { protocolFamilySchema } from "../../schemas/compat";
import { unifiedModelDraftSchema } from "../../schemas/unified";
import {
  addMember,
  isMember,
  memberKey,
  moveMember,
  moveMemberTo,
  removeMember,
} from "../unified-draft";

/** One width per column of the member-order table. */
const MEMBER_COLUMNS = ["w-8", "w-8", undefined, "w-24"];

/** One width per column of the candidate table. */
const CANDIDATE_COLUMNS = ["w-9", undefined, undefined];

interface UnifiedModelEditorProps {
  /** The stored aggregate being edited, or null for a new one. */
  initial: null | UnifiedModel;
  isNavRequested?: boolean;
  onDone: () => void;
  onNavRequestResolved?: ((accepted: boolean) => void) | undefined;
  providers: ProviderListItem[];
}

/**
 * The create/edit surface of one unified model. Membership and order are two
 * questions, so they get two tables side by side: the left arranges the order
 * the members are attempted in, the right picks which models belong. Both
 * tables fill the height left under the form, because a candidate list is only
 * searchable once it is long enough to need searching, and the footer stays
 * put at the bottom of the page while they scroll.
 */
export function UnifiedModelEditor({
  initial: initialValue,
  isNavRequested = false,
  onDone,
  onNavRequestResolved,
  providers,
}: UnifiedModelEditorProps) {
  const { t } = useTranslation();
  const [initial] = useState(initialValue);
  const presets = useProviderPresets();
  const create = useCreateUnifiedModel();
  const update = useUpdateUnifiedModel();
  const [id, setId] = useState(initial?.id ?? "");
  const [members, setMembers] = useState<UnifiedMember[]>(
    initial?.members ?? [],
  );
  const [search, setSearch] = useState("");
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [protocols, setProtocols] = useState<string[]>([]);
  const [isRefused, setIsRefused] = useState(false);
  const isSaving = create.isPending || update.isPending;
  const writeError = create.error ?? update.error;

  const isIdChanged = id !== (initial?.id ?? "");
  const areMembersChanged = !isDeepEqual(members, initial?.members ?? []);
  const changedCount = Number(isIdChanged) + Number(areMembersChanged);
  const guard = useDraftGuard({
    isChanged: changedCount > 0,
    isNavRequested,
    isSaving,
    onLeave: onDone,
    onNavRequestResolved,
  });

  const allCandidates = unifiedCandidateRows(providers);
  const candidates = allCandidates.filter((row) =>
    matchesModelFilters(row, { protocols, providerIds, search }),
  );
  // Candidates are grouped the way the model list groups them, so the same
  // provider reads as the same place in both.
  const sections = sectionRows(candidates);

  const providerOptions = providerOptionsOf(allCandidates, presets.presets);
  const protocolOptions = protocolOptionsOf(allCandidates, t);

  function reset(): void {
    create.reset();
    update.reset();
    setIsRefused(false);
    setId(initial?.id ?? "");
    setMembers(initial?.members ?? []);
  }

  function save(): void {
    if (isSaving) {
      return;
    }
    create.reset();
    update.reset();
    const draft: UnifiedModelDraft = { id: id.trim(), members };
    if (!unifiedModelDraftSchema.safeParse(draft).success) {
      setIsRefused(true);
      return;
    }
    setIsRefused(false);
    if (initial === null) {
      create.mutate({ unified: draft }, { onSuccess: onDone });
      return;
    }
    update.mutate({ id: initial.id, unified: draft }, { onSuccess: onDone });
  }

  function toggleMember(member: UnifiedMember): void {
    setMembers((current) =>
      isMember(current, member)
        ? removeMember(
            current,
            current.findIndex(
              (entry) => memberKey(entry) === memberKey(member),
            ),
          )
        : addMember(current, member),
    );
  }

  /** Adds every candidate the filters left, skipping the ones already in. */
  function addAllVisible(): void {
    const missing = candidates.filter(
      (row) => !isMember(members, memberOf(row)),
    );
    if (missing.length === 0) {
      return;
    }
    setMembers((current) =>
      missing.reduce((acc, row) => addMember(acc, memberOf(row)), current),
    );
  }

  const errorText = isRefused
    ? t("errors.invalid_input")
    : writeError !== null
      ? t(`errors.${writeError.code}`)
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
      <DirtyNotice
        onCancel={guard.cancel}
        onConfirm={guard.confirm}
        open={guard.isBlocked}
      />
      <fieldset
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        disabled={isSaving}
      >
        {/* No top inset: the title strip above the page is its top edge, so
            the way back stands on the same line as the list's own toolbar. */}
        <div className="flex shrink-0 items-center gap-3 pb-2">
          <Button
            onClick={guard.requestLeave}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft className="size-3.5" />
            {t("settings.models.unified")}
          </Button>
        </div>
        <SettingsRow
          info={t("settings.models.unifiedIdDesc")}
          isInvalid={isRefused && id.trim() === ""}
          label={t("settings.models.unifiedId")}
          onRevert={isIdChanged ? () => setId(initial?.id ?? "") : undefined}
        >
          <Input
            aria-label={t("settings.models.unifiedId")}
            className="w-80 max-w-full"
            onChange={(event) => setId(event.target.value)}
            value={id}
          />
        </SettingsRow>

        <div className="grid min-h-0 flex-1 gap-2 pt-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {/* Both tables run heading and box, so the two boxes start and end
            on the same line: a transfer control reads as one control only
            while its halves are level. */}
          <section className="flex min-h-0 min-w-0 flex-col gap-1.5">
            <div className="flex h-8 items-center gap-2">
              <h3 className="text-sm">{t("settings.models.memberOrder")}</h3>
              {/* The way back stands on the heading's right, next to the thing
                  it restores, rather than before the name it belongs to. */}
              {areMembersChanged && (
                <RevertButton
                  onRevert={() => setMembers(initial?.members ?? [])}
                />
              )}
            </div>
            <MemberOrderTable
              members={members}
              onChange={setMembers}
              providers={providers}
            />
          </section>
          {/* The direction the rows travel: candidates go in, members come
              out. A mark rather than a control — the exchange is driven from
              either table. */}
          <div
            aria-hidden="true"
            className="text-muted-foreground hidden items-center justify-center pt-8 md:flex"
          >
            <ChevronLeft className="size-4" />
          </div>
          <section className="flex min-h-0 min-w-0 flex-col gap-1.5">
            <div className="flex h-8 min-w-0 items-center gap-2">
              <h3 className="shrink-0 text-sm">
                {t("settings.models.candidateMembers")}
              </h3>
              <div className="ml-auto flex min-w-0 items-center gap-1.5">
                <div className="relative w-36 min-w-0">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                  <Input
                    aria-label={t("settings.models.searchCandidates")}
                    className="pl-7"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("settings.models.searchCandidates")}
                    type="search"
                    value={search}
                  />
                </div>
                <FacetedFilter
                  onChange={setProviderIds}
                  options={providerOptions}
                  title={t("common.filterProvider")}
                  values={providerIds}
                />
                <FacetedFilter
                  onChange={setProtocols}
                  options={protocolOptions}
                  title={t("common.filterProtocol")}
                  values={protocols}
                />
              </div>
            </div>
            <DataTablePanel
              columns={CANDIDATE_COLUMNS}
              header={
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-2">
                      <span className="sr-only">
                        {t("settings.models.addAllVisible")}
                      </span>
                      <Checkbox
                        aria-label={t("settings.models.addAllVisible")}
                        checked={
                          candidates.length > 0 &&
                          candidates.every((row) =>
                            isMember(members, memberOf(row)),
                          )
                            ? true
                            : candidates.some((row) =>
                                  isMember(members, memberOf(row)),
                                )
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            addAllVisible();
                            return;
                          }
                          setMembers((current) =>
                            candidates.reduce(
                              (acc, row) =>
                                removeMember(
                                  acc,
                                  acc.findIndex(
                                    (entry) =>
                                      memberKey(entry) ===
                                      memberKey(memberOf(row)),
                                  ),
                                ),
                              current,
                            ),
                          );
                        }}
                      />
                    </TableHead>
                    <TableHead>{t("settings.providers.modelName")}</TableHead>
                    <TableHead>{t("settings.providers.modelId")}</TableHead>
                  </TableRow>
                </TableHeader>
              }
            >
              <TableBody>
                {sections.map(({ provider, rows: group }) => (
                  <CandidateGroup
                    group={group}
                    isDisabled={isSaving}
                    key={provider.id}
                    members={members}
                    onToggle={toggleMember}
                    providerName={provider.name}
                  />
                ))}
                {candidates.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      className="text-muted-foreground py-6 text-center text-sm"
                      colSpan={3}
                    >
                      {t(
                        allCandidates.length === 0
                          ? "settings.models.noCandidates"
                          : "settings.models.noResults",
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </DataTablePanel>
          </section>
        </div>
        {/* The footer holds the page's bottom: the tables above it are what
          scroll, so the way out of the editor is always where the eye expects
          it. Leaving stands on the far left, away from save and reset — it
          ends the edit, and a click on it cannot be undone. */}
        <div className="flex shrink-0 items-center gap-3 pt-3">
          <Button
            disabled={isSaving}
            onClick={guard.requestLeave}
            size="sm"
            type="button"
            variant="outline"
          >
            {initial === null
              ? t("settings.models.abandon")
              : t("common.cancel")}
          </Button>
          <p
            className="text-destructive min-w-0 flex-1 truncate text-sm"
            role="alert"
          >
            {errorText}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {changedCount > 0 && (
              <Badge variant="secondary">
                {t("common.changedCount", { count: changedCount })}
              </Badge>
            )}
            <Button
              disabled={isSaving}
              onClick={reset}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("settings.models.reset")}
            </Button>
            <Button disabled={isSaving} onClick={save} size="sm" type="button">
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function CandidateGroup({
  group,
  isDisabled,
  members,
  onToggle,
  providerName,
}: {
  group: AggregateRow[];
  isDisabled: boolean;
  members: UnifiedMember[];
  onToggle: (member: UnifiedMember) => void;
  providerName: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* One table, one heading per provider: the group row spans every
          column, so a row never repeats the provider its model belongs to. */}
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell className="py-1 text-xs font-medium" colSpan={3}>
          {providerName}
        </TableCell>
      </TableRow>
      {group.map((row) => {
        const member = memberOf(row);
        return (
          // The row is the target, and the checkbox in it is the state the row
          // carries rather than a control of its own: its click is kept from
          // reaching the row, or one click would toggle the member twice and
          // cancel itself out.
          <TableRow
            aria-disabled={isDisabled || undefined}
            // The fieldset disables the checkbox, not the row. A frozen row
            // drops its own hover tint and pointer cursor so it cannot read as
            // clickable; the disabled pair must be spelled out because the
            // table's base row carries `hover:bg-muted/50` of its own, and
            // tailwind-merge resolves that conflict in favor of the later one.
            className={cn(
              "hover:bg-muted cursor-pointer",
              isDisabled && "cursor-default hover:bg-transparent",
            )}
            key={memberKey(member)}
            onClick={isDisabled ? undefined : () => onToggle(member)}
          >
            <TableCell className="p-1 pl-2">
              <Checkbox
                aria-label={`${providerName} · ${row.model.id}`}
                checked={isMember(members, member)}
                onCheckedChange={() => onToggle(member)}
                onClick={(event) => event.stopPropagation()}
              />
            </TableCell>
            <TableCell className="min-w-0 truncate text-sm">
              {modelDisplayName(row.model)}
            </TableCell>
            <TableCell className="text-muted-foreground min-w-0 truncate font-mono text-xs">
              {row.model.id}
            </TableCell>
          </TableRow>
        );
      })}
      {group.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            className="text-muted-foreground py-1 text-center text-xs"
            colSpan={3}
          >
            {t("settings.models.noResults")}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** The member pin one candidate row stands for. */
function memberOf(row: AggregateRow): UnifiedMember {
  return { model: row.model.id, providerId: row.provider.id };
}

function MemberOrderTable({
  members,
  onChange,
  providers,
}: {
  members: UnifiedMember[];
  onChange: (members: UnifiedMember[]) => void;
  providers: ProviderListItem[];
}) {
  const { t } = useTranslation();
  // The row being dragged, and the row it would land on. The pointer is
  // captured by the grip, so the move is tracked on the grip while the target
  // is resolved from the point under the pointer: a captured pointer sends
  // every move to the grip, and no other row would see one.
  const fromRef = useRef<null | number>(null);
  const [from, setFrom] = useState<null | number>(null);
  const [to, setTo] = useState<null | number>(null);

  function handlePointerDown(index: number, event: ReactPointerEvent): void {
    // The drag sweeps the pointer across the row's text, so the selection
    // anchor it would otherwise extend is dropped before it is set.
    event.preventDefault();
    document.getSelection()?.removeAllRanges();
    event.currentTarget.setPointerCapture(event.pointerId);
    fromRef.current = index;
    setFrom(index);
    setTo(index);
  }

  function handlePointerMove(event: ReactPointerEvent): void {
    if (fromRef.current === null) {
      return;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const index = element
      ?.closest("[data-member-row]")
      ?.getAttribute("data-member-row");
    if (index !== null && index !== undefined) {
      setTo(Number(index));
    }
  }

  /** Ends the drag on every path out of it: capture released, state dropped. */
  function releaseDrag(event: ReactPointerEvent): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    fromRef.current = null;
    setFrom(null);
    setTo(null);
  }

  function handlePointerUp(event: ReactPointerEvent): void {
    const start = fromRef.current;
    const end = to;
    releaseDrag(event);
    if (start === null || end === null || start === end) {
      return;
    }
    onChange(moveMemberTo(members, start, end));
  }

  return (
    <DataTablePanel
      columns={MEMBER_COLUMNS}
      header={
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>
              <span className="sr-only">{t("settings.models.dragMember")}</span>
            </TableHead>
            <TableHead className="text-center">
              {t("settings.providers.modelIndex")}
            </TableHead>
            <TableHead>{t("settings.models.member")}</TableHead>
            <TableHead className="text-center">{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
      }
    >
      <TableBody>
        {members.map((member, index) => {
          const parts = unifiedMemberParts(member, providers);
          const isDragging = from === index;
          const dropEdge =
            isDragging || to !== index || from === null
              ? null
              : from > index
                ? "before"
                : "after";
          return (
            <TableRow
              // The landing line is drawn on the cells: WebKit paints no
              // box-shadow on a table-row box, so a line on the row itself
              // would never show.
              className={
                isDragging
                  ? "bg-muted opacity-60"
                  : dropEdge === "before"
                    ? "[&_td]:shadow-[inset_0_2px_0_0_var(--primary)]"
                    : dropEdge === "after"
                      ? "[&_td]:shadow-[inset_0_-2px_0_0_var(--primary)]"
                      : undefined
              }
              data-member-row={index}
              key={memberKey(member)}
            >
              <TableCell className="p-0">
                <div className="flex justify-center">
                  <button
                    aria-label={t("settings.models.dragMember")}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-6 cursor-grab touch-none items-center justify-center rounded-[4px] outline-none focus-visible:ring-3 active:cursor-grabbing"
                    onPointerCancel={releaseDrag}
                    onPointerDown={(event) => handlePointerDown(index, event)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    type="button"
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
                {index + 1}
              </TableCell>
              <TableCell className="min-w-0">
                {/* The provider badge sits on the name's right, not on the
                    column's: it qualifies the model it stands next to, and at
                    the far edge it reads as a column of its own. */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm">
                    {parts.model}
                  </span>
                  <Badge className="shrink-0" variant="secondary">
                    {parts.provider}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="p-1">
                <div className="flex items-center justify-center gap-0.5">
                  <IconButton
                    aria-label={t("settings.models.moveUp")}
                    disabled={index === 0}
                    onClick={() => onChange(moveMember(members, index, -1))}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronUp className="size-3" />
                  </IconButton>
                  <IconButton
                    aria-label={t("settings.models.moveDown")}
                    disabled={index === members.length - 1}
                    onClick={() => onChange(moveMember(members, index, 1))}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDown className="size-3" />
                  </IconButton>
                  <IconButton
                    aria-label={t("settings.models.removeMember")}
                    onClick={() => onChange(removeMember(members, index))}
                    size="icon-xs"
                    type="button"
                    variant="destructive"
                  >
                    <X className="size-3" />
                  </IconButton>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {members.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="text-muted-foreground py-6 text-center text-sm"
              colSpan={4}
            >
              {t("settings.models.membersEmpty")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </DataTablePanel>
  );
}

/** One filterable value per protocol family, counting the models that answer it. */
function protocolOptionsOf(
  candidates: ReturnType<typeof unifiedCandidateRows>,
  t: (key: string) => string,
): FacetedFilterOption[] {
  const counts = new Map<string, number>();
  for (const row of candidates) {
    for (const api of row.model.apis ?? []) {
      counts.set(api, (counts.get(api) ?? 0) + 1);
    }
  }
  return protocolFamilySchema.options.map((family) => ({
    count: counts.get(family) ?? 0,
    icon: <ProtocolIcon family={family} />,
    label: t(`settings.providers.protocolsShort.${family}`),
    value: family,
  }));
}

/** One filterable value per provider that offers a candidate. */
function providerOptionsOf(
  candidates: ReturnType<typeof unifiedCandidateRows>,
  presets: ProviderPreset[],
): FacetedFilterOption[] {
  const counts = new Map<string, number>();
  const owners = new Map<string, Provider>();
  for (const row of candidates) {
    counts.set(row.provider.id, (counts.get(row.provider.id) ?? 0) + 1);
    owners.set(row.provider.id, row.provider);
  }
  return [...owners].map(([value, provider]) => ({
    count: counts.get(value) ?? 0,
    icon: (
      <VendorIcon presetId={presetIdForBaseUrl(provider.baseUrl, presets)} />
    ),
    label: provider.name,
    value,
  }));
}
