import type { ReactNode } from "react";

/** The opening every landing section shares: pill label, display heading, lead. */
export function SectionHeading({
  id,
  pill,
  icon,
  title,
  lead,
}: {
  /** Heading id, for the section's aria-labelledby. */
  id: string;
  pill: string;
  icon?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="landing-pill">
        {icon}
        {pill}
      </span>
      <h2 id={id} className="text-display text-display-section mt-4 text-foreground">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{lead}</p>
      )}
    </div>
  );
}
