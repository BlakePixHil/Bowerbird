"use client";

import { useState } from "react";
import {
  BottomSheet,
  Button,
  Checkbox,
  ListRow,
  Money,
  TextField,
  Tile,
  Well,
} from "@/components/ui";

/** Opens a bottom sheet, so the dialog, its backdrop and Escape can be tried. */
export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon="split" onClick={() => setOpen(true)}>
        Open a sheet
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Split Kmart"
        footer={
          <Button variant="primary" size="lg" block onClick={() => setOpen(false)}>
            Save the split
          </Button>
        }
      >
        <Well style={{ padding: "0 12px" }}>
          <ListRow
            leading={<Tile icon="bag" size="sm" />}
            title="Kmart"
            detail="Shopping · Sat 10 Oct"
            trailing={<Money cents={-12_450} />}
          />
        </Well>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <TextField label="Shopping" inputMode="decimal" defaultValue="84.50" />
          <TextField label="Gifts" inputMode="decimal" defaultValue="40.00" />
          <Checkbox defaultChecked>Remember this split for Kmart</Checkbox>
        </div>
      </BottomSheet>
    </>
  );
}
