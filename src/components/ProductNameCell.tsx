"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./ProductNameCell.module.css";

export interface StoreLink {
  label: string;
  url: string;
}

interface Props {
  name: string;
  unit: string;
  historyHref: string;
  storeLinks: StoreLink[];
}

export default function ProductNameCell({
  name,
  unit,
  historyHref,
  storeLinks,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.nameButton}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {name}
        </button>
        <Link href={historyHref} className={styles.historyLink} title="Histórico de preços">
          📈
        </Link>
      </div>
      <div className={styles.unit}>{unit}</div>

      {expanded && (
        <div className={styles.storeLinks}>
          {storeLinks.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.storeButton}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
