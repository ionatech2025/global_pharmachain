import * as React from "react";
import { cn } from "../lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        // min-w-0 is load-bearing, not cosmetic (same reasoning as Panel):
        // a flex/grid item defaults to min-width:auto, so wide content
        // inside (a table, a long unwrapped button) pushes the card past
        // its track and scrolls the whole page sideways on a phone instead
        // of scrolling — or clipping — within the card itself.
        "flex min-w-0 flex-col gap-4 rounded-2xl border bg-card py-5 text-card-foreground shadow-[var(--shadow-tile)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex min-w-0 flex-col gap-1.5 px-5", className)}
      {...props}
    />
  );
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function containsHeadingElement(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) && typeof child.type === "string" && HEADING_TAGS.has(child.type),
  );
}

function CardTitle({ className, children, ...props }: React.ComponentProps<"h2">) {
  // Auth cards wrap an explicit <h1> inside <CardTitle>; in-app cards pass
  // text/icons directly and render as a semantic <h2> under the page's <h1>.
  const Comp = containsHeadingElement(children) ? "div" : "h2";
  return (
    <Comp
      data-slot="card-title"
      className={cn("font-semibold tracking-tight leading-snug", className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0 px-5", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex min-w-0 items-center px-5", className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
