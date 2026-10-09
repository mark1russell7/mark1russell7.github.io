/** The props of each concept of the pool. */
export interface ConceptProps {
  /** The concept uses this function when the user opens a site card. */
  readonly onOpen: (id: string, element: HTMLElement) => void;
  /** True when the user asks for reduced motion. */
  readonly reduced: boolean;
  /** True when a site is open over the pool. The concept stops its simulation then. */
  readonly paused: boolean;
}

export type ConceptId = "pond" | "board" | "river";

export const concepts: readonly { readonly id: ConceptId; readonly name: string; readonly hint: string }[] = [
  { id: "pond", name: "Pond", hint: "Move the pointer to stir the water. Push and hold to stir harder. Select a site to open it." },
  { id: "board", name: "Board", hint: "Drag to move. Scroll to zoom. Select a site to fly to it, and use it in place." },
  { id: "river", name: "River", hint: "The pointer is a rock in the current. Push and hold to stop the river. Scroll to move it." },
];
