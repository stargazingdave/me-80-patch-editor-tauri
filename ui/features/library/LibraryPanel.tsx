import { useMemo, useState } from "react";
import type { DevicePatch } from "../../domain/types";
import LibraryDialogs from "./components/LibraryDialogs";
import LocalLibraryContent from "./components/LocalLibraryContent";
import { PatchButton } from "./components/PatchButton";
import type { ConfirmRequest, LibraryPanelProps, TextRequest } from "./types";
import shared from "../../styles/shared.module.css";
import styles from "./Library.module.css";

export default function LibraryPanel(props: LibraryPanelProps) {
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const banks = useMemo(
    () => groupIntoBanks(props.devicePatches),
    [props.devicePatches],
  );

  const renameLocal = (
    kind: "patch" | "liveSet",
    id: string,
    currentName: string,
  ) =>
    setTextRequest({
      title: kind === "patch" ? "Rename patch" : "Rename Live Set",
      label:
        kind === "patch" ? "Patch name (1–16 characters)" : "Live Set name",
      value: currentName,
      maxLength: kind === "patch" ? 16 : undefined,
      submit: (name) =>
        props.onLocalMutation(
          "/api/local/rename",
          { kind, id, name },
          kind === "patch" ? "Patch renamed." : "Live Set renamed.",
        ),
    });
  const deleteLocal = (kind: "patch" | "liveSet", id: string, name: string) =>
    setConfirmRequest({
      title: kind === "patch" ? "Delete local patch?" : "Delete Live Set?",
      message: `“${name}” will be removed from the local library.`,
      actionLabel: "Delete",
      confirm: () =>
        props.onLocalMutation(
          "/api/local/delete",
          { kind, id },
          kind === "patch" ? "Patch deleted." : "Live Set deleted.",
        ),
    });
  const confirmRemove = (
    id: string,
    index: number,
    itemName: string,
    setName: string,
  ) =>
    setConfirmRequest({
      title: "Remove patch from Live Set?",
      message: `“${itemName}” will be removed from “${setName}”.`,
      actionLabel: "Remove",
      confirm: () =>
        props.onLocalMutation(
          "/api/local/remove-live-patch",
          { id, index },
          "Patch removed from Live Set.",
        ),
    });
  const saveCurrentPatch = () => {
    if (!props.currentPatch) return props.onToast("Open a patch first.", true);
    if (props.currentLocalSource?.kind === "liveSet") {
      props.onLocalMutation(
        "/api/local/save-live-patch",
        {
          setId: props.currentLocalSource.id,
          index: props.currentLocalSource.index,
          sessionId: props.currentPatch.id,
        },
        "Live Set patch saved.",
      );
      return;
    }
    const existing =
      props.currentLocalSource?.kind === "patch"
        ? props.currentLocalSource.id
        : undefined;
    props.onLocalMutation(
      "/api/local/save-patch",
      {
        sessionId: props.currentPatch.id,
        id: existing,
        name: props.currentPatch.decoded.name.text,
      },
      existing ? "Local patch saved." : "Patch added to local library.",
    );
  };

  return (
    <>
      <aside className={`${shared.panel} ${styles.libraryPanel}`}>
        <div className={shared.panelHeading}>
          <div>
            <span className={shared.eyebrow}>Sources</span>
            <h2>Patch library</h2>
          </div>
          <button
            className={shared.smallButton}
            onClick={() => props.fileInput.current?.click()}
          >
            Import .tsl
          </button>
          <input
            ref={props.fileInput}
            type="file"
            accept=".tsl,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {props.source === "device" && !props.live && (
          <button
            className={styles.livePatchButton}
            disabled={props.busy}
            onClick={props.onReadCurrent}
          >
            <span className={styles.liveIcon}>⌁</span>
            <span>
              <strong>Read current patch</strong>
              <small>Load the pedal’s active buffer</small>
            </span>
            <span>→</span>
          </button>
        )}
        <div
          className={styles.sourceSwitch}
          role="tablist"
          aria-label="Patch source"
        >
          <button
            role="tab"
            aria-selected={props.source === "device"}
            onClick={() => props.onSource("device")}
          >
            ME-80
          </button>
          <button
            role="tab"
            aria-selected={props.source === "local"}
            onClick={() => props.onSource("local")}
          >
            Local library
          </button>
        </div>
        {props.source === "local" && (
          <div className={styles.localActions}>
            <button
              title="Save the editor's current patch locally"
              onClick={saveCurrentPatch}
            >
              Save patch
            </button>
            <button
              onClick={() =>
                setTextRequest({
                  title: "New Live Set",
                  label: "Live Set name",
                  value: "",
                  submit: (name) =>
                    props.onLocalMutation(
                      "/api/local/create-set",
                      { name },
                      "Live Set created.",
                    ),
                })
              }
            >
              New set
            </button>
            <button
              title="Reload files from the library folder"
              onClick={props.onReloadLocal}
            >
              ↻
            </button>
          </div>
        )}
        <div className={styles.libraryMeta}>
          <span>
            {props.source === "device" ? "USER + PRESET" : "LOCAL LIBRARY"}
          </span>
          <div className={styles.libraryMetaActions}>
            <small>
              {props.source === "device"
                ? props.deviceLoading
                  ? "Reading…"
                  : `${props.devicePatches.length} PATCHES`
                : `${props.localLibrary.patches.length + props.localLibrary.liveSets.length} FILES`}
            </small>
            {props.source === "device" && (
              <div
                className={styles.viewSwitch}
                role="group"
                aria-label="Patch library view"
              >
                <button
                  type="button"
                  aria-label="Show patch names"
                  title="List view"
                  aria-pressed={props.view === "list"}
                  onClick={() => props.onView("list")}
                >
                  ☰
                </button>
                <button
                  type="button"
                  aria-label="Show four-patch banks"
                  title="Bank view"
                  aria-pressed={props.view === "banks"}
                  onClick={() => props.onView("banks")}
                >
                  ▦
                </button>
              </div>
            )}
          </div>
        </div>
        {props.deviceLoading && props.source === "device" && (
          <div className={styles.loader} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <strong>Reading patches from ME-80</strong>
            <small>Scanning all 72 stored slots…</small>
          </div>
        )}
        <div
          className={`${styles.patchList}${props.source === "device" && props.view === "banks" ? ` ${styles.banksView}` : ""}`}
          aria-busy={props.deviceLoading || undefined}
        >
          {props.source === "device" ? (
            banks.map(([label, patches]) => (
              <section className={styles.patchBank} key={label}>
                <div className={styles.patchBankHeading}>{label}</div>
                <div className={styles.patchBankItems}>
                  {patches.map((patch) => (
                    <PatchButton
                      key={patch.slot}
                      slot={patch.slot}
                      name={patch.name}
                      active={props.activeKey === patch.slot}
                      onClick={() => props.onLoadDevice(patch)}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <LocalLibraryContent
              {...props}
              renameLocal={renameLocal}
              deleteLocal={deleteLocal}
              confirmRemove={confirmRemove}
            />
          )}
        </div>
      </aside>
      <LibraryDialogs
        textRequest={textRequest}
        confirmRequest={confirmRequest}
        setTextRequest={setTextRequest}
        setConfirmRequest={setConfirmRequest}
      />
    </>
  );
}

function groupIntoBanks(patches: DevicePatch[]) {
  const banks = new Map<string, DevicePatch[]>();
  for (const patch of patches) {
    const label = /^([UP]\d)-[1-4]$/u.exec(patch.slot)?.[1] ?? "Other";
    banks.set(label, [...(banks.get(label) ?? []), patch]);
  }
  return [...banks.entries()];
}
