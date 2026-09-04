import type { DecodedPatch } from "../../../domain/types";
import { deriveEffectChain } from "../../../lib/effectChain";
import shared from "../../../styles/shared.module.css";
import styles from "../PatchEditor.module.css";

export default function SignalChain({ patch }: { patch: DecodedPatch }) {
  const chain = deriveEffectChain(patch);
  return <section className={styles.signalChainPanel} aria-labelledby="signal-chain-title"><div className={styles.signalChainHeading}><div><span className={shared.eyebrow}>Routing</span><strong id="signal-chain-title">Signal flow</strong></div><small>Derived from effect types</small></div><div className={styles.signalChainScroll}><div className={styles.signalChainFlow} aria-label="Current ME-80 signal flow"><span className={styles.signalChainEndpoint}>IN</span>{chain.map((block) => <span key={block.key} className={`${styles.signalChainNode}${block.enabled ? "" : ` ${styles.off}`}`} data-effect={block.key} title={`${block.label}: ${block.type} · ${block.enabled ? "On" : "Off"} · routing slot ${block.slot}`}><span className={styles.signalChainLamp} /><strong>{block.label}</strong><small>{block.type}</small></span>)}<span className={styles.signalChainEndpoint}>OUT</span></div></div></section>;
}
