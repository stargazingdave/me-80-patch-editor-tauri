import Header from "../components/Header/Header";
import PatchEditor from "../features/editor/PatchEditor";
import LibraryPanel from "../features/library/LibraryPanel";
import ConfirmStoreDialog from "../components/dialogs/ConfirmStoreDialog";
import ActionPanel from "../features/device/ActionPanel";
import SettingsDialog from "../features/settings/SettingsDialog";
import Toast from "../components/Toast/Toast";
import { useAppController } from "./useAppController";
import styles from "./App.module.css";

export default function App() {
  const controller = useAppController();

  return (
    <>
      <Header {...controller.header} />
      <main className={styles.workspace}>
        <LibraryPanel {...controller.library} />
        <PatchEditor {...controller.editor} />
        <ActionPanel {...controller.actions} />
      </main>
      <ConfirmStoreDialog {...controller.confirmDialog} />
      <SettingsDialog {...controller.settingsDialog} />
      <Toast toast={controller.toast} />
    </>
  );
}
