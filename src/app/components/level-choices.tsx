import { SyntheticText } from "./demo-badge";
import type { LearningLevel } from "@prisma/client";
import { learningLevels } from "../../lib/learning-content";
import { chooseLevel } from "../learning/actions";

/** Equal-weight native forms keep all three paths directly available; suggestions do not disable choices. */
export function LevelChoices({ selected, suggested }: { selected?: LearningLevel; suggested?: LearningLevel | null }) {
  return <div className="level-options">{learningLevels.map((level) => <section key={level.code} className="level-option" aria-label={level.title}>
    <h3><SyntheticText rebrand>{level.title}</SyntheticText></h3><p><SyntheticText rebrand>{level.description}</SyntheticText></p>
    {selected === level.code && <p className="selection-note">Current level</p>}
    {suggested === level.code && <p className="selection-note">Advisory suggestion · your choice</p>}
    <form action={chooseLevel}><input type="hidden" name="level" value={level.code} />
      <button className="secondary-button" type="submit">Choose <SyntheticText rebrand>{level.title}</SyntheticText></button>
    </form>
  </section>)}</div>;
}
