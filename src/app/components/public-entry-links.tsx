import Link from "next/link";

/** Public links lead to the existing auth forms, which revalidate sessions and route by role. */
export function PublicEntryLinks() {
  return <div className="public-entry-links">
    <Link className="primary-button button-link" href="/register">Create a free learner account</Link>
    <Link className="secondary-button button-link" href="/login">Sign in</Link>
  </div>;
}
