import { credentialDisclosure } from "../../lib/credential-content";

/** Always show synthetic/pilot and evidence limitations beside a credential; never imply third-party certification. */
export function CredentialDisclosures() {
  return <div className="demo-notice"><p className="notice-label">{credentialDisclosure.label}</p>
    <p>{credentialDisclosure.competencies}</p><p>{credentialDisclosure.evidence}</p></div>;
}
