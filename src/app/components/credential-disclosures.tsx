import { SyntheticText } from "./demo-badge";
import { credentialDisclosure } from "../../lib/credential-content";

/** Always show synthetic/pilot and evidence limitations beside a credential; never imply third-party certification. */
export function CredentialDisclosures() {
  return <div className="demo-notice"><p className="notice-label"><SyntheticText>{credentialDisclosure.label}</SyntheticText></p>
    <p><SyntheticText>{credentialDisclosure.competencies}</SyntheticText></p><p><SyntheticText>{credentialDisclosure.evidence}</SyntheticText></p></div>;
}
