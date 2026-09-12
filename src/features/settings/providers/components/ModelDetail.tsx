import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  InputModality,
  JsonValue,
  ModelEntry,
  ProviderDraft,
} from "@/types/ipc";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changedValueCount, restoreField } from "@/lib/draft-values";

import type { ProtocolFamily } from "../../components/compat/compat-fields";
import type { ModelRowErrors } from "../draft";

import { compatFamiliesFor } from "../../components/compat/compat-fields";
import {
  overrideRecord,
  storedBuckets,
  withCompatOverride,
} from "../../components/compat/compat-values";
import { CompatSection } from "../../components/compat/CompatSection";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import { SettingsRow } from "../../components/SettingsRow";
import {
  BLANK_MODEL_ENTRY,
  hasFieldError,
  optionalText,
  patchModel,
  toggleModality,
  withModelValue,
} from "../model-rows";
import { HeadersEditor } from "./HeadersEditor";
import { ModelCostEditor } from "./ModelCostEditor";
import { ModelNumberField } from "./ModelNumberField";
import { ModelSamplingParams } from "./ModelSamplingParams";
import { ModelThinkingLevels } from "./ModelThinkingLevels";

const MODALITIES: readonly InputModality[] = ["text", "image"];

const SECTIONS = ["identity", "capability", "pricing", "compat"] as const;

// One width for the identity fields, sized by the base-URL override, the
// longest value they take, so the column of controls ends on one line.
const FIELD_WIDTH = "w-72 max-w-full";

interface ModelDetailProps {
  baseline?: ModelEntry | undefined;
  /**
   * `pane` fills a page of its own and carries the way back to the list;
   * `panel` sits inside a floating panel, which owns the title and the way
   * out, so the pane's own header would only repeat them.
   */
  chrome?: "pane" | "panel";
  errors: ModelRowErrors | undefined;
  model: ModelEntry;
  onBack: () => void;
  onChange: (model: ModelEntry) => void;
  /** The provider draft this model's compat merge resolves against. */
  provider: ProviderDraft;
}

