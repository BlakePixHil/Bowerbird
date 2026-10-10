import { Avatar, Divider, LogoMark, NavItem, NavSection, Sidebar } from "@/components/ui";
import type { Shell } from "./data";
import { REPORTS, SETTINGS, TABS, visible } from "./nav";
import { SearchBox } from "./SearchBox";
import styles from "./Shell.module.css";

/** The desktop menu from the "Desktop: Home" board. */
export function AppSidebar({ shell, className }: { shell: Shell; className?: string }) {
  // The Reports tab becomes the Reports section here, listing each report.
  const main = visible(TABS).filter((item) => item.href !== "/reports");
  const reports = visible(REPORTS);
  return (
    <Sidebar
      className={className}
      footer={
        <>
          {visible(SETTINGS).map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavItem>
          ))}
          <Divider className={styles.footRule} />
          <div className={styles.member}>
            <Avatar
              owner={shell.member.owner}
              initials={shell.member.initials}
              label={shell.member.name}
            />
            <span className={styles.memberName}>{shell.member.name}</span>
            <span className="mono">READ-ONLY</span>
          </div>
        </>
      }
    >
      <div className={styles.household}>
        <LogoMark size={26} />
        <span className={styles.householdName}>{shell.householdName}</span>
      </div>
      <SearchBox />
      {main.map((item) => (
        <NavItem key={item.href} href={item.href} icon={item.icon}>
          {item.label}
        </NavItem>
      ))}
      {reports.length > 0 && (
        <NavSection title="Reports">
          {reports.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavItem>
          ))}
        </NavSection>
      )}
    </Sidebar>
  );
}
