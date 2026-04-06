import { uuidv7 } from "uuidv7";

/** Time-ordered UUID (v7) for primary keys and correlation. */
export function newId(): string {
  return uuidv7();
}