// One model of the directory, opened from its row. It is a child of the
// provider's model section rather than a section of its own, so it keeps the
// directory's back path and saves with the provider document; the four
// subsections are the four questions a model answers — who it is, what it can
// do, what it costs, and how its protocol has to be bent.
export function ModelDetail({
  baseline = BLANK_MODEL_ENTRY,
  chrome = "pane",
  errors,
  model,
  onBack,
  onChange,
  provider,
}: ModelDetailProps) {
  const { t } = useTranslation();
  const [restored, setRestored] = useState<
    Partial<Record<keyof ModelEntry, number>>
  >({});
  function revertFor(field: keyof ModelEntry): (() => void) | undefined {
    if (changedValueCount(baseline[field], model[field]) === 0)
      return undefined;
    return () => {
      onChange(restoreField(model, baseline, field));
      setRestored((current) => ({
        ...current,
        [field]: (current[field] ?? 0) + 1,
      }));
    };
  }
  const [section, setSection] = useState<string>(SECTIONS[0]);
  const [requestedFamily, setRequestedFamily] = useState<null | string>(null);
  const sectionIndex = Math.max(
    0,
    SECTIONS.findIndex((entry) => entry === section),
  );
  const label =
    model.id === "" ? t("settings.providers.modelUntitled") : model.id;

  // The model's own protocols scope the compat sections; the provider default
  // stands in while the row has checked none, matching the merge the request
  // layer performs.
  const families = useMemo(
    () => compatFamiliesFor(provider.api, [model]),
    [model, provider.api],
  );
  const input = useMemo(() => ({ model, provider }), [model, provider]);
  const resolved = useCompatResolution(families, input);
  // The family whose compat is being edited. The compat strip sits under the
  // section strip rather than beside the fields, so the protocol is picked
  // where the section was picked and the fields keep the pane's full width.
  const activeFamily =
    families.find((family) => family === requestedFamily) ?? families[0];
  const familyIndex = Math.max(
    0,
    families.findIndex((family) => family === activeFamily),
  );

  function handleCompatChange(
    family: ProtocolFamily,
    field: string,
    value: JsonValue | null,
  ): void {
    onChange(
      withModelValue(
        model,
        "compat",
        storedBuckets(withCompatOverride(model.compat, family, field, value)),
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={setSection}
        value={section}
      >
        {/* One row: the way back, the model it is about, and the sections it
            holds, so the strip costs no line of its own. */}
        <div className="flex shrink-0 items-center gap-3 py-2">
          {chrome === "pane" && (
            <Button onClick={onBack} size="sm" type="button" variant="outline">
              <ChevronLeft className="size-3.5" />
              {t("settings.providers.models")}
            </Button>
          )}
          {/* The chip is the pane's title, so it carries the weight and the
              height of the button beside it: a shorter, rounder chip reads as
              a tag on the row rather than as the name of what is being
              edited. A panel names itself and leaves the chip out. */}
          {chrome === "pane" && (
            <Badge
              className="h-7 min-w-0 shrink truncate rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-normal"
              variant="secondary"
            >
              {label}
            </Badge>
          )}
          <TabsList
            className="ml-auto shrink-0"
            segmentCount={SECTIONS.length}
            segmentIndex={sectionIndex}
          >
            {SECTIONS.map((entry) => (
              <TabsTrigger key={entry} value={entry}>
                {t(`settings.providers.modelSections.${entry}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent
          className="min-h-0 flex-1 overflow-x-clip overflow-y-auto pt-2"
          value="identity"
        >
          <SettingsRow
            info={t("settings.providers.modelIdDesc")}
            isInvalid={errors?.id !== undefined}
            label={t("settings.providers.modelId")}
            onRevert={revertFor("id")}
          >
            <Input
              aria-label={t("settings.providers.modelId")}
              className={FIELD_WIDTH}
              onChange={(event) =>
                onChange(patchModel(model, { id: event.target.value }))
              }
              value={model.id}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelNameDesc")}
            isInvalid={errors?.name !== undefined}
            label={t("settings.providers.modelName")}
            onRevert={revertFor("name")}
          >
            <Input
              aria-label={t("settings.providers.modelName")}
              className={FIELD_WIDTH}
              onChange={(event) =>
                onChange(
                  withModelValue(
                    model,
                    "name",
                    optionalText(event.target.value),
                  ),
                )
              }
              value={model.name ?? ""}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelBaseUrlDesc")}
            isInvalid={errors?.baseUrl !== undefined}
            label={t("settings.providers.modelBaseUrl")}
            onRevert={revertFor("baseUrl")}
          >
            <Input
              aria-label={t("settings.providers.modelBaseUrl")}
              className={FIELD_WIDTH}
              onChange={(event) =>
                onChange(
                  withModelValue(
                    model,
                    "baseUrl",
                    optionalText(event.target.value),
                  ),
                )
              }
              value={model.baseUrl ?? ""}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelHeadersDesc")}
            isInvalid={hasFieldError(errors?.headers)}
            label={t("settings.providers.modelHeaders")}
            layout="stacked"
            onRevert={revertFor("headers")}
          >
            <HeadersEditor
              key={restored.headers ?? 0}
              onChange={(headers) =>
                onChange(
                  withModelValue(
                    model,
                    "headers",
                    Object.keys(headers).length > 0 ? headers : undefined,
                  ),
                )
              }
              value={model.headers}
            />
          </SettingsRow>
        </TabsContent>
        <TabsContent
          className="min-h-0 flex-1 overflow-x-clip overflow-y-auto pt-2"
          value="capability"
        >
          <SettingsRow
            info={t("settings.providers.modelReasoningDesc")}
            label={t("settings.providers.modelReasoning")}
            onRevert={revertFor("reasoning")}
          >
            <Switch
              aria-label={t("settings.providers.modelReasoning")}
              checked={model.reasoning}
              onCheckedChange={(checked) =>
                onChange(patchModel(model, { reasoning: checked }))
              }
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelInputDesc")}
            isInvalid={hasFieldError(errors?.input)}
            label={t("settings.providers.modelInput")}
            onRevert={revertFor("input")}
          >
            <div className="flex items-center gap-4">
              {MODALITIES.map((modality) => (
                <label className="flex items-center gap-1.5" key={modality}>
                  <Checkbox
                    checked={(model.input ?? []).includes(modality)}
                    onCheckedChange={() =>
                      onChange(toggleModality(model, modality))
                    }
                  />
                  <span className="text-sm">
                    {t(`settings.providers.modalities.${modality}`)}
                  </span>
                </label>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelContextWindowDesc")}
            isInvalid={errors?.contextWindow !== undefined}
            label={t("settings.providers.modelContextWindow")}
            onRevert={revertFor("contextWindow")}
          >
            <ModelNumberField
              ariaLabel={t("settings.providers.modelContextWindow")}
              className="w-32 tabular-nums"
              key={restored.contextWindow ?? 0}
              onChange={(contextWindow) =>
                onChange(withModelValue(model, "contextWindow", contextWindow))
              }
              value={model.contextWindow}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelMaxTokensDesc")}
            isInvalid={errors?.maxTokens !== undefined}
            label={t("settings.providers.modelMaxTokens")}
            onRevert={revertFor("maxTokens")}
          >
            <ModelNumberField
              ariaLabel={t("settings.providers.modelMaxTokens")}
              className="w-32 tabular-nums"
              key={restored.maxTokens ?? 0}
              onChange={(maxTokens) =>
                onChange(withModelValue(model, "maxTokens", maxTokens))
              }
              value={model.maxTokens}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelThinkingLevelsDesc")}
            isInvalid={hasFieldError(errors?.thinkingLevelMap)}
            label={t("settings.providers.modelThinkingLevels")}
            onRevert={revertFor("thinkingLevelMap")}
          >
            <ModelThinkingLevels
              baseline={baseline}
              model={model}
              onChange={onChange}
            />
          </SettingsRow>
          <SettingsRow
            info={t("settings.providers.modelSamplingParamsDesc")}
            isInvalid={hasFieldError(errors?.samplingParams)}
            label={t("settings.providers.modelSamplingParams")}
            layout="stacked"
            onRevert={revertFor("samplingParams")}
          >
            <ModelSamplingParams
              key={restored.samplingParams ?? 0}
              onChange={(samplingParams) =>
                onChange(
                  withModelValue(model, "samplingParams", samplingParams),
                )
              }
              value={model.samplingParams}
            />
          </SettingsRow>
        </TabsContent>
        <TabsContent
          className="min-h-0 flex-1 overflow-x-clip overflow-y-auto pt-4"
          value="pricing"
        >
          <ModelCostEditor
            baseline={baseline.cost}
            onChange={(cost) => onChange(withModelValue(model, "cost", cost))}
            value={model.cost}
          />
          {/* The price editor is a block, not a settings row, so the rejection
              its fields carry needs a line of its own. */}
          {hasFieldError(errors?.cost) && (
            <p className="text-destructive pt-3 text-xs" role="alert">
              {t("errors.invalid_input")}
            </p>
          )}
        </TabsContent>
        <TabsContent
          className="flex min-h-0 flex-1 flex-col pt-4"
          value="compat"
        >
          {activeFamily !== undefined && (
            <Tabs
              className="min-h-0 flex-1 gap-0"
              onValueChange={setRequestedFamily}
              value={activeFamily}
            >
              <TabsList
                className="shrink-0"
                segmentCount={families.length}
                segmentIndex={familyIndex}
              >
                {families.map((family) => (
                  <TabsTrigger key={family} value={family}>
                    {t(`settings.providers.protocolsShort.${family}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent
                className="min-h-0 flex-1 overflow-x-clip overflow-y-auto pt-2"
                value={activeFamily}
              >
                <CompatSection
                  baseline={overrideRecord(baseline.compat?.[activeFamily])}
                  bucket={overrideRecord(model.compat?.[activeFamily])}
                  family={activeFamily}
                  layerSource="model"
                  onFieldChange={(field, value) =>
                    handleCompatChange(activeFamily, field, value)
                  }
                  showHeading={false}
                  sources={resolved[activeFamily]?.sources ?? {}}
                  values={resolved[activeFamily]?.values ?? {}}
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
