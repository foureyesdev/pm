import Image from "next/image";
import logo from "./icon.png";
import { Laptop, PanelsTopLeft } from "lucide-react";
import { Board } from "./board/Board";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.nav}>
          <div className={styles.identity}>
            <Image src={logo} width={32} height={32} alt="" unoptimized />
            <span className={styles.wordmark}>Fieldwork</span>
            <span className={styles.workspace}>Workspace</span>
          </div>
          <span className={styles.session} title="Refreshing the page restores the sample board.">
            <Laptop size={16} aria-hidden="true" /> Local session
          </span>
        </div>
      </header>
      <main className={styles.main}>
        <header className={styles.project}>
          <div className={styles.projectText}>
            <div className={styles.projectLabel}>
              <PanelsTopLeft size={15} aria-hidden="true" /> Project board
            </div>
            <h1>Website launch</h1>
            <p>Design, content, and development for our new studio website.</p>
          </div>
          <div className={styles.art} aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i />
          </div>
        </header>
        <Board />
      </main>
    </>
  );
}
