import Form from "next/form";
import { Icon, Kbd } from "@/components/ui";
import styles from "./Shell.module.css";

/**
 * The sidebar's search box. It searches transactions on Activity, which reads the words from
 * `?q=` once project 03 builds search.
 */
export function SearchBox() {
  return (
    <Form action="/activity" role="search" className={styles.search}>
      <label className={styles.searchField}>
        <Icon name="search" size="sm" />
        <input
          type="search"
          name="q"
          placeholder="Search"
          aria-label="Search transactions"
          aria-keyshortcuts="/"
          enterKeyHint="search"
          data-search
        />
        <span aria-hidden="true">
          <Kbd>/</Kbd>
        </span>
      </label>
    </Form>
  );
}
