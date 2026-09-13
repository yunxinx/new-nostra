import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { ModelEntry, Provider } from "@/types/ipc";

import { FloatingPanel } from "@/components/common/FloatingPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { modelDisplayName } from "@/lib/model-catalog";

import { compatFamiliesFor } from "../../components/compat/compat-fields";
import { formatJsonValue } from "../../components/compat/compat-values";
import { CompatResolutionNotice } from "../../components/compat/CompatResolutionNotice";
import { CompatSourceBadge } from "../../components/compat/CompatSourceBadge";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import { providerToDraft } from "../../providers/draft";
import { formatRate, priceSummary } from "../model-pricing";

interface ModelCardPanelProps {
  model: ModelEntry;
  onClose: () => void;
  provider: Provider;
}

/**
 * Everything one model is, read-only and in one place: the summary a row
 * cannot carry without becoming unreadable. It exists because the numbers a
 * choice depends on — what it costs, how much it takes, which protocols it
 * answers on — live on four different tabs of the editor, and seeing them
 * together is the whole point.
 */
export function ModelCardPanel({
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

  return (
    <FloatingPanel
      footer={
        <Button onClick={onClose} size="sm" type="button" variant="outline">
          {t("common.close")}
        </Button>
      }
      onClose={onClose}
      size="card"
      subtitle={provider.name}
      title={modelDisplayName(model)}
    >
      <div aria-busy={resolved.isLoading} className="flex flex-col gap-4">
        <CompatResolutionNotice resolution={resolved} />
        <CardSection title={t("settings.providers.modelSections.identity")}>
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
              .map((modality) => t(`settings.providers.modalities.${modality}`))
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

        <CardSection title={t("settings.providers.modelSections.pricing")}>
          {summary === null ? (
            <p className="text-muted-foreground text-xs">
              {t("settings.models.noPrice")}
            </p>
          ) : (
            <>
              <RateGrid rates={summary.rates} />
              {summary.tiers.map((tier, index) => (
                <div className="flex flex-col gap-1" key={index}>
                  <p className="text-muted-foreground text-xs">
                    {t("settings.providers.costTierAbove")} {tier.threshold}
                  </p>
                  <RateGrid rates={tier.rates} />
                </div>
              ))}
              {summary.peak !== undefined && (
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground text-xs">
                    {t("settings.providers.modelCostPeak")}
                  </p>
                  <RateGrid rates={summary.peak} />
                </div>
              )}
            </>
          )}
        </CardSection>

        {families.map((family) => {
          const values = resolved.data[family]?.values ?? {};
          if (Object.keys(values).length === 0) {
            return null;
          }
          return (
            <CardSection
              key={family}
              title={t(`settings.providers.protocols.${family}`)}
            >
              <div className="flex flex-col gap-1">
                {Object.entries(values).map(([field, value]) => {
                  const source = (resolved.data[family]?.sources ?? {})[field];
                  return (
                    <div className="flex items-center gap-2" key={field}>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {t(`settings.providers.compatFields.${field}`, {
                          defaultValue: field,
                        })}
                      </span>
                      <span className="max-w-40 shrink-0 truncate font-mono text-xs">
                        {formatJsonValue(value)}
                      </span>
                      {source !== undefined && (
                        <CompatSourceBadge source={source} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardSection>
          );
        })}
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
      <h3 className="text-muted-foreground text-xs font-medium select-none">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** One labelled value; an empty one reads as the dash rather than as nothing. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-baseline gap-2">
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      <span className="truncate text-sm">
        {value === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function RateGrid({ rates }: { rates: Array<{ key: string; value: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
      {rates.map((rate) => (
        <Badge className="font-normal" key={rate.key} variant="outline">
          {t(`settings.providers.${rate.key}`)} {formatRate(rate.value)}
        </Badge>
      ))}
    </div>
  );
}
