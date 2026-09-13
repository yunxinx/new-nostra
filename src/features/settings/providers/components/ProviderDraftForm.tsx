import type { SubmitEvent } from "react";

import { cn } from "cn";
import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useFormState, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import type { ProviderDraft } from "@/types/ipc";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PROTOCOL_FAMILIES } from "@/lib/protocols";

import type { ProviderDraftController } from "../use-provider-draft";

import {
  hasCustomCompat,
  hasInvalidCompatInputs,
  restoreCompatDefaults,
} from "../../components/compat/compat-draft";
import { compatFamiliesFor } from "../../components/compat/compat-fields";
import { storedBuckets } from "../../components/compat/compat-values";
import { useCompatResolution } from "../../components/compat/use-compat-resolution";
import { SettingsRow } from "../../components/SettingsRow";
import { protocolFamilySchema } from "../../schemas/compat";
import { BLANK_PROVIDER_DRAFT, type ProviderDraftField } from "../draft";
import { DeleteProviderButton } from "./DeleteProviderButton";
import { HeadersEditor } from "./HeadersEditor";
import { ModelDetail } from "./ModelDetail";
import { ModelDirectory } from "./ModelDirectory";
import { ProviderCompatPanel } from "./ProviderCompatPanel";
import { SecondsField } from "./SecondsField";

const REASONING_MODES = ["auto", "always", "off"] as const;

// Two field widths for the general section: the wider one for the fields that
// hold text or a choice, sized by the endpoint, which is the longest value
// they take; the narrower one for the fields that hold a number, sized by the
// duration field. A section reads as one column only while its controls start
// and end on the same pair of lines.
const FIELD_WIDTH = "w-80 max-w-full";
const NUMBER_WIDTH = "w-32 max-w-full";

// Fields the general section holds; a validation error in any of them is what
// puts the marker on that section's tab.
const GENERAL_FIELDS = [
  "abortOnDisconnect",
  "api",
  "apiKey",
  "baseUrl",
  "headers",
  "maxRetries",
  "name",
  "reasoningOutput",
  "requestTimeoutMs",
  "streamIdleTimeoutMs",
] as const;

const SECTIONS = ["general", "models", "advanced"] as const;

interface ProviderDraftFormProps {
  controller: ProviderDraftController;
}

