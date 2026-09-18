"use client";

import { useState } from "react";
import { entityInitials, usableEntityImage } from "@/lib/projects/entity-avatar";

export function EntityAvatar({ name, imageUrl, kind, size = "medium" }: {
  name: string; imageUrl?: string | null; kind: "character" | "place"; size?: "small" | "medium";
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const source = usableEntityImage(imageUrl, failedImageUrl === imageUrl);
  const label = `${kind === "character" ? "Character" : "Place"}: ${name}`;
  return <span className={`entity-avatar ${size}`} title={name} aria-label={label} role="img">
    {/* Entity images may use arbitrary author-provided remote hosts, so Next Image cannot safely preconfigure them. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {source ? <img src={source} alt="" onError={() => setFailedImageUrl(source)} /> : entityInitials(name)}
  </span>;
}
