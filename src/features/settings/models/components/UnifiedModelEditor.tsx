import { ChevronDown, ChevronLeft, ChevronUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ProviderListItem,
  UnifiedMember,
  UnifiedModel,
  UnifiedModelDraft,
} from "@/types/ipc";

import { FacetedFilter } from "@/components/common/FacetedFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useCreateUnifiedModel,
  useUpdateUnifiedModel,
} from "@/hooks/use-providers";
import { isDeepEqual } from "@/lib/deep-equal";
import {
  aggregateRowLabel,
  matchesModelFilters,
  sectionRows,
  unifiedCandidateRows,
  unifiedMemberLabel,
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
  removeMember,
} from "../unified-draft";

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
 * questions, so they get two panes side by side: the left arranges the order
 * the members are attempted in, the right picks which models belong. Both
 * panes fill the height left under the form, because a candidate list is only
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
  const sections = useMemo(() => sectionRows(candidates), [candidates]);

  const providerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const names = new Map<string, string>();
    for (const row of allCandidates) {
      counts.set(row.provider.id, (counts.get(row.provider.id) ?? 0) + 1);
      names.set(row.provider.id, row.provider.name);
    }
    return [...names].map(([value, label]) => ({
      count: counts.get(value) ?? 0,
      label,
      value,
    }));
  }, [allCandidates]);

  const protocolOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allCandidates) {
      for (const api of row.model.apis ?? []) {
        counts.set(api, (counts.get(api) ?? 0) + 1);
      }
    }
    return protocolFamilySchema.options.map((family) => ({
      count: counts.get(family) ?? 0,
      label: t(`settings.providers.protocolsShort.${family}`),
      value: family,
    }));
  }, [allCandidates, t]);

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

  const errorText = isRefused
    ? t("errors.invalid_input")
    : writeError !== null
      ? t(`errors.${writeError.code}`)
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-10 pb-6">
      {guard.isBlocked && (
        <DirtyNotice onCancel={guard.cancel} onConfirm={guard.confirm} />
      )}
      <fieldset
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        disabled={isSaving}
      >
        <div className="flex shrink-0 items-center gap-3 py-2">
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

        <div className="grid min-h-0 flex-1 gap-4 pt-4 md:grid-cols-2">
          {/* Both panes run heading, toolbar, list box, so the two boxes start
            and end on the same line: a transfer control reads as one control
            only while its halves are level. */}
          <section className="flex min-h-0 min-w-0 flex-col gap-1.5">
            <div className="flex h-8 items-center gap-2">
              {areMembersChanged && (
                <RevertButton
                  onRevert={() => setMembers(initial?.members ?? [])}
                />
              )}
              <h3 className="text-sm">{t("settings.models.memberOrder")}</h3>
            </div>
            <div className="text-muted-foreground flex h-8 items-center text-xs tabular-nums">
              {t("settings.models.count", { count: members.length })}
            </div>
            <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto rounded-[6px] border p-1">
              <ol>
                {members.map((member, index) => (
                  <li
                    className="hover:bg-muted/50 flex h-8 min-w-0 items-center gap-1.5 rounded-[4px] px-1.5"
                    key={memberKey(member)}
                  >
                    <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {unifiedMemberLabel(member, providers)}
                    </span>
                    <Button
                      aria-label={t("settings.models.moveUp")}
                      disabled={index === 0}
                      onClick={() =>
                        setMembers((current) => moveMember(current, index, -1))
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronUp className="size-3" />
                    </Button>
                    <Button
                      aria-label={t("settings.models.moveDown")}
                      disabled={index === members.length - 1}
                      onClick={() =>
                        setMembers((current) => moveMember(current, index, 1))
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronDown className="size-3" />
                    </Button>
                    <Button
                      aria-label={t("settings.models.removeMember")}
                      onClick={() =>
                        setMembers((current) => removeMember(current, index))
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-3" />
                    </Button>
                  </li>
                ))}
              </ol>
              {members.length === 0 && (
                <p className="text-muted-foreground px-1.5 py-2 text-xs">
                  {t("settings.models.membersEmpty")}
                </p>
              )}
            </div>
          </section>
          <section className="flex min-h-0 min-w-0 flex-col gap-1.5">
            <div className="flex h-8 items-center gap-2">
              <h3 className="text-sm">
                {t("settings.models.candidateMembers")}
              </h3>
            </div>
            <div className="flex h-8 min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1">
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
                title={t("settings.models.filterProvider")}
                values={providerIds}
              />
              <FacetedFilter
                onChange={setProtocols}
                options={protocolOptions}
                title={t("common.filterProtocol")}
                values={protocols}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto rounded-[6px] border p-1">
              {sections.map(({ provider, rows: group }) => (
                <div className="flex flex-col" key={provider.id}>
                  <p className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
                    {provider.name}
                  </p>
                  <ul>
                    {group.map((row) => {
                      const member: UnifiedMember = {
                        model: row.model.id,
                        providerId: row.provider.id,
                      };
                      return (
                        <li key={memberKey(member)}>
                          <label className="hover:bg-muted/50 flex h-8 min-w-0 cursor-default items-center gap-2 rounded-[4px] px-1.5">
                            <Checkbox
                              aria-label={aggregateRowLabel(row)}
                              checked={isMember(members, member)}
                              onCheckedChange={() => toggleMember(member)}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {row.model.id}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {candidates.length === 0 && (
                <p className="text-muted-foreground px-1.5 py-2 text-xs">
                  {t(
                    allCandidates.length === 0
                      ? "settings.models.noCandidates"
                      : "settings.models.noResults",
                  )}
                </p>
              )}
            </div>
          </section>
        </div>
        {/* The footer holds the page's bottom: the panes above it are what
          scroll, so the way out of the editor is always where the eye
          expects it. */}
        <div className="flex shrink-0 items-center gap-3 pt-3 pb-3">
          <p
            className="text-destructive min-w-0 flex-1 truncate text-sm"
            role="alert"
          >
            {errorText}
          </p>
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
      </fieldset>
    </div>
  );
}