// The draft form over one provider document: a plain save/reset surface with
// no per-keystroke writes. The document is split across three sections rather
// than one long scroll, because the model directory needs the pane's whole
// height and the compat panel would otherwise bury it. A section that hides a
// rejected field carries a marker, so nothing is refused out of sight.
//
// Its fields re-key on the controller's revision, so every re-baseline
// remounts them — the local row state inside the header editor resets with
// them — while the section and the open model live above that key and survive
// a save.
export function ProviderDraftForm({ controller }: ProviderDraftFormProps) {
  const { t } = useTranslation();
  const { control, register } = controller.form;
  // Same subscription rule as the controller's dirty flag: a render-time read
  // of the `formState` proxy is memoized by the React Compiler, so the resolver
  // errors would never reach the rows.
  const { errors } = useFormState({ control });
  // Subscribed rather than read once: a protocol picked after the directory
  // mounted is what the next added row must pre-check, and the compat panel
  // resolves against the values as they are typed.
  const api = useWatch({ control, name: "api" });
  const baseUrl = useWatch({ control, name: "baseUrl" });
  const compat = useWatch({ control, name: "compat" });
  const defaultsInput = useMemo(
    () => ({ provider: { ...BLANK_PROVIDER_DRAFT, baseUrl } }),
    [baseUrl],
  );
  const defaults = useCompatResolution(PROTOCOL_FAMILIES, defaultsInput);
  const presetId = Object.values(defaults.data).find(
    (resolution) => resolution.presetId !== undefined,
  )?.presetId;
  const canRestoreDefaults =
    hasInvalidCompatInputs(controller.compatInputs) ||
    hasCustomCompat(storedBuckets(compat), defaults.data);
  const [section, setSection] = useState<string>(SECTIONS[0]);
  const [requestedFamily, setRequestedFamily] = useState<null | string>(null);
  const [openModelKey, setOpenModelKey] = useState<null | string>(null);
  // The families the directory resolves against, and the one the advanced pane
  // shows. Both are decided here because the switcher that picks the family
  // shares this form's tab strip with the section switcher.
  const families = useMemo(
    () => compatFamiliesFor(api, controller.models),
    [api, controller.models],
  );
  const activeFamily =
    families.find((family) => family === requestedFamily) ?? families[0];
  const sectionIndex = Math.max(
    0,
    SECTIONS.findIndex((entry) => entry === section),
  );

  const target = controller.target;
  const revealLabel = t(
    controller.isKeyRevealed
      ? "settings.providers.hideKey"
      : "settings.providers.revealKey",
  );
  const openModelIndex = controller.modelRows.findIndex(
    (row) => row.key === openModelKey,
  );
  const openRow = controller.modelRows[openModelIndex];
  // The layers under a model's own overrides: the model editor resolves
  // against the draft as it stands, not against the stored row.
  const compatProvider = useMemo<ProviderDraft>(() => {
    const stored = storedBuckets(compat);
    return {
      ...BLANK_PROVIDER_DRAFT,
      api,
      baseUrl,
      ...(stored !== undefined && { compat: stored }),
    };
  }, [api, baseUrl, compat]);
  const invalidSections = {
    advanced:
      errors.compat !== undefined ||
      hasInvalidCompatInputs(controller.compatInputs),
    general: GENERAL_FIELDS.some((field) => errors[field] !== undefined),
    models:
      errors.models !== undefined ||
      controller.modelRows.some((row) =>
        hasInvalidCompatInputs(row.editor.compatInputs),
      ),
  };

  function handleSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    controller.save();
  }

  // One field's restore: the row shows it while its value has moved away from
  // the stored one, so the mark and the way back appear together.
  function revertOf(field: ProviderDraftField): { onRevert?: () => void } {
    return controller.changedFields.has(field)
      ? { onRevert: () => controller.revertField(field) }
      : {};
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={setSection}
        value={section}
      >
        {/* The pane starts at the section strip: the provider's name is the
            list's highlighted row and its form field, and the enabled switch
            lives on the list row, so neither is repeated here. The protocol
            switcher shares the row while Advanced is open — even for a single
            family, where it names the one being configured. One line, always:
            the switcher is the shrinking side, so a narrow pane truncates its
            labels instead of dropping it onto a second line. */}
        {/* The pane's 40px inset on both sides: the section panes below carry
            the same inset, so the strip's edges line up with theirs. */}
        <div className="flex shrink-0 items-center gap-x-3 pr-10 pb-3 pl-10">
          <TabsList
            className="shrink-0"
            segmentCount={SECTIONS.length}
            segmentIndex={sectionIndex}
          >
            {SECTIONS.map((tab) => (
              // The marker is decorative: the rejected field states its own
              // message through the row's alert, so the tab keeps its name
              // and only carries the invalid flag.
              <TabsTrigger
                aria-invalid={invalidSections[tab] || undefined}
                key={tab}
                value={tab}
              >
                {t(`settings.providers.sections.${tab}`)}
                {invalidSections[tab] && (
                  <span
                    aria-hidden="true"
                    className="bg-destructive size-1.5 shrink-0 rounded-full"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {section === "advanced" && activeFamily !== undefined && (
            <SegmentedControl
              className="ml-auto min-w-0"
              label={t("settings.providers.protocolTabs")}
              onValueChange={setRequestedFamily}
              options={families.map((family) => ({
                label: t(`settings.providers.protocolsShort.${family}`),
                value: family,
              }))}
              value={activeFamily}
            />
          )}
        </div>
        {/* The footer and the tab strip stay mounted: a re-key here must not
            drop the focus of the button that started the re-baseline, nor the
            section the user was reading. */}
        <div className="flex min-h-0 flex-1 flex-col" key={controller.revision}>
          <TabsContent
            className="min-h-0 flex-1 scrollbar-none overflow-x-clip overflow-y-auto px-10 pb-6"
            value="general"
          >
            <SettingsRow
              info={t("settings.providers.nameDesc")}
              isInvalid={errors.name !== undefined}
              label={t("settings.providers.name")}
              {...revertOf("name")}
            >
              <Input
                aria-label={t("settings.providers.name")}
                className={FIELD_WIDTH}
                {...register("name")}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.apiDesc")}
              isInvalid={errors.api !== undefined}
              label={t("settings.providers.api")}
              {...revertOf("api")}
            >
              <Controller
                control={control}
                name="api"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger
                      aria-label={t("settings.providers.api")}
                      className={FIELD_WIDTH}
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {protocolFamilySchema.options.map((family) => (
                        <SelectItem key={family} value={family}>
                          {t(`settings.providers.protocols.${family}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.baseUrlDesc")}
              isInvalid={errors.baseUrl !== undefined}
              label={t("settings.providers.baseUrl")}
              {...revertOf("baseUrl")}
            >
              <Input
                aria-label={t("settings.providers.baseUrl")}
                className={FIELD_WIDTH}
                {...register("baseUrl")}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.apiKeyDesc")}
              isInvalid={errors.apiKey !== undefined}
              label={t("settings.providers.apiKey")}
              {...revertOf("apiKey")}
            >
              <div className={cn("relative", FIELD_WIDTH)}>
                <Input
                  aria-label={t("settings.providers.apiKey")}
                  className="pr-8"
                  type={controller.isKeyRevealed ? "text" : "password"}
                  {...register("apiKey")}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={revealLabel}
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={controller.toggleKeyReveal}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      {controller.isKeyRevealed ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{revealLabel}</TooltipContent>
                </Tooltip>
              </div>
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.requestTimeoutDesc")}
              isInvalid={errors.requestTimeoutMs !== undefined}
              label={t("settings.providers.requestTimeout")}
              {...revertOf("requestTimeoutMs")}
            >
              <Controller
                control={control}
                name="requestTimeoutMs"
                render={({ field }) => (
                  <SecondsField
                    ariaLabel={t("settings.providers.requestTimeout")}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.streamIdleTimeoutDesc")}
              isInvalid={errors.streamIdleTimeoutMs !== undefined}
              label={t("settings.providers.streamIdleTimeout")}
              {...revertOf("streamIdleTimeoutMs")}
            >
              <Controller
                control={control}
                name="streamIdleTimeoutMs"
                render={({ field }) => (
                  <SecondsField
                    ariaLabel={t("settings.providers.streamIdleTimeout")}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.maxRetriesDesc")}
              isInvalid={errors.maxRetries !== undefined}
              label={t("settings.providers.maxRetries")}
              {...revertOf("maxRetries")}
            >
              <Input
                aria-label={t("settings.providers.maxRetries")}
                className={cn(NUMBER_WIDTH, "tabular-nums")}
                inputMode="numeric"
                {...register("maxRetries", { valueAsNumber: true })}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.abortOnDisconnectDesc")}
              label={t("settings.providers.abortOnDisconnect")}
              {...revertOf("abortOnDisconnect")}
            >
              <Controller
                control={control}
                name="abortOnDisconnect"
                render={({ field }) => (
                  <Switch
                    aria-label={t("settings.providers.abortOnDisconnect")}
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </SettingsRow>
            <SettingsRow
              info={t("settings.providers.reasoningOutputDesc")}
              isInvalid={errors.reasoningOutput !== undefined}
              label={t("settings.providers.reasoningOutput")}
              {...revertOf("reasoningOutput")}
            >
              <Controller
                control={control}
                name="reasoningOutput"
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <SelectTrigger
                      aria-label={t("settings.providers.reasoningOutput")}
                      className={FIELD_WIDTH}
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONING_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t(`settings.providers.reasoningModes.${mode}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </SettingsRow>
            <Controller
              control={control}
              name="headers"
              render={({ field }) => (
                <HeadersEditor
                  info={t("settings.providers.headersDesc")}
                  label={t("settings.providers.headers")}
                  onChange={field.onChange}
                  onRevert={revertOf("headers").onRevert}
                  value={field.value}
                />
              )}
            />
          </TabsContent>
          {/* The directory's table is the pane's content and fills it to the
              footer; the model editor is a scrolling form and carries the
              bottom inset itself. */}
          <TabsContent
            className="flex min-h-0 flex-1 flex-col px-10"
            value="models"
          >
            {openRow === undefined ? (
              <ModelDirectory
                api={api}
                errors={errors.models}
                modelRows={controller.modelRows}
                onModelsChange={controller.updateModelRows}
                onOpenModel={setOpenModelKey}
              />
            ) : (
              <ModelDetail
                baseline={openRow.baseline}
                editor={openRow.editor}
                errors={errors.models?.[openModelIndex]}
                model={openRow.model}
                onBack={() => setOpenModelKey(null)}
                onChange={(model) => controller.updateModel(openRow.key, model)}
                onEditorChange={(editor) =>
                  controller.updateModelEditor(openRow.key, editor)
                }
                provider={compatProvider}
              />
            )}
          </TabsContent>
          <TabsContent
            className="min-h-0 flex-1 scrollbar-none overflow-x-clip overflow-y-auto px-10 pb-6"
            value="advanced"
          >
            {activeFamily !== undefined && (
              <ProviderCompatPanel
                baseline={controller.baseline.compat}
                family={activeFamily}
                form={controller.form}
                inputs={controller.compatInputs}
                onInputsChange={controller.updateCompatInputs}
                resolution={defaults}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
      {/* The strip's inset again, so the footer's buttons end on the line the
          section rows end on. */}
      <div className="flex shrink-0 items-center gap-3 pt-3 pr-10 pb-3 pl-10">
        {/* The delete stands at the far left, away from save and reset: it
            ends the provider rather than the edit, and a click on it cannot
            be undone. */}
        {target.kind === "edit" && (
          <DeleteProviderButton
            onDeleted={() => controller.afterDelete(target.id)}
            providerId={target.id}
          />
        )}
        <p
          className="text-destructive min-w-0 flex-1 truncate text-sm"
          role="alert"
        >
          {controller.error !== null
            ? t(`errors.${controller.error.code}`)
            : ""}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {controller.changedFields.size > 0 && (
            <Badge className="shrink-0" variant="secondary">
              {t("common.changedCount", {
                count: controller.changedCount,
              })}
            </Badge>
          )}
          {section === "advanced" && presetId !== undefined && (
            <Button
              disabled={
                controller.isSaving ||
                defaults.isLoading ||
                defaults.error !== null ||
                !canRestoreDefaults
              }
              onClick={() =>
                controller.restoreCompat(
                  restoreCompatDefaults(
                    controller.baseline.compat,
                    defaults.data,
                  ),
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {t("settings.providers.restoreDefault")}
            </Button>
          )}
          <Button
            disabled={!controller.isChanged || controller.isSaving}
            onClick={controller.discard}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("settings.providers.reset")}
          </Button>
          <Button
            disabled={controller.isSaving || controller.hasInvalidInputs}
            size="sm"
            type="submit"
          >
            {controller.isSaving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
