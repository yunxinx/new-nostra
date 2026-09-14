import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type {
  JsonValue,
  ModelEntry,
  Provider,
  ResolvedCompat,
} from "@/types/ipc";

import { FloatingPanel } from "@/components/common/FloatingPanel";
import { Badge } from "@/components/ui/badge";
import { modelDisplayName } from "@/lib/model-catalog";

import { compatFamiliesFor } from "../../components/compat/compat-fields";
import { CompatResolutionNotice } from "../../components/compat/CompatResolutionNotice";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import { providerToDraft } from "../../providers/draft";
import { formatRate, priceSummary } from "../model-pricing";
import { ProtocolBadge } from "./ProtocolBadge";

/** One compat setting as the card names it; a switch carries no value. */
interface CompatSetting {
  field: string;
  value: JsonValue;
}

interface ModelCardPanelProps {
  anchor: HTMLElement;
  model: ModelEntry;
  onClose: () => void;
  provider: Provider;
}

/**
 * Everything one model is, read-only and in one place: the summary a row
 * cannot carry without becoming unreadable. It exists because the numbers a
 * choice depends on — what it costs, how much it takes, which protocols it
 * answers on — live on four different tabs of the editor, and seeing them
 * together is the whole point. What a card leaves out is what a protocol
 * already does by itself: only settings someone made are named.
 */
