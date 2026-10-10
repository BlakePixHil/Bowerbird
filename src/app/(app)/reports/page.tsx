import type { Metadata } from "next";
import { PageHeader, REPORTS, visible } from "@/components/shell";
import { Card, Icon, ListRow, Tile } from "@/components/ui";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" actions={null} />
      <p className={styles.intro}>Your household, run like a small business, in plain words.</p>
      <Card>
        <ul className={styles.list}>
          {visible(REPORTS).map((report) => (
            <ListRow
              key={report.href}
              as="li"
              href={report.href}
              leading={<Tile icon={report.icon} />}
              title={report.label}
              detail={<span className={styles.question}>{report.question}</span>}
              trailing={<Icon name="chevron-right" size="sm" />}
            />
          ))}
        </ul>
      </Card>
    </>
  );
}