export function ModelCardPanel({
  anchor,
  model,
  onClose,
  provider,
}: ModelCardPanelProps) {
  const { t } = useTranslation();
  const providerDraft = useMemo(() => providerToDraft(provider), [provider]);
  const input = useMemo(
    () => ({ model, provider: providerDraft }),
    [model, providerDraft],
  );
  const families = useMemo(
    () => compatFamiliesFor(providerDraft.api, [model]),
    [model, providerDraft.api],
  );
  const resolved = useCompatResolution(families, input);
  const summary = priceSummary(model.cost);

  if (resolved.isInitialLoading) return null;

  return (
    <FloatingPanel
      anchor={anchor}
      dismissOnOutsidePress
      onClose={onClose}
      size="card"
      title={modelDisplayName(model)}
      titleBadge={<Badge variant="secondary">{provider.name}</Badge>}
    >
      <div aria-busy={resolved.isLoading} className="flex flex-col gap-4">
        <CompatResolutionNotice resolution={resolved} />
        {/* Identity and capability are read together — whose model it is, what
            it takes — so they share a line rather than making the card two
            screens tall. */}
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <CardSection title={t("settings.providers.modelSections.identity")}>
            <Fact label={t("settings.models.provider")} value={provider.name} />
            <Fact label={t("settings.providers.modelId")} value={model.id} />
            <Fact
              label={t("settings.providers.modelName")}
              value={model.name ?? ""}
            />
            <Fact
              label={t("settings.providers.modelBaseUrl")}
              value={model.baseUrl ?? ""}
            />
          </CardSection>

          <CardSection title={t("settings.providers.modelSections.capability")}>
            <Fact
              label={t("settings.providers.modelReasoning")}
              value={t(
                model.reasoning ? "settings.models.yes" : "settings.models.no",
              )}
            />
            <Fact
              label={t("settings.providers.modelInput")}
              value={(model.input ?? [])
                .map((modality) =>
                  t(`settings.providers.modalities.${modality}`),
                )
                .join(", ")}
            />
            <Fact
              label={t("settings.providers.modelContextWindow")}
              value={model.contextWindow?.toLocaleString() ?? ""}
            />
            <Fact
              label={t("settings.providers.modelMaxTokens")}
              value={model.maxTokens?.toLocaleString() ?? ""}
            />
          </CardSection>
        </div>

        <CardSection title={t("settings.providers.modelSections.pricing")}>
          {summary === null ? (
            <p className="text-muted-foreground text-xs">
              {t("settings.models.noPrice")}
            </p>
          ) : (
            <>
              <RateGrid rates={summary.rates} />
              {summary.tiers.map((tier, index) => (
                <div className="flex flex-col gap-1.5" key={index}>
                  <CostLabel>
                    {t("settings.providers.costTierAbove")} {tier.threshold}
                  </CostLabel>
                  <RateGrid rates={tier.rates} />
                </div>
              ))}
              {summary.peak !== undefined && (
                <div className="flex flex-col gap-1.5">
                  <CostLabel>{t("settings.providers.modelCostPeak")}</CostLabel>
                  <RateGrid rates={summary.peak} />
                </div>
              )}
            </>
          )}
        </CardSection>

        <CardSection title={t("settings.models.protocols")}>
          {families.map((family) => {
            const settings = configuredCompat(resolved.data[family]);
            return (
              <div className="flex flex-col gap-1.5" key={family}>
                <ProtocolBadge
                  family={family}
                  label={t(`settings.providers.protocols.${family}`, {
                    defaultValue: family,
                  })}
                />
                {settings.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("settings.models.noCompatOverrides")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {settings.map((setting) => (
                      <CompatBadge key={setting.field} setting={setting} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardSection>
      </div>
    </FloatingPanel>
  );
}

/** One block of the card. */
function CardSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium select-none">{title}</h3>
      {children}
    </section>
  );
}

/** One compat value as a badge shows it: the scalar itself, anything else compact JSON. */
function compactValue(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * One configured compat setting: a switch someone turned on is a state rather
 * than a value, so it is named in the colour that means "on" and says nothing
 * more, while a field someone filled carries the value it holds.
 */
function CompatBadge({ setting }: { setting: CompatSetting }) {
  const { t } = useTranslation();
  const label = t(`settings.providers.compatFields.${setting.field}`, {
    defaultValue: setting.field,
  });
  if (setting.value === true) {
    return <Badge variant="success">{label}</Badge>;
  }
  return (
    <Badge className="font-normal" variant="outline">
      {label}
      <span className="text-muted-foreground font-mono">
        {compactValue(setting.value)}
      </span>
    </Badge>
  );
}

/**
 * The compat settings one family shows on a card: a switch only while it is
 * on, any other field only while it holds something someone set. What a
 * protocol already does by itself — an off switch, an unset field, a value
 * the family's own defaults supply — is not a property of this model, and
 * naming it would bury the settings that are.
 */
function configuredCompat(
  resolution: ResolvedCompat | undefined,
): CompatSetting[] {
  const values = resolution?.values ?? {};
  const sources = resolution?.sources ?? {};
  return Object.entries(values)
    .filter(([field, value]) => {
      if (sources[field] === "familyDefault") {
        return false;
      }
      if (typeof value === "boolean") {
        return value;
      }
      return hasContent(value);
    })
    .map(([field, value]) => ({ field, value }));
}

/**
 * The condition a price block is priced under — the tier it starts at, the
 * hours it applies to — as a chip on the block's own line, so it reads as a
 * heading over the rates that follow rather than as one of them.
 */
function CostLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-secondary text-secondary-foreground self-start rounded-[4px] px-1.5 py-0.5 text-xs font-medium">
      {children}
    </p>
  );
}

/** One labelled value; an empty one reads as the dash rather than as nothing. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2">
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      {/* A URL has no spaces to break at, so the value wraps anywhere rather
          than losing its tail to a column this narrow. */}
      <span className="text-sm break-all">
        {value === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function hasContent(value: JsonValue | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return true;
}

/**
 * One price block: each rate is named on the line and priced in a badge of its
 * own, two to a row, so four rates read as one small table instead of a wall
 * of badges.
 */
function RateGrid({ rates }: { rates: Array<{ key: string; value: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
      {rates.map((rate) => (
        <div
          className="flex min-w-0 items-center justify-between gap-2"
          key={rate.key}
        >
          <span className="text-muted-foreground truncate text-xs">
            {t(`settings.providers.${rate.key}`)}
          </span>
          <Badge
            className="font-mono font-normal tabular-nums"
            variant="outline"
          >
            {formatRate(rate.value)}
          </Badge>
        </div>
      ))}
    </div>
  );
}
